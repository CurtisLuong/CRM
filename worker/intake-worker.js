// intake-worker.js — Cloudflare Worker: "cổng nhập liệu" (intake layer) cho CRM.
//
// Route hiện có:
//   POST /ocr   — nhận ảnh (base64), gọi Gemini vision, trả JSON field khách để
//                 app tự điền vào form "Thêm khách" (KHÔNG lưu thẳng — user rà tay).
// Route để dành cho sau (kênh 3 – leads landing page): CHƯA bật ở file này.
//
// ─────────────────────────────────────────────────────────────────────────────
// Biến/secret cần đặt cho Worker (Dashboard > Worker > Settings > Variables, hoặc
// `npx wrangler secret put <TÊN>`):
//   GEMINI_API_KEY    — API key Google AI Studio (BÍ MẬT — chỉ nằm ở Worker, không lộ ra app)
//   SUPABASE_URL      — URL project Supabase (để xác thực người dùng CRM)
//   SUPABASE_ANON_KEY — anon key Supabase (public, dùng cho endpoint /auth/v1/user)
//   ALLOWED_ORIGIN    — origin app được phép gọi, vd: https://crm-cop.pages.dev
//
// Vì sao phải xác thực: /ocr đốt quota Gemini (và có thể tính tiền) → CHỈ cho user
// đã đăng nhập CRM gọi. App gửi kèm access_token Supabase; Worker hỏi lại Supabase
// xem token có hợp lệ không. Người lạ không có token → bị chặn, không đốt được key.
// ─────────────────────────────────────────────────────────────────────────────

// Model Gemini dùng cho vision. Bản Flash có free tier rộng, đọc ảnh + xuất JSON tốt.
// Đổi tên tại đây nếu Google ra bản mới (vd 'gemini-2.5-pro' cho ảnh khó, tốn quota hơn).
const MODEL = 'gemini-2.5-flash';

// Ràng buộc cấu trúc JSON model phải trả về — khớp đúng field bảng customers.
// nullable:true để field không có trong ảnh thì trả null (không bịa).
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    phone:          { type: 'string',  nullable: true },
    full_name:      { type: 'string',  nullable: true },
    gender:         { type: 'string',  nullable: true }, // 'nam' | 'nữ' | 'khác'
    dob:            { type: 'string',  nullable: true }, // 'YYYY-MM-DD'
    marital_status: { type: 'string',  nullable: true }, // 'đã kết hôn' | 'chưa kết hôn'
    occupation:     { type: 'string',  nullable: true }, // 1 trong 4 nghề ở PROMPT
    income:         { type: 'string',  nullable: true },
    residence:      { type: 'string',  nullable: true },
    apt_type:       { type: 'string',  nullable: true },
    apt_code:       { type: 'string',  nullable: true },
    building_code:  { type: 'string',  nullable: true },
    apt_price:      { type: 'number',  nullable: true },
    projects:       { type: 'array',   nullable: true, items: { type: 'string' } },
    interest_level: { type: 'integer', nullable: true },
    note:           { type: 'string',  nullable: true },
  },
};

