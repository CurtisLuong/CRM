import {
  BANK_RATES_CRON,
  BANK_RATES_SUPPLEMENTAL_CRON,
  BANK_SOURCES,
  DB_SUBREQUESTS,
  MAX_PAGES,
  MAX_SUBREQUESTS,
  MIN_NEWS_PAGES,
  NEWS_FEEDS,
  SUPPLEMENTAL_CELLS_PER_RUN,
  missingCellSearchFeeds,
  newsSearchFeeds,
} from './bank-rates-config.js';
import {
  exceedsDrift,
  extractionStats,
  extractPage,
  logRejectedValue,
  preferredRates,
  rateKey,
} from './bank-rates-extract.js';
import { bankLinks, createPageReader, newsArticles, pageMetadata, pageText, recentNews } from './bank-rates-sources.js';

export { BANK_RATES_CRON, BANK_RATES_SUPPLEMENTAL_CRON };

// Chỉ gộp yêu cầu đang chạy; lượt sau luôn đọc lại DB.
const runs = new WeakMap();
const vnDay = (date) => new Date(date.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const CELLS = BANK_SOURCES.flatMap((bank) => ['loan', 'deposit'].map((kind) => ({ bank_code: bank.code, kind })));
function missingCells(latest, now) {
  const complete = new Set(
    latest
      .filter(
        (row) =>
          vnDay(new Date(row.fetched_at)) === vnDay(now) &&
          (row.kind === 'deposit' ? row.deposit_rate != null : row.promo_rate != null || row.floating_rate != null),
      )
      .map(rateKey),
  );
  return CELLS.filter((cell) => !complete.has(rateKey(cell)));
}
const skippedRun = () => ({
  skipped: 'complete_today',
  pages: 0,
  candidates: 0,
  written: 0,
  drifted: 0,
  failed: 0,
  ai_calls: 0,
  rejected: extractionStats().rejected,
  missing_before: 0,
  missing_after: 0,
});
function reportRun(result, logger, stats = extractionStats(), queries = []) {
  (logger.log || console.log).call(logger, 'bank-rates summary', {
    ...result,
    queries,
    ai_rows: stats.ai_rows,
    validated: stats.validated,
  });
  return result;
}

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
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      throw new Error(`bank-rates database HTTP ${response.status} ${detail}`);
    }
    return response;
  }
  return {
    async latest() {
      const response = await request(
        'bank_rates_latest?select=bank_code,kind,deposit_rate,promo_rate,floating_rate,reference_rate,margin,fetched_at',
      );
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error('bank-rates latest invalid');
      for (const row of rows) {
        if (
          !row ||
          !BANK_SOURCES.some((bank) => bank.code === row.bank_code) ||
          (row.kind !== undefined && !['loan', 'deposit'].includes(row.kind)) ||
          !Number.isFinite(Date.parse(row.fetched_at))
        )
          throw new Error('bank-rates latest invalid');
        const fields = ['promo_rate', 'floating_rate', 'reference_rate', 'margin'];
        if (row.kind !== undefined) fields.push('deposit_rate');
        for (const key of fields) {
          if (row[key] !== null && !(typeof row[key] === 'number' && Number.isFinite(row[key])))
            throw new Error('bank-rates latest invalid');
        }
      }
      return rows;
    },
    // Nhận một dòng hoặc mảng dòng (PostgREST ghi mảng trong một request, cùng thành công hoặc cùng lỗi).
    async insert(rows) {
      const response = await request('bank_rates', { method: 'POST', body: JSON.stringify(rows) });
      await response.body?.cancel();
    },
  };
}

