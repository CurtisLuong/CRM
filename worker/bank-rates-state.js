import {
  BANK_SOURCES,
  MAX_AI_CALLS,
  NEWS_FEEDS,
  SUPPLEMENTAL_CELLS_PER_RUN,
  missingCellSearchFeeds,
} from './bank-rates-config.js';
import { exceedsDrift, rateKey } from './bank-rates-extract.js';
import { bankLinks, isComparisonArticle, newsArticles, pageMetadata, pageText } from './bank-rates-sources.js';

export const SCAN_STATE_KEY = 'bank-rates:state:v1';
const HOUR = 3_600_000;
export const vnDay = (date) => new Date(date.getTime() + 7 * HOUR).toISOString().slice(0, 10);
export const sourceDay = (row, now) => row.published_on || vnDay(new Date(row.fetched_at || now));
export const hasRate = (row) =>
  row && (row.kind === 'deposit' ? row.deposit_rate != null : row.promo_rate != null || row.floating_rate != null);
export const nextAiReset = (now) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();

export async function loadScanState(binding, now) {
  const stored = await binding.get(SCAN_STATE_KEY, 'json');
  const fresh = { version: 1, visited: {}, queue: [], paused_until: null };
  // Trạng thái hỏng thì làm lại từ đầu, không kẹt Worker mãi.
  if (!stored || stored.version !== 1 || !stored.visited || !Array.isArray(stored.queue)) return fresh;
  // Dọn trang đọc quá 8 ngày (nghỉ dài nhất 7 ngày) để khoá KV không phình mãi.
  const cutoff = (now ?? new Date()).getTime() - 8 * 24 * HOUR;
  for (const [url, entry] of Object.entries(stored.visited))
    if (!(Date.parse(entry?.read_at) >= cutoff)) delete stored.visited[url];
  return stored;
}

export function pageHistory(state, now) {
  const skipped = new Set();
  const cooling = (url) => {
    const previous = state.visited[url];
    if (!previous) return false;
    const rest =
      previous.source_kind === 'bank' ? 24 * HOUR : previous.source_kind === 'news' ? 7 * 24 * HOUR : 6 * HOUR;
    const active = now.getTime() < Date.parse(previous.read_at) + rest;
    if (active) skipped.add(url);
    return active;
  };
  return {
    cooling,
    skipped,
    record(url, source_kind = 'feed') {
      state.visited[url] = { read_at: now.toISOString(), source_kind, rows: 0, banks: [] };
    },
  };
}

export function newestRates(candidates, now) {
  const best = new Map();
  for (const row of candidates) {
    const previous = best.get(rateKey(row));
    const day = sourceDay(row, now);
    if (!previous || day > sourceDay(previous, now) || (day === sourceDay(previous, now) && row.source_kind === 'bank'))
      best.set(rateKey(row), row);
  }
  return [...best.values()];
}

