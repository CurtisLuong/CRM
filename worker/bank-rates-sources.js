import { MAX_NEWS_AGE_DAYS, MAX_PAGES, MAX_TEXT } from './bank-rates-config.js';

export function decodeEntities(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, key) => {
    if (key[0] !== '#') return named[key.toLowerCase()] || all;
    const number = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : ' ';
  });
}

function withoutScripts(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, ' ');
}

export function pageText(html, limit = MAX_TEXT) {
  const plain = withoutScripts(html)
    .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
  return decodeEntities(plain)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

export function fold(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
}

// Chỉ đọc HTTPS của nhà xuất bản đã cấu hình, kể cả sau redirect; không theo URL do AI đưa.
export function sourceUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(decodeEntities(value), base);
    const host = new URL(base).hostname.replace(/^www\./, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (url.hostname !== host && !url.hostname.endsWith(`.${host}`)) return null;
    if (/\.(?:pdf|docx?|xlsx?|zip|jpe?g|png|gif|webp|mp4)(?:$|\/)/i.test(url.pathname)) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function attributes(tag) {
  const result = Object.create(null);
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    result[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4]);
  }
  return result;
}

export function bankLinks(html, base) {
  const links = new Set();
  for (const match of withoutScripts(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const attrs = attributes(match[1]);
    const label = fold(`${pageText(match[2])} ${attrs.title || ''} ${attrs['aria-label'] || ''}`);
    if (!/lai suat|vay mua nha|vay nha|bat dong san/.test(label)) continue;
    const url = sourceUrl(attrs.href, base);
    if (url && url !== base) links.add(url);
  }
  return [...links];
}

export function dateOnly(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const day = text.slice(0, 10);
    const parsed = new Date(`${day}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : null;
  }
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : null;
}

export function recentNews(day, now) {
  if (!day) return false;
  const age = Date.parse(now.toISOString().slice(0, 10)) - Date.parse(day);
  return age >= 0 && age <= MAX_NEWS_AGE_DAYS * 86_400_000;
}

export function pageMetadata(html) {
  let published = null;
  for (const tag of html.match(/<(?:meta|time)\b[^>]*>/gi) || []) {
    const attrs = attributes(tag);
    if (
      /^(?:article:published_time|datePublished|pubdate|publishdate)$/i.test(
        attrs.property || attrs.name || attrs.itemprop || '',
      )
    ) {
      published ||= dateOnly(attrs.content);
    }
    if (/^<time/i.test(tag)) published ||= dateOnly(attrs.datetime);
  }
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1];
  return { published_on: published, source_title: title ? pageText(title, 300) : null };
}

function xmlText(item, name) {
  const raw = item.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}\\s*>`, 'i'))?.[1] || '';
  return decodeEntities(raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim();
}

export function newsArticles(rss, feed, now) {
  const articles = new Map();
  for (const match of rss.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi)) {
    const item = match[1];
    const title = pageText(xmlText(item, 'title'), 300);
    const description = pageText(xmlText(item, 'description'));
    if (!/lai suat cho vay|vay mua nha|lai suat tha noi|lai suat uu dai/.test(fold(`${title} ${description}`)))
      continue;
    const day = dateOnly(xmlText(item, 'pubDate') || xmlText(item, 'dc:date'));
    const url = sourceUrl(xmlText(item, 'link'), feed);
    if (!url || !recentNews(day, now)) continue;
    const previous = articles.get(url);
    if (!previous || day > previous.published_on) {
      articles.set(url, { source_url: url, source_kind: 'news', source_title: title, published_on: day, base: feed });
    }
  }
  return [...articles.values()].sort((a, b) => b.published_on.localeCompare(a.published_on));
}

// Mỗi HTTP request công khai (kể cả RSS, lỗi và redirect) đều trừ ngân sách.
export function createPageReader(fetcher, logger = console) {
  let count = 0;
  const seen = new Set();
  return {
    get count() {
      return count;
    },
    async read(address, base) {
      let url = sourceUrl(address, base);
      for (let redirects = 0; url && redirects <= 3 && count < MAX_PAGES; redirects++) {
        if (seen.has(url)) return null;
        seen.add(url);
        count++;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12_000);
        try {
          const response = await fetcher(url, {
            redirect: 'manual',
            signal: controller.signal,
            headers: { Accept: 'text/html,application/rss+xml,application/xml,text/xml' },
          });
          if (response.status >= 300 && response.status < 400) {
            await response.body?.cancel();
            url = sourceUrl(response.headers.get('Location') || '', url);
            continue;
          }
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const type = response.headers.get('Content-Type') || '';
          if (type && !/text\/|(?:rss\+)?xml|xhtml/i.test(type)) {
            await response.body?.cancel();
            return null;
          }
          const reader = response.body?.getReader();
          if (!reader) return null;
          const decoder = new TextDecoder();
          let html = '',
            size = 0;
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > 1_000_000) {
              await reader.cancel();
              break;
            }
            html += decoder.decode(chunk.value, { stream: true });
          }
          html += decoder.decode();
          return { html, url };
        } catch {
          logger.warn('bank-rates source failed', { url });
          return null;
        } finally {
          clearTimeout(timer);
        }
      }
      return null;
    },
  };
}
