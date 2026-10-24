# Đợt CP — Hồ sơ khách và loại công việc

Worker: deepseek (DeepSeek Flash); dự phòng: luna (gpt-6-luna), Curtis chỉ định 23/10/2026. Reviewer khác worker theo Factory.

Yêu cầu đã chốt: Nhu cầu & căn lên đầu/mặc định; dự án chọn từ catalog + thêm trực tiếp + xoá có xác nhận; Curtis chọn xoá mềm khỏi danh sách, giữ hồ sơ và toà/căn. Ô trống dưới Bổ sung; ô ngắn 2 cột điện thoại/nhiều hơn desktop; sở thích BĐS trong Nâng cao. Ảnh có nguồn máy/clipboard, xem đủ, đổi/xoá. Tài liệu nhóm có dữ liệu. Thêm việc có 5 loại Gọi điện, Zalo, Cafe và Gặp, Tham quan, Hồ sơ, icon dùng chung.

Thực hiện tuần tự để tránh cùng sửa route hồ sơ: CP-02 ảnh/tài liệu → CP-01 nhu cầu/dự án → CP-03 công việc. Mỗi task worktree riêng, kiểm tra + review + merge factory; không push/main/production.

FACT: remote có sẵn upload/remove avatar/cover; catalog có addProject/archiveProject; xóa mềm qua archived_at. TASK_KINDS có mã cũ cần giữ tương thích. Gọi điện dùng luồng lịch gọi next_call_at hiện có.

## CP-02
- DeepSeek high, 1 lần, $0.0790, 10 phút worker; script gate đạt; commit f753235. Worker chạm timeout, báo cáo cuối thiếu. Reviewer máy lỗi (không có kết luận), Lead đọc diff toàn bộ và ảnh.
- Lead phát hiện khung quản lý ảnh bị đưa lên header thay vì tab Tài liệu; khôi phục header, đưa khung vào tab Tài liệu và cập nhật thao tác e2e tương ứng (9dbd7a9, e9c93de). Cổng merge toàn app đang chạy.
- Lead sửa remote.listDocuments để ném lỗi đọc thay vì giả dữ liệu rỗng, thêm regression test (e048a1a).
- Cổng toàn app lần đầu: 442 passed, 56 skipped, 6 failed do test ảnh khách lưu trữ chưa mở tab Tài liệu. Đã sửa thao tác test trong e048a1a. Chưa merge.
- Tiếp tục CP-01 trên agent/CP-02 rồi CP-03 trên CP-01, mỗi task worktree riêng. Chạy cổng toàn app cuối chuỗi trước khi merge factory.
- Không gửi secret hay dữ liệu khách thật sang worker: worktree từ Git không chứa .env.backup/.env.staging; fixture legacy-customers.json ghi rõ dữ liệu tổng hợp. Curtis xác nhận cho phép gửi mã nguồn/tài liệu cần thiết đến DeepSeek cho đợt này sau lần auto-review chặn.

## Tiếp tục 24/10 sau gián đoạn quota
- CP-01: DeepSeek high đạt lần 1, afa13c2; 1144 unit + 18 e2e. Lead sửa giữ nguyên tên dự án cũ và báo lỗi catalog (b1fa972); cập nhật fixture count của các bảng catalog (9994027).
- Review CP-01 Luna: cờ combobox chưa lọc archived_at. Lead đối chiếu catalog.visibleCatalog: lọc khi scope cache, load và archive; cờ không áp dụng luồng thật.
- CP-03: DeepSeek high đạt lần 1, f77b0a0; $0.1181, 14.4 phút, 19.1M token; 1162 unit + 24 e2e. Lead xem ảnh 360px picker và diff. Đóng/reset form khi đổi khách, đồng bộ icon loại gọi điện (9994027).
- Review CP-03 Luna: cờ đổi nhãn call. Lead chấp nhận vì Curtis yêu cầu nhãn Gọi điện/icon Phone; dữ liệu vẫn next_call_at, không đổi mã hay luồng schedule, không tạo next_tasks trùng.
- Cổng merge cuối đang chạy agent/CP-03 (bao gồm CP-02/CP-01) → factory; không push/main/production.

## Kết quả cuối 24/10/2026
- Đã merge cả chuỗi CP-02 → CP-01 → CP-03 vào factory: d2bd61f. Không push, không merge main, không deploy, không đổi database production trong phần UI này.
- npm run check: 129 file / 1162 test đạt, TypeScript và Biome đạt.
- Cổng e2e toàn app: 489 passed, 56 skipped, 1 failed tại PF-08 (nút đo 43.99993896484375px so với ngưỡng 44px). Đây là file không bị đợt CP sửa. Script retry nhận nhầm các tên test đạt là file lỗi nên không tự chạy lại.
- Theo ngoại lệ script lỗi: dùng factory-merge với npm run check và chạy lại đúng pf08-customer-sort.spec.ts / phone-360. Lượt này đạt, script mới merge. Log cổng đầy đủ: logs/cp-full-gate-20261024.log; log lượt chốt: logs/merge-agent_CP-03.log.
- Fixture profile cần Content-Range và Access-Control-Expose-Headers đúng bảng catalog; không áp count=0 cho mock customers (sẽ biến mock rỗng thành phản hồi đầy đủ). Đã sửa và kiểm riêng profile + CP-01 mobile 8/8.
- Worker API: CP-01 $0.1477, CP-02 $0.0790, CP-03 $0.1181; tổng $0.3448. Luna review dùng hạn mức gói. Các worker đều DeepSeek; chưa cần worker dự phòng.

## Nghiệm thu chức năng
- ✓ Nhu cầu mở mặc định, thứ tự tab; ô trống sau Bổ sung; trường ngắn cùng hàng; sở thích BĐS trong Nâng cao: cp01-needs + cp01-projects.
- ✓ Chọn nhiều dự án, thêm, xác nhận/huỷ lưu trữ mềm, giữ tên cũ và trường lạ, offline và lỗi server: cp01-projects unit/e2e.
- ✓ Khung ảnh trống, nguồn máy/clipboard, xem đủ ảnh, đổi/xoá và quyền chỉ xem; nhóm tài liệu chỉ hiện khi có tệp: cp02-profile-assets + unit photos/documents.
- ✓ Thêm việc đúng 5 hành động/icon; call dùng schedule, bốn loại lưu mã đúng, hạn giờ/cả ngày/không hạn, huỷ không ghi, quyền và hàng đợi offline: cp03-add-task + cp03-task-actions.
- ✓ Kiểm browser giả 360/390/1280, sáng/tối; Lead xem ảnh nhu cầu và picker mobile/desktop.
- Chưa xác minh: clipboard/upload trên Android thật, Supabase staging/production và nhiều máy thật. Không thay schema; dùng API hiện có.

## Curtis thử sau khi phát hành
1. Mở khách → Nhu cầu; mở Bổ sung/Nâng cao; chọn 2 dự án, thêm dự án thử rồi lưu trữ với xác nhận. Tên đã chọn trong hồ sơ phải còn.
2. Tài liệu → dấu cộng → ảnh từ máy/clipboard; bấm ảnh xem đủ → Đổi/Xoá.
3. Thêm việc → kiểm 5 loại; thử Zalo và Tham quan, thử lịch gọi không xuất hiện việc trùng; thử mất mạng rồi nối lại.
