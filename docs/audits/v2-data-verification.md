# Kiểm chứng dữ liệu v2 trên staging (T5.2)

> **Trạng thái:** ĐANG LÀM — công cụ + runbook xong (2026-10-17); dùng staging hiện tại (bỏ Phần A); chờ Phần B.
> **Cách làm:** `docs/runbooks/data-verification.md`. **Công cụ (chỉ đọc):** `scripts/verify/counts.sql`, `scripts/verify/audit-since.sql`, `scripts/verify/idb-counts.js`.
> **Xong khi (tasks.md T5.2):** báo cáo có số liệu trước/sau; **0 mất dữ liệu**.
> Ký hiệu: ✅ đạt · ❌ lỗi (có task con) · ⏳ chưa chạy. Ghi rõ nơi kiểm: *local* / *trình duyệt* / *staging* / *máy thật*.

## 0. Staging dùng cho lần kiểm

| Mục | Giá trị |
|---|---|
| Project | `mksjmpcsfawsiabfhoxe` (staging hiện tại) |
| Khôi phục từ backup | `~/CRM-backups/20261016-120548` (diễn tập T0.1, khớp 22/22 bảng). **Không** khôi phục lại — chủ dự án chọn 2026-10-17 |
| Độ lệch so với yêu cầu | tasks.md T5.2 yêu cầu staging khôi phục từ production **mới nhất**. Lần kiểm này dùng bản 2026-10-16 + dữ liệu chủ dự án đã thử trên v2 từ đó. Hệ quả: (1) khách/ghi chú/cuộc gọi tạo trên production sau 2026-10-16 không có trong lần kiểm; (2) có thể có bản ghi do v2 tạo/sửa trước Phần B — vẫn nằm trong "số liệu gốc" nên không ảnh hưởng so sánh trước/sau. Bù lại: T5.4 backup + chạy migration v2 trên production ngay trước cutover |
| Migration v2 đã chạy trên staging | **Phát hiện 2026-10-17:** staging **chưa** có 002–006 (kiểm cột: `cot_002=0, bang_003_001=1, cot_004=0, cot_005_006=0`) → v2 trên staging chạy thiếu cột v2 từ trước tới nay; tasks.md §4 "chạy SQL v2 trên production sau khi agent báo đã qua staging" chưa từng qua staging. Chạy bổ sung 002→006 trên staging trước Phần B: ⏳ · `tests/sql/002_005_v2.test.sql`: ⏳ |
| Bản v2 được kiểm | `v2` @ `fbd2e0e` (2026-10-17 10:58) — `crm-v2-9hf.pages.dev` |
| Mốc giờ bắt đầu (Phần B) | ⏳ |

## 1. Số liệu trước / sau (`counts.sql`, staging)

| Mục | Trước (Phần B) | Sau (Phần F) | Chênh | Giải thích |
|---|---|---|---|---|
| 01 khách (tổng) | ⏳ | ⏳ | | |
| 02 khách đang dùng | ⏳ | ⏳ | | |
| 03 khách đã lưu trữ | ⏳ | ⏳ | | |
| 04 khách mới (chưa phân loại) | ⏳ | ⏳ | | |
| 05 việc (tổng) | ⏳ | ⏳ | | |
| 06 việc đang mở | ⏳ | ⏳ | | |
| 07 cuộc gọi (tổng) | ⏳ | ⏳ | | |
| 08 cuộc gọi chưa ghi kết quả | ⏳ | ⏳ | | |
| 09 ghi chú hồ sơ | ⏳ | ⏳ | | |
| 10 khách có ghi chú đăng ký | ⏳ | ⏳ | | |
| 11 mốc lịch sử bậc | ⏳ | ⏳ | | |
| 12 tương tác ngoài cuộc gọi | ⏳ | ⏳ | | |
| 20 tài liệu | ⏳ | ⏳ | | |
| 21 nhật ký thay đổi | ⏳ | ⏳ | | |
| 30 vân tay khách (bỏ `updated_at`) | ⏳ | ⏳ | | Chỉ được đổi do Phần E |
| 32 vân tay tài liệu | ⏳ | ⏳ | | Phải giữ nguyên |

