// Test worker/fb-leads.js (không gọi mạng thật — giả lập Supabase + Graph API bằng fetch giả).
// Chạy: node tests/fb-leads.test.mjs
import assert from 'node:assert/strict';
import { normalizePhoneVN, parseFieldData, saveLead, handleFb, pollLeads } from '../worker/fb-leads.js';

// ---- chuẩn hoá SĐT + đọc form ----
assert.equal(normalizePhoneVN('+84 912 345 678'), '0912345678');
assert.equal(normalizePhoneVN('84912345678'), '0912345678');
assert.equal(normalizePhoneVN('912345678'), '0912345678');
const p = parseFieldData([
  { name: 'full_name', values: ['Nguyễn Văn Trường'] },
  { name: 'phone_number', values: ['+84912345678'] },
  { name: 'email', values: ['t@x.vn'] },
  { name: 'bạn_quan_tâm_loại_căn_nào?', values: ['2 phòng ngủ'] },
]);
assert.equal(p.full_name, 'Nguyễn Văn Trường');
assert.equal(p.phone, '0912345678');
assert.equal(p.apt_type, '2 phòng ngủ');
assert.ok(p.lines.includes('Email: t@x.vn'));

// ---- giả lập Supabase REST ----
function fakeEnv() {
  return { SUPABASE_URL: 'https://sb', SUPABASE_SERVICE_ROLE_KEY: 'k', FB_LEAD_OWNER_ID: 'owner-1', FB_PAGE_ID: 'page-1',
    FB_PAGE_ACCESS_TOKEN: 'tok', FB_APP_SECRET: 'appsecret', FB_VERIFY_TOKEN: 'verify', FB_MANUAL_SECRET: 'm' };
}
const db = { customers: [], fb_leads: [] };
const graphLeads = {
  L1: { id: 'L1', created_time: '2026-10-08T03:00:00+0000', form_id: 'F1', field_data: [{ name: 'full_name', values: ['Trần Hưởng'] }, { name: 'phone_number', values: ['0987654321'] }] },
};
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  const ok = (data) => new Response(JSON.stringify(data), { status: 200 });
  if (u.host === 'graph.facebook.com') {
    const path = u.pathname.split('/').slice(2).join('/');
    if (path === 'page-1/leadgen_forms') return ok({ data: [{ id: 'F1', name: 'Form NOXH Tràng Duệ' }] });
    if (path === 'F1/leads') return ok({ data: [{ id: 'L1' }] });
    if (path === 'F1') return ok({ name: 'Form NOXH Tràng Duệ' });
    if (graphLeads[path]) return ok(graphLeads[path]);
    return new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 });
  }
  const table = u.pathname.replace('/rest/v1/', '');
  const q = Object.fromEntries(u.searchParams);
  const method = init.method || 'GET';
  if (table === 'fb_leads' && method === 'GET') {
    const id = q.lead_id.replace('eq.', '');
    return ok(db.fb_leads.filter((r) => r.lead_id === id && r.status !== 'error'));
  }
  if (table === 'fb_leads' && method === 'POST') {
    const row = JSON.parse(init.body);
    db.fb_leads = db.fb_leads.filter((r) => r.lead_id !== row.lead_id).concat([row]);
    return new Response('', { status: 201 });
  }
  if (table === 'customers' && method === 'GET') return ok(db.customers.filter((c) => c.phone === q.phone.replace('eq.', '')));
  if (table === 'customers' && method === 'POST') {
    const row = { id: 'c' + (db.customers.length + 1), ...JSON.parse(init.body) };
    db.customers.push(row); return new Response(JSON.stringify([row]), { status: 201 });
  }
  if (table === 'customers' && method === 'PATCH') {
    const id = q.id.replace('eq.', ''); Object.assign(db.customers.find((c) => c.id === id), JSON.parse(init.body));
    return new Response(null, { status: 204 });
  }
  throw new Error('unexpected ' + method + ' ' + url);
};

