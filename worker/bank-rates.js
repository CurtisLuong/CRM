import { BANK_RATES_CRON, BANK_SOURCES, MAX_PAGES, NEWS_FEEDS } from './bank-rates-config.js';
import { exceedsDrift, extractPage, preferredRates } from './bank-rates-extract.js';
import { bankLinks, createPageReader, newsArticles, pageMetadata, pageText, recentNews } from './bank-rates-sources.js';

export { BANK_RATES_CRON };

// Gộp yêu cầu trùng trong cùng isolate; DB latest giữ dấu ngày khi đã ghi được số.
const runs = new WeakMap();
const vnDay = (date) => new Date(date.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

function createStore(env, fetcher) {
  async function request(path, init = {}) {
    const response = await fetcher(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
      ...init,
      signal: AbortSignal.timeout(15_000),
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
    });
    if (!response.ok) throw new Error(`bank-rates database HTTP ${response.status}`);
    return response;
  }
  return {
    async latest() {
      const response = await request(
        'bank_rates_latest?select=bank_code,promo_rate,floating_rate,reference_rate,margin,fetched_at',
      );
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error('bank-rates latest invalid');
      for (const row of rows) {
        if (
          !row ||
          !BANK_SOURCES.some((bank) => bank.code === row.bank_code) ||
          !Number.isFinite(Date.parse(row.fetched_at))
        )
          throw new Error('bank-rates latest invalid');
        for (const key of ['promo_rate', 'floating_rate', 'reference_rate', 'margin']) {
          if (row[key] !== null && !(typeof row[key] === 'number' && Number.isFinite(row[key])))
            throw new Error('bank-rates latest invalid');
        }
      }
      return rows;
    },
    async insert(row) {
      const response = await request('bank_rates', { method: 'POST', body: JSON.stringify(row) });
      await response.body?.cancel();
    },
  };
}

async function collectAndStore(env, now, fetcher, logger) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.AI?.run)
    throw new Error('bank-rates configuration missing');
  const store = createStore(env, fetcher);
  // Không có bản đối chiếu đáng tin → dừng, không coi lỗi đọc là bảng trống.
  const latest = await store.latest();
  if (latest.some((row) => vnDay(new Date(row.fetched_at)) === vnDay(now))) {
    return { skipped: 'already_ran_today', pages: 0, written: 0 };
  }
  const reader = createPageReader(fetcher, logger);
  const candidates = [],
    banks = [],
    articles = new Map();
  let failed = 0,
    drifted = 0,
    written = 0;
  async function inspect(page, source) {
    const metadata = pageMetadata(page.html);
    const actual = {
      ...source,
      source_url: page.url,
      source_title: metadata.source_title || source.source_title || null,
      published_on: metadata.published_on || source.published_on || null,
    };
    if (actual.source_kind === 'news' && !recentNews(actual.published_on, now)) return;
    try {
      candidates.push(...(await extractPage(env, actual, pageText(page.html))));
    } catch {
      failed++;
      logger.warn('bank-rates extraction failed', { url: page.url });
    }
  }
  // Đọc đủ mười trang chủ trước để một ngân hàng không chiếm hết ngân sách.
  for (const bank of BANK_SOURCES) {
    const page = await reader.read(bank.url, bank.url);
    const source = { bank_code: bank.code, source_kind: 'bank' };
    const state = { bank, source, links: [], visited: 1 };
    banks.push(state);
    if (!page) continue;
    state.links.push(...bankLinks(page.html, page.url));
    await inspect(page, source);
  }
  for (const feed of NEWS_FEEDS) {
    const page = await reader.read(feed, feed);
    if (!page) continue;
    for (const article of newsArticles(page.html, feed, now)) articles.set(article.source_url, article);
  }
  const news = [...articles.values()].sort((a, b) => b.published_on.localeCompare(a.published_on));
  // Chừa tối đa năm lượt cho bài báo; còn lại chia vòng, mỗi ngân hàng tối đa ba trang.
  const bankBudget = MAX_PAGES - Math.min(5, news.length);
  for (let round = 0; round < 2; round++) {
    for (const state of banks) {
      if (reader.count >= bankBudget || state.visited >= 3) continue;
      const url = state.links.shift();
      if (!url) continue;
      state.visited++;
      const page = await reader.read(url, state.bank.url);
      if (!page) continue;
      state.links.push(...bankLinks(page.html, page.url).filter((link) => !state.links.includes(link)));
      await inspect(page, state.source);
    }
  }
  for (const source of news) {
    if (reader.count >= MAX_PAGES) break;
    const page = await reader.read(source.source_url, source.base);
    if (page) await inspect(page, source);
  }
  const previous = new Map(latest.map((row) => [row.bank_code, row]));
  for (const row of preferredRates(candidates)) {
    if (exceedsDrift(row, previous.get(row.bank_code))) {
      drifted++;
      logger.warn('bank-rates drift > 2 points; keeping previous', {
        bank_code: row.bank_code,
        source_url: row.source_url,
      });
      continue;
    }
    try {
      await store.insert({ ...row, fetched_at: now.toISOString() });
      written++;
    } catch {
      failed++;
      logger.warn('bank-rates insert failed', { bank_code: row.bank_code });
    }
  }
  return { pages: reader.count, candidates: candidates.length, written, drifted, failed };
}

export async function runBankRates(env, { now = new Date(), fetcher = fetch, logger = console } = {}) {
  const day = vnDay(now);
  const previous = runs.get(env);
  if (previous?.day === day) {
    if (previous.pending) return previous.pending;
    return { skipped: 'already_ran_today', pages: 0, written: 0 };
  }
  const state = { day };
  runs.set(env, state);
  state.pending = collectAndStore(env, now, fetcher, logger);
  try {
    const result = await state.pending;
    delete state.pending;
    return result;
  } catch (error) {
    if (runs.get(env) === state) runs.delete(env);
    throw error;
  }
}

export async function handleBankRates(request, env) {
  const json = (body, status) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (!env.BANK_RATES_SECRET) return json({ error: 'Not found' }, 404);
  if (request.headers.get('X-Cron-Secret') !== env.BANK_RATES_SECRET) return json({ error: 'Unauthorized' }, 401);
  try {
    return json(await runBankRates(env), 200);
  } catch {
    return json({ error: 'Không cập nhật được lãi suất; giữ bản cũ.' }, 503);
  }
}
