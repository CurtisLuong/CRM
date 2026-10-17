# Kiểm chứng dữ liệu v2 trên staging (T5.2)

> **Trạng thái:** XONG kiểm chứng 2026-10-17 — xem Kết luận mục 5. Còn 3 task con trước T5.4 (T5.6a, T5.6b, T5.8a).
> **Cách làm:** `docs/runbooks/data-verification.md`. **Công cụ (chỉ đọc):** `scripts/verify/counts.sql`, `scripts/verify/audit-since.sql`, `scripts/verify/idb-counts.js`.
> **Xong khi (tasks.md T5.2):** báo cáo có số liệu trước/sau; **0 mất dữ liệu**.
> Ký hiệu: ✅ đạt · ❌ lỗi (có task con) · ⏳ chưa chạy. Ghi rõ nơi kiểm: *local* / *trình duyệt* / *staging* / *máy thật*.

## 0. Staging dùng cho lần kiểm

| Mục | Giá trị |
|---|---|
| Project | `mksjmpcsfawsiabfhoxe` (staging hiện tại) |
| Khôi phục từ backup | `~/CRM-backups/20261016-120548` (diễn tập T0.1, khớp 22/22 bảng). **Không** khôi phục lại — chủ dự án chọn 2026-10-17 |
| Độ lệch so với yêu cầu | tasks.md T5.2 yêu cầu staging khôi phục từ production **mới nhất**. Lần kiểm này dùng bản 2026-10-16 + dữ liệu chủ dự án đã thử trên v2 từ đó. Hệ quả: (1) khách/ghi chú/cuộc gọi tạo trên production sau 2026-10-16 không có trong lần kiểm; (2) có thể có bản ghi do v2 tạo/sửa trước Phần B — vẫn nằm trong "số liệu gốc" nên không ảnh hưởng so sánh trước/sau. Bù lại: T5.4 backup + chạy migration v2 trên production ngay trước cutover |
| Migration v2 đã chạy trên staging | **Phát hiện 2026-10-17:** staging **chưa** có 002–006 (kiểm cột: `cot_002=0, bang_003_001=1, cot_004=0, cot_005_006=0`) → v2 trên staging chạy thiếu cột v2 từ trước tới nay; tasks.md §4 "chạy SQL v2 trên production sau khi agent báo đã qua staging" chưa từng qua staging. Chạy bổ sung 002→006 trên staging trước Phần B: ✅ (chủ dự án: 5 file Success; kiểm cột lại 3·2·1·2; trigger audit `trigger_count = 3`, `rls = true`) · `tests/sql/002_005_v2.test.sql`: chưa báo kết quả |
| Bản v2 được kiểm | `v2` @ `fbd2e0e` (2026-10-17 10:58) — `crm-v2-9hf.pages.dev` |
| Mốc giờ bắt đầu (Phần B) | 2026-10-17 12:05 (+07) |
| Theo người phụ trách (Phần B) | `a70e8d12…`: 87 khách · 22 khách mới · 14 việc mở · 45 cuộc gọi · 67 ghi chú — `ef44fb2f…`: 1 khách · 1 khách mới · 0 việc mở · 1 cuộc gọi · 0 ghi chú (cả 2 `profiles.full_name` trống) |
| Nhận xét số liệu gốc | 88 khách = đúng số production lúc backup 2026-10-16 (T0.3), `customer_changes` = 0 dòng → staging chưa bị sửa khách nào kể từ khi khôi phục |
| Vân tay đầy đủ (Phần B) | khách `41b3fb4a1535f590e2005bdda10936d3` · bỏ `updated_at` `faf8a2d74e2fa7d721e0f0328828ffa1` · tài liệu `456e5f42987e40cbec38034e33b5d2b6` |

## 1. Số liệu trước / sau (`counts.sql`, staging)

