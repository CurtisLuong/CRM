# Trạng thái dự án — snapshot từ tài liệu nguồn

## Nguồn và giới hạn

Nội dung bên dưới được chuyển từ CLAUDE.md người dùng cung cấp. Tài liệu nguồn không cho biết thời điểm xác minh các trạng thái này.

Bộ tài liệu được biên soạn ngày 06/10/2026; đây không phải ngày kiểm tra app. Chưa xác minh repo, Supabase, GitHub, Cloudflare hoặc thiết bị thật trong quá trình biên soạn. Không coi snapshot này là xác nhận hiện tại.

Chỉ đọc file này khi cần tiếp nối công việc hoặc task phụ thuộc trạng thái triển khai/test.

## Thanh đầu kiểu Facebook + ngăn kéo chừa status bar (2026-10-30)

- Curtis gửi ảnh vỏ Android: tấm khách và Lọc khách tràn lên status bar, không bấm được nút Đóng. Sửa: `SheetContent` đệm `safe-area-inset-top/bottom`, `DialogContent` chừa hai mép; thanh đầu khung app trên điện thoại ẩn khi cuộn xuống (vuốt lên), hiện khi cuộn lên, dải nền status bar luôn giữ; tab dính hồ sơ theo `--app-header-top`. Kiểm bằng Chromium giả lập status bar 32px (CDP `Emulation.setSafeAreaInsetsOverride`), chưa thử máy thật. `main` = `cec8c33` (Curtis duyệt qua Telegram), Cloudflare đã build (`index-BGblD2TL.js`). **Rollback:** `main` về `fa64f0f`.

## Sửa thanh đầu trên Android (2026-10-29, chiều)

- Curtis gửi ảnh vỏ Android: thanh đầu trùng status bar, nút gọi của dòng khách đè lên khi cuộn. Sửa: thanh đầu cao `56px + env(safe-area-inset-top)` (trước cố định 56px nên phần đệm ăn vào nội dung, đẩy nút lên status bar), lớp z-30 (trước z-5); tab dính hồ sơ dời theo. `main` = `fa64f0f` (merge `factory` @ `a4c638f`), Cloudflare đã build (`index-C6mebC2P.js`). **Rollback:** `main` về `a0532a5`.
- Kiểm: check 1239; e2e cả bộ 701 đạt + 3 ca r3-01 (Lead dùng `@/ui/Toast` ở Thông báo → đổi sang thanh xác nhận bằng kit, chạy lại đạt); test mới `header-overlay.spec.ts` trượt trên code cũ. Safe-area không giả lập được trên Chromium → **chờ Curtis thử máy thật**.

## UI mới mọi màn (R2–R5) + góp ý đợt U lên production (2026-10-29)

- **Curtis duyệt "merge main và push" 2026-10-29** sau khi xem preview `factory`. `main` = `a0532a5` (merge `factory` @ `fa1f4e2`; `origin/main` = `6012270`, không xung đột; cây `main` trùng `factory`). Lead push thẳng `main`; Cloudflare project `crm` tự build `crm-cop.pages.dev`. **Rollback:** đưa `main` về `6012270`.
- Gồm: mọi màn theo bản UI "Realty CRM" (R2–R5: Khách hàng + tấm xem nhanh, Hồ sơ, Thông báo, Hiệu quả, Thêm khách, Thao tác nhanh, Công việc, Cài đặt, Giỏ hàng, danh sách phụ, Tài liệu) + đợt U: Thông báo chỉ Tạm hoãn (2 giờ/4 giờ/8 giờ/1 ngày, mặc định 8 giờ), bỏ nút Lọc cũ, tiêu đề mục chữ HOA, Thao tác nhanh (nhật ký 2 dòng, bỏ Ghi cuộc gọi, phiên gọi chạy ở `/thao-tac-nhanh`), trang Mẫu tin Zalo `/mau-zalo`, trang Thủ tục `/thu-tuc`.
- **Không đổi** SQL, Supabase, Worker, vỏ Android → không migration, không APK mới. Mục `hidden` cũ của tín hiệu giữ nguyên trong `ui_state`.
- Kiểm: `npm run check` 1239 test; `npm run e2e` cả bộ 698/701 (3 ca pf06 tìm "dũng" → sửa phụ đề lệnh, chạy lại đạt); sau đó 2 sửa nhỏ (nhật ký 2 dòng, toast hoãn) chạy lại e2e liên quan. Ảnh 360/1280 sáng/tối bằng dữ liệu mẫu. Chưa thử máy thật Android/vỏ app.

