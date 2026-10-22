# Factory metrics — mỗi task một dòng

Nguồn: báo cáo `scripts/factory-run.mjs` / `reports/overnight-*.md` + nghiệm thu tay của Product Owner. Lần chạy bị Lead loại khi đọc diff **tính là một lần thử**.

| ID | Loại | Ngày | Model | Số lần thử | Chi phí worker | File đổi | Gate tự động | Lead đọc diff | Nghiệm thu tay (phút) | Phút Lead / % quota | Việc Lead làm | Ghi chú |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M1-L | lead | 2026-10-19 | — | — | — | `src/ui/display.ts` + test, `src/config/sources.ts`, e2e `m1-readable`, `domain/metrics/care.ts` | xanh | — | — | — | Bộ định dạng chung + lưới e2e (trượt 7/10 trang trước khi sửa) | Lead làm vì là nền chung cho 4 task |
| M1-01 | code | 2026-10-19 | deepseek-flash | 1 | $0.0150 | 3 | ĐẠT | Đạt, vá nhỏ | — | ~5 | Ô sửa hồ sơ: giữ chuỗi gốc thay `displayText` (phòng ghi ngược định dạng vào DB) | Worker đổi phép so sánh khi lưu — không sai dữ liệu hiện tại (dob `YYYY-MM-DD`) nhưng rủi ro D-012 |
| M1-02 | code | 2026-10-19 | deepseek-flash | 1 | $0.0075 | 2 | ĐẠT | Đạt | — | ~2 | — | |
| M1-03 | code | 2026-10-19 | deepseek-flash | 1 | $0.0175 | 3 | ĐẠT | Đạt, vá | — | ~5 | Bỏ hàm regex che chữ; sửa chuỗi gốc ở domain; sửa câu cụt, bỏ `qualified_at` | Chuỗi gốc nằm ngoài scope → worker che triệu chứng. Bài học: đặc tả phải liệt kê cả file nguồn của chữ |
| M1-04 | code | 2026-10-19 | deepseek-flash | 1 | $0.0122 | 4 | ĐẠT | Đạt | — | ~3 | — | Dùng lại `ErrorState` đúng đặc tả |
| M3-L | lead | 2026-10-19 | — | — | — | today/model, e2e m3, config signals | xanh | — | — | — | Model thẻ Hôm nay + e2e; chặn 2 lỗi trước khi giao (tín hiệu phụ mất nút Gọi; P0 bị giấu vào nhóm thu gọn) | Theo skill cũ (Lead viết model) |
| M3-01 | code | 2026-10-19 | deepseek-flash | 1 | $0.0386 | 1 | ĐẠT | Đạt, vá 3 chỗ | — | ~10 | Phiên gọi + đếm quá hạn theo quy tắc thẻ; khôi phục dòng chờ đồng bộ trong tổng kết | Đặc tả quá chi tiết (kiểu cũ) |
| M4-01 | code | 2026-10-19 | deepseek-flash | 1 | $0.0544 | 3 | ĐẠT (hết giờ 20′, gate xanh) | Đạt, vá 1 | — | ~8 | `dueTone`: "đến hạn" phải vàng, worker tô đỏ + viết test khoá sai luật | Mẫu task mới; không có báo cáo cuối (hết giờ) |
| M5-01 | code | 2026-10-19 | deepseek-flash | 1 | $0.0359 | 3 | ĐẠT (hết giờ 20′, gate xanh) | Đạt | — | ~5 | — | Gọi từ danh sách nay đi luồng chuẩn (trước dùng `tel:`) |
| M5-02 | code | 2026-10-19 | deepseek-flash | 1 | $0.0362 | 3 | ĐẠT (hết giờ 20′, gate xanh) | Đạt | — | ~4 | — | |
| M5-03 | code | 2026-10-19 | deepseek-flash | 1 | $0.0239 | 4 | ĐẠT (hết giờ 20′, gate xanh) | Đạt | — | ~4 | — | |
| ML-L | lead | 2026-10-19 | — | — | — | SQL/v2/007 + test, `domain` (`lead_form`, `isSaleTouch`), hook `useIntegrationHealth`, factory-run mở vùng cấm theo Phạm vi | xanh | — | — | — | Migration chạy thử Postgres 17 cục bộ (gắn lead, chống gắn trùng, RLS/GRANT) | Lead làm vì là vùng dữ liệu/migration |
| ML-01 | code | 2026-10-19 | deepseek-flash | 1 | $0.0858 | 14 | ĐẠT (hết giờ 25′, gate xanh) | Đạt, vá 4 | — | ~20 | Phân trang Graph (kéo bù > 100 lead/form bị sót); token hỏng ở lượt quét không báo + health nhấp nháy ok/lỗi; mã lead Make chứa SĐT (lộ vào log); câu báo trỏ tới "nhật ký lead trong Cài đặt" không tồn tại | Không có báo cáo cuối (hết giờ). Đặc tả nên nói rõ "đọc hết các trang" |
| ML-02 | code | 2026-10-19 | deepseek-flash | 1 | $0.0372 | 9 | ĐẠT (hết giờ 20′, gate xanh) | Đạt, vá 1 | — | ~5 | `leads` import `features/settings/model` (phá ranh giới module) → chuyển mã/ngưỡng/nhãn sang `src/config/integrations.ts` + `src/domain/integrations.ts` | Đặc tả nên chỉ sẵn nơi đặt luật dùng chung giữa 2 feature |
| ML-03 | code | 2026-10-21 | deepseek-flash | 1 | $0.0479 | 7 | ĐẠT | Đạt | — | ~6 | — | Có báo cáo cuối; đặc tả dùng mẫu field_data thật của form → làm đúng ngay lần 1 |
| ML-04 | code | 2026-10-21 | deepseek-flash | 1 | $0.0488 | 5 | ĐẠT | Đạt | — | ~4 | — | |
| PF-01 | code | 2026-10-21 | deepseek-flash | 1 | $0.0468 | — | ĐẠT | Đạt, vá 1 | — | ~8 | Ô Tài sản `type=number` làm ghi cũ dạng chữ hiện trống → Lead thêm dòng "Đang lưu: …"; Lead thêm 2 khoá gộp vào ngữ cảnh AI (`aiContext.ts`) | Chạy song song với PF-02 nhờ Lead tách `timeline.tsx` trước |
| PF-02 | code | 2026-10-21 | deepseek-flash | 1 | $0.0394 | — | ĐẠT | Đạt | — | ~4 | Tên bậc suy từ tiêu đề "Bậc: …" (chấp nhận; nếu đổi tiêu đề thì thêm trường `stage`) | |
| PF-03 | code | 2026-10-21 | deepseek-flash | 1 | $0.0379 | — | ĐẠT | Đạt, vá 1 (lỗi có sẵn) | — | ~6 | Worker phát hiện lỗi có sẵn: lưu khách xong vẫn hỏi "Bản nháp chưa lưu" → Lead sửa (`savedRef` trong `useBlocker`) + e2e `pf03-lead-saved` | Báo cáo mục 3 hữu ích — worker báo lỗi ngoài phạm vi thay vì tự sửa |
| PF-04 | code | 2026-10-21 | deepseek-flash | 2 (1 BLOCKED) | $0.0585 | — | ĐẠT | Đạt | — | ~6 | — | BLOCKED đúng: icon mới cần đăng ký glyph ở `src/ui/Icon.tsx` (vùng cấm) → Lead thêm sẵn. Đặc tả nên nhớ: thêm khái niệm icon = sửa cả `icons.ts` + `Icon.tsx`. Test vitest đỏ giả ở thư mục chính do cache glob (`commands.ts` mới) → xoá `node_modules/.vitest-cache` |
| PF-05 | code | 2026-10-21 | deepseek-flash | 1 (BLOCKED) | $0.0708 | — | BLOCKED → Lead hoàn tất | Đạt | — | ~10 | Worker cài xong nhưng BLOCKED đúng: parity v1/golden trái luật dấu mới → Lead sửa `parity.test.ts` (chỉ so v1 khi từ khoá không dấu; có dấu phải là tập con v1), commit bản worker. Lead thêm: ô tìm Giỏ hàng dùng chung luật (`unitMatchesQuery`) | Đặc tả đổi luật domain cần nói trước test parity nào bị thay |
| PF-06 | code | 2026-10-21 | deepseek-flash | 1 | $0.0707 | — | ĐẠT | Đạt | — | ~5 | — | Chuông + màn Thông báo chung hook `useNotificationSignals`; tìm khách nối qua `setCustomerSearch` (cổng cắm có sẵn) |
| PF-07 | code | 2026-10-21 | deepseek-flash | 1 | $0.0518 | 2 | ĐẠT (hết giờ, gate xanh) | Đạt, vá 1 (lỗi có sẵn) | — | ~25 | Trước khi giao: khung app `wide` (gốc của nút xuống dòng + tab bị cắt là trần 760px của AppShell), ngày đăng ký cùng kiểu, e2e bố cục 9 ca + ảnh mẫu điện thoại. Sau: nút Gọi lấn mép thẻ (`lg:-mx-6` có sẵn) | Nguyên nhân gốc nằm ngoài phạm vi feature → Lead sửa khung trước, worker chỉ còn bố cục trong màn. Ảnh tối chụp ngay sau `emulateMedia` dính hiệu ứng chuyển màu → chờ 600ms |

