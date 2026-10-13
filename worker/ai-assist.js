// ai-assist.js — TRỢ LÝ AI cho trang hồ sơ khách (Cloudflare Workers AI, model mã nguồn mở).
//
// Route: POST /ai   body { task, customer, extra }
//   task 'brief'      — tóm tắt khách trước khi gọi + 2–3 câu cần hỏi.
//   task 'zalo'       — soạn 1 tin Zalo theo ngữ cảnh (extra.goal = mục đích tin, tuỳ chọn).
//   task 'parse_note' — tách 1 ghi chú thành ĐỀ XUẤT cập nhật thông tin + việc cần làm + lịch gọi.
//                       Chỉ ĐỀ XUẤT: app hiện hộp cho sale tick chọn rồi mới ghi (không ghi thẳng).
//
// `customer` = JSON khách do app dựng sẵn (buildAnalysisJSON trong js/app.js) — Worker KHÔNG đọc DB.
// Cần binding Workers AI tên `AI` (wrangler.toml [ai]). Không cần API key: tính vào tài khoản
// Cloudflare của Worker (gói miễn phí 10.000 neurons/ngày — đủ vài trăm lượt/ngày).

// ✏️ DANH SÁCH MODEL (1 chỗ duy nhất). App gửi extra.model = khoá ở đây ('qwen' | 'glm'); khoá lạ → DEFAULT_MODEL.
// Thêm model: thêm 1 dòng ở đây + 1 dòng AI_MODELS trong js/ai.js. Danh sách: developers.cloudflare.com/workers-ai/models/
//   thinking(on): cách bật/tắt chế độ "suy nghĩ" riêng từng model → { suffix nối vào prompt, params thêm vào lệnh gọi }.
const MODELS = {
  qwen: { id: '@cf/qwen/qwen3-30b-a3b-fp8', thinking: (on) => ({ suffix: on ? '' : ' /no_think', params: {} }) },
  glm:  { id: '@cf/zai-org/glm-4.7-flash',  thinking: (on) => ({ suffix: '', params: { chat_template_kwargs: { enable_thinking: on } } }) },
};
const DEFAULT_MODEL = 'qwen';

// THINK: bật chế độ "suy nghĩ" của model (chậm hơn vài giây, tốn token hơn) — chỉ cho việc tách ghi chú,
// nơi cần suy luận chính xác (việc nào thật sự cần làm, lịch gọi ≠ việc). Hai việc kia viết nhanh là đủ.
const THINK = { brief: false, zalo: false, parse_note: true };
const MAX_TOKENS = { brief: 700, zalo: 500, parse_note: 4000 };
const TEMPERATURE = { brief: 0.3, zalo: 0.6, parse_note: 0.1 };

// Phần CỐ ĐỊNH của system prompt (vai trò + an toàn dữ liệu + định dạng JSON). PHONG CÁCH VIẾT không nằm ở đây:
// sale tự sửa trong app (Trợ lý AI → Cài đặt), app gửi kèm extra.style → nối vào sau (chỉ cho tóm tắt + tin Zalo).
const SYSTEM_BASE = `Bạn là trợ lý của một sale bất động sản ở Việt Nam, bán dự án nhà ở xã hội tại Hải Phòng / Hưng Yên.
Bạn đọc dữ liệu khách từ CRM (JSON) và viết tiếng Việt tự nhiên.
NGUYÊN TẮC: chỉ dựa trên dữ liệu được đưa; KHÔNG bịa thông tin, con số, cam kết về lãi suất / pháp lý.
Thiếu dữ liệu thì nói rõ là chưa rõ. Luôn trả về DUY NHẤT 1 object JSON hợp lệ, không kèm chữ nào khác.`;
const STYLE_TASKS = ['brief', 'zalo'];
function systemFor(task, extra) {
  const style = STYLE_TASKS.includes(task) ? String((extra && extra.style) || '').trim().slice(0, 2000) : '';
  return style ? `${SYSTEM_BASE}\n\nPHONG CÁCH VIẾT (sale yêu cầu — tuân thủ khi viết nội dung):\n${style}` : SYSTEM_BASE;
}

function briefPrompt(customer) {
  return `Dữ liệu khách:
${JSON.stringify(customer)}

Viết TÓM TẮT TRƯỚC KHI GỌI cho sale đọc trong 10 giây. Trả JSON:
{
  "tom_tat": "2–3 câu: khách cần gì, đang ở bước nào, đang băn khoăn gì, lần trước đã hẹn / nói gì (bám ghi chú mới nhất)",
  "can_hoi": ["2–3 câu hỏi ngắn sale nên hỏi trong cuộc gọi này để làm rõ điều còn thiếu hoặc chốt bước tiếp"],
  "luu_y": "1 câu lưu ý (vd tránh nhắc điều gì, gọi đúng anh/chị) — hoặc chuỗi rỗng nếu không có"
}
Ưu tiên ghi chú gần nhất. Gọi khách đúng "anh"/"chị" theo giới tính nếu có.`;
}

