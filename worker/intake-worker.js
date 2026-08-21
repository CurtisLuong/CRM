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
// Đổi tên tại đây nếu Google ra bản mới (vd bản 'pro' cho ảnh khó, tốn quota hơn).
const MODEL = 'gemini-3.6-flash'; // 2.5-flash đã ngừng cho user mới (Google báo dùng 3.6-flash)

// Ràng buộc cấu trúc JSON model phải trả về — khớp đúng field bảng customers.
// LƯU Ý: Gemini đòi `type` viết HOA (OBJECT/STRING/NUMBER/INTEGER/ARRAY), không
// phải chữ thường. nullable:true để field không có trong ảnh thì trả null (không bịa).
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    phone:          { type: 'STRING',  nullable: true },
    full_name:      { type: 'STRING',  nullable: true },
    gender:         { type: 'STRING',  nullable: true }, // 'nam' | 'nữ' | 'khác'
    gender_confidence: { type: 'INTEGER', nullable: true }, // 0-100: độ chắc chắn của gender (suy từ tên)
    dob:            { type: 'STRING',  nullable: true }, // 'YYYY-MM-DD'
    marital_status: { type: 'STRING',  nullable: true }, // 'đã kết hôn' | 'chưa kết hôn'
    occupation:     { type: 'STRING',  nullable: true }, // 1 trong 4 nghề ở PROMPT
    income:         { type: 'STRING',  nullable: true },
    residence:      { type: 'STRING',  nullable: true },
    apt_type:       { type: 'STRING',  nullable: true },
    apt_code:       { type: 'STRING',  nullable: true },
    building_code:  { type: 'STRING',  nullable: true },
    apt_price:      { type: 'NUMBER',  nullable: true },
    projects:       { type: 'ARRAY',   nullable: true, items: { type: 'STRING' } },
    interest_level: { type: 'INTEGER', nullable: true },
    note:           { type: 'STRING',  nullable: true },
    message_time:   { type: 'STRING',  nullable: true }, // giờ tin nhắn 'HH:MM' (24h)
  },
};

const PROMPT = `Bạn là trợ lý trích xuất dữ liệu KHÁCH HÀNG bất động sản (tiếng Việt) từ ẢNH.
Ảnh thường là chụp tin nhắn Zalo/Messenger hoặc form lead, có các dòng dạng
"Nhãn: giá trị" (vd "Full name:", "Phone number:", "Anh/Chị quan tâm đến căn mấy phòng ngủ ạ?:").

NHIỆM VỤ: chỉ lấy thông tin của KHÁCH (người điền form / để lại liên hệ) và điền vào
đúng các field dưới đây. Trả về DUY NHẤT 1 JSON.

NGUYÊN TẮC TỐI QUAN TRỌNG:
- Chỉ điền field khi thông tin ĐƯỢC VIẾT RÕ trong ảnh. Không có → để null.
- TUYỆT ĐỐI KHÔNG suy đoán/bịa (hallucination) cho hầu hết field. KHÔNG đoán tuổi,
  hôn nhân, thu nhập, nghề... từ ảnh đại diện hay từ tên. Chỉ lấy khi có chữ ghi rõ.
  NGOẠI LỆ DUY NHẤT: giới tính ĐƯỢC PHÉP suy luận từ TÊN — xem quy tắc ở field gender.
- BỎ QUA tin nhắn tự động/của phía tư vấn (vd "Chuyên viên tư vấn sẽ liên hệ...",
  "Xem trang web", "nhân viên kinh doanh bên em..."), lời chào, câu marketing.

CÁC FIELD (đúng thuộc tính CRM):
- phone: đọc kỹ TỪNG SỐ (dữ liệu quan trọng nhất). Chỉ chữ số, bỏ dấu cách/chấm.
  Chuẩn hoá (SĐT VN chỉ 10 số): (1) bắt đầu "+84" → thay bằng "0"; (2) bắt đầu "84"
  và đủ 11 chữ số → đổi "84" thành "0"; (3) không bắt đầu "0" và chưa đủ 10 chữ số →
  thêm "0" đầu. Số nước ngoài/khác thì GIỮ NGUYÊN, không động vào.
  VD "093 274 12 27" → "0932741227"; "+84 932 741 227" → "0932741227"; "84932741227" → "0932741227"; "932741227" → "0932741227".
- full_name: họ tên khách.
- gender: 1 trong ['nam','nữ','khác'].
  • Nếu ảnh GHI RÕ giới tính → lấy đúng, gender_confidence = 100.
  • Nếu KHÔNG ghi rõ nhưng có full_name → ĐƯỢC PHÉP suy luận giới tính từ TÊN tiếng Việt
    (đa số tên tiếng Việt đoán được giới tính khá chắc), và tự chấm gender_confidence.
  • TUYỆT ĐỐI KHÔNG đoán giới tính từ ẢNH ĐẠI DIỆN/khuôn mặt — chỉ từ chữ ghi rõ hoặc từ tên.
  • Tên trung tính/không rõ (vd chỉ có họ, hoặc tên dùng được cả nam lẫn nữ) → cho
    gender_confidence THẤP tương ứng, đừng gượng đoán chắc.
  • Không có tên và ảnh không ghi rõ → gender = null.
- gender_confidence: SỐ NGUYÊN 0-100 = độ chắc chắn của giá trị gender ở trên (100 =
  ảnh ghi rõ; suy từ tên thì chấm theo mức chắc thật sự). gender = null thì để null.
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
  nhu cầu, hoàn cảnh, câu khách nói) thành 1 câu ngắn; không có → null.
- message_time: GIỜ tin nhắn của khách hiển thị trong cuộc trò chuyện (mốc thời gian
  cạnh/dưới tin nhắn), dạng 24h "HH:MM" (vd "07:28"; nếu ảnh ghi "2:50 PM" → "14:50").
  Ưu tiên mốc giờ của TIN NHẮN, không phải đồng hồ trên thanh trạng thái điện thoại.
  Không thấy → null.`;

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
    console.log('Gemini error', gRes.status, t.slice(0, 800)); // xem qua `wrangler tail`
    return json({ error: 'Gemini trả lỗi', status: gRes.status, detail: t.slice(0, 500) }, 502);
  }
  const g = await gRes.json();
  const text = g && g.candidates && g.candidates[0] && g.candidates[0].content
    && g.candidates[0].content.parts && g.candidates[0].content.parts[0]
    && g.candidates[0].content.parts[0].text;
  if (!text) return json({ error: 'Gemini không trả nội dung', raw: JSON.stringify(g).slice(0, 500) }, 502);
  let data;
  try { data = JSON.parse(text); } catch { return json({ error: 'Kết quả không phải JSON hợp lệ', raw: text.slice(0, 500) }, 502); }

  // Giới tính suy từ tên chỉ đáng tin khi model tự chấm ĐỘ CHẮC CHẮN >= 90%. Dưới ngưỡng
  // (hoặc không chấm điểm) → coi như KHÔNG RÕ: bỏ gender (để trống cho user tự chọn khi rà),
  // tránh điền sai với tên trung tính. Áp ở Worker cho chắc, không phó mặc model tự lọc.
  const GENDER_MIN_CONFIDENCE = 90;
  if (data && data.gender && !(Number(data.gender_confidence) >= GENDER_MIN_CONFIDENCE)) {
    data.gender = null;
  }

  return json({ data });
}