async function collectAndStore(env, now, fetcher, logger, supplemental, state) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.AI?.run)
    throw new Error('bank-rates configuration missing');
  // Đếm mọi subrequest (fetch + AI) để không chạm trần của Cloudflare trước khi kịp ghi DB.
  let used = 0;
  const counted = (input, init) => {
    used++;
    return fetcher(input, init);
  };
  // Phần cho đọc trang + AI; DB_SUBREQUESTS đã gồm lần đọc bảng mới nhất và các lần ghi.
  const workLeft = () => MAX_SUBREQUESTS - DB_SUBREQUESTS - reader.count - stats.ai_calls;
  const ai = env.AI;
  env = { ...env, AI: { run: (...args) => (used++, ai.run(...args)) } };
  const store = createStore(env, counted);
  // Không có bản đối chiếu đáng tin → dừng, không coi lỗi đọc là bảng trống.
  const latest = await store.latest();
  const missing = missingCells(latest, now);
  if (!missing.length) {
    return reportRun(skippedRun(), logger);
  }
  // Cron chỉ định lượt rộng/bổ sung; gọi tay không chỉ định thì chọn theo dữ liệu hôm nay.
  const manual = supplemental === undefined;
  supplemental ??= latest.some((row) => vnDay(new Date(row.fetched_at)) === vnDay(now));
  const missingKeys = new Set(missing.map(rateKey));
  const queries = [];
  const logPage = (page, source_kind, ai_rows = 0, accepted = 0) =>
    logger.log?.('bank-rates page', { url: page.url, source_kind, ai_rows, accepted });
  const reader = createPageReader(counted, logger);
  const read = (url, base, end = MAX_PAGES) => reader.read(url, base, Math.min(end, reader.count + workLeft()));
  const candidates = [],
    banks = [],
    articles = new Map(),
    rssArticles = new Map();
  const searchFeeds = newsSearchFeeds(now);
  let remainingSeeds = BANK_SOURCES.length + NEWS_FEEDS.length + searchFeeds.length;
  async function readSeed(url) {
    remainingSeeds--;
    // Cho tối đa một request redirect nguồn đầu vào; luôn giữ lượt cho các nguồn còn lại.
    return read(url, url, MAX_PAGES - MIN_NEWS_PAGES - remainingSeeds + 1);
  }
  async function collectArticles(feeds, target) {
    for (const feed of feeds) {
      const page = await readSeed(feed);
      if (!page) continue;
      logPage(page, 'news');
      for (const article of newsArticles(page.html, feed, now)) {
        const previous = target.get(article.source_url);
        if (!previous || article.published_on > previous.published_on) target.set(article.source_url, article);
      }
    }
  }
  let failed = 0,
    drifted = 0,
    written = 0;
  const stats = extractionStats();
  async function inspect(page, source, canCall = () => true) {
    const before = stats.ai_rows;
    let accepted = 0;
    const metadata = pageMetadata(page.html);
    const actual = {
      ...source,
      source_url: page.url,
      source_title: metadata.source_title || source.source_title || null,
      published_on: metadata.published_on || source.published_on || null,
    };
    try {
      if (actual.source_kind === 'news' && !recentNews(actual.published_on, now)) return;
      const extracted = await extractPage(env, actual, pageText(page.html), {
        stats,
        logger,
        canCall: () => workLeft() > 0 && canCall(),
      });
      const eligible = extracted.filter(
        (row) =>
          (!source.target_kind || row.kind === source.target_kind) && (!supplemental || missingKeys.has(rateKey(row))),
      );
      accepted = eligible.length;
      candidates.push(...eligible);
    } catch {
      logger.warn('bank-rates extraction failed', { url: page.url });
    } finally {
      logPage(page, actual.source_kind, stats.ai_rows - before, accepted);
    }
  }
  if (supplemental) {
    // Gọi tay xoay theo phút trên danh sách thiếu để isolate mới không lặp vì các ô đã đủ.
    // Cron giữ vòng mười phút trên toàn bộ ô; con trỏ giữ tiến độ trong cùng isolate.
    const pool = manual ? missing : CELLS;
    const cursorKey = manual ? 'manualCursor' : 'cursor';
    const slot = manual
      ? Math.floor(now.getTime() / 60_000)
      : Math.floor((now.getUTCHours() * 60 + now.getUTCMinutes()) / 10);
    // Gọi tay: mỗi lượt chạy 1–2 phút nên nhảy 1 ô/phút để lượt kế tiếp không bỏ sót ô.
    let cursor = (state[cursorKey] ?? slot * (manual ? 1 : SUPPLEMENTAL_CELLS_PER_RUN)) % pool.length;
    const selected = [];
    for (let scanned = 0; scanned < pool.length && selected.length < SUPPLEMENTAL_CELLS_PER_RUN; scanned++) {
      const cell = pool[cursor];
      cursor = (cursor + 1) % pool.length;
      if (missingKeys.has(rateKey(cell))) selected.push(cell);
    }
    state[cursorKey] = cursor;
    const feeds = missingCellSearchFeeds(selected, now);
    // Chia đều trang và AI để bài dài của ô đầu không lấy hết lượt của ô sau.
    const aiPerCell = Math.floor((MAX_SUBREQUESTS - DB_SUBREQUESTS - MAX_PAGES) / selected.length);
    const pagesPerCell = Math.floor(MAX_PAGES / selected.length);
    const cached = new Map();
    for (let i = 0; i < selected.length; i++) {
      const cell = selected[i];
      const bank = BANK_SOURCES.find((bank) => bank.code === cell.bank_code);
      const feed = feeds[i];
      const query = new URL(feed).searchParams.get('q');
      queries.push(query);
      logger.log?.('bank-rates search', { ...cell, query });
      const pageEnd = reader.count + pagesPerCell;
      const aiEnd = stats.ai_calls + aiPerCell;
      const canCall = () => stats.ai_calls < aiEnd;
      const readCell = async (url, base) => {
        if (cached.has(url)) return cached.get(url);
        const page = await read(url, base, pageEnd);
        if (page) cached.set(url, page);
        return page;
      };
      const source = { bank_code: bank.code, source_kind: 'bank', target_kind: cell.kind };
      const feedPage = await readCell(feed, feed);
      if (feedPage) logPage(feedPage, 'news');
      const found = feedPage ? newsArticles(feedPage.html, feed, now, bank) : [];
      const home = await readCell(bank.url, bank.url);
      const links = home ? bankLinks(home.html, home.url) : [];
      if (home) await inspect(home, source, canCall);
      for (const article of found) {
        if (!canCall() || workLeft() <= 0) break;
        const page = await readCell(article.source_url, article.base);
        if (page) await inspect(page, article.source_kind === 'news' ? article : { ...article, ...source }, canCall);
      }
      for (let visited = 0; visited < 2 && links.length && canCall() && workLeft() > 0; visited++) {
        const page = await readCell(links.shift(), bank.url);
        if (!page) continue;
        links.push(...bankLinks(page.html, page.url).filter((link) => !links.includes(link)));
        await inspect(page, source, canCall);
      }
    }
  } else {
    queries.push(...searchFeeds.map((feed) => new URL(feed).searchParams.get('q')));
    logger.log?.('bank-rates search', { queries });
    await collectArticles(searchFeeds, articles);
    // Đọc đủ mười trang chủ; chưa đọc trang con để giữ ngân sách bài báo.
    for (const bank of BANK_SOURCES) {
      const page = await readSeed(bank.url);
      const source = { bank_code: bank.code, source_kind: 'bank' };
      const state = { bank, source, links: [], visited: 1 };
      banks.push(state);
      if (!page) continue;
      state.links.push(...bankLinks(page.html, page.url));
      await inspect(page, source);
    }
    await collectArticles(NEWS_FEEDS, rssArticles);
    const newestFirst = (a, b) => b.published_on.localeCompare(a.published_on);
    const news = [
      ...[...articles.values()].sort(newestFirst),
      ...[...rssArticles.values()].filter((article) => !articles.has(article.source_url)).sort(newestFirst),
    ];
    // Bài tìm kiếm trước, bài RSS sau; phần dư mới dành cho trang con ngân hàng.
    for (const source of news) {
      if (reader.count >= MAX_PAGES) break;
      const page = await read(source.source_url, source.base);
      if (page) await inspect(page, source);
    }
    for (let round = 0; round < 2; round++) {
      for (const state of banks) {
        if (reader.count >= MAX_PAGES || state.visited >= 3) continue;
        const url = state.links.shift();
        if (!url) continue;
        state.visited++;
        const page = await read(url, state.bank.url);
        if (!page) continue;
        state.links.push(...bankLinks(page.html, page.url).filter((link) => !state.links.includes(link)));
        await inspect(page, state.source);
      }
    }
  }
  const previous = new Map(latest.map((row) => [rateKey(row), row]));
  const rows = [];
  for (const row of preferredRates(candidates)) {
    if (supplemental && !missingKeys.has(rateKey(row))) continue;
    if (exceedsDrift(row, previous.get(rateKey(row)))) {
      drifted++;
      stats.rejected.drift++;
      logger.warn('bank-rates drift > 2 points; keeping previous', {
        bank_code: row.bank_code,
        kind: row.kind,
        source_url: row.source_url,
      });
      const evidence = stats.evidence.get(row);
      const fields =
        row.kind === 'deposit'
          ? ['deposit_rate']
          : ['promo_rate', 'promo_months', 'floating_rate', 'reference_rate', 'margin'];
      for (const field of fields) {
        if (row[field] != null)
          logRejectedValue(
            logger,
            row,
            field,
            'drift',
            evidence?.[field] ||
              (field === 'floating_rate' ? [evidence?.reference_rate, evidence?.margin].filter(Boolean).join(' ') : ''),
          );
      }
      continue;
    }
    rows.push({ ...row, fetched_at: now.toISOString() });
  }
  const insertFailed = (row, error) =>
    logger.warn('bank-rates insert failed', {
      bank_code: row.bank_code,
      error: error instanceof Error ? error.message : String(error),
    });
  const saved = [];
  if (rows.length) {
    try {
      await store.insert(rows);
      written = rows.length;
      saved.push(...rows);
    } catch (error) {
      // Ghi gộp lỗi → ghi lẻ để một ngân hàng lỗi không chặn ngân hàng khác (luật 6), trong phần subrequest còn lại.
      for (const row of rows) {
        if (used >= MAX_SUBREQUESTS) {
          failed++;
          insertFailed(row, error);
          continue;
        }
        try {
          await store.insert(row);
          written++;
          saved.push(row);
        } catch (rowError) {
          failed++;
          insertFailed(row, rowError);
        }
      }
    }
  }
  const result = {
    pages: reader.count,
    candidates: candidates.length,
    written,
    drifted,
    failed: failed + stats.failed_pages,
    ai_calls: stats.ai_calls,
    rejected: stats.rejected,
    missing_before: missing.length,
    missing_after: missingCells([...latest, ...saved], now).length,
  };
  return reportRun(result, logger, stats, queries);
}

export async function runBankRates(env, { now = new Date(), fetcher = fetch, logger = console, supplemental } = {}) {
  const day = vnDay(now);
  const previous = runs.get(env);
  if (previous?.day === day) {
    if (previous.pending) return previous.pending;
  }
  const state = previous?.day === day ? previous : { day };
  runs.set(env, state);
  state.pending = collectAndStore(env, now, fetcher, logger, supplemental, state);
  try {
    const result = await state.pending;
    delete state.pending;
    return result;
  } catch (error) {
    delete state.pending;
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
  } catch (error) {
    // Lý do chỉ ghi nhật ký Worker (wrangler tail), không trả ra ngoài.
    console.error('bank-rates run failed', error instanceof Error ? error.message : String(error));
    return json({ error: 'Không cập nhật được lãi suất; giữ bản cũ.' }, 503);
  }
}