| PF-08 | code | 2026-10-22 | deepseek-flash | 2 (1 BLOCKED) | $0.1354 | — | ĐẠT (hết giờ, gate xanh) | Đạt, vá 1 | — | ~10 | BLOCKED đúng: e2e m5 có sẵn đòi thẻ quá SLA vẫn có "N ngày trước" → Lead: giữ lần liên hệ cuối sau "Quá SLA". Sau: nút đổi chiều chỉ hiện chiều đang chọn → Lead đổi thành hiện cả hai chiều (đúng lời Curtis); ghi localStorage bọc try/catch | Lead thêm `hasSaleTouch` trước khi giao (mốc bậc có ở mọi khách lúc tạo nên không dùng được để biết "chưa tương tác"). Đặc tả UI nên trích nguyên lời Curtis về cách bấm |
Loại: `code` / `test-only` / `lead` (Lead tự làm) / `đối chứng` (làm bằng Claude Code thuần để so sánh).

## Phát hiện

- 2026-10-19 (M1-03): khi chữ cần sửa nằm trong file ngoài scope (domain), worker không dừng hỏi mà viết regex che ở UI cho test xanh. Đặc tả M2+ phải tìm và liệt kê **nguồn** của mọi chuỗi hiển thị (grep cả `src/domain`) trước khi giao.
- 2026-10-19 (M1-01): worker sửa cả logic lưu (so sánh nháp) dù đặc tả chỉ nói hiển thị → đặc tả nên ghi rõ "không đổi điều kiện gọi onSave".
- 2026-10-19: `tests/domain/loan/parity.test.ts` thỉnh thoảng quá 5s khi máy bận (chập chờn, không liên quan M1).

