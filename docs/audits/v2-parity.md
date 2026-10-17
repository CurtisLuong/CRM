# Audit parity v1 ↔ v2

**Trạng thái:** CHƯA ĐẠT T5.1 — còn thao tác ghi có ở v1 nhưng thiếu giao diện tương ứng trong v2; cần chủ dự án chấp nhận hoãn hoặc giao task bổ sung trước khi đánh dấu hoàn tất.

**Phạm vi kiểm tra:** các đường ghi dữ liệu người dùng tìm thấy trong `legacy/js/{app,calls,db,team,catalog,catalog-ui,ai}.js`, `legacy/js/loan/*` và handler trong `legacy/index.html`; đối chiếu với code v2 và test hiện có trên `origin/v2` tại `9ad2f0d` (sau khi T6.4, T6.6, T6.8 merge). Đây là đối chiếu mã nguồn/test cục bộ, không phải kiểm thử staging, production, Android hay ảnh chụp giao diện.

| Nhóm thao tác ghi của v1 | Đối ứng v2 và bằng chứng | Trạng thái |
|---|---|---|
| Tạo/sửa hồ sơ khách; trường cơ bản, dự án, quan tâm, trường mở rộng; gộp nguồn khi gặp khách trùng | `src/features/intake/route.tsx`, `src/features/intake/model.ts`, `src/data/repositories/customers.ts`; `tests/features/intake/intake.test.ts`, `tests/e2e/intake.spec.ts`; giữ thuộc tính mở rộng được kiểm tra trong `tests/data/repositories.test.ts` | ✅ Có đường ghi và test |
| Khách mới/lead: ghi cuộc gọi, đạt/loại, lý do và khôi phục lead | `src/features/leads/route.tsx`, `src/features/leads/model.ts`; `tests/features/leads/model.test.ts`, `tests/e2e/leads.spec.ts`; thao tác gọi đi qua `src/features/quick-actions/QuickActions.tsx` | ✅ Có đường ghi và test |
| Ghi kết quả cuộc gọi, cập nhật cuộc gọi chờ ghi chú, hẹn gọi lại; cuộc gọi tự nhập từ Android | `src/features/quick-actions/QuickActions.tsx`, `src/data/callSource.ts`, `src/data/repositories/customers.ts`; `tests/features/quick-actions/model.test.ts`, `tests/data/callSource.test.ts`, `tests/e2e/quick-actions.spec.ts`. V1 mở sửa mọi cuộc gọi từ `legacy/js/app.js:4226-4229`; v2 route chỉ mở ghi kết quả cho cuộc gọi chưa có `result` (`src/features/quick-actions/route.tsx:137-155`). V1 còn xóa cuộc gọi chờ tại `legacy/js/calls.js:194-220`. | ⚠ Thiếu sửa cuộc gọi đã ghi và xóa cuộc gọi chờ trong UI |
| Thêm ghi chú nhanh và ghi chú cuộc gọi | `src/features/quick-actions/QuickActions.tsx`, `src/data/repositories/customers.ts:addNote`; `tests/features/quick-actions/QuickActions.test.tsx`, `tests/e2e/quick-actions.spec.ts` | ✅ Có đường ghi và test |
| Sửa/xóa ghi chú hồ sơ đã lưu | V1 gọi `CRM.updateNote`/`CRM.deleteNote` (`legacy/js/app.js:3605-3618`). V2 repository có `updateNote`/`deleteNote` (`src/data/repositories/customers.ts:222-259`), nhưng không tìm thấy giao diện v2 gọi hai API này; hồ sơ/timeline chỉ hiển thị và thêm ghi chú. | ⚠ Thiếu thao tác sửa/xóa trong UI |
| Ghi chú trên mốc lịch sử bậc, sửa ghi chú của mốc cũ | V1 gọi `CRM.updateCareHistoryNote` (`legacy/js/app.js:3445-3452`). V2 repository có `updateCareHistoryNote` (`src/data/repositories/customers.ts:390-407`), nhưng không tìm thấy giao diện v2 gọi API này. | ⚠ Thiếu thao tác sửa trong UI |
| Đổi bậc, lịch sử bậc, Booking checklist, tự chuyển SLA và hoàn tác | `src/features/profile/route.tsx`, `src/domain/velocity/automation.ts`, `src/features/leads/model.ts`; `tests/domain/velocity/automation.test.ts`, `tests/domain/velocity/parity.test.ts`, `tests/e2e/profile.spec.ts` | ✅ Có đường ghi và test cho luồng bậc/SLA; không bao gồm sửa ghi chú lịch sử nêu trên |
| Tạo việc; sửa nội dung/hạn/loại; xóa việc; hoàn tất/mở lại | V1 sửa/xóa tại `legacy/js/app.js:4640-4657`. V2 tạo việc ở `src/features/profile/route.tsx`, tạo lời hứa tại `src/features/tasks/route.tsx`, hoàn tất/mở lại ở `src/features/tasks/route.tsx:490-535`; hiện không thấy thao tác sửa/xóa việc. `tests/e2e/tasks.spec.ts` kiểm tra hoàn tất/mở lại và lời hứa. | ⚠ Thiếu sửa/xóa việc trong UI |
| Hẹn gọi, chấp nhận gợi ý follow-up, hoàn tất sau gọi | `src/features/quick-actions/QuickActions.tsx`, `src/domain/followup/index.ts`, `src/domain/deadlines/index.ts`; `tests/domain/followup/followup.test.ts`, `tests/domain/deadlines/deadlines.test.ts`, `tests/e2e/quick-actions.spec.ts` | ✅ Có đường ghi và test |
| Lời hứa hai chiều, chống trùng, giữ hạn gốc, dời hàng loạt và hoàn tác | `src/features/tasks/route.tsx`, `src/features/today/route.tsx`, `src/domain/deadlines/promises.ts`; `tests/domain/deadlines/promises.test.ts`, `tests/e2e/tasks.spec.ts`, `tests/e2e/today.spec.ts` | ✅ Có đường ghi và test |
| Ghi tương tác Zalo/gặp/xem dự án | `src/features/quick-actions/interactions.tsx`, `src/domain/customer/interactions.ts`, hồ sơ hiển thị timeline qua `src/domain/customer/timeline.ts`; `tests/domain/customer/interactions.test.ts`, `tests/e2e/quick-actions.spec.ts`, `tests/e2e/profile.spec.ts` | ✅ Có đường ghi và test |
| Tải/xóa tài liệu; ảnh đại diện và ảnh bìa hồ sơ | `src/features/profile/route.tsx`, `src/data/repositories/remote.ts`; `tests/data/remote-repositories.test.ts` | ✅ Có đường ghi; kiểm thử tương tác dịch vụ cục bộ |
| Phát hiện/gộp hồ sơ trùng có duyệt | `src/features/intake/route.tsx` dùng `detectDuplicatePairs`/`findDuplicateCandidates`, yêu cầu chọn hồ sơ giữ và xác nhận trước `customers.merge`; `src/domain/customer/merge.ts`, `src/data/repositories/customers.ts`; `tests/domain/customer/merge.test.ts`, `tests/features/intake/intake.test.ts`, `tests/e2e/intake.spec.ts` | ✅ Có đường ghi và test; T6.8 đã merge cục bộ vào `origin/v2` |
| Giao khách, người theo dõi, quản lý thành viên nhóm | `src/features/team/route.tsx`, `src/features/team/model.ts`, `src/data/repositories/customers.ts`; `tests/features/team/model.test.ts`, `tests/e2e/team.spec.ts` | ✅ Có đường ghi và test |
| Giỏ hàng: dự án/tòa/loại căn/căn, tiến độ thanh toán, nhập Excel | `src/features/catalog/route.tsx`, `src/data/repositories/catalog.ts`; `tests/data/catalog-import.test.ts`, `tests/data/remote-repositories.test.ts`, `tests/e2e/catalog.spec.ts` | ✅ Có đường ghi và test |
| Tính vay: cài đặt máy tư vấn viên, lưu/mở phương án, PDF | `src/features/loan/LoanCalculator.tsx`, `src/features/loan/store.ts`, `src/features/loan/print.ts`; `tests/features/loan/store.test.ts`, `tests/domain/loan/parity.test.ts`, `tests/e2e/loan.spec.ts` | ✅ Có đường ghi và test |
| Cài đặt theme, mẫu Zalo, lời chào, cấu hình AI, cập nhật APK | `src/features/settings/route.tsx`, `src/data/repositories/remote.ts`; `tests/features/settings/route.test.tsx`, `tests/data/remote-repositories.test.ts`, `tests/e2e/settings.spec.ts` | ✅ Có đường ghi và test |
| Nhập/xuất khách Excel/CSV và mẫu ánh xạ cột | `src/features/import-export/route.tsx`, `src/features/import-export/model.ts`; `tests/features/import-export/model.test.ts`, `tests/e2e/import-export.spec.ts` | ✅ Có đường ghi và test |
| Gợi ý AI/soạn Zalo/đọc ghi chú rồi duyệt cập nhật | `src/features/ai/*`, `src/features/quick-actions/QuickActions.tsx`; `tests/features/ai/AiZaloDraft.test.tsx`, `tests/e2e/quick-actions.spec.ts`, `tests/e2e/profile.spec.ts` | ✅ Có đường ghi sau duyệt; không tự gửi Zalo |
| Chỉ số chăm sóc, drill-down và HealthDot | `src/features/insights/care.tsx`, `src/domain/metrics/care.ts`; `tests/domain/metrics/care.test.ts`, `tests/e2e/insights.spec.ts` | ✅ Có phần đọc/điều hướng; không bổ sung thao tác ghi hồ sơ (T6.4) |
| Nhập ghi chú bằng giọng nói | `src/features/quick-actions/voice.tsx`, `src/features/quick-actions/QuickActions.tsx`; `src/features/quick-actions/voice.test.tsx`, `tests/e2e/quick-actions.spec.ts`; nội dung đi qua luồng ghi chú hiện hữu sau khi người dùng xem/duyệt | ✅ Có đường nhập và test; audio không lưu (T6.6) |