## 2. Số v2 hiện khớp DB (Phần C)

| Tài khoản | Mục | DB (`counts.sql`) | v2 máy (`idb-counts.js`) | Màn v2 | Kết quả |
|---|---|---|---|---|---|
| ⏳ admin | khách / khách mới / việc mở / cuộc gọi / ghi chú | ⏳ | ⏳ | ⏳ | ⏳ |
| ⏳ thành viên | khách / khách mới / việc mở / cuộc gọi / ghi chú | ⏳ | ⏳ | ⏳ | ⏳ |

## 3. Mở + lưu không sửa (Phần D)

| Mục | Kết quả |
|---|---|
| Số khách đã mở + lưu | ⏳ / ⏳ |
| `audit-since` từ mốc Phần D | ⏳ (đạt = `thay đổi: 0`) |
| Vân tay 30 so với Phần B | ⏳ (đạt = giống hệt) |

## 4. Kịch bản rủi ro (Phần E)

| # | Kịch bản | Nơi kiểm | Kết quả | Bằng chứng |
|---|---|---|---|---|
| E1 | Offline rồi đóng app | máy thật + staging | ⏳ | |
| E2 | 2 máy sửa cùng khách | máy thật + staging | ⏳ | Rủi ro đã biết: 2 máy cùng thêm phần tử vào **cùng một mảng** khi offline → bản ghi sau thắng cả mảng (LWW theo cột, D-012) → có thể mất 1 ghi chú. `audit-since` sẽ báo `✗ MẤT PHẦN TỬ` |
| E3 | Mở gọi rồi huỷ | trình duyệt/máy thật + staging | ⏳ | |
| E4 | Webhook FB lặp | local | ✅ chống trùng (test) · ⏳ thật | `node tests/fb-leads.test.mjs` → passed (2026-10-17). Không thử thật trên staging: Worker `intake-worker` chỉ có 1 bản, `SUPABASE_URL` là secret dùng cho production — bắn lead thử sẽ ghi vào production |
| E5 | Đổi tài khoản | trình duyệt + staging | ⏳ | |
| E6 | Hàng đợi chéo v1 ↔ v2 cùng máy | local | ✅ | `npx vitest run tests/data/localdb.test.ts` → 20/20 pass (2026-10-17): v2 gửi đúng hàng đợi v1 ghi (đúng thứ tự, upsert/patch/delete), v1 gửi đúng op v2, cùng xử lý lỗi. Thật chỉ xảy ra lúc cutover (cùng tên miền) → runbook T5.4 giữ bước "mọi máy Đã đồng bộ" |

## 5. Mất dữ liệu (`audit-since.sql` từ mốc Phần B, staging)

| Mức | Số dòng | Ghi chú / task con |
|---|---|---|
| ✗ XOÁ CỨNG | ⏳ | |
| ✗ MẤT PHẦN TỬ | ⏳ | |
| ✗ MẤT THUỘC TÍNH | ⏳ | |
| ⚠ TRƯỜNG BỊ XOÁ | ⏳ | |

**Kết luận:** ⏳

## 6. Tự kiểm công cụ (local, 2026-10-17)

`counts.sql` và `audit-since.sql` chạy trên Postgres 17 cục bộ với schema giả lập + `SQL/v2/001_customer_audit.sql` + `002_customer_memory.sql` thật, dữ liệu giả 3 khách:

- Số đếm khớp dữ liệu giả (khách, khách mới, việc mở, cuộc gọi chưa ghi, ghi chú, lịch sử bậc, theo người phụ trách).
- "Lưu không sửa" (`update … set updated_at`) → nhật ký 0 dòng, vân tay 30 giữ nguyên, vân tay 31 đổi — đúng ý đồ.
- Phá dữ liệu có chủ đích → bắt đủ: xoá cứng, mất phần tử `call_attempts`/`notes_manual`, mất thuộc tính lạ `x_lạ`, trường `notes` bị xoá trống; sửa nội dung việc (giữ `at`) **không** bị báo mất.
- `idb-counts.js`: mới kiểm cú pháp (`node --check`); chạy thật ở Phần C.
