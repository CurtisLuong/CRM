# Runbook — Chuyển v1 sang v2 (T5.4)

> **Phạm vi:** tài liệu chuẩn bị cho cutover. T5.4a chỉ viết và rà soát runbook; không có backup mới, migration, thay đổi Cloudflare, merge `v2` → `main` hay cutover production nào được thực hiện trong task này.
>
> **Ai thực hiện:** chủ dự án và agent cùng phối hợp. Chỉ bắt đầu phần **Thực hiện cutover** sau khi T5.3 đã hoàn tất, các mục QA thiết bị/offline được xác nhận đạt, và chủ dự án xác nhận bắt đầu cửa sổ cutover. Nếu T5.3 chưa xong hoặc có mục chưa đạt, dừng ở phần Chuẩn bị.
>
> **Môi trường:** Supabase production `nrqccwamwctihivpxjww`; Supabase staging `mksjmpcsfawsiabfhoxe`. Mọi thao tác dữ liệu ghi trong phần cutover chỉ được thực hiện trên production đúng thời điểm được chỉ rõ. Không đưa key, mật khẩu hay dữ liệu khách vào tài liệu/chat.

## 1. Chuẩn bị trước ngày cutover

Các bước này có thể hoàn tất trước T5.3. Chúng không chuyển người dùng hoặc dữ liệu sang v2.

### 1.1 Xác nhận điều kiện bắt đầu

Chủ dự án và agent kiểm tra:

- [ ] T5.1 parity, T5.2 staging và T5.3 thiết bị thật/offline đã được đánh dấu hoàn tất; T5.3 có kết quả trên Android và Mac.
- [ ] Nhánh `v2` là phiên bản đã QA; `npm run check`, `npm run e2e` (nếu có thay đổi luồng UI) và `npm run build` đã chạy đạt trên commit dự kiến.
- [ ] Có thể đăng nhập v2 bằng tài khoản phù hợp; app v2 đang trỏ đúng Supabase staging trong môi trường staging.
- [ ] Chủ dự án chọn thời gian ít sử dụng app để tạo cửa sổ dừng sửa v1 và xác nhận bắt đầu T5.4.
- [ ] Đã xác định người dùng/thiết bị cần thông báo, người kiểm tra Android và Mac, và cách liên hệ nếu cần dừng cutover.

Nếu thiếu bất kỳ mục nào, ghi lại mục còn thiếu và chưa thực hiện các bước tiếp theo.

### 1.2 Chuẩn bị backup

Làm theo `docs/runbooks/backup.md` Phần A để kiểm tra công cụ và cấu hình backup. Không gửi file `.env.backup`, key, database URL có mật khẩu hoặc thư mục backup cho agent. Trước cutover phải tạo **backup production mới** theo Phần B; bản backup T0.1 cũ không thay thế backup ngay trước cutover.

Backup phải được lưu ngoài repo, có bản sao riêng tư thứ hai và kiểm tra `SHA256SUMS`. Ghi lại đường dẫn backup, thời điểm, project id và kết quả kiểm tra vào ghi chú vận hành riêng tư. Không chép dữ liệu khách hoặc secrets vào Git.

### 1.3 Lập danh sách migration production còn thiếu

Đối chiếu danh sách migration `SQL/v2/` với bằng chứng đã chạy trên **production `nrqccwamwctihivpxjww`**. `docs/project-status.md` và `docs/architecture.md` là snapshot, cần xác minh lại tại thời điểm cutover. Không chạy lại migration đã chạy và không suy ra trạng thái production chỉ từ việc file có trong repo.

Với từng migration còn thiếu, ghi tên file và cách xác minh sau khi chạy. Kiểm tra nội dung theo D-012: chỉ thêm, không drop/rename/đổi kiểu/đổi nghĩa hoặc cập nhật hàng loạt. Nếu phát hiện migration không an toàn, trạng thái production không rõ, hoặc file cần chạy không rõ thứ tự, dừng và yêu cầu chủ dự án quyết định trước khi chạm production.

### 1.4 Ghi lại cấu hình hiện hành để rollback

Trong Cloudflare Dashboard → **Workers & Pages** → project `crm-cop`, ghi lại hoặc chụp ảnh riêng tư các mục:

- production branch hiện tại và trạng thái deployment đang phục vụ `https://crm-cop.pages.dev`;
- Build command và output directory hiện tại;
- tên các biến môi trường đang cấu hình cho production (chỉ tên, không chép giá trị bí mật vào ghi chú).

Xác nhận có quyền truy cập Cloudflare, GitHub và Supabase production. Xác nhận deployment v1 hiện tại còn hiển thị trong Cloudflare để có thể rollback. Không chỉnh các thiết lập ở bước chuẩn bị.