function zaloPrompt(customer, extra) {
  const goal = String((extra && extra.goal) || '').trim().slice(0, 300);
  return `Dữ liệu khách:
${JSON.stringify(customer)}

Soạn 1 TIN NHẮN ZALO sale gửi cho khách này.${goal ? `\nMục đích tin do sale yêu cầu: "${goal}".` : '\nMục đích: hỏi thăm / giữ liên lạc, nhắc đúng vấn đề khách đang phân vân theo ghi chú gần nhất.'}
Yêu cầu:
- Xưng "em" XUYÊN SUỐT (không đổi sang "cháu"/"mình"), gọi khách "anh"/"chị" + tên (lấy TÊN GỌI = chữ cuối của họ tên). Không rõ giới tính → "anh/chị".
- KHÔNG tự giới thiệu tên của sale, không ký tên cuối tin (sale tự thêm nếu muốn).
- Bám 1 chi tiết cụ thể trong ghi chú (nếu có). Kết bằng 1 câu hỏi hoặc lời mời dễ trả lời.
- Không hashtag. Không hứa giá / lãi suất / suất mua cụ thể.
Trả JSON: { "tin_nhan": "nội dung tin" }`;
}

function parseNotePrompt(customer, extra) {
  const note = String((extra && extra.note) || '').slice(0, 1500);
  const o = (extra && extra.options) || {};
  const slots = (extra && extra.slots) || [];
  const list = (a) => (Array.isArray(a) && a.length ? a.map((x) => `"${x}"`).join(', ') : '(tự do)');
  return `Thời điểm hiện tại: ${String((extra && extra.now) || '')} (giờ Việt Nam).
Khung giờ gọi của app: ${slots.map((s) => `${s.key} = ${s.name} ${s.text}`).join('; ') || '(không có)'}.

Dữ liệu khách hiện có:
${JSON.stringify(customer)}

GHI CHÚ MỚI sale vừa nhập:
"""${note}"""

Từ GHI CHÚ MỚI, đề xuất những gì nên cập nhật vào CRM. CHỈ lấy điều ghi chú NÓI RÕ; không suy diễn.
Trả JSON đúng khung sau (field nào không có thì bỏ hẳn khỏi "cap_nhat"; không có việc thì mảng rỗng; không hẹn gọi thì null):
{
  "cap_nhat": {
    "apt_type": "1 trong: ${list(o.apt_types)}",
    "projects": ["tên dự án, chọn trong: ${list(o.projects)}"],
    "purpose": "1 trong: ${list(o.purpose)}",
    "marital_status": "1 trong: ${list(o.marital)}",
    "occupation": "1 trong: ${list(o.occupation)}",
    "finance": "số tiền khách có sẵn, đơn vị VND, số nguyên (vd 300 triệu → 300000000)",
    "apt_price": "giá căn khách nhắm, VND, số nguyên",
    "income": "thu nhập, chữ ngắn (vd ~25tr/tháng)",
    "residence": "nơi ở hiện tại"
  },
  "viec": [
    { "text": "việc cần làm, ngắn", "kind": "message|cafe|docs|visit|contract|other", "ngay": "mã ngày hoặc null", "time": "HH:MM hoặc null" }
  ],
  "hen_goi": { "ngay": "mã ngày", "slot": "mã khung A/B/C/D hợp nhất hoặc null", "time": "HH:MM nếu ghi chú nói giờ cụ thể, không thì null", "reason": "lý do gọi, ngắn" }
}
Quy tắc:
- "gọi lại / hẹn gọi" → điền "hen_goi" (KHÔNG đưa vào "viec"). Các việc khác (gửi bảng giá, hẹn xem nhà mẫu, nhắn Zalo...) → "viec".
- "ngay" = MÃ NGÀY, chép đúng ý ghi chú, KHÔNG tự tính ra ngày tháng: "hom_nay" | "mai" | "kia" (ngày kia) |
  "t2" "t3" "t4" "t5" "t6" "t7" "cn" (thứ trong tuần, vd "tối thứ Sáu" → "t6", "chủ nhật" → "cn") |
  "tuan_sau" (tuần sau, không rõ thứ) | "tuan_sau_t6" (thứ Sáu tuần sau) | "DD/MM" (ghi chú ghi rõ ngày, vd "20/10").
  Ghi chú không nói ngày → null.
- Mỗi việc / hẹn nói tới trong ghi chú là 1 mục riêng (vd "hẹn cafe" và "đưa đi xem nhà mẫu" = 2 việc).
- "sáng / trưa / chiều / tối" → chọn slot tương ứng theo tên khung; nói giờ cụ thể → time.
- Giá trị chọn-từ-danh-sách phải khớp CHÍNH XÁC 1 mục trong danh sách; không khớp thì bỏ field đó.
- Ghi chú chỉ kể lại (vd "khách chưa quyết, để nghĩ thêm") mà KHÔNG nêu việc phải làm → "viec" rỗng. Không bịa việc.
- Việc chỉ có "ngay"/"time" khi ghi chú nói thời điểm CHO CHÍNH VIỆC ĐÓ; không lấy thời điểm của lịch gọi gán cho việc khác.
- Không lặp lại thông tin khách đã có giống hệt.`;
}