// Hàng chờ chỉ giữ URL/metadata và văn bản đang đợi AI; không giữ phản hồi AI hay bí mật.
export async function collectQueued({
  state,
  history,
  latest,
  missing,
  now,
  read,
  inspect,
  stats,
  workLeft,
  logger,
  queries,
}) {
  const previous = new Map(latest.map((row) => [rateKey(row), row]));
  const available = (cell) => {
    const bank = BANK_SOURCES.find((bank) => bank.code === cell.bank_code);
    return (
      state.queue.some(
        (job) =>
          (job.cell === rateKey(cell) || job.bank_code === cell.bank_code) &&
          (job.page || !history.cooling(job.source_url)),
      ) ||
      !history.cooling(bank.url) ||
      [0, 1, 2, 3].some((variant) => !history.cooling(missingCellSearchFeeds([cell], now, variant)[0]))
    );
  };
  const selected = [...missing]
    .sort((a, b) => {
      const first = previous.get(rateKey(a)),
        second = previous.get(rateKey(b));
      return (
        Number(Boolean(hasRate(first))) - Number(Boolean(hasRate(second))) ||
        (first && second ? sourceDay(first, now).localeCompare(sourceDay(second, now)) : 0)
      );
    })
    .filter(available)
    .slice(0, SUPPLEMENTAL_CELLS_PER_RUN);
  const pending = new Set(missing.map(rateKey));
  const banks = new Set(selected.map((cell) => cell.bank_code));
  const bankNeeded = (code) => [...pending].some((key) => key.startsWith(`${code}:`));
  const relevant = (job) =>
    job.role !== 'feed' && (job.source_kind !== 'bank' || (banks.has(job.bank_code) && bankNeeded(job.bank_code)));
  state.queue = state.queue.filter((job) => job.source_kind !== 'bank' || bankNeeded(job.bank_code));
  const enqueue = (job) => {
    const previous = state.queue.find((item) => item.source_url === job.source_url);
    if (!previous) state.queue.push(job);
    else if ((job.published_on || '') > (previous.published_on || '')) {
      previous.published_on = job.published_on;
      previous.source_title = job.source_title;
    }
  };
  const canWork = () => !state.paused_until && workLeft() > 0 && stats.ai_calls < MAX_AI_CALLS;
  async function inspectJob(job) {
    let page = job.page;
    if (!page) {
      page = await read(job.source_url, job.base, undefined, job.source_kind);
      if (!page) return false;
      // Redirect cũng được nhớ; chỉ URL thực nhận số mới có rows/banks khác 0.
      for (const url of [job.source_url, page.url]) {
        if (state.visited[url]) state.visited[url].source_kind = job.source_kind;
      }
      if (job.source_kind === 'bank' && job.depth < 3) {
        for (const url of bankLinks(page.html, page.url))
          enqueue({
            source_url: url,
            base: job.base,
            source_kind: 'bank',
            bank_code: job.bank_code,
            depth: job.depth + 1,
          });
      }
      job.page = { url: page.url, text: pageText(page.html), metadata: pageMetadata(page.html) };
    }
    const rows = await inspect(page, job, canWork);
    const accepted = rows.filter((row) => !exceedsDrift(row, previous.get(rateKey(row))));
    for (const row of accepted) pending.delete(rateKey(row));
    const entry = state.visited[page.url];
    if (entry) {
      entry.rows += rows.length;
    }
    if (!state.paused_until) {
      delete job.page;
      state.queue = state.queue.filter((item) => item !== job);
    }
    return true;
  }
  // Trang đã tải trước khi chạm hạn mức được trích tiếp mà không fetch lại URL đang nghỉ.
  for (const job of [...state.queue].filter((job) => job.page && relevant(job))) {
    if (!canWork()) break;
    await inspectJob(job);
  }
  if (!canWork() || !pending.size) {
    state.queue = state.queue.filter((job) => job.source_kind !== 'bank' || bankNeeded(job.bank_code));
    return selected;
  }
  for (const cell of selected) {
    if (!pending.has(rateKey(cell))) continue;
    const bank = BANK_SOURCES.find((bank) => bank.code === cell.bank_code);
    enqueue({ source_url: bank.url, base: bank.url, bank_code: bank.code, source_kind: 'bank', depth: 0 });
    // Ưu tiên xử lý hết bài chưa đọc của mẫu trước, rồi mới mở mẫu truy vấn tiếp theo.
    if (state.queue.some((job) => job.cell === rateKey(cell) && !history.cooling(job.source_url))) continue;
    for (let variant = 0; variant < 4; variant++) {
      const feed = missingCellSearchFeeds([cell], now, variant)[0];
      if (history.cooling(feed)) continue;
      const page = await read(feed, feed, undefined, 'feed');
      if (!page) break;
      const query = new URL(feed).searchParams.get('q');
      queries.push(query);
      logger.log?.('bank-rates search', { ...cell, query });
      logger.log?.('bank-rates page', { url: page.url, source_kind: 'news', ai_rows: 0, accepted: 0 });
      for (const article of newsArticles(page.html, feed, now, bank, { allowUndated: true, today: vnDay(now) }))
        enqueue({
          ...article,
          cell: rateKey(cell),
          ...(article.source_kind === 'bank' ? { bank_code: bank.code, depth: 1 } : {}),
        });
      break;
    }
  }
  for (const feed of NEWS_FEEDS) enqueue({ source_url: feed, base: feed, source_kind: 'news', role: 'feed' });
  for (const job of [...state.queue].filter((job) => job.role === 'feed')) {
    if (!canWork()) break;
    const feed = job.source_url;
    if (history.cooling(feed)) continue;
    const page = await read(feed, feed, undefined, 'feed');
    if (!page) continue;
    logger.log?.('bank-rates page', { url: page.url, source_kind: 'news', ai_rows: 0, accepted: 0 });
    for (const article of newsArticles(page.html, feed, now, undefined, { allowUndated: true, today: vnDay(now) }))
      enqueue(article);
    state.queue = state.queue.filter((item) => item !== job);
  }
  // Bài nhiều ngân hàng đi trước bài đơn lẻ và trang riêng của ngân hàng.
  const rank = (job) => (job.source_kind === 'news' ? (isComparisonArticle(job) ? 0 : 1) : 2);
  const attempted = new Set();
  while (canWork() && pending.size) {
    const ready = state.queue.filter(
      (job) => relevant(job) && !attempted.has(job.source_url) && (job.page || !history.cooling(job.source_url)),
    );
    ready.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        Number(Boolean(state.visited[a.source_url])) - Number(Boolean(state.visited[b.source_url])) ||
        (b.published_on || '').localeCompare(a.published_on || ''),
    );
    const job = ready[0];
    if (!job) break;
    attempted.add(job.source_url);
    await inspectJob(job);
  }
  // Mục ngân hàng đã đủ không được tồn tại để lượt sau vô tình mở lại.
  state.queue = state.queue.filter((job) => job.source_kind !== 'bank' || bankNeeded(job.bank_code));
  // Lịch sử hết thời gian nghỉ dài nhất không cần giữ trong KV mãi.
  for (const [url, entry] of Object.entries(state.visited)) {
    if (now.getTime() - Date.parse(entry.read_at) > 7 * 24 * HOUR) delete state.visited[url];
  }
  return selected;
}
