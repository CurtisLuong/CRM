/* Local search: shared matcher for customers and inventory, no network/build step. */
(function (root) {
  'use strict';
  const normalize = (v) => String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
  const aliases = (v) => normalize(v).replace(/(\d)[.,](?=\d)/g, '$1.').replace(/(\d+)\s*(?:phong ngu|pn|br)\b/g, '$1n').replace(/(\d+n\+?)\s*[,/-]\s*(\d+wc)\b/g, '$1-$2');
  // Group variants (2N+, corner units, any WC count) by bedroom count.
  function apartmentGroup(value) {
    const text = aliases(value);
    if (!text) return '';
    if (text === 'studio') return 'Studio';
    const rooms = text.match(/^(\d+)n(?=$|[^a-z])/);
    return rooms ? Number(rooms[1]) + 'N' : 'other';
  }
  function phone(v) {
    let d = String(v || '').replace(/\D/g, '');
    if (d.startsWith('0084')) d = '0' + d.slice(4);
    else if (d.startsWith('84') && (d.length >= 11 || /^\s*\+84/.test(String(v)))) d = '0' + d.slice(2);
    return d;
  }
  const phoneMatch = (p, q) => !!p && !!q && (p.startsWith(q) || (q.length >= 3 && p.includes(q)));
  function compile(raw, scope = 'all') {
    const text = aliases(raw), numeric = /^[\d\s+().,/-]+$/.test(text), digits = phone(raw);
    const phoneOnly = scope === 'phone' || (scope === 'all' && numeric && (/^0\d{9}$/.test(digits) || /^\+?84/.test(text) && digits.startsWith('0') || digits.length < 3));
    const terms = [...text.matchAll(/"([^"]+)"|([^\s"]+)/g)].map((m) => ({ text: m[1] || m[2], phrase: !!m[1] }));
    return { raw: String(raw || '').trim(), text, scope, numeric, digits, phoneOnly, terms, active: !!terms.length };
  }
  const groups = {
    name: ['Tên'], phone: ['SĐT'], unit: ['Mã căn', 'Mã toà'], year: ['Ngày sinh'],
    property: ['Dự án', 'Loại căn', 'Mã căn', 'Mã toà', 'Diện tích', 'Giá căn', 'Hướng', 'Tầng'],
    notes: ['Ghi chú', 'Lịch sử chăm sóc', 'Cuộc gọi', 'Thông tin đăng ký', 'Việc tiếp theo', 'Lý do loại']
  };
  function weight(label) { return label === 'Tên' ? 100 : label === 'SĐT' ? 120 : groups.property.includes(label) ? 45 : groups.notes.includes(label) ? 10 : 20; }
  function prepare(fields) {
    const list = fields.map(([label, value]) => ({ label, value: String(value).normalize('NFC'), norm: aliases(value), weight: weight(label) }));
    const name = list.find((f) => f.label === 'Tên')?.norm || '';
    return { fields: list, name, nameWords: name.split(/[^a-z]+/).filter(Boolean), phone: phone(list.find((f) => f.label === 'SĐT')?.value) };
  }
  // Restricted Damerau distance <= 1, including one adjacent transposition.
  function oneEdit(a, b) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    if (a.length === b.length) {
      const bad = []; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) bad.push(i);
      return bad.length === 1 || bad.length === 2 && bad[1] === bad[0] + 1 && a[bad[0]] === b[bad[1]] && a[bad[1]] === b[bad[0]];
    }
    const short = a.length < b.length ? a : b, long = a.length < b.length ? b : a;
    let i = 0, j = 0, edits = 0;
    while (i < short.length && j < long.length) {
      if (short[i] === long[j]) { i++; j++; } else { j++; if (++edits > 1) return false; }
    }
    return true;
  }
  function match(doc, ctx) {
    if (!ctx.active) return { match: true, score: 0, fuzzy: false, highlights: [] };
    if (ctx.phoneOnly) {
      const ok = phoneMatch(doc.phone, ctx.digits);
      return { match: ok, score: ok ? doc.phone === ctx.digits ? 2000 : doc.phone.startsWith(ctx.digits) ? 800 : 600 : 0, fuzzy: false, highlights: [ctx.digits] };
    }
    const fields = ctx.scope === 'all' ? doc.fields : doc.fields.filter((f) => (groups[ctx.scope] || []).includes(f.label));
    let score = 0, fuzzy = false; const highlights = [];
    for (const term of ctx.terms) {
      let best = 0;
      for (const f of fields) {
        if (f.label === 'SĐT' && /^\d+$/.test(term.text) && !phoneMatch(doc.phone, term.text)) continue;
        if (f.norm.includes(term.text)) best = Math.max(best, f.weight + (f.norm === term.text ? 30 : f.norm.startsWith(term.text) ? 10 : 0));
      }
      if (best) { score += best; highlights.push(term.text); continue; }
      const canFuzzy = !term.phrase && /^(?:[a-z]{4,12})$/.test(term.text) && (ctx.scope === 'all' || ctx.scope === 'name');
      const corrected = canFuzzy && doc.nameWords.find((word) => oneEdit(term.text, word));
      if (!corrected) return { match: false, score: 0, fuzzy: false, highlights: [] };
      fuzzy = true; score += 5; highlights.push(corrected);
    }
    if (doc.name === ctx.text) score += 1000;
    else if (ctx.terms.length && ctx.terms.every((t) => doc.name.includes(t.text))) score += 200;
    if (ctx.numeric && doc.phone === ctx.digits) score += 2000;
    return { match: true, score, fuzzy, highlights };
  }
  function escape(v) { return String(v).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
  // NFC keeps each Vietnamese letter together. Map normalized offsets to original
  // characters; collapse spaces exactly as normalize() does, preserving display.
  function mapped(text) {
    const original = String(text || '').normalize('NFC'); let norm = ''; const starts = [], ends = [];
    for (let i = 0; i < original.length; i++) {
      const c = original[i], n = normalize(c);
      if (/\s/.test(c)) {
        if (norm && !norm.endsWith(' ')) { norm += ' '; starts.push(i); ends.push(i + 1); }
        else if (norm.endsWith(' ')) ends[ends.length - 1] = i + 1;
      } else for (const ch of n) { norm += ch; starts.push(i); ends.push(i + 1); }
    }
    return { original, norm, starts, ends };
  }
  function highlight(text, terms, maxLen = 0) {
    const { original, norm: mappedNorm, starts, ends } = mapped(text); const norm = mappedNorm.replace(/(\d)[.,](?=\d)/g, '$1.'); const ranges = [];
    for (const raw of (Array.isArray(terms) ? terms : [terms])) {
      const q = normalize(raw).replace(/(\d)[.,](?=\d)/g, '$1.'); if (!q) continue;
      for (let i = norm.indexOf(q); i >= 0; i = norm.indexOf(q, i + q.length)) ranges.push([starts[i], ends[i + q.length - 1]]);
    }
    ranges.sort((a,b) => a[0] - b[0]); const merged = [];
    for (const r of ranges) { const last = merged[merged.length-1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push(r); }
    let start = 0, end = original.length;
    if (maxLen && merged.length && end > maxLen) { start = Math.max(0, merged[0][0] - Math.floor(maxLen/3)); end = Math.min(end, start+maxLen); start = Math.max(0,end-maxLen); }
    let out = start ? '…' : '', pos = start;
    for (const [a,b] of merged) { if (b <= start || a >= end) continue; const lo=Math.max(a,start), hi=Math.min(b,end); out += escape(original.slice(pos,lo))+'<mark>'+escape(original.slice(lo,hi))+'</mark>'; pos=hi; }
    return out + escape(original.slice(pos,end)) + (end < original.length ? '…' : '');
  }
  function range(value, min, max) {
    if (min == null && max == null) return true;
    if (value == null || value === '' || !Number.isFinite(Number(value))) return false;
    return (min == null || Number(value) >= min) && (max == null || Number(value) <= max);
  }
  root.CRMSearch = { normalize, aliases, apartmentGroup, phone, phoneMatch, compile, prepare, match, highlight, oneEdit, range };
  if (typeof module !== 'undefined') module.exports = root.CRMSearch;
})(typeof window !== 'undefined' ? window : globalThis);
