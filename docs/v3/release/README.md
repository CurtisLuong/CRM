# Phát hành v3 (M1–M5) — chờ Curtis duyệt

> 2026-10-19 · Nhánh `factory` (so với production `main` f63bf7d). Ảnh: các file `*.png` trong thư mục này (dữ liệu giả; chấm đỏ góc trên = "lỗi đồng bộ" do máy chụp không nối Supabase thật).

## Đã đổi

| Milestone | Người dùng thấy |
|---|---|
| M1 | Không còn mã thô (`busy`, `facebook_ads`…), ngày ISO, `[object Object]`, chữ nội bộ; một khối lỗi không làm trắng cả app |
| M2 | Design System v4 "Precision Tonal": màu mới (đạt AA sáng/tối), nút phụ không viền, thẻ khách, thanh SLA 7 đoạn |
| M3 | Hôm nay: dải "Gọi lần lượt N khách" + nhóm theo tín hiệu; nhóm gấp = thẻ đầy đủ (tên + nút Gọi; lần gọi gần nhất, số lần, ghi chú cuối, SLA); nhóm ít gấp thu gọn; bỏ tab lọc và nhãn P0 |
| M4 | Hồ sơ: tên/bậc/SLA → Việc tiếp theo → Lần trước → Đã biết + "Còn thiếu" → dòng thời gian có lọc; đổi bậc bằng sheet; 4 nút Gọi/Zalo/Ghi chú/Hẹn ở đáy (điện thoại) |
| M5 | Khách hàng: tìm + chip tệp, bộ lọc vào sheet, ⋯ chứa Retarget/Đồng nghiệp/Xuất/Lưu trữ, thẻ gọn có hạn gọi; nút Gọi giờ đi luồng chuẩn (có sheet ghi kết quả). Công việc: mỗi việc một thẻ gọn. Hiệu quả: 4 con số đầu trang, chi tiết thu gọn |

**Không đụng** SQL, Supabase, Worker, vỏ Android, tầng dữ liệu `src/data` (FACT: `git diff origin/main..factory` các thư mục này rỗng) → không cần migration; APK không cần build lại (vỏ mở `crm-cop.pages.dev`).

## Đã kiểm (máy Lead, dữ liệu giả)

- `npm run check`: 902 unit test đạt.
- E2E Playwright 360 / 390 / 1280px, sáng/tối: toàn bộ đạt (lần cuối 301 đạt + các file sửa chạy lại đạt). Chập chờn có từ trước, chạy lại đạt: `tests/data/sync.test.ts`, `tests/e2e/sync.spec.ts`.
- Chưa kiểm: preview Cloudflare, điện thoại thật, vỏ Android, dữ liệu thật.

## Các bước (Curtis)

1. **Kiểm Cloudflare preview** theo `docs/runbooks/factory-preview.md` (preview phải dùng Supabase **staging**). Báo Lead "staging/production/trống".
2. **Push nhánh `factory`** để có bản xem trước:
   ```bash
   git push "$(git remote get-url origin)" factory:factory
   ```
3. **Thử trên điện thoại** (bản preview, dữ liệu staging) — danh sách dưới. 10–15 phút.
4. **Duyệt** → Lead merge `factory` → `main` và push; Cloudflare tự deploy production `crm-cop.pages.dev`.

**Quay lui nếu có sự cố:** Cloudflare Pages → crm-cop → Deployments → bản của commit `f63bf7d` → *Rollback to this deployment* (không ảnh hưởng dữ liệu vì v3 không đổi dữ liệu).

## Danh sách thử trên điện thoại (preview staging)

| # | Làm | Đúng khi |
|---|---|---|
| 1 | Mở Hôm nay | Thấy dải "Gọi lần lượt N khách"; khách quá hẹn có vạch đỏ bên trái + nút **Gọi** to |
| 2 | Bấm **Gọi** trên một thẻ | Gọi điện; quay lại app hiện sheet "Kết quả cuộc gọi" |
| 3 | Chạm tên khách | Mở hồ sơ: thấy Việc tiếp theo, Lần trước, Đã biết; 4 nút ở đáy, không còn thanh điều hướng |
| 4 | Hồ sơ → bấm nút bậc | Sheet chọn bậc; đổi bậc → hỏi hẹn lịch như cũ |
| 5 | Hồ sơ → Dòng thời gian → chip "Cuộc gọi" | Chỉ còn cuộc gọi, nhãn tiếng Việt |
| 6 | Khách hàng | Thấy ngay danh sách (~7 khách màn đầu); nút Lọc mở sheet; ⋯ có Tệp & Retarget / Đồng nghiệp / Xuất / Khách đã lưu trữ |
| 7 | Công việc → tick hoàn tất một việc | Việc sang "Đã xong", có Hoàn tác |
| 8 | Hiệu quả | 4 ô số ở đầu; bấm ô mở khối chi tiết |
| 9 | Đổi Sáng/Tối (Cài đặt) | Cả hai đọc rõ |
| 10 | Tắt mạng → thêm ghi chú cho 1 khách → bật mạng | Ghi chú được giữ và đồng bộ (không mất dữ liệu) |