## Bản UI "Realty CRM" R0+R1 + Tài liệu gửi khách (bản thử) lên production (2026-10-28)

- **Curtis duyệt "merge vào main" 2026-10-28** sau khi thử preview `factory`. `main` = `6012270` (merge `factory` @ `8bbc806`; trước đó gộp `origin/main` 85dd7c9 — chỉ có merge commit PR #1–#3, không xung đột). Lead push thẳng `main`; Cloudflare project `crm` tự build `crm-cop.pages.dev`. **Rollback:** đưa `main` về `85dd7c9` (bản production trước).
- Gồm: token/màu mới (D-028), khung mới (menu trái 64/232px, thanh tab dưới, thanh đầu 56px), Hôm nay mới (R1-02), chế độ dữ liệu mẫu (**không hiện trên production** — URL Supabase production), Tài liệu gửi khách bản thử (SK-01/02: lưu trên máy, chưa đồng bộ; vỏ Android chưa chia sẻ tệp được → tải tệp + mở Zalo), thông báo "Có bản mới" nổi trên thanh tab + tự hỏi bản mới mỗi 30 phút.
- **Không đổi** SQL, Supabase, Worker, vỏ Android → không migration, không APK mới.
- Kiểm: `npm run check` 1227 test; `npm run e2e` trên cây merge 534 đạt + 2 trượt (`dm01` chập chờn do 2 tiêu đề lúc chuyển màn — Lead sửa test, chạy lại xanh). Chưa thử máy thật Android/vỏ app.

## Hồ sơ desktop 2 cột PF-07 lên production (2026-10-21)

- 2026-10-22 (3): CL-03 (hồ sơ gọn: ngày sinh đủ năm hoặc chỉ ngày/tháng → tuổi, mệnh, cung; ô trống ẩn sau "Bổ sung"; ô ngắn 2 cột; Nhu cầu theo đợt + Người cùng quyết định sang tab Nhu cầu & căn → Nâng cao) + worker pool Factory (chỉ script). Curtis duyệt merge. `main` = `805c0c9` (cây file giống hệt `factory` b3663f6; 1100 unit + 418 e2e xanh, build xanh). Push GitHub → Cloudflare deployment `fe7fa0b7`; trang thật có bundle mới. Không có SQL. Rollback: deployment `f9a969a2` (be3b43f).
- 2026-10-22 (2): CL-01 (đầu danh sách khách: chip nhóm không số, hàng phễu + đếm + Xoá lọc, ngày đăng ký preset + lịch, sắp xếp mũi tên, nhớ nhóm khi quay lại), CL-02 (Nuôi dài hạn là nhánh của Đang chăm sóc), D-025 (khách nhóm sửa được thông tin + ghi chú, không SLA). Curtis duyệt merge. SQL `SQL/v2/010_team_info_edit.sql` đã có trên production trước khi deploy (policy + trigger khớp file). `main` = `be3b43f` (cây file giống hệt `factory` 7aedbac; 1092 unit + 415 e2e xanh, build xanh). Push GitHub → Cloudflare deployment `f9a969a2`; trang thật có bundle mới. Rollback: deployment `348bbeb3` (da659fa) — nếu rollback app, SQL 010 để nguyên vô hại.
- 2026-10-22: PF-08 (sắp xếp danh sách khách 3 tầng + ghim cần gọi/quá SLA). Curtis duyệt merge. `main` = `da659fa` (merge `factory` @ `9cde3e9`, cây file giống hệt `factory`; 1069 unit + 396 e2e xanh, build xanh). Push GitHub → Cloudflare tự build, deployment `348bbeb3`; trang thật có bundle mới. Rollback: deployment `012f16f2` (516867f).
- Curtis duyệt merge + deploy. `main` = `516867f` (merge `factory` @ `6b111f5`, cây file giống hệt `factory`). Kiểm trước: 1053 unit + 390 e2e xanh (worktree Lead); sau merge `factory` 387/390 khi máy quá tải (3 test hồ sơ 360 hết giờ tải trang), chạy lại nhóm hồ sơ 41/41 xanh.
- GitHub sự cố → tải thẳng: build `main` @ `516867f` với 3 biến công khai lấy từ bundle production (Supabase production `nrqccwamwctihivpxjww`, khoá publishable, `intake-worker`) rồi `npx wrangler pages deploy dist --project-name crm --branch main --commit-hash 516867f` → deployment `32126d97`. Đã thấy bundle mới (`index-CRTz-t-Q.js`) trên `crm-cop.pages.dev`. Khi GitHub hồi phục Cloudflare có thể build lại cùng commit — nội dung giống hệt.
- Không đổi dữ liệu/SQL/Worker/APK. **Rollback:** Cloudflare Pages → `crm` → Deployments → deployment `2150314d` (badge, `e14bb45`).

## Badge chuông nhỏ lên production (2026-10-21)

- Curtis duyệt đưa **riêng** sửa badge (không kèm PF-07 hồ sơ desktop đang ở `factory`). `main` = `e14bb45` = cherry-pick `eed5505` lên `9593ccc`. Kiểm: 1052 unit + e2e header/shell xanh. GitHub sự cố → tải thẳng bằng wrangler (deployment `2150314d`), đã thấy bundle mới trên trang thật. **Rollback:** deployment `9593ccc`/`15e3849`.
- Lưu ý: `main` giờ có commit không qua merge `factory` — lần merge `factory → main` sau sẽ gộp bình thường (cùng nội dung).

## Tìm có dấu + chuông + tìm toàn app PF-05/06 lên production (2026-10-21)

- Curtis duyệt push. `main` = `15e3849` (merge `factory` @ `850b64b`). Kiểm trước: 1052 unit + 372 e2e xanh.
- **GitHub sự cố (webhook sang Cloudflare chậm/mất)** → Cloudflare không build `15e3849`/`9593ccc` (commit rỗng kích lại). Curtis duyệt tải thẳng: build `main` @ `9593ccc` trên máy với 3 biến công khai lấy từ bundle production đang chạy (`VITE_SUPABASE_URL` = production `nrqccwamwctihivpxjww`, `VITE_SUPABASE_ANON_KEY` = khoá publishable, `VITE_WORKER_URL` = `intake-worker`) rồi `npx wrangler pages deploy dist --project-name crm --branch main --commit-hash 9593ccc` → deployment `940a9a3c`. Đã thấy bundle mới trên `crm-cop.pages.dev`. Khi GitHub hồi phục Cloudflare có thể build lại cùng commit — nội dung giống hệt.
- Không đổi dữ liệu/SQL/Worker/APK. **Rollback:** Cloudflare Pages → `crm` → Deployments → bản `6582212`.

## Menu có nhóm PF-04 lên production (2026-10-21)

- Curtis duyệt "Push menu mới lên app thật". `main` = `6582212` (merge `factory` @ `b9a86ea`). Kiểm trước: 1013 unit + 359 e2e xanh (Lead vá 1 e2e chập chờn của PF-04).
- Không đổi dữ liệu/SQL/Worker/APK. **Rollback:** Cloudflare Pages → `crm` → Deployments → bản `b8f73d6`.

## Hồ sơ gọn PF-01/02/03 lên production (2026-10-21)

- **Curtis duyệt push (2026-10-21, qua remote control).** `main` = `b8f73d6` (merge `factory`, gồm cả Meta Lead Ads `ae52e3a` đã có trước). Cloudflare project `crm` (domain `crm-cop.pages.dev`) build production `b8f73d6`, deployment `4610001c`; đã thấy chữ mới trong bundle trang thật.
- Kiểm trước push: 1008 unit + 350 e2e (360/390/1280) xanh trên `factory`; cây `main` giống hệt `factory`.
- **Không đổi** SQL, Supabase, Worker, vỏ Android. Dữ liệu chỉ thêm khoá JSONB `advanced.life_context`, `advanced.pref_conditions` khi người dùng gõ.
- **Chưa xác minh:** thử trên điện thoại thật.
- **Rollback:** Cloudflare Pages → `crm` → Deployments → deployment `ae52e3a` → *Rollback to this deployment*; rồi `git revert -m 1 b8f73d6` trên `main` nếu muốn bỏ hẳn.

## Phát hành v3 — thiết kế lại UI/UX (2026-10-19)

- **Curtis duyệt "merge và deploy" 2026-10-19.** `main` = `53a9fc5` (merge `factory` @ `17229dd`, D-023/D-024); push → Cloudflare `crm-cop` tự build production. Cây code giống hệt bản `factory` đã kiểm (902 unit + e2e 360/390/1280 sáng/tối; build production chạy thử đạt).
- **Không đổi** SQL, Supabase, Worker, vỏ Android, `src/data` → không migration, không cần APK mới (vỏ mở `crm-cop`). Người dùng PWA thấy lời nhắc cập nhật khi Service Worker mới về.
- **Chưa xác minh:** thử trên điện thoại thật / Mac với dữ liệu production (danh sách thử: `docs/v3/release/README.md`). Nhánh `factory` **chưa push** (preview Cloudflare chưa kiểm key theo `docs/runbooks/factory-preview.md`).
- **Rollback:** Cloudflare Pages → `crm-cop` → Deployments → deployment của commit `f63bf7d` → *Rollback to this deployment* (cấu hình build giữ nguyên; dữ liệu không ảnh hưởng vì v3 không đổi dữ liệu). Sau đó `git revert -m 1 53a9fc5` trên `main` nếu muốn bỏ hẳn.

## Cutover v2 → production (T5.4, 2026-10-17)

- **v2 đang chạy production** tại `https://crm-cop.pages.dev` từ 2026-10-17 ~23:39 +07: `main` = `f63bf7d` (merge `v2` @ `66fc241`). Vỏ Android vẫn trỏ `crm-cop` (không đổi `server.url`).
- Trước khi đổi: mọi máy báo "Đã đồng bộ"; backup production mới (`scripts/backup/dump.sh`) đạt checksum, có bản sao thứ hai (chủ dự án giữ đường dẫn, ngoài repo).
- **Migration production đã chạy 2026-10-17:** `SQL/v2/002_customer_memory.sql` → `003_campaign_costs.sql` → `004_user_settings_ui_state.sql` → `005_units_verified_at.sql` → `006_catalog_archives.sql`; mỗi file báo Success, kiểm tra cột/bảng sau cùng đều có. Production giờ có đủ `SQL/v2/001`–`006`.
- **Cloudflare `crm-cop`:** Build command `npm ci && npm run build`, output `dist`, biến Production `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (production), `VITE_WORKER_URL` (`intake-worker`, như v1), `NODE_VERSION=22`. Đã xác minh bundle chứa ref production, không chứa ref staging.
  - *Rollback (runbook `cutover.md` §4):* Deployments → rollback về deployment v1 trước `f63bf7d`, rồi xoá Build command/output/4 biến (cấu hình v1 cũ: nhánh `main`, auto-deploy bật, build/output/root trống, không có biến).
- **APK 1.5** (versionCode 6, quyền RECORD_AUDIO + MODIFY_AUDIO_SETTINGS — lỗi L4 T5.3): đã tải lên Storage production `app-releases/SoKhach-1.5.apk` (checksum khớp), cùng chứng chỉ ký với 1.4; `/android-app-version.json` báo 1.5.
- Kiểm tra sau cutover (chủ dự án, 2026-10-17): **Mac và Android đạt** — đăng nhập, danh sách, hồ sơ, tìm kiếm, ghi chú, đồng bộ, Gọi/Zalo/Back; APK 1.5 cài đè được, ghi chú giọng nói chạy.
- **Đang theo dõi 48 giờ** (đến ~2026-10-19 23:40): lỗi đăng nhập/đồng bộ và nhật ký `customer_changes` (không có DELETE cứng, mảng ghi chú/việc/cuộc gọi không bị ngắn lại ngoài ý muốn).
- Worker `intake-worker` deploy 2026-10-21 (version `b1910971`, Curtis duyệt khi bật Meta Lead Ads) — **gồm AI v2 (T6.7, D-022)** + Meta Lead Ads (`docs/runbooks/meta-lead-ads.md`). Rollback Worker: `cd worker && wrangler rollback be650b75` (code 13/10, giữ secret). Nếu rollback app về v1 thì rollback Worker kèm. Dọn dẹp + tài liệu as-built: T5.5.

## Đại tu v2 (cập nhật 2026-10-16)

- Đã có bộ quy định: `PRD.md`, `tasks.md`, `ARCHITECTURE.md` v2, `DESIGN_SYSTEM.md` v3, `UX_GUIDELINES.md` v2, `prompts.md`, D-011…D-015. **Chưa code v2.**
- Sóng 0: T0.1 ☑ (backup `~/CRM-backups/20261016-120548`, diễn tập khôi phục vào staging khớp 22/22 bảng) · T0.2 ☑ · T0.3 ☑ · T0.4 ☑ · T0.5 ☑ (`crm-v2-9hf.pages.dev`, nhánh `v2`, staging) · T0.6 đang đo.
- Chờ chủ dự án xác nhận stack D-011 trước T1.1.

| Supabase | Mã project | Vai trò |
|---|---|---|
| production | `nrqccwamwctihivpxjww` | DB thật; từ 2026-10-17 app v2 (`crm-cop.pages.dev`, APK 1.5) dùng |
| staging | `mksjmpcsfawsiabfhoxe` | Khôi phục từ backup 2026-10-16; app v2 `crm-v2-9hf.pages.dev` (Cloudflare project `crm-v2`, nhánh `v2`) trỏ vào đây |

## Migration production (xác minh 2026-10-16 bằng `scripts/sql/inspect.sql`)

- **Mọi migration v1 trong `SQL/` đã chạy** (kể cả `add_zalo_templates`, `add_team_assign`, `add_ai_settings`, `add_realtime_customers`). Chi tiết: `ARCHITECTURE.md` §3.2.
- `SQL/v2/001_customer_audit.sql` (T0.2): **đã chạy production 2026-10-16** — mọi sửa/xoá khách được ghi vào `customer_changes`.

## Trạng thái được ghi trong nguồn

| Hạng mục | Nội dung nguồn ghi | Cần xác minh khi nào |
|---|---|---|
| Hosting | Đã deploy tại https://crm-cop.pages.dev | Khi kiểm tra production hoặc triển khai |
| Auto-deploy | GitHub → Cloudflare Pages khi push main | Trước khi push có khả năng deploy |
| Chức năng cơ bản | Đăng nhập/đăng ký, tạo khách, filter/sort, offline sync đã chạy và được test thủ công | Khi sửa các luồng liên quan |
| Tài khoản/dữ liệu | Có một tài khoản role sale, chưa có khách thật | Khi thao tác dữ liệu; không giả định hiện vẫn trống |
| Baseline schema | `schema.sql` được mô tả đã vá các lỗi ở phần pitfalls | Khi setup/migration; kiểm tra schema thực tế |
| Migration cũ | `fix_rls_recursion.sql`, `fix_table_grants.sql` được ghi đã áp dụng | Khi xác định trạng thái DB; không chạy lại mặc định |
| Deep-link Zalo | Chưa test kỹ SĐT → Zalo trên môi trường thật | Khi sửa hoặc xác nhận tính năng này |

## Icon PWA

File nguồn ghi các icon:

- `icons/app-icon-192.png`
- `icons/app-icon-512.png`
- `icons/apple-touch-icon.png`

Được tạo từ `icons/Net_Icon.png`, logo mạng lưới xanh trên nền mint. Nguồn ghi đã center-crop bằng `sips` để cắt viền trắng thừa.

Không cần đọc hoặc tái tạo icon cho task không liên quan. Khi đổi asset, kiểm tra file và tham chiếu trong manifest/HTML/Service Worker.

## Cách cập nhật snapshot

Sau một lần xác minh thực tế, thay trạng thái liên quan bằng thông tin mới, ghi:

- Ngày kiểm tra.
- Môi trường: local / trình duyệt / Supabase / production.
- Kết quả và bằng chứng ngắn: commit, deployment, migration hoặc kiểm tra cụ thể.
- Phần chưa xác minh hoặc bị chặn.

Không dồn lịch sử vào file này; changelog/Git giữ lịch sử. Không cập nhật phần ngoài phạm vi task bằng suy đoán.