## Gap cần xử lý trước khi T5.1 đạt

Các thao tác dưới đây có trong v1, vẫn chưa có giao diện v2 tại snapshot `origin/v2` `9ad2f0d`:

1. **Ghi chú hồ sơ:** sửa/xóa ghi chú cũ. V2 có API repository nhưng chưa có UI gọi.
2. **Ghi chú lịch sử bậc:** sửa ghi chú ở mốc cũ. V2 có API repository nhưng chưa có UI gọi.
3. **Việc:** sửa nội dung/hạn/loại và xóa việc đã tạo. Hiện v2 cho tạo, hoàn tất, mở lại và dời lời hứa.
4. **Cuộc gọi:** v2 chỉ mở sửa cuộc gọi đang chờ ghi chú; thiếu sửa cuộc gọi đã ghi và xóa cuộc gọi chờ ghi chú.

Không có task đã duyệt trong `docs/tasks.md` bao phủ đầy đủ bốn gap này. Đề xuất để điều phối/chủ dự án quyết định: giao task bổ sung UI cho các thao tác trên, hoặc chấp nhận hoãn từng mục để T5.1 có thể kết thúc. T5.1 chưa được đánh dấu xong và chưa chạy merge gate.

## Giới hạn bằng chứng

Các đường code/test liệt kê ở trên chỉ xác nhận có triển khai cục bộ. Chưa có bằng chứng kiểm thử tài khoản/dữ liệu trên staging, production, APK/Android, offline thực địa hoặc ảnh chụp UI. Các bước đó thuộc T5.2/T5.3 và không được suy ra từ audit này.