const PROMPT = `Bạn là trợ lý trích xuất dữ liệu KHÁCH HÀNG bất động sản (tiếng Việt) từ ẢNH.
Ảnh thường là chụp tin nhắn Zalo/Messenger hoặc form lead, có các dòng dạng
"Nhãn: giá trị" (vd "Full name:", "Phone number:", "Anh/Chị quan tâm đến căn mấy phòng ngủ ạ?:").

NHIỆM VỤ: chỉ lấy thông tin của KHÁCH (người điền form / để lại liên hệ) và điền vào
đúng các field dưới đây. Trả về DUY NHẤT 1 JSON.

NGUYÊN TẮC TỐI QUAN TRỌNG:
- Chỉ điền field khi thông tin ĐƯỢC VIẾT RÕ trong ảnh. Không có → để null.
- TUYỆT ĐỐI KHÔNG suy đoán/bịa (hallucination). Đặc biệt: KHÔNG đoán giới tính, tuổi,
  hôn nhân... từ ảnh đại diện hay từ tên. Chỉ lấy khi có chữ ghi rõ.
- BỎ QUA tin nhắn tự động/của phía tư vấn (vd "Chuyên viên tư vấn sẽ liên hệ...",
  "Xem trang web", "nhân viên kinh doanh bên em..."), lời chào, câu marketing.

CÁC FIELD (đúng thuộc tính CRM):
- phone: CHỈ chữ số, bỏ hết dấu cách/chấm (vd "093 274 12 27" → "0932741227"). Đọc kỹ từng số — đây là dữ liệu quan trọng nhất.
- full_name: họ tên khách.
- gender: 1 trong ['nam','nữ','khác'] — chỉ khi ghi rõ, không đoán từ ảnh/tên.
- dob: 'YYYY-MM-DD' (dương lịch). Chỉ có năm hoặc không chắc → null.
- marital_status: 'đã kết hôn' | 'chưa kết hôn' — chỉ khi ghi rõ.
- occupation: 1 trong ['Tự do','Công ty, DN','Công, viên chức','Công an, Bộ đội'] — chỉ khi khớp rõ.
- income: thu nhập (giữ nguyên chữ khách ghi).
- residence: nơi ở/thường trú.
- apt_type: loại căn theo số phòng ngủ - WC. Ánh xạ về ĐÚNG 1 giá trị chuẩn nếu khớp:
  ['1N-1WC','1N+, 1WC','2N-2WC','2N+, 2WC','3N-2WC'] (vd khách ghi "3N, 2WC" → "3N-2WC").
  Không khớp giá trị chuẩn nào → giữ nguyên chữ khách ghi.
- apt_code: mã căn. building_code: mã toà.
- apt_price: số tiền VND (vd "2 tỷ" → 2000000000).
- projects: mảng tên dự án khách quan tâm (nếu có).
- interest_level: số 0-100, chỉ khi ảnh thể hiện rõ; không rõ → null.
- note: gom thông tin đáng lưu ý KHÁC chưa có field riêng (vd diện tích "76.3 m2",
  nhu cầu, hoàn cảnh, câu khách nói) thành 1 câu ngắn; không có → null.`;

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), origin);
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/ocr') {
      return withCors(await handleOcr(request, env), origin);
    }
    return withCors(json({ error: 'Not found' }, 404), origin);
  },
};

function withCors(res, origin) {
  res.headers.set('Access-Control-Allow-Origin', origin);
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.headers.set('Vary', 'Origin');
  return res;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

async function handleOcr(request, env) {
  // 1) Xác thực: token Supabase phải hợp lệ (chặn người lạ đốt quota Gemini).
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Thiếu token đăng nhập' }, 401);
  const who = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
  });
  if (!who.ok) return json({ error: 'Phiên đăng nhập không hợp lệ' }, 401);

  // 2) Đọc ảnh từ body { image: <base64 không kèm data:>, mime }
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Body không hợp lệ' }, 400); }
  const image = body && body.image;
  const mime = (body && body.mime) || 'image/jpeg';
  if (!image) return json({ error: 'Thiếu ảnh' }, 400);

  // 3) Gọi Gemini (structured output — ép trả JSON đúng schema).
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  let gRes;
  try {
    gRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType: mime, data: image } }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
      }),
    });
  } catch (e) {
    return json({ error: 'Không gọi được Gemini', detail: String(e) }, 502);
  }
  if (!gRes.ok) {
    const t = await gRes.text();
    return json({ error: 'Gemini trả lỗi', status: gRes.status, detail: t.slice(0, 500) }, 502);
  }
  const g = await gRes.json();
  const text = g && g.candidates && g.candidates[0] && g.candidates[0].content
    && g.candidates[0].content.parts && g.candidates[0].content.parts[0]
    && g.candidates[0].content.parts[0].text;
  if (!text) return json({ error: 'Gemini không trả nội dung', raw: JSON.stringify(g).slice(0, 500) }, 502);
  let data;
  try { data = JSON.parse(text); } catch { return json({ error: 'Kết quả không phải JSON hợp lệ', raw: text.slice(0, 500) }, 502); }
  return json({ data });
}