### 1.5 Chuẩn bị kiểm tra sau chuyển đổi

Chuẩn bị tài khoản kiểm tra và checklist chức năng không chứa dữ liệu khách nhạy cảm: đăng nhập, xem danh sách, mở hồ sơ, tìm kiếm, ghi chú/lịch sử, tạo việc, gọi/Zalo theo đúng thao tác thủ công, trạng thái đồng bộ và đăng xuất/đăng nhập lại. Chuẩn bị thiết bị Android có APK hiện dùng và MacBook. Các bước này sẽ được chạy sau khi deployment production hoàn tất.

## 2. Thực hiện cutover — chỉ sau T5.3 và xác nhận của chủ dự án

**Checkpoint bắt buộc:** xác nhận T5.3 hoàn tất; chủ dự án xác nhận cửa sổ cutover bắt đầu; mọi người dùng đã nhận thông báo dừng sửa v1. Nếu không thể xác nhận một trong ba điều kiện này, dừng tại đây.

### 2.1 Đóng ghi trên v1 và xả hàng đợi

1. Thông báo tất cả người dùng dừng nhập/sửa trên v1 trong cửa sổ cutover. Giữ app mở và có mạng trên từng thiết bị đang sử dụng.
2. Trên từng máy, bấm đồng bộ/đợi đồng bộ đến khi app báo **“Đã đồng bộ”**. Kiểm tra không còn thao tác chờ hoặc lỗi đồng bộ.
3. Nếu máy offline, còn hàng đợi, hoặc có lỗi không xử lý được: dừng cutover. Kết nối lại, đồng bộ và xác nhận dữ liệu trước khi tiếp tục; không bỏ hàng đợi.

### 2.2 Backup production ngay trước thay đổi

1. Chạy `docs/runbooks/backup.md` Phần B với cấu hình production và project `nrqccwamwctihivpxjww`.
2. Xác nhận script in đúng project id production, backup hoàn tất, kiểm tra checksum đạt và bản thứ hai đã được chép riêng tư.
3. Nếu project id, số dòng, tải file hoặc checksum không đạt/không rõ, dừng. Không chạy migration hay đổi deployment.

### 2.3 Áp dụng migration còn thiếu

Chỉ chạy các migration đã được xác định ở §1.3, trong thứ tự đã kiểm tra, tại Supabase Dashboard → SQL Editor của **production `nrqccwamwctihivpxjww`**. Không chạy chúng ở staging trong bước này, không chạy lại migration đã áp dụng và không chạy toàn bộ thư mục `SQL/v2/` theo kiểu hàng loạt.

Sau mỗi file, kiểm tra kết quả SQL và bằng chứng schema/trạng thái tương ứng. Nếu câu lệnh lỗi, kết quả một phần, hoặc trạng thái sau chạy không xác định, dừng và chuyển sang đánh giá rollback; không tiếp tục file kế tiếp. Tuyệt đối không dùng `SQL/schema.sql` làm migration production.

### 2.4 Chuyển cấu hình Cloudflare Pages

Trong Cloudflare Dashboard → Workers & Pages → `crm-cop` → **Settings → Builds & deployments**:

1. Xác nhận project đang chỉnh là `crm-cop` và production branch cần dùng là `main` sau khi cập nhật mã.
2. Đặt Build command `npm ci && npm run build`, Build output directory `dist`.
3. Trong **Settings → Environment variables → Production**, đặt `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` lấy từ **production `nrqccwamwctihivpxjww`**. Không lấy biến staging từ project `crm-v2`; không dùng service-role key ở frontend. Giữ `VITE_WORKER_URL` theo cấu hình production đã được xác nhận cho bản phát hành.
4. Lưu cấu hình theo giao diện Cloudflare. Chưa coi việc lưu cấu hình là đã deploy thành công.

Nếu không xác định được giá trị hiện hành/chính xác hoặc production và staging bị lẫn, dừng trước khi deploy. Không dán giá trị biến vào ticket, log hay chat.

### 2.5 Đưa mã v2 lên nhánh production

Sau khi migration và cấu hình đã sẵn sàng, chủ dự án cùng agent rà soát lần cuối commit `v2` đã QA và target `main`. Dùng quy trình Git/PR của dự án để đưa `v2` vào `main`; xác minh diff không chứa secrets hay thay đổi ngoài phạm vi. Không force-push. Chờ Cloudflare build/deploy production kết thúc xanh.

Nếu build thất bại, không tuyên bố cutover xong. Giữ trạng thái dừng sửa theo kế hoạch, xử lý lỗi hoặc thực hiện rollback §4 trước khi cho người dùng quay lại.