| Mục | Trước (Phần B, 12:05) | Sau (Phần F, ~15:45) | Chênh | Giải thích |
|---|---|---|---|---|
| 01 khách (tổng) | 88 | 89 | +1 | khách thử `Test T5.2 1` (E1) |
| 02 khách đang dùng | 88 | 89 | +1 | khách thử |
| 03 khách đã lưu trữ | 0 | 0 | 0 |  |
| 04 khách mới (chưa phân loại) | 23 | 12 | −11 | −12 tự chuyển Loại SLA (12:26) + 1 khách thử |
| 05 việc (tổng) | 16 | 18 | +2 | `việc offline e1`, `việc Mac E2` |
| 06 việc đang mở | 14 | 16 | +2 | như trên |
| 07 cuộc gọi (tổng) | 46 | 47 | +1 | cuộc gọi E3 (Không nghe) |
| 08 cuộc gọi chưa ghi kết quả | 1 | 1 | 0 |  |
| 09 ghi chú hồ sơ | 67 | 72 | +5 | khách thử: offline e1, từ điện thoại e2, e5, Điện thoại e2, Mac E2 lần 2 (ghi chú Mac E2 lần 1 bị mất ở E2 lần 1 → không tính) |
| 10 khách có ghi chú đăng ký | 4 | 4 | 0 |  |
| 11 mốc lịch sử bậc | 220 | 221 | +1 | mốc "Đăng kí mới" khi tạo khách thử |
| 12 tương tác ngoài cuộc gọi | 0 | 0 | 0 |  |
| 20 tài liệu | 59 | 59 | 0 |  |
| 21 nhật ký thay đổi | 0 | 22 | +22 | = `audit-since` mục 5 |
| 30 vân tay khách (bỏ `updated_at`) | `faf8a2d7…` | `f6f1470b…` | đổi | chỉ do SLA + Phần D + Phần E (nhật ký mục 5) |
| 32 vân tay tài liệu | `456e5f42…` | `456e5f42…` | giữ nguyên | ✅ |

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
| `ef44fb2f…` (thành viên) | — | 1 khách | không kiểm: tài khoản chưa ai dùng, không có mật khẩu (chủ dự án) | — | bỏ qua |

**Lệch "khách mới" 23 → 11 = 12 khách tự chuyển Loại lúc đăng nhập (12:26), không phải lỗi đọc dữ liệu.** 12 khách bậc "Đăng kí mới" có `disqualified_at` sau 12:05, `disqualify_reason = khong_lien_lac_duoc`, `updated_at` sau 12:05; không khách nào khác đổi `updated_at`. Đây là tự chuyển SLA đã duyệt (D-008, `src/domain/velocity/automation.ts`, giống v1 `runSlaAutomation` trong `legacy/js/app.js`): dữ liệu staging dừng ở 2026-10-16 nên tới 2026-10-17 các khách này quá hạn SLA. Thay đổi đã đồng bộ lên staging → nằm trong nhật ký từ 12:05; `audit-since` (mốc 2026-10-17 00:00, chạy staging) xác nhận ✅: `thay đổi: 12 · khách bị đổi: 12 · lỗi ✗: 0 · cảnh báo ⚠: 21`. Cột đổi chỉ gồm `disqualified_at`, `disqualify_reason`, `disqualify_note` (12 khách) và `next_call_at/end/reason` (7 khách có lịch hẹn → bị gỡ khi chuyển Loại, đúng v1; 21 cảnh báo ⚠ = 7 × 3 trường này). Thời điểm 12:26:09–12:26:24 — lần đăng nhập v2 đầu tiên của chủ dự án (trước khi đăng nhập lại trong trình duyệt app Claude lúc ~12:29); nên ghi chính xác: tự chuyển lúc **12:26**, không phải 12:29.

Ghi nhận phụ (không phải mất dữ liệu): 4 việc đang mở thuộc khách đã loại không hiện ở màn Công việc (màn bỏ khách đã loại).

## 3. Mở + lưu không sửa (Phần D)

