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
| Mốc giờ bắt đầu (Phần B) | 2026-10-17 12:05 (+07) |
| Theo người phụ trách (Phần B) | `a70e8d12…`: 87 khách · 22 khách mới · 14 việc mở · 45 cuộc gọi · 67 ghi chú — `ef44fb2f…`: 1 khách · 1 khách mới · 0 việc mở · 1 cuộc gọi · 0 ghi chú (cả 2 `profiles.full_name` trống) |
| Nhận xét số liệu gốc | 88 khách = đúng số production lúc backup 2026-10-16 (T0.3), `customer_changes` = 0 dòng → staging chưa bị sửa khách nào kể từ khi khôi phục |
| Vân tay đầy đủ (Phần B) | khách `41b3fb4a1535f590e2005bdda10936d3` · bỏ `updated_at` `faf8a2d74e2fa7d721e0f0328828ffa1` · tài liệu `456e5f42987e40cbec38034e33b5d2b6` |

## 1. Số liệu trước / sau (`counts.sql`, staging)

| Mục | Trước (Phần B) | Sau (Phần F) | Chênh | Giải thích |
|---|---|---|---|---|
| 01 khách (tổng) | 88 | ⏳ | | |
| 02 khách đang dùng | 88 | ⏳ | | |
| 03 khách đã lưu trữ | 0 | ⏳ | | |
| 04 khách mới (chưa phân loại) | 23 | ⏳ | | |
| 05 việc (tổng) | 16 | ⏳ | | |
| 06 việc đang mở | 14 | ⏳ | | |
| 07 cuộc gọi (tổng) | 46 | ⏳ | | |
| 08 cuộc gọi chưa ghi kết quả | 1 | ⏳ | | |
| 09 ghi chú hồ sơ | 67 | ⏳ | | |
| 10 khách có ghi chú đăng ký | 4 | ⏳ | | |
| 11 mốc lịch sử bậc | 220 | ⏳ | | |
| 12 tương tác ngoài cuộc gọi | 0 | ⏳ | | |
| 20 tài liệu | 59 | ⏳ | | |
| 21 nhật ký thay đổi | 0 | ⏳ | | |
| 30 vân tay khách (bỏ `updated_at`) | `faf8a2d7…` | ⏳ | | Chỉ được đổi do Phần E |
| 32 vân tay tài liệu | `456e5f42…` | ⏳ | | Phải giữ nguyên |

## 2. Số v2 hiện khớp DB (Phần C)

| Tài khoản | Mục | DB (`counts.sql` 12:05) | v2 máy (`idb-counts.js` 12:30) | Màn v2 | Kết quả |
|---|---|---|---|---|---|
| `a70e8d12…` (admin, trình duyệt trong app Claude, Mac) | khách (tổng / đang dùng / lưu trữ) | 88 / 88 / 0 | 88 / 88 / 0 | Khách hàng: "88 khách đã nạp" · "13 tiềm năng, 74 khách mới, 1 khách nhóm" | ✅ |
| | việc (tổng / đang mở) | 16 / 14 | 16 / 14 | Công việc: "24 việc" = 12 hẹn gọi + 12 việc của khách chưa loại (màn bỏ khách đã loại — `taskRows`) | ✅ |
| | cuộc gọi (tổng / chưa ghi) | 46 / 1 | 46 / 1 | — | ✅ |
| | ghi chú hồ sơ · ghi chú đăng ký · mốc lịch sử bậc · tương tác | 67 · 4 · 220 · 0 | 67 · 4 · 220 · 0 | — | ✅ |
| | khách mới chưa phân loại | 23 | **11** | Khách mới › Trong phễu: 10 thẻ (= 10 của `a70e8d12`) | ✅ có giải thích ↓ |
| | theo người phụ trách | `a70e8d12` 87 · `ef44fb2f` 1 | `a70e8d12` 87 · `ef44fb2f` 1 | — | ✅ |
| | hàng đợi chưa gửi | — | 0 ("Đã đồng bộ 12:29") | — | ✅ |
| `ef44fb2f…` (thành viên) | — | 1 khách | ⏳ chưa đăng nhập | ⏳ | ⏳ |