### 2.6 Kiểm tra production và mở lại sử dụng

1. Mở `https://crm-cop.pages.dev` trên Mac, đăng nhập bằng tài khoản production và chạy checklist §1.5.
2. Lặp các kiểm tra cốt lõi trên Android shell hiện dùng; xác nhận mở app, đăng nhập, đồng bộ, nút Back và các cầu nối native liên quan hoạt động.
3. Xác nhận app gọi đúng Supabase production `nrqccwamwctihivpxjww`; kiểm tra trạng thái đồng bộ và `customer_changes` cho các thao tác kiểm tra đã thực hiện. Không dùng thử nghiệm có ghi dữ liệu khách thật nếu chưa có bản ghi/tài khoản kiểm thử được chủ dự án cho phép.
4. Chỉ sau khi kiểm tra đạt, thông báo người dùng có thể tiếp tục. Ghi thời điểm mở lại và commit/deployment id vào nhật ký vận hành.
5. Theo dõi lỗi đăng nhập/đồng bộ, phản ánh người dùng và audit trong **48 giờ**. Sự cố có thể làm mất dữ liệu: yêu cầu người dùng dừng sửa và chuyển sang §4.

## 3. Tiêu chí hoàn tất T5.4

- Mọi máy đã đồng bộ trước khi đóng v1; backup mới production có checksum đạt và bản sao riêng tư.
- Chỉ migration production còn thiếu đã được chạy và xác minh.
- Cloudflare `crm-cop` phục vụ v2, build xanh, cấu hình frontend trỏ production chứ không phải staging.
- Kiểm tra trên Mac và Android đạt; người dùng được thông báo mở lại; bắt đầu theo dõi 48 giờ.
- Có ghi chú vận hành gồm thời điểm, commit/deployment, migration đã xác minh, kết quả thiết bị và người xác nhận. Không ghi secrets hoặc dữ liệu khách.

## 4. Rollback

Kích hoạt rollback nếu v2 không đăng nhập/đồng bộ được, lỗi nghiêm trọng trên Mac/Android, ghi dữ liệu sai, hoặc không thể xác nhận an toàn dữ liệu. Báo người dùng dừng sửa ngay; giữ nguyên thiết bị có hàng đợi và ghi lại thời điểm/symptom. Không tự xóa queue hoặc khôi phục đè database.

### 4.1 Quay lại deployment v1

1. Cloudflare Dashboard → Workers & Pages → `crm-cop` → **Deployments**.
2. Chọn deployment v1 gần nhất đã xác minh, dùng **Rollback to this deployment** theo giao diện hiện tại và chờ trạng thái hoàn tất.
3. Khôi phục Build command, output directory, production branch và biến môi trường về các giá trị đã ghi ở §1.4 nếu chúng đã bị đổi. Kiểm tra frontend v1 vẫn dùng cấu hình Supabase production.
4. Mở `https://crm-cop.pages.dev`, kiểm tra đăng nhập và thao tác đọc. Chưa cho ghi trở lại cho đến khi xác định rõ trạng thái queue và dữ liệu trên từng máy.

Rollback deployment không tự hoàn tác migration. Migration v2 chỉ được chạy nếu đã xác minh là additive theo D-012; không chạy SQL đảo ngược/drop để “dọn” schema.

### 4.2 Xử lý dữ liệu sai

Nếu audit cho thấy thao tác ghi sai, xác định khách/trường/thời điểm qua `customer_changes` và làm theo `docs/runbooks/audit.md` để lập phương án khôi phục từng trường. Đối chiếu trước trên staging; mọi sửa production cần chủ dự án duyệt và backup trước. Không restore toàn bộ backup vào production như bước rollback mặc định.

Nếu có hỏng dữ liệu diện rộng hoặc queue chưa được xả, dừng cả v1/v2 ở các thiết bị, không tiếp tục sync, và chuyển sang quy trình cứu dữ liệu trong `docs/runbooks/backup.md` Phần D. Chỉ mở ghi lại sau khi đã thống nhất nguồn dữ liệu đúng và cách xử lý queue.

## 5. Báo cáo sau cutover hoặc rollback

Ghi lại ngày giờ và múi giờ, người xác nhận, commit/deployment, kết quả backup/migration, kiểm tra Mac/Android, thời điểm mở lại hoặc rollback, và các mục còn theo dõi. Cập nhật trạng thái dự án/changelog qua quy trình task sau khi đã xác minh. Không đánh dấu T5.4 hoàn tất chỉ vì đã chuẩn bị runbook hoặc vì deployment đã bắt đầu.