| Mục | Kết quả |
|---|---|
| Số liệu gốc Phần D (`counts.sql`, sau tự chuyển SLA, trước 12:39) | khách mới 11 · nhật ký 12 dòng · vân tay khách bỏ `updated_at` `9008590ad4693378b219ba0b25cca86d` · đầy đủ `4b5aa4a77ab93a0ce9fc72efba113286` · tài liệu `456e5f42987e40cbec38034e33b5d2b6` (= Phần B); các số khác = Phần B |
| Mốc giờ Phần D | 2026-10-17 12:39 (+07) |
| Ô thông tin (tab Trí nhớ + Nhu cầu & căn), trình duyệt trong app Claude | 87/87 khách của `a70e8d12` · ~4.000 lượt focus → blur mọi ô text/textarea/number/date (trừ ô tích) · 12:40–12:44 → **0 khách đổi `updated_at`, hàng đợi 0** ✅ |
| Sửa việc → lưu không đổi (màn Công việc) | 10 việc hiện trên màn, form `Lưu sửa` gửi không đổi → 1 khách (`a84dcc02…`) đổi `updated_at` 12:44:04, `next_tasks` giống hệt từng ký tự trước/sau → nghi gửi lại bản giống hệt (khác thứ tự khoá); `audit-since` xác nhận: **không có dòng nhật ký** cho khách này (chỉ `updated_at` đổi) ✅ |
| Sửa kết quả cuộc gọi → lưu không đổi (Thao tác nhanh) | 1 khách (`01d822c6…`, 1 cuộc gọi `busy`) → chỉ `updated_at` đổi; `call_attempts`, ghi chú, lịch hẹn, bậc giữ nguyên ✅ |
| Sửa ghi chú hồ sơ → lưu không đổi (Dòng thời gian) | 1 khách (`018b946e…`, 1 ghi chú) → ❌ **thêm `edited_at`** vào ghi chú dù nội dung giống hệt; `text`, `at` giữ nguyên. Nguyên nhân `src/features/profile/route.tsx` `saveTimelineEntry`: luôn ghi + gắn `edited_at`, và `trim()` nội dung (ghi chú cũ có khoảng trắng đầu/cuối sẽ bị đổi chữ). Cùng lỗi ở ghi chú lịch sử bậc. Không mất dữ liệu; vi phạm tiêu chí "mở + lưu không sửa → không đổi giá trị" → **task con** (phạm vi T5.6) |
| `audit-since` (chạy với mốc 00:00, đọc phần sau 12:39) | ✅ đúng mong đợi: tổng `thay đổi: 13 · lỗi ✗: 0` = 12 tự chuyển SLA lúc 12:26 + **đúng 1** thay đổi sau 12:39: `018b946e…` cột `notes_manual` lúc 12:45:35 (ghi chú lưu không sửa ở trên). Sửa việc (`a84dcc02…`) và sửa cuộc gọi (`01d822c6…`) không sinh dòng nhật ký → không đổi giá trị |
| `counts.sql` sau Phần D | ✅ mọi số đếm giữ nguyên (khách 88, việc 16/14, cuộc gọi 46/1, ghi chú 67, lịch sử bậc 220, tài liệu 59); nhật ký 12 → 13 (+1 = ghi chú trên); vân tay khách bỏ `updated_at` `9008590a…` → `26b2304fc98bf94f7979fdfa4d21c98d` (khác duy nhất do ghi chú trên — nhật ký chứng minh); vân tay tài liệu giữ nguyên `456e5f42…` |
| **Kết luận Phần D** | Đạt cho ô thông tin, sửa việc, sửa cuộc gọi. **Không đạt** cho sửa ghi chú hồ sơ / lịch sử bậc (gắn `edited_at` khi lưu không đổi) → task con T5.6a, phải xong trước T5.4. 0 mất dữ liệu |

Chưa làm: positive control "sửa thật 1 ô → có ghi" để chứng minh cách bấm tự động kích hoạt lưu — làm ở Phần E trên khách thử.

## 4. Kịch bản rủi ro (Phần E)