**Lệch "khách mới" 23 → 11 = 12 khách tự chuyển Loại lúc đăng nhập (12:26), không phải lỗi đọc dữ liệu.** 12 khách bậc "Đăng kí mới" có `disqualified_at` sau 12:05, `disqualify_reason = khong_lien_lac_duoc`, `updated_at` sau 12:05; không khách nào khác đổi `updated_at`. Đây là tự chuyển SLA đã duyệt (D-008, `src/domain/velocity/automation.ts`, giống v1 `runSlaAutomation` trong `legacy/js/app.js`): dữ liệu staging dừng ở 2026-10-16 nên tới 2026-10-17 các khách này quá hạn SLA. Thay đổi đã đồng bộ lên staging → nằm trong nhật ký từ 12:05; `audit-since` (mốc 2026-10-17 00:00, chạy staging) xác nhận ✅: `thay đổi: 12 · khách bị đổi: 12 · lỗi ✗: 0 · cảnh báo ⚠: 21`. Cột đổi chỉ gồm `disqualified_at`, `disqualify_reason`, `disqualify_note` (12 khách) và `next_call_at/end/reason` (7 khách có lịch hẹn → bị gỡ khi chuyển Loại, đúng v1; 21 cảnh báo ⚠ = 7 × 3 trường này). Thời điểm 12:26:09–12:26:24 — lần đăng nhập v2 đầu tiên của chủ dự án (trước khi đăng nhập lại trong trình duyệt app Claude lúc ~12:29); nên ghi chính xác: tự chuyển lúc **12:26**, không phải 12:29.

Ghi nhận phụ (không phải mất dữ liệu): 4 việc đang mở thuộc khách đã loại không hiện ở màn Công việc (màn bỏ khách đã loại).

## 3. Mở + lưu không sửa (Phần D)

| Mục | Kết quả |
|---|---|
| Số liệu gốc Phần D (`counts.sql`, sau tự chuyển SLA, trước 12:39) | khách mới 11 · nhật ký 12 dòng · vân tay khách bỏ `updated_at` `9008590ad4693378b219ba0b25cca86d` · đầy đủ `4b5aa4a77ab93a0ce9fc72efba113286` · tài liệu `456e5f42987e40cbec38034e33b5d2b6` (= Phần B); các số khác = Phần B |
| Mốc giờ Phần D | 2026-10-17 12:39 (+07) |
| Ô thông tin (tab Trí nhớ + Nhu cầu & căn), trình duyệt trong app Claude | 87/87 khách của `a70e8d12` · ~4.000 lượt focus → blur mọi ô text/textarea/number/date (trừ ô tích) · 12:40–12:44 → **0 khách đổi `updated_at`, hàng đợi 0** ✅ |
| Sửa việc → lưu không đổi (màn Công việc) | 10 việc hiện trên màn, form `Lưu sửa` gửi không đổi → 1 khách (`a84dcc02…`) đổi `updated_at` 12:44:04, `next_tasks` giống hệt từng ký tự trước/sau → nghi gửi lại bản giống hệt (khác thứ tự khoá); chờ `audit-since` xác nhận 0 dòng ⏳ |
| Sửa kết quả cuộc gọi → lưu không đổi (Thao tác nhanh) | 1 khách (`01d822c6…`, 1 cuộc gọi `busy`) → chỉ `updated_at` đổi; `call_attempts`, ghi chú, lịch hẹn, bậc giữ nguyên ✅ |
| Sửa ghi chú hồ sơ → lưu không đổi (Dòng thời gian) | 1 khách (`018b946e…`, 1 ghi chú) → ❌ **thêm `edited_at`** vào ghi chú dù nội dung giống hệt; `text`, `at` giữ nguyên. Nguyên nhân `src/features/profile/route.tsx` `saveTimelineEntry`: luôn ghi + gắn `edited_at`, và `trim()` nội dung (ghi chú cũ có khoảng trắng đầu/cuối sẽ bị đổi chữ). Cùng lỗi ở ghi chú lịch sử bậc. Không mất dữ liệu; vi phạm tiêu chí "mở + lưu không sửa → không đổi giá trị" → **task con** (phạm vi T5.6) |
| `audit-since` từ mốc Phần D | ⏳ (mong đợi: `thay đổi: 1` = `018b946e…` cột `notes_manual`, lỗi ✗: 0) |
| Vân tay 30 so với số liệu gốc Phần D | ⏳ (mong đợi **khác** đúng do 1 ghi chú trên; các số đếm giữ nguyên) |

Chưa làm: positive control "sửa thật 1 ô → có ghi" để chứng minh cách bấm tự động kích hoạt lưu — làm ở Phần E trên khách thử.

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
