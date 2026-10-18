# Factory metrics — mỗi task một dòng

Nguồn: báo cáo `scripts/factory-run.mjs` / `reports/overnight-*.md` + nghiệm thu tay của Product Owner. Lần chạy bị Lead loại khi đọc diff **tính là một lần thử**.

| ID | Loại | Ngày | Model | Số lần thử | Chi phí worker | File đổi | Gate tự động | Lead đọc diff | Nghiệm thu tay (phút) | Phút Lead / % quota | Việc Lead làm | Ghi chú |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

Loại: `code` / `test-only` / `lead` (Lead tự làm) / `đối chứng` (làm bằng Claude Code thuần để so sánh).

## Phát hiện

- <ngày> (<ID>): …

## Tiêu chí kết thúc / điều kiện dừng

- ≥ 60% task **code** đạt trong 1–2 lần (test-only không tính).
- < $0.50 chi phí worker / task.
- 0 lần sửa ngoài scope lọt qua gate — **trượt = DỪNG**.
- 0 lần luật nghiệp vụ bị bẻ lọt qua Lead review — **trượt = DỪNG**.
- Trung vị nghiệm thu tay ≤ 10 phút/task (mục tiêu); > 20 phút trên 5 task code liên tiếp = DỪNG.
- Lead loại > 2 lần chạy trên 5 task liên tiếp (đặc tả sai) = DỪNG.