- 2026-10-19 (M4/M5 song song): 4 worker cùng lúc → cả 4 chạm trần 20 phút/lần (cài thư viện + build e2e đồng thời làm máy chậm). Gate vẫn xanh trên trạng thái cuối nên ĐẠT, nhưng **mất báo cáo cuối** (quyết định thiết kế) → Lead phải đọc diff kỹ hơn. Lần sau: song song tối đa 2, hoặc trần 30 phút khi chạy 4.
- 2026-10-19 (M4-01): worker tự viết test khoá luật sai (đến hạn = đỏ). Gate không bắt được — chỉ Lead review bắt. Đặc tả nên ghi số chuẩn cho cả 3 trạng thái màu.
- 2026-10-19: `tests/data/sync.test.ts` thỉnh thoảng trượt 1 lần (race), chạy lại xanh.

## Tiêu chí kết thúc / điều kiện dừng

- ≥ 60% task **code** đạt trong 1–2 lần (test-only không tính).
- < $0.50 chi phí worker / task.
- 0 lần sửa ngoài scope lọt qua gate — **trượt = DỪNG**.
- 0 lần luật nghiệp vụ bị bẻ lọt qua Lead review — **trượt = DỪNG**.
- Trung vị nghiệm thu tay ≤ 10 phút/task (mục tiêu); > 20 phút trên 5 task code liên tiếp = DỪNG.
- Lead loại > 2 lần chạy trên 5 task liên tiếp (đặc tả sai) = DỪNG.
- 2026-10-19 (ML-01/02 song song, trần 25′/20′): cả 2 hết giờ lần 1 nhưng gate xanh → ĐẠT, lại mất báo cáo cuối. Task Worker lớn (14 file) nên trần 35′.
- 2026-10-21 (ML production): 2 lỗi lọt qua test vì đặc tả/test dựa trên giả định: (1) `SQL/add_fb_leads.sql` không cấp quyền cho service_role — test SQL chỉ chạy trên Postgres cục bộ nơi service_role có quyền mặc định; (2) form thật đặt tên trường tiếng Việt, đặc tả chỉ nêu `phone_number`/`full_name`. Bài học: tích hợp ngoài phải lấy **1 mẫu dữ liệu thật** trước khi viết đặc tả; kiểm quyền bằng `has_table_privilege('service_role', …)` trên production (chỉ đọc) trước deploy.
- 2026-10-22 (CL, Lead Claude): CL-01 (vừa, high, 1 lần, $0.10, 11′) + CL-02 (thấp, high, 1 lần, $0.06, 9′, tự merge). CL-01 review 2 cờ nhỏ: báo cáo cuối worker mất (chỉ 1 dòng — lần thứ 2 gặp), 2 assert unit lặp/luôn đúng (e2e có kiểm thật). Góp ý không chặn: lịch Tuỳ chọn tô ngày cuối khoảng nhạt hơn ngày đầu; mũi tên sắp xếp dùng ký tự ↑↓ thay icon `src/config/icons.ts`. Lead ~10′ đọc diff + ảnh.
- 2026-10-22 (D-025, Lead Claude tự làm — vùng dữ liệu/quyền, rủi ro cao): SQL 010 + `teamEdit.ts` + `CustomerRepository.write` + hồ sơ. Lead sửa 2 test có sẵn khẳng định luật D-003 cũ (`repositories.test.ts` addNote khách đồng nghiệp; `choices.test.tsx` ô chọn khách đồng nghiệp) theo luật mới Curtis duyệt. Staging: test SQL 6/6. Bài học: CHECK constraint `customers_occupation_check` trên DB — test SQL dùng cột tự do (residence).
- 2026-10-22 (worker pool, Lead Claude): thêm haiku (Claude Code, gói) + luna (Codex, gói) bên cạnh deepseek. Thử 3 task giả rủi ro thấp (`reports/pool-probe-2026-10-22.md`): cả 3 ĐẠT lần 1 · deepseek $0.0028 / 122k token / 0,4′ · haiku 214k token / 0,7′ (gói) · luna 208k token / 0,6′ (gói); review deepseek#max $0.0018–0.0020. Lỗi tìm ra khi thử: luna làm reviewer không đọc được file (công cụ đọc duy nhất là shell, prompt cấm chạy lệnh) → cho luna dùng lệnh đọc trong sandbox read-only. Hết hạn mức giả (claude giả trả "You've hit your limit"): có dự phòng → chuyển luna, ĐẠT; không dự phòng → TẠM DỪNG, task giữ trong hàng đợi. Bài học: Lead không sửa file repo chính khi batch đang chạy (chốt chặn báo động giả).
- 2026-10-22 (CL-03, Lead Claude): worker deepseek#high ĐẠT lần 1 ($0.0747, 6.7M token, 8.7′); reviewer luna@xhigh cắm 1 cờ "chặn" (worker tự giới hạn năm sinh 1900…năm nay) — Lead chấp nhận: kiểm tra đầu vào hợp lý, bảng âm lịch cũng bắt đầu 1900. Lead sửa trước 3 test cũ theo bố cục mới (Curtis yêu cầu). factory-merge trượt 2 lần vì e2e chập chờn có sẵn (`sync.spec.ts:117` — factory cũng trượt 1/8; `pf08` nút đo 43,9999px khi sheet đang trượt) mà **không tự chạy lại** dù file không bị nhánh đụng; gọi hàm tay thì chạy lại đúng → chưa rõ nguyên nhân (HYPOTHESIS: đầu ra thật khác mẫu). Đã thêm log lý do không chạy lại vào `retryUntouched`. Lần 3 xanh. Góp ý không chặn: tuổi/mệnh/cung xuống 3 dòng ở ô nửa hàng desktop; chọn có giá trị cũ ngoài danh sách hiện "(giá trị hiện có)" bị cắt chữ ở ô nửa hàng.

