# Overnight 2026-11-10 — base `factory`

Bắt đầu 2026-11-10 11:43 · xong 2026-11-10 12:11 · tổng chi phí API **$0.0162** / trần $5 · worker chạy bằng gói: tính token + phút, không tính tiền

Task ĐẠT → review tự động (reviewer khác worker). Rủi ro thấp/vừa + không cờ → tự merge vào `factory` (rebase + check + e2e). Rủi ro cao hoặc có cờ → chờ Lead review. Cuối batch push `factory` qua push-branch.sh nếu có commit mới.

**Push:** factory không có commit mới — không push

| Task | Kết quả | Rủi ro | Worker | Reviewer | Suy luận | Số lần thử | Chi phí API | Token | Phút worker | Review | Auto-merge | Nhánh | File đổi | Log | Phút |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| KB-02 | ĐẠT | vừa | luna | deepseek | high | 1 | $0.0162 | 5.4M | 14.5 | block · 2 cờ | không (có cờ) | agent/KB-02 | M src/features/profile/advanced.tsx, M src/features/profile/model.ts, M src/features/profile/route.tsx, M src/features/quick-actions/QuickActions.tsx, M src/features/quick-actions/model.ts, A src/features/profile/interest.tsx, A src/features/quick-actions/interest-picker.tsx, A tests/e2e/kb02-profile-interest.spec.ts, A tests/features/profile/kb02-profile.test.tsx, A tests/features/quick-actions/kb02-interest.test.tsx | logs/batch-KB-02.out.txt | 19.2 |

## KB-02 — cờ review (Lead xem trước khi merge)
- **chặn** · điểm 3 · `tests/e2e/kb02-profile-interest.spec.ts`: Ca (e) 'khách của người khác trong nhóm' không seed nhóm: openProfile(page, true) chỉ đổi owner_id thành 'kb02-colleague' trong rows.map, không thêm USER_ID vào followers. Đây là khách của người ngoài, không phải khách nhóm; test không kiểm L6/D-025 (người trong nhóm được sửa hồ sơ vẫn phải thấy chữ, không nút) và vẫn xanh nếu ProfileInterest (src/features/profile/interest.tsx) dùng writable mà cờ này bật cho follower. Unit test 'khách nhóm...' (tests/features/profile/kb02-profile.test.tsx) và 'người ghi giùm' (tests/features/quick-actions/kb02-interest.test.tsx) cũng chỉ đổi owner_id, không seed followers.
- lưu ý · điểm 1 · `src/features/quick-actions/QuickActions.tsx`: Hoàn tác mới chọn bằng ternary interestChanged ? undo-interest : undo-auto-drop cũ. Khi một lần lưu vừa đổi mức quan tâm vừa tự loại (mode === 'drop', suggestion.auto), callback tự loại (trả disqualified_at/lý do/ghi chú và lịch) bị bỏ, chỉ còn trả interest_level; trái L7 'trả cả mức quan tâm' và AGENTS §3.6 yêu cầu giữ Hoàn tác cho tự động hoá. Cần gộp hai việc hoặc xác nhận hai điều kiện không cùng xảy ra.