// ─── Gọi model + đọc JSON ────────────────────────────────────────────────────
function textOf(out) {
  if (!out) return '';
  if (typeof out === 'string') return out;
  if (typeof out.response === 'string') return out.response;
  if (out.response && typeof out.response === 'object') return JSON.stringify(out.response);
  const ch = out.choices && out.choices[0];
  if (ch && ch.message && typeof ch.message.content === 'string') return ch.message.content;
  if (ch && typeof ch.text === 'string') return ch.text;
  return '';
}
// Qwen3 có thể kèm khối <think>…</think> → bỏ; lấy object JSON đầu tiên (bỏ ```json bao ngoài nếu có).
function parseJson(text) {
  let s = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a === -1 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

async function runModel(env, task, userPrompt, extra, modelKey) {
  const m = MODELS[modelKey];
  const th = m.thinking(!!THINK[task]);
  const messages = [{ role: 'system', content: systemFor(task, extra) }, { role: 'user', content: userPrompt + th.suffix }];
  let lastRaw = '';
  for (let attempt = 1; attempt <= 2; attempt++) { // JSON hỏng / lỗi tạm → thử lại 1 lần
    let out;
    try {
      out = await env.AI.run(m.id, { messages, max_tokens: MAX_TOKENS[task], temperature: TEMPERATURE[task], ...th.params });
    } catch (e) {
      lastRaw = (e && e.message) || String(e);
      console.log(`AI attempt ${attempt} lỗi`, lastRaw);
      continue;
    }
    lastRaw = textOf(out);
    const data = parseJson(lastRaw);
    if (data) return { data };
    console.log(`AI attempt ${attempt} JSON hỏng`, lastRaw.slice(0, 300));
  }
  return { error: lastRaw };
}

// ─── Làm sạch kết quả (không tin model hoàn toàn) ────────────────────────────
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
function cleanBrief(d) {
  return {
    tom_tat: str(d.tom_tat, 800),
    can_hoi: (Array.isArray(d.can_hoi) ? d.can_hoi : []).map((x) => str(x, 200)).filter(Boolean).slice(0, 3),
    luu_y: str(d.luu_y, 300),
  };
}
function cleanZalo(d) { return { tin_nhan: str(d.tin_nhan, 1200) }; }
// Mã ngày của model → 'YYYY-MM-DD', tính từ ngày hôm nay của máy sale (extra.today). Model tính lịch hay lệch
// nên chỉ cho nó chép ý ghi chú ("t6", "mai"…), còn đổi ra ngày làm bằng code ở đây.
const WD_CODE = { cn: 0, t2: 1, t3: 2, t4: 3, t5: 4, t6: 5, t7: 6 };
function resolveDay(code, today) {
  const m0 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(today || ''));
  if (!m0 || typeof code !== 'string') return null;
  const base = new Date(Date.UTC(+m0[1], +m0[2] - 1, +m0[3]));
  const add = (n) => { const d = new Date(base); d.setUTCDate(d.getUTCDate() + n); return d; };
  const iso = (d) => d.toISOString().slice(0, 10);
  const c = code.trim().toLowerCase();
  if (c === 'hom_nay') return iso(base);
  if (c === 'mai') return iso(add(1));
  if (c === 'kia') return iso(add(2));
  if (c === 'tuan_sau') return iso(add(7));
  const w = /^(tuan_sau_)?(cn|t[2-7])$/.exec(c);
  if (w) {
    let n = (WD_CODE[w[2]] - base.getUTCDay() + 7) % 7 || 7; // lần GẦN NHẤT sau hôm nay
    if (w[1]) { const toMon = ((1 - base.getUTCDay() + 7) % 7) || 7; n = toMon + ((WD_CODE[w[2]] + 6) % 7); } // tuần sau = tuần bắt đầu từ thứ Hai tới
    return iso(add(n));
  }
  const dm = /^(\d{1,2})\/(\d{1,2})$/.exec(c);
  if (dm) {
    let d = new Date(Date.UTC(base.getUTCFullYear(), +dm[2] - 1, +dm[1]));
    if (d < base) d = new Date(Date.UTC(base.getUTCFullYear() + 1, +dm[2] - 1, +dm[1])); // ngày đã qua → năm sau
    return iso(d);
  }
  return null;
}

