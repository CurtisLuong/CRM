# ARCH-01 — Bản đồ kiến trúc từ code
Loại: code. Rủi ro: thấp. Khó: có. Base: factory. Milestone: v3.

## Mục tiêu

Curtis (không đọc code) mở `docs/architecture.html` là hiểu app có những phần nào, phần nào gọi phần nào, quyền và giới hạn của từng phần, dữ liệu đi đường nào, sửa phần nào ảnh hưởng phần nào, phần nào dễ bị tấn công. Nguồn duy nhất là `docs/architecture.json`; HTML sinh bằng script của kit.

## Bối cảnh

- Cách viết JSON: mục "Viết JSON thế nào cho tốt" trong `~/ai-factory-lab/factory-kit/skill/references/architecture.md`. Mẫu: `~/ai-factory-lab/factory-kit/templates/architecture.json` (chép bằng `node ~/ai-factory-lab/factory-kit/scripts/factory-arch.mjs --init`, rồi thay toàn bộ ví dụ).
- Nguồn hiểu dự án: `docs/ARCHITECTURE.md` hiện có (viết tay: §0 module/hợp đồng/vùng cấm, §3 dữ liệu, §4 luồng đồng bộ, §6 AI/Worker, §7 cầu nối Android, §8 build/PWA), `package.json`, `wrangler.toml`/`worker/`, `supabase/`, `SQL/`, `android-app/`, import giữa các thư mục `src/*`, nơi dùng `import.meta.env`. Tài liệu có thể cũ hơn code: code thắng, ghi chỗ lệch vào báo cáo.
- Khối gợi ý (gộp/tách theo code thật, 10–16 khối): màn hình `src/features`, giao diện `src/components` + `src/lib/crm`, luật nghiệp vụ `src/domain`, cấu hình `src/config`, dữ liệu cục bộ + hàng đợi đồng bộ + auth trong `src/data`, Supabase (DB + RLS, đăng nhập, Storage, Realtime), Cloudflare Worker (AI/OCR/giọng nói), Cloudflare Pages + PWA/Service Worker, vỏ Android `android-app/`, dịch vụ AI bên ngoài (nếu có trong `worker/`).
- Luồng nên có (1–3): ghi cuộc gọi/ghi chú khi mất mạng → IndexedDB → hàng đợi → Supabase → máy khác nhận; đăng nhập; gợi ý AI (không gửi SĐT).
- **Quan trọng:** script sinh ra cả `docs/ARCHITECTURE.md` và sẽ ghi đè file viết tay đó. Sau mỗi lần chạy script, trả lại file cũ bằng `git checkout -- docs/ARCHITECTURE.md`. Không được nộp thay đổi nào ở file này.

## Phạm vi

- `docs/architecture.json`
- `docs/architecture.html`

## PHẢI

- Mỗi khối trỏ tới thư mục có thật hoặc dịch vụ ngoài có thật trong cấu hình. Mỗi mũi tên có `evidence` dạng `file:dòng` có thật (import hoặc lời gọi).
- Mọi khối có quyền, giới hạn, lộ diện, rủi ro; khối lộ diện public/auth hoặc rủi ro cao có ít nhất 1 mục threats. Dữ liệu/đồng bộ/auth/RLS = rủi ro cao.
- `aiTip` của từng khối nhắc đúng hàng rào của dự án (vd. `src/data/**` và `SQL/**` là vùng cấm của worker; migration chỉ thêm D-012; AI chỉ đề xuất).
- Tiếng Việt có dấu, câu ngắn, cho người không học IT. Chỉ ghi tên biến môi trường, không ghi giá trị khoá/mật khẩu/URL quản trị. Threats ghi loại rủi ro và cách đang chặn, không ghi bước khai thác.
- Sinh HTML bằng script, không sửa tay `docs/architecture.html`.

## CẤM

- Sửa file nào khác, kể cả `docs/ARCHITECTURE.md`. Vẽ thứ chưa có trong code (dự định thì bỏ qua).
- Chạy `npm run e2e` (task không đụng code app).

## Nghiệm thu

- Báo cáo cuối liệt kê khối/mũi tên bạn không chắc (đoán từ tên thư mục) và chỗ tài liệu lệch code.

```bash
node ~/ai-factory-lab/factory-kit/scripts/factory-arch.mjs && git checkout -- docs/ARCHITECTURE.md && test -s docs/architecture.html && git diff --quiet -- docs/ARCHITECTURE.md
```
