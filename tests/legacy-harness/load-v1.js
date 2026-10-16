// Nạp code v1 (js/*.js) vào một vm context để chạy logic thật mà không cần trình duyệt.
// - Đồng hồ giả (setNow) → đầu ra golden không phụ thuộc giờ chạy.
// - DOM giả "nuốt mọi thứ": các dòng gắn sự kiện / querySelector ở top-level app.js chạy được,
//   không vẽ gì. Không có mạng, không IndexedDB thật, không Supabase.
// - Script nạp đúng thứ tự index.html (bỏ supabase CDN). Không sửa file nào của v1.
'use strict';
process.env.TZ = 'Asia/Ho_Chi_Minh';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
// Thứ tự = các thẻ <script> trong index.html (trừ loan-ui/loan-pdf/catalog-ui… chỉ dựng giao diện).
const SCRIPTS = [
  'js/config.js', 'js/lunar.js', 'js/paged-fetch.js', 'js/search.js', 'js/db.js', 'js/notifications.js',
  'js/icons.js', 'js/followup.js', 'js/velocity.js', 'js/catalog.js', 'js/app.js', 'js/team.js', 'js/calls.js',
  'js/loan/loan-engine.js', 'js/property-search.js',
];

// Proxy gọi được / new được / đọc thuộc tính nào cũng ra chính nó. Giá trị nguyên thuỷ → ''.
// Không lưu gì khi gán (mọi $('#…') dùng chung 1 stub → gán innerHTML chỗ này không được lộ sang chỗ khác).
function makeStub() {
  const fn = function () {};
  let proxy;
  const handler = {
    get(target, prop) {
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === Symbol.iterator) return function* () {};
      if (prop === 'then') return undefined; // không bị coi là Promise
      if (prop === 'length') return 0;
      if (prop === 'prototype') return proxy;
      if (prop === 'toString' || prop === 'valueOf') return () => '';
      if (prop === 'createElement') return () => makeElement();
      return proxy;
    },
    set() { return true; },
    apply() { return proxy; },
    construct() { return proxy; },
    has() { return true; },
  };
  proxy = new Proxy(fn, handler);
  return proxy;
}

// Phần tử do document.createElement tạo: đủ để escapeHtml() của v1 chạy đúng như trình duyệt
// (gán textContent → đọc innerHTML ra chuỗi đã escape &, <, >, NBSP; null/undefined → '').
function makeElement() {
  const stub = makeStub();
  const own = { innerHTML: '', textContent: '' };
  return new Proxy(stub, {
    get(target, prop) { return prop in own ? own[prop] : stub[prop]; },
    set(target, prop, value) {
      if (prop === 'textContent') {
        const t = value == null ? '' : String(value);
        own.textContent = t;
        own.innerHTML = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\u00a0/g, '&nbsp;');
      } else own[prop] = value;
      return true;
    },
  });
}

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(String(k)); },
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

/**
 * Tạo context v1. opts.now: ISO hoặc ms cho đồng hồ giả. Trả về
 * { ctx, run(code), setNow(ms|iso), now() }.
 */
function loadV1(opts = {}) {
  let nowMs = typeof opts.now === 'string' ? Date.parse(opts.now) : (opts.now ?? Date.parse('2026-12-01T10:00:00+07:00'));
  const RealDate = Date;
  class ClockDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [nowMs])); }
    static now() { return nowMs; }
  }
  const timers = { setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
  const stub = makeStub();
  const sandbox = {
    Date: ClockDate, console: opts.quiet === false ? console : { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    ...timers, queueMicrotask, structuredClone, URL, URLSearchParams, TextEncoder, TextDecoder,
    Intl, Math, JSON, Promise, crypto: { randomUUID: () => 'uuid-not-used', getRandomValues: (a) => a },
    document: stub, navigator: { onLine: false, userAgent: 'legacy-harness', clipboard: stub, serviceWorker: stub },
    location: { href: 'https://crm-cop.pages.dev/', origin: 'https://crm-cop.pages.dev', pathname: '/', search: '', hash: '', reload() {} },
    history: { pushState() {}, replaceState() {}, back() {}, state: null },
    localStorage: memoryStorage(), sessionStorage: memoryStorage(),
    indexedDB: stub, fetch: () => Promise.reject(new Error('Không có mạng trong harness')),
    HTMLDialogElement: stub, HTMLElement: stub, Element: stub, Node: stub, Event: stub, CustomEvent: stub,
    MutationObserver: stub, ResizeObserver: stub, IntersectionObserver: stub, Image: stub, FileReader: stub,
    Blob: stub, File: stub, FormData: stub, CSS: { escape: (s) => String(s) }, matchMedia: () => stub,
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, requestIdleCallback: () => 0, cancelIdleCallback() {},
    getComputedStyle: () => stub, performance: { now: () => 0 }, alert() {}, confirm: () => true, prompt: () => null,
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, scrollTo() {},
    innerWidth: 390, innerHeight: 844, scrollY: 0, devicePixelRatio: 2, screen: stub, visualViewport: stub,
    supabase: stub,
  };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const rel of SCRIPTS) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    try { vm.runInContext(code, ctx, { filename: rel }); }
    catch (e) { e.message = `[load-v1] ${rel}: ${e.message}`; throw e; }
  }
  const run = (code) => vm.runInContext(code, ctx);
  return {
    ctx, run,
    setNow(v) { nowMs = typeof v === 'string' ? Date.parse(v) : v; },
    now: () => nowMs,
  };
}

module.exports = { loadV1, SCRIPTS, ROOT };