function cleanParse(d, extra) {
  const today = extra && extra.today;
  const cu = d.cap_nhat && typeof d.cap_nhat === 'object' ? d.cap_nhat : {};
  const KINDS = ['message', 'cafe', 'docs', 'visit', 'contract', 'other'];
  const isTime = (v) => typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v);
  const out = { cap_nhat: {}, viec: [], hen_goi: null };
  for (const k of ['apt_type', 'purpose', 'marital_status', 'occupation', 'income', 'residence']) {
    if (str(cu[k], 200)) out.cap_nhat[k] = str(cu[k], 200);
  }
  if (Array.isArray(cu.projects)) {
    const p = cu.projects.map((x) => str(x, 120)).filter(Boolean);
    if (p.length) out.cap_nhat.projects = p.slice(0, 5);
  }
  for (const k of ['finance', 'apt_price']) {
    const n = Number(typeof cu[k] === 'string' ? cu[k].replace(/[^\d.]/g, '') : cu[k]);
    if (isFinite(n) && n >= 1e6) out.cap_nhat[k] = Math.round(n); // < 1 triệu = chắc chắn sai đơn vị → bỏ
  }
  for (const t of Array.isArray(d.viec) ? d.viec.slice(0, 5) : []) {
    if (!t || !str(t.text, 200)) continue;
    out.viec.push({
      text: str(t.text, 200), kind: KINDS.includes(t.kind) ? t.kind : 'other',
      date: resolveDay(t.ngay, today), time: isTime(t.time) ? t.time : null,
    });
  }
  const h = d.hen_goi;
  const hDate = h && typeof h === 'object' ? resolveDay(h.ngay, today) : null;
  if (hDate) {
    out.hen_goi = { date: hDate, slot: str(h.slot, 2).toUpperCase() || null, time: isTime(h.time) ? h.time : null, reason: str(h.reason, 200) };
  }
  // Lưới an toàn khi có lịch gọi: model hay (1) nhân đôi lịch gọi / mục đích cuộc gọi thành 1 "việc",
  // (2) gán giờ của cuộc gọi cho việc khác ("gửi bảng tính TRƯỚC khi gọi" ≠ làm lúc gọi).
  if (out.hen_goi) {
    const norm = (x) => String(x || '').toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
    const reason = norm(out.hen_goi.reason);
    out.viec = out.viec.filter((t) => {
      const tx = norm(t.text);
      return !/^(hẹn )?gọi( lại)?\b/.test(tx) && !(reason && (tx === reason || tx.includes(reason) || reason.includes(tx)));
    });
    for (const t of out.viec) {
      if (t.date === out.hen_goi.date && (t.time || null) === (out.hen_goi.time || null)) { t.date = null; t.time = null; }
    }
  }
  return out;
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export async function handleAi(request, env, json) {
  if (!env.AI) return json({ error: 'Worker chưa bật Workers AI (thiếu binding AI trong wrangler.toml).', code: 'no_binding' }, 500);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Body không hợp lệ' }, 400); }
  const task = body && body.task;
  const customer = body && body.customer;
  const extra = (body && body.extra) || {};
  if (!customer || typeof customer !== 'object') return json({ error: 'Thiếu dữ liệu khách' }, 400);
  // Chặn payload quá to (model 32k token; ghi chú dài cắt bớt ở app).
  if (JSON.stringify(customer).length > 40000) return json({ error: 'Dữ liệu khách quá dài' }, 413);

  let prompt, clean;
  if (task === 'brief') { prompt = briefPrompt(customer); clean = cleanBrief; }
  else if (task === 'zalo') { prompt = zaloPrompt(customer, extra); clean = cleanZalo; }
  else if (task === 'parse_note') {
    if (!String(extra.note || '').trim()) return json({ error: 'Thiếu nội dung ghi chú' }, 400);
    prompt = parseNotePrompt(customer, extra); clean = cleanParse;
  } else return json({ error: 'task không hợp lệ' }, 400);

  const modelKey = MODELS[extra.model] ? extra.model : DEFAULT_MODEL;
  const r = await runModel(env, task, prompt, extra, modelKey);
  if (r.error != null) {
    return json({ error: 'AI không trả kết quả hợp lệ — thử lại giúp mình.', code: 'bad_output', detail: String(r.error).slice(0, 300) }, 502);
  }
  return json({ data: clean(r.data, extra), model: modelKey });
}