const env = fakeEnv();
// ---- tạo khách mới ----
let r = await saveLead({ id: 'A1', created_time: '2026-10-08T01:00:00Z', form_id: 'F1',
  field_data: [{ name: 'full_name', values: ['Lê Ngữ'] }, { name: 'phone_number', values: ['+84 912 000 111'] }] }, 'Form A', env, 'manual');
assert.equal(r.status, 'created');
const c1 = db.customers[0];
assert.equal(c1.owner_id, 'owner-1'); assert.equal(c1.phone, '0912000111');
assert.deepEqual(c1.source, ['facebook_ads']); assert.equal(c1.intake_method, 'api');
assert.equal(c1.campaign, 'Form A'); assert.equal(c1.care_stage, 'Đăng kí mới');
assert.ok(c1.notes.includes('SĐT: +84 912 000 111'));

// ---- cùng SĐT → gộp, không tạo trùng ----
db.customers[0].source = ['website'];
r = await saveLead({ id: 'A2', created_time: '2026-10-08T02:00:00Z', field_data: [{ name: 'phone_number', values: ['0912000111'] }] }, 'Form B', env, 'manual');
assert.equal(r.status, 'merged'); assert.equal(db.customers.length, 1);
assert.deepEqual(db.customers[0].source, ['website', 'facebook_ads']);
assert.match(db.customers[0].notes_manual[0].text, /Đăng ký lại qua Facebook Lead Ads/);

// ---- thiếu SĐT → error, vẫn ghi nhật ký ----
r = await saveLead({ id: 'A3', field_data: [{ name: 'full_name', values: ['X'] }] }, null, env, 'manual');
assert.equal(r.status, 'error'); assert.equal(db.fb_leads.find((x) => x.lead_id === 'A3').status, 'error');

// ---- webhook: xác minh + chữ ký ----
let res = await handleFb(new Request('https://w/fb/webhook?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=123'), env);
assert.equal(await res.text(), '123');
res = await handleFb(new Request('https://w/fb/webhook?hub.mode=subscribe&hub.verify_token=sai&hub.challenge=1'), env);
assert.equal(res.status, 403);
const body = JSON.stringify({ object: 'page', entry: [{ changes: [{ field: 'leadgen', value: { leadgen_id: 'L1' } }] }] });
res = await handleFb(new Request('https://w/fb/webhook', { method: 'POST', body, headers: { 'X-Hub-Signature-256': 'sha256=deadbeef' } }), env);
assert.equal(res.status, 401, 'chữ ký sai phải bị chặn');
const { createHmac } = await import('node:crypto');
const sig = 'sha256=' + createHmac('sha256', 'appsecret').update(body).digest('hex');
res = await handleFb(new Request('https://w/fb/webhook', { method: 'POST', body, headers: { 'X-Hub-Signature-256': sig } }), env);
assert.equal(res.status, 200);
const hưởng = db.customers.find((c) => c.phone === '0987654321');
assert.ok(hưởng, 'webhook phải tạo khách'); assert.equal(hưởng.campaign, 'Form NOXH Tràng Duệ');

// ---- cron quét: lead đã có → duplicate, không tạo thêm ----
const before = db.customers.length;
const poll = await pollLeads(env);
assert.equal(poll.duplicate, 1); assert.equal(db.customers.length, before);

// ---- /fb/manual cần mật khẩu ----
res = await handleFb(new Request('https://w/fb/manual', { method: 'POST', body: '{}' }), env);
assert.equal(res.status, 401);
res = await handleFb(new Request('https://w/fb/manual', { method: 'POST', headers: { 'X-Intake-Secret': 'm' },
  body: JSON.stringify({ full_name: 'Đỗ Đường', phone: '0909 111 222', campaign: 'Zapier test', answers: { 'Dự án': 'Tràng Duệ' } }) }), env);
assert.equal((await res.json()).status, 'created');
assert.ok(db.customers.find((c) => c.full_name === 'Đỗ Đường').notes.includes('Dự án: Tràng Duệ'));

console.log('fb-leads: chuẩn hoá SĐT, đọc form, tạo/gộp/lỗi, webhook (xác minh + chữ ký), cron chống trùng, /fb/manual — passed.');