| # | Kịch bản | Nơi kiểm | Kết quả | Bằng chứng |
|---|---|---|---|---|
| E1 | Offline rồi đóng app | Android Chrome (máy thật) + staging + Mac | ✅ (trừ cuộc gọi) | 12:55–13:15. Chế độ máy bay → tạo khách `Test T5.2 1` (`d063bb16…`, `0900000001`) + 1 ghi chú + 1 việc → đóng hẳn Chrome → mở lại offline: còn đủ (chủ dự án) → bật mạng: "Đã đồng bộ". Mac (trình duyệt app Claude) nhận về đủ: 89 khách, khách thử có 1 ghi chú + 1 việc đúng nội dung. **Cuộc gọi chưa ghi được:** v2 không có nút ghi cuộc gọi nhập tay (v1 có `📞 Ghi cuộc gọi`, `legacy/js/calls.js` cách 1) — hộp ghi kết quả chỉ mở sau khi bấm Gọi (quay số) hoặc với cuộc gọi đang chờ. Thiếu parity mà `v2-parity.md` (T5.1) đánh ✅ → **task con**; phần ghi cuộc gọi offline kiểm cùng E3 |
| E2 | 2 máy sửa cùng khách | Android Chrome + Mac (trình duyệt app Claude) + staging | ❌ lần 1 (bản trước T5.9) → ✅ **lần 2 sau T5.9** | ~13:45–13:49, khách `Test T5.2 1` (`d063bb16…`). Điện thoại offline thêm ghi chú `Ghi chú từ điện thoại e2`; Mac online thêm `Thêm ghi chú từ Mac e2` (đã gửi lên) và đổi Nghề nghiệp = `Kĩ sư`; điện thoại online lúc 06:48:56Z. **(1) Mất ghi chú:** server (GET chỉ đọc) còn `notes_manual` = [điện thoại e2, offline e1] — ghi chú của Mac bị ghi đè vì điện thoại gửi nguyên mảng `notes_manual` theo bản cũ (LWW theo cột, D-012; v1 cùng cơ chế nên cũng mất). Mac vẫn hiện ghi chú đã mất (không kéo lại khi hàng đợi chưa rỗng). Chi tiết nhật ký: chạy `audit-since` ⏳ (mong đợi `✗ MẤT PHẦN TỬ notes_manual`). **(2) Kẹt đồng bộ:** PATCH `occupation = 'Kĩ sư'` bị server từ chối 400 `23514 customers_occupation_check` — cột chỉ nhận `Tự do / Công ty, DN / Công, viên chức / Công an, Bộ đội` (`SQL/schema.sql`, `src/config/occupations.ts`), nhưng ô Nghề nghiệp trong hồ sơ v2 là ô gõ tự do (`src/features/profile/route.tsx` `Field`). Cùng lỗi với **Giới tính** (`nam/nữ/khác`), **Hôn nhân** (`đã kết hôn/chưa kết hôn`), **Mục đích** (`Ở/Đầu tư/Cho tặng`). `flushQueue` dừng ở op lỗi (`src/data/queue.ts` `break`) → **mọi thao tác sau đó trên máy này không lên server** cho tới khi gỡ op lỗi; app chỉ hiện "Lỗi đồng bộ", không nói lý do, không có nút bỏ. v1 dùng ô chọn nên không gặp. → 2 task con, **chặn cutover**. **Quyết định chủ dự án 2026-10-17:** (a) gỡ kẹt Mac bằng cách bỏ đúng op lỗi `occupation = 'Kĩ sư'` (opId 34, khách thử, server chưa từng nhận) khỏi hàng đợi IndexedDB của Mac — agent làm 13:53, Mac "Đã đồng bộ 13:54", hàng đợi 0, dữ liệu Mac = server; (b) lỗi mất phần tử khi 2 máy cùng sửa một mảng: **sửa trước cutover** (không chấp nhận như v1). **Lần 2 (sau T5.9, `v2` @ `4271bf3`, bundle `index-Ctltm0Bv.js`), 15:23–15:34:** điện thoại xác nhận bản mới (bấm "Đã đồng bộ" → bảng "Đồng bộ"), bật máy bay, thêm ghi chú `Điện thoại e2`; Mac (agent) thêm ghi chú `Mac E2 lần 2` + việc `việc Mac E2` → lên server; điện thoại bật mạng → "Đã đồng bộ". Server (GET chỉ đọc) `notes_manual` = [Mac E2 lần 2, Điện thoại e2, Ghi chú e5, Ghi chú từ điện thoại e2, Ghi chú offline e1] — **đủ cả hai ghi chú mới, không mất phần tử nào**; `next_tasks` giữ `việc Mac E2`; 1 cuộc gọi giữ nguyên ✅. Kẹt đồng bộ do op bị từ chối: T5.9 thêm bảng "Đồng bộ" có lý do + "Bỏ thao tác này" (chưa thử lại trên staging; ô gõ tự do vẫn chờ T5.6b). Ghi nhận UX: "Thêm việc" trong hồ sơ dùng `window.prompt` của trình duyệt (không theo DESIGN_SYSTEM) |
| E3 | Mở gọi rồi huỷ | Android Chrome (máy thật) + staging | ✅ | ~13:20: khách `Test T5.2 1`, 2 lần bấm Gọi → quay lại Chrome ngay → không hiện hộp ghi kết quả; staging: khách thử 0 cuộc gọi, tổng cuộc gọi vẫn 46 (không ghi thừa/trùng, không mất). Đúng thiết kế, giống v1: rời app < 3 giây coi là bấm nhầm (`src/data/callSource.ts` `back()`, v1 `legacy/js/calls.js` dòng 256, cửa sổ 15 giây). ~13:36: ở màn quay số 5–10 giây rồi quay lại → hiện hộp ghi kết quả: (a) chọn Không nghe + Lưu → staging có đúng 1 cuộc gọi `{origin: manual, result: no_answer}`, tổng 46 → 47, tự hẹn gọi lại theo nhịp follow-up; (b) đóng hộp không lưu → không ghi gì, không nhắc — giống v1 trên web (v1 đường 2 cũng không giữ cuộc "chưa ghi chú"; chỉ vỏ Android đọc nhật ký máy mới tạo cuộc chờ, kiểm ở T5.3). `duration` = null: đúng v1 (thời gian ước lượng chỉ hiển thị, không lưu) |
| E4 | Webhook FB lặp | local | ✅ chống trùng (test) · ⏳ thật | `node tests/fb-leads.test.mjs` → passed (2026-10-17). Không thử thật trên staging: Worker `intake-worker` chỉ có 1 bản, `SUPABASE_URL` là secret dùng cho production — bắn lead thử sẽ ghi vào production |
| E5 | Đổi tài khoản | local (test tự động) | ✅ bằng test · ⏳ máy thật | Chủ dự án chọn 2026-10-17: không tạo tài khoản thử (chỉ có 1 người dùng thật; tài khoản `ef44fb2f` chưa ai dùng, không có mật khẩu) → kiểm bằng test, **chưa thử trên máy thật**. Trên `v2` @ `4271bf3` (đã có T5.9): `npx vitest run tests/data/sync.test.ts tests/data/localdb.test.ts` → 35/35 pass (gồm: offline đổi tài khoản tách kho riêng + đăng xuất local; tài khoản sau cùng thắng, phiên cũ đóng; đóng phiên giữa lúc kéo/flush không ghi đè). Thêm 1 test tạm (không commit — `tests/data/**` ngoài phạm vi T5.2) đúng kịch bản E5: A offline có 1 op ghi chú → đăng xuất → B đăng nhập online: B không thấy khách/hàng đợi của A, **0 lần gửi** op của A → B đăng xuất, A đăng nhập lại: op của A gửi **đúng 1 lần**, hàng đợi rỗng → pass. `migrateLegacy` chỉ nhận op của đúng tài khoản. Đề xuất đưa test này vào `tests/data` ở task sau |
| E6 | Hàng đợi chéo v1 ↔ v2 cùng máy | local | ✅ | `npx vitest run tests/data/localdb.test.ts` → 20/20 pass (2026-10-17): v2 gửi đúng hàng đợi v1 ghi (đúng thứ tự, upsert/patch/delete), v1 gửi đúng op v2, cùng xử lý lỗi. Thật chỉ xảy ra lúc cutover (cùng tên miền) → runbook T5.4 giữ bước "mọi máy Đã đồng bộ" |

