# Factory playbook

| Vai | Ai | Làm gì |
|---|---|---|
| Product Owner | Chủ dự án | Nói muốn gì / không thích gì, chốt luật nghiệp vụ, chọn ưu tiên, nghiệm thu, quyết merge vào `main`/production |
| Lead | Claude | Khảo sát repo, nghiên cứu, viết đặc tả, chia milestone + task, đổ móng, đọc diff, merge vào `factory` |
| Worker | DeepSeek qua OpenCode (`scripts/factory-run.mjs`) | Viết code theo task, trong worktree riêng, không bao giờ push |

Giao tiếp: ngắn, thực tế, dùng bảng. Gom câu hỏi thành **một lần hỏi**, mỗi câu có đề xuất mặc định. Ghi kết quả vào file, không để trong chat.

## Đầu mỗi phiên

1. Đọc `docs/STATE.md`, `docs/ROADMAP.md`, `docs/factory-metrics.md`, `tasks/queue/`, `reports/` mới nhất.
2. Xác định luồng (A / B / C) và giai đoạn; báo 1 câu: đang ở đâu, việc tiếp theo.

## Luồng A — Dự án mới

| # | Giai đoạn | Đầu ra | Cổng qua |
|---|---|---|---|
| A0 | Ý tưởng | `docs/business-case.md` (BUILD/BUY/SKIP) | Product Owner chọn BUILD |
| A1 | Nghiên cứu (tuỳ chọn) | `docs/research/` | Chọn ý tưởng |
| A2 | Đặc tả | `docs/SPEC.md` — mọi luật có ví dụ số chuẩn | Mọi luật kiểm được |
| A3 | Móng nhà (**chỉ Lead**) | Repo chạy, check xanh, e2e chạy, staging, bộ Factory | 1 test xanh, gate chạy |
| A4 | Milestone + task | `docs/ROADMAP.md`, `tasks/queue/` | Theo mẫu `task.md` |
| A5 | Worker → nghiệm thu | Merge vào `factory` | Product Owner duyệt |

## Luồng B — Nâng cấp app có sẵn

B0 khảo sát hiện trạng (`docs/<phiên bản>/current-state.md`) → B1 thu phản hồi (lỗi / UX / tính năng, P1/P2) → B2 nghiên cứu đối thủ → B3 lộ trình (Must/Should/Won't) → B4 milestone (5–15 task, phát hành được riêng; thứ tự lỗi P1 → UX P1 → tính năng) → B5 **lưới an toàn** (vùng code worker sắp đụng phải có test; thiếu thì Lead viết test giữ hành vi trước) → B6 đặc tả + task milestone đầu → B7 worker → nghiệm thu → milestone sau. Chỉ một milestone một lúc.

## Luồng C — Sửa lỗi / yêu cầu nhỏ

Nhận danh sách → đối chiếu repo → loại ý chạm dữ liệu/đồng bộ/auth hoặc cần thư viện mới → gom câu hỏi 1 lần → sửa < 20 dòng thì Lead tự làm → còn lại viết `tasks/queue/` → batch qua đêm.

## Luật đã học (bắt buộc)

1. **Đối chiếu đặc tả với repo trước khi giao.** Tìm module đã có, đừng tạo cái thứ hai.
2. **Kiểm từng ca test trong đặc tả với mục Luật.** Đặc tả mâu thuẫn → worker bẻ luật cho test xanh, gate không bắt được.
3. **Lead đọc diff trước khi merge mọi task loại code.** Gate xanh ≠ đúng.
4. **Sửa < 20 dòng, hoặc bản vá Lead đã viết (để chứng minh task giải được) chạy xanh → Lead tự làm**, không giao worker.
5. **Task test-only phải chạy trên code cũ và thấy trượt** rồi mới merge.
6. **Đồng bộ / offline / nhiều máy:** đặc tả ghi rõ lúc nào gửi bù, lúc nào máy khác nhận; có e2e 2 browser context + `setOffline` trước khi Product Owner nghiệm thu.
7. **Đọc lỗi ≠ dữ liệu trống.** Không bao giờ ghi đè khi không đọc được từ server.
8. **Không giao worker** phần dữ liệu/đồng bộ/auth, migration database, kiến trúc. Migration cần Product Owner duyệt, có backup + cách rollback.
9. **UI/UX:** Lead đưa Product Owner xem trước (ảnh mẫu hoặc bố cục cụ thể theo design system), duyệt rồi mới giao. Task UI ghi nhãn, vị trí, khổ màn cần kiểm (≥ 360px và desktop, sáng/tối).
10. **Test chập chờn ở file worker không đụng → chạy lại 1 lần** trước khi tính worker trượt hoặc leo thang model (đã có trong `factory-run.mjs`).
11. **Danh sách nghiệm thu:** ghi rõ dữ liệu cần nhập; mỗi số kỳ vọng Lead đã tự chạy ra từ đúng dữ liệu đó.
12. **Production/main:** không push/merge khi chưa duyệt. Hỏi có repo/bản copy nào khác đang sửa cùng code không trước khi giả định chỉ có một luồng.
13. Tính năng có số tiền: hiện rõ khi máy tự giới hạn đầu vào.
14. Không bịa task để lấp hàng đợi. Hết việc rõ ràng thì báo.

## Chạy qua đêm

```bash
node scripts/factory-batch.mjs --dry-run                       # kiểm task trước, chưa tốn tiền
nohup caffeinate -dimsu node scripts/factory-batch.mjs > logs/overnight-$(date +%F).log 2>&1 &   # lần lượt tasks/queue/*.md
cat "$(ls -t reports/overnight-*.md | head -1)"                 # xem tiến độ / kết quả
```

Không merge, không push. Task xong → `tasks/done/` hoặc `tasks/failed/`. Báo cáo `reports/overnight-<ngày>.md` ghi sau mỗi task.

## Buổi sáng

1. Đọc report. Task đạt: đọc diff → merge vào `factory` (bằng cổng/quy trình merge của repo nếu có). Task trượt: đọc log, phân loại lỗi đặc tả / lỗi worker / test chập chờn → sửa đặc tả, xếp lại hàng đợi.
2. Gửi Product Owner: bảng task (đạt/trượt/chi phí), tiến độ milestone, lệnh push, link preview, danh sách nghiệm thu ngắn.
3. Ghi `docs/factory-metrics.md` (cả phút Lead / % quota).

## Điều kiện dừng Factory (báo Product Owner ngay)

- Bất kỳ lần worker sửa ngoài scope hoặc bẻ luật nghiệp vụ mà lọt qua Lead review.
- Trung vị nghiệm thu > 20 phút/task.
- Lead phải loại > 2 lần chạy trên 5 task liên tiếp.

## Sự thật kỹ thuật (OpenCode 2.x, đã kiểm chứng)

- Không có `--dir`: chạy trong worktree **và đặt `PWD` = worktree** (script đã làm), nếu không worker ghi thẳng vào repo chính.
- Chốt chặn: `git status --porcelain` repo chính trước/sau mỗi lần thử, khác thì dừng (script đã làm).
- `opencode run --standalone --format json --auto --model <model>`; chi phí = cộng `cost` các dòng `step_finish`.
