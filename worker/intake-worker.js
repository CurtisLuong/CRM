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

// Chống lỗi 524 (Cloudflare cắt vì Gemini treo/quá lâu): mỗi lần gọi Gemini chờ TỐI ĐA
// GEMINI_TIMEOUT_MS rồi tự huỷ (AbortController) — trả lỗi rõ nghĩa thay vì để treo tới ~100s.
// Lỗi TẠM THỜI (timeout, lỗi mạng, 5xx kể cả 524) → tự thử lại tới GEMINI_MAX_ATTEMPTS lần.
const GEMINI_TIMEOUT_MS = 45000; // 45s/lần, dưới ngưỡng ~100s của Cloudflare
const GEMINI_MAX_ATTEMPTS = 2;   // 1 lần đầu + 1 lần thử lại

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
    apt_area:       { type: 'NUMBER',  nullable: true }, // diện tích m² (vd 68.6), thường trong ngoặc sau loại căn
    apt_code:       { type: 'STRING',  nullable: true },
    building_code:  { type: 'STRING',  nullable: true },
    apt_price:      { type: 'NUMBER',  nullable: true },
    projects:       { type: 'ARRAY',   nullable: true, items: { type: 'STRING' } },
    interest_level: { type: 'INTEGER', nullable: true },
    note:           { type: 'STRING',  nullable: true },
    message_time:   { type: 'STRING',  nullable: true }, // giờ tin nhắn 'HH:MM' (24h)
    message_day:    { type: 'INTEGER', nullable: true }, // ngày (1-31) kèm cạnh giờ, null nếu ảnh CHỈ có giờ
    message_month:  { type: 'INTEGER', nullable: true }, // tháng (1-12) kèm cạnh giờ, null nếu chỉ có giờ
    message_year:   { type: 'INTEGER', nullable: true }, // năm — CHỈ khi ảnh ghi rõ năm, còn lại null
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
- apt_area: DIỆN TÍCH căn hộ (m²), SỐ THỰC (vd 68.6). Thường ghi TRONG NGOẶC ngay SAU loại
  căn, vd "2N+, 2WC (68.6 m2)" → apt_area = 68.6. Chỉ lấy phần SỐ (bỏ "m2"/"m²"). Không có → null.
- apt_code: mã căn. building_code: mã toà.
- apt_price: số tiền VND (vd "2 tỷ" → 2000000000).
- projects: mảng tên dự án khách quan tâm (nếu có).
- interest_level: số 0-100, chỉ khi ảnh thể hiện rõ; không rõ → null.
- note: gom thông tin đáng lưu ý KHÁC chưa có field riêng (nhu cầu, hoàn cảnh, câu khách
  nói) thành 1 câu ngắn; không có → null. LƯU Ý: DIỆN TÍCH đã có field apt_area riêng —
  TUYỆT ĐỐI KHÔNG đưa diện tích vào note.
- message_time / message_day / message_month / message_year: MỐC THỜI GIAN của tin nhắn
  khách gửi cho page, hiển thị trong cuộc trò chuyện (thường ở dòng header phía TRÊN tin
  nhắn, vd "22:51 22 THG 8" hoặc chỉ "07:28").
  • ĐÂY LÀ MỐC CỦA TIN NHẮN — TUYỆT ĐỐI KHÔNG lấy đồng hồ trên THANH TRẠNG THÁI điện thoại
    (góc trên cùng màn hình, vd "10:03" cạnh sóng/pin) — đó KHÔNG phải giờ tin nhắn.
  • message_time: giờ, dạng 24h "HH:MM" (vd "07:28"; "2:50 PM" → "14:50"; "22:51" → "22:51").
  • Nếu cạnh giờ CÓ KÈM NGÀY (Messenger/Facebook chỉ kèm ngày khi tin KHÔNG phải hôm nay):
    đọc NGÀY + THÁNG vào message_day, message_month. Định dạng tiếng Việt: "THG" = "tháng",
    vd "22 THG 8" → message_day=22, message_month=8; "22 tháng 8" hay "22/8" cũng vậy.
    Chỉ điền message_year khi ảnh GHI RÕ năm (vd "22 THG 8, 2024" → message_year=2024); không
    ghi năm → message_year=null.
  • Nếu cạnh giờ CHỈ CÓ GIỜ (không có ngày) → message_day, message_month, message_year đều null.
  • KHÔNG tự suy hôm nay/hôm qua/năm — chỉ đọc ĐÚNG những gì ghi trong ảnh; app sẽ tự tính.
  • Không thấy mốc thời gian tin nhắn nào → tất cả 4 field null.`;

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

// Gọi Gemini 1 lần, tự huỷ nếu quá timeoutMs (AbortController). Trả:
//   { res }                    — có response (dù ok hay lỗi status, để bên gọi tự xử)
//   { timedOut: true, message } — bị huỷ do quá lâu
//   { timedOut: false, message }— lỗi mạng khác
async function callGeminiOnce(endpoint, payload, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    return { res };
  } catch (e) {
    return { timedOut: e && e.name === 'AbortError', message: (e && e.message) || String(e) };
  } finally {
    clearTimeout(timer);
  }
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

  // 3) Gọi Gemini (structured output — ép trả JSON đúng schema) CÓ timeout + tự thử lại.
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const payload = {
    contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType: mime, data: image } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
  };

  let gRes = null;
  let lastTimedOut = false, lastStatus = 0, lastDetail = '', lastNetErr = '';
  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    const r = await callGeminiOnce(endpoint, payload, GEMINI_TIMEOUT_MS);
    if (r.res) {
      if (r.res.ok) { gRes = r.res; break; }
      lastStatus = r.res.status;
      lastDetail = (await r.res.text()).slice(0, 500);
      console.log(`Gemini attempt ${attempt} status`, lastStatus, lastDetail.slice(0, 300)); // xem `wrangler tail`
      // 5xx (kể cả 524 do Cloudflare tự sinh khi treo) = tạm thời → thử lại; 4xx = lỗi cố định → dừng.
      if (lastStatus >= 500 && attempt < GEMINI_MAX_ATTEMPTS) continue;
      break;
    }
    // Không có res = timeout (AbortError) hoặc lỗi mạng.
    lastTimedOut = r.timedOut; lastNetErr = r.message || '';
    console.log(`Gemini attempt ${attempt} ${r.timedOut ? 'TIMEOUT' : 'network error'}`, lastNetErr);
    if (attempt < GEMINI_MAX_ATTEMPTS) continue; // thử lại
  }

  if (!gRes) {
    // Thông báo PHÂN LOẠI rõ (thay cho "Gemini trả lỗi" mập mờ trước đây).
    if (lastTimedOut) {
      return json({ error: 'Gemini phản hồi quá lâu — thử lại giúp mình (ảnh nhỏ & rõ hơn sẽ nhanh hơn).', code: 'timeout' }, 504);
    }
    if (lastStatus >= 500) {
      return json({ error: 'Gemini đang bận/quá tải — thử lại sau ít phút.', code: 'busy', status: lastStatus, detail: lastDetail }, 502);
    }
    if (lastStatus >= 400) {
      return json({ error: 'Gemini từ chối yêu cầu (kiểm tra ảnh / tên model / API key).', code: 'rejected', status: lastStatus, detail: lastDetail }, 502);
    }
    return json({ error: 'Không gọi được Gemini (lỗi mạng).', code: 'network', detail: lastNetErr }, 502);
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