## 5. Mất dữ liệu (`audit-since.sql` từ 2026-10-17 00:00, staging, chạy ~15:40)

TÓM TẮT: `thay đổi: 22 · khách bị đổi: 14 · lỗi ✗: 1 · cảnh báo ⚠: 21`. 14 khách = 12 tự chuyển SLA (12:26) + `018b946e…` (ghi chú lưu không đổi, Phần D) + `d063bb16…` (khách thử Phần E).

| Mức | Số dòng | Giải thích |
|---|---|---|
| ✗ XOÁ CỨNG | 0 | |
| ✗ MẤT PHẦN TỬ | 1 | `d063bb16…` `notes_manual` lúc 13:48:56 = ghi chú Mac bị ghi đè ở **E2 lần 1** (trước T5.9). Đã sửa bằng T5.9; E2 lần 2 (15:23–15:34) không mất phần tử nào — nhật ký sau 15:00 không có ✗ |
| ✗ MẤT THUỘC TÍNH | 0 | |
| ⚠ TRƯỜNG BỊ XOÁ | 21 | = 7 khách × `next_call_at/end/reason` bị gỡ khi tự chuyển Loại (SLA, D-008, đúng v1) |
| · ĐỔI GIÁ TRỊ | — | Chỉ: 12 khách SLA (cột lý do loại + lịch hẹn); `018b946e…` `notes_manual` (12:45, lỗi `edited_at` → T5.6a); `d063bb16…` `call_attempts` + `next_call_*` (13:37, ghi cuộc gọi E3 + tự hẹn lại), `next_tasks` ×2, `notes_manual` ×6 (thao tác E1/E2/E5 có chủ đích) |

## 6. Tự kiểm công cụ (local, 2026-10-17)

`counts.sql` và `audit-since.sql` chạy trên Postgres 17 cục bộ với schema giả lập + `SQL/v2/001_customer_audit.sql` + `002_customer_memory.sql` thật, dữ liệu giả 3 khách:

- Số đếm khớp dữ liệu giả (khách, khách mới, việc mở, cuộc gọi chưa ghi, ghi chú, lịch sử bậc, theo người phụ trách).
- "Lưu không sửa" (`update … set updated_at`) → nhật ký 0 dòng, vân tay 30 giữ nguyên, vân tay 31 đổi — đúng ý đồ.
- Phá dữ liệu có chủ đích → bắt đủ: xoá cứng, mất phần tử `call_attempts`/`notes_manual`, mất thuộc tính lạ `x_lạ`, trường `notes` bị xoá trống; sửa nội dung việc (giữ `at`) **không** bị báo mất.
- `idb-counts.js`: mới kiểm cú pháp (`node --check`); chạy thật ở Phần C.
