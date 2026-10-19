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
