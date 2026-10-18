# Factory metrics — mỗi task một dòng

Nguồn: báo cáo `scripts/factory-run.mjs` / `reports/overnight-*.md` + nghiệm thu tay của Product Owner. Lần chạy bị Lead loại khi đọc diff **tính là một lần thử**.

| ID | Loại | Ngày | Model | Số lần thử | Chi phí worker | File đổi | Gate tự động | Lead đọc diff | Nghiệm thu tay (phút) | Phút Lead / % quota | Việc Lead làm | Ghi chú |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M1-L | lead | 2026-10-19 | — | — | — | `src/ui/display.ts` + test, `src/config/sources.ts`, e2e `m1-readable`, `domain/metrics/care.ts` | xanh | — | — | — | Bộ định dạng chung + lưới e2e (trượt 7/10 trang trước khi sửa) | Lead làm vì là nền chung cho 4 task |
| M1-01 | code | 2026-10-19 | deepseek-flash | 1 | $0.0150 | 3 | ĐẠT | Đạt, vá nhỏ | — | ~5 | Ô sửa hồ sơ: giữ chuỗi gốc thay `displayText` (phòng ghi ngược định dạng vào DB) | Worker đổi phép so sánh khi lưu — không sai dữ liệu hiện tại (dob `YYYY-MM-DD`) nhưng rủi ro D-012 |
| M1-02 | code | 2026-10-19 | deepseek-flash | 1 | $0.0075 | 2 | ĐẠT | Đạt | — | ~2 | — | |
| M1-03 | code | 2026-10-19 | deepseek-flash | 1 | $0.0175 | 3 | ĐẠT | Đạt, vá | — | ~5 | Bỏ hàm regex che chữ; sửa chuỗi gốc ở domain; sửa câu cụt, bỏ `qualified_at` | Chuỗi gốc nằm ngoài scope → worker che triệu chứng. Bài học: đặc tả phải liệt kê cả file nguồn của chữ |
| M1-04 | code | 2026-10-19 | deepseek-flash | 1 | $0.0122 | 4 | ĐẠT | Đạt | — | ~3 | — | Dùng lại `ErrorState` đúng đặc tả |

Loại: `code` / `test-only` / `lead` (Lead tự làm) / `đối chứng` (làm bằng Claude Code thuần để so sánh).

## Phát hiện

- 2026-10-19 (M1-03): khi chữ cần sửa nằm trong file ngoài scope (domain), worker không dừng hỏi mà viết regex che ở UI cho test xanh. Đặc tả M2+ phải tìm và liệt kê **nguồn** của mọi chuỗi hiển thị (grep cả `src/domain`) trước khi giao.
- 2026-10-19 (M1-01): worker sửa cả logic lưu (so sánh nháp) dù đặc tả chỉ nói hiển thị → đặc tả nên ghi rõ "không đổi điều kiện gọi onSave".
- 2026-10-19: `tests/domain/loan/parity.test.ts` thỉnh thoảng quá 5s khi máy bận (chập chờn, không liên quan M1).

## Tiêu chí kết thúc / điều kiện dừng

- ≥ 60% task **code** đạt trong 1–2 lần (test-only không tính).
- < $0.50 chi phí worker / task.
- 0 lần sửa ngoài scope lọt qua gate — **trượt = DỪNG**.
- 0 lần luật nghiệp vụ bị bẻ lọt qua Lead review — **trượt = DỪNG**.
- Trung vị nghiệm thu tay ≤ 10 phút/task (mục tiêu); > 20 phút trên 5 task code liên tiếp = DỪNG.
- Lead loại > 2 lần chạy trên 5 task liên tiếp (đặc tả sai) = DỪNG.
