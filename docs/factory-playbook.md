# Factory playbook

> Theo skill `ai-factory-lead` (cập nhật 2026-10-19: Lead vạch xương sống, worker tự do trong hàng rào; 2026-10-22: review theo rủi ro, script chạy test thay Lead; 2026-10-22 (2): worker pool deepseek / haiku / luna, Curtis chỉ định mỗi đợt). Hàng rào chung cho worker: `AGENTS.md`. Bản đồ module/hợp đồng/vùng cấm: `docs/ARCHITECTURE.md` §0. Mẫu task: `tasks/TEMPLATE.md`.

| Vai | Ai | Làm gì |
|---|---|---|
| Product Owner | Curtis | Nói muốn gì / không thích gì, quyết luật nghiệp vụ, chọn ưu tiên, nghiệm thu, quyết merge vào `main`/production |
| Lead | Claude | Vạch **xương sống** và **hàng rào**: kiến trúc, hợp đồng, luật + số chuẩn, PHẢI/CẤM, nghiệm thu. Nghiên cứu, chia việc, review, merge vào `factory` |
| Worker | Pool: **deepseek** (OpenCode, API) · **haiku** (Claude Code, gói) · **luna** (Codex, gói) — `scripts/factory-workers.mjs` | Coding agent: **tự thiết kế cách cài đặt**, tự viết test, tự sửa lỗi trong phạm vi. Worktree riêng, không bao giờ push. Curtis chọn worker + dự phòng mỗi đợt |
| Reviewer | Khác worker: deepseek → **luna@xhigh** (hết hạn mức → haiku@max); haiku/luna → **deepseek#max** (`scripts/factory-review.mjs`) | Đọc diff + task + AGENTS.md, kiểm 4 điểm, trả JSON cờ. Chỉ đọc |

Giao tiếp với Curtis: ngắn, thực tế, dùng bảng; gom câu hỏi thành một lần (mỗi câu có đề xuất mặc định); FACT / HYPOTHESIS; ghi kết quả vào file. Tự làm hết, chỉ hỏi khi vướng giới hạn kỹ thuật, tiền, hoặc duyệt trước deploy production.

## Phân vai: xương sống và không gian tự do

| Lead PHẢI vạch rõ | Lead KHÔNG làm (worker tự quyết) |
|---|---|
| Mục tiêu: người dùng thấy/làm được gì | Cách cài đặt từng bước, vị trí dòng code |
| Kiến trúc, ranh giới module, hợp đồng | Tên biến, hàm nội bộ, cấu trúc trong module |
| Luật nghiệp vụ + **ví dụ số chuẩn** | Ca test thêm, helper, refactor nhỏ trong phạm vi |
| Phạm vi (thư mục/glob) | Sửa file nào trong vùng đó |
| PHẢI / CẤM riêng của task | Thứ tự làm, cách debug |
| Nghiệm thu: hành vi + test bắt buộc | Thiết kế test chi tiết ngoài ca bắt buộc |

Không viết code mẫu, không "bản vá chứng minh". Việc < 20 dòng: Lead tự sửa. Migration, kiến trúc, vùng dữ liệu/đồng bộ/auth: Lead làm hoặc ghi hợp đồng rất rõ.

## Đầu mỗi phiên

1. Đọc `docs/ARCHITECTURE.md`, `docs/STATE.md`, `docs/ROADMAP.md`, `docs/factory-metrics.md`, `tasks/queue/`, `tasks/blocked/`, `reports/` mới nhất.
2. Xác định luồng (A dự án mới / B nâng cấp / C sửa lỗi nhỏ) và giai đoạn; báo 1 câu.

## Luồng B — nâng cấp app có sẵn (đang dùng cho v3)

B0 hiện trạng (`docs/v3/current-state-ui.md`, cập nhật `docs/ARCHITECTURE.md`) → B1 phản hồi (`docs/v3/feedback.md`) → B2 đối thủ (`docs/research/`) → B3 lộ trình (`docs/ROADMAP.md`) → B4 milestone (phát hành được riêng; lỗi P1 → UX P1 → tính năng) → B5 lưới an toàn (vùng sắp sửa chưa có test → task test-only giữ hành vi, chạy trên code cũ phải trượt đúng chỗ) → B6 task → B7 worker → review → merge → hết milestone hỏi Curtis có phát hành không. Một milestone một lúc.

Luồng C (lỗi/yêu cầu nhỏ): đối chiếu repo → gom câu hỏi → < 20 dòng Lead tự sửa → còn lại gộp theo vùng code thành task → batch.

## Task

- Mẫu `tasks/TEMPLATE.md`: dòng đầu (Loại · **Rủi ro** thấp/vừa/cao · **Khó** có/không) · Mục tiêu · Bối cảnh · Luật nghiệp vụ (số chuẩn) · Hợp đồng · Phạm vi (glob) · PHẢI · CẤM · Nghiệm thu (code block lệnh) · Tự do · Báo cáo cuối (4 mục, mục 4 = checklist nghiệm thu).
- Rủi ro: **thấp** = giao diện/chữ/hàm thuần trong 1 màn, không luật nghiệp vụ, không dữ liệu/đồng bộ/auth, không hợp đồng chung → được tự merge. **Vừa** = có luật/số chuẩn hoặc nhiều màn. **Cao** = dữ liệu/đồng bộ/auth/migration/kiến trúc. Không chắc → chọn mức cao hơn.
- Khó: **có** = thuật toán/luật nhiều nhánh dễ sai tinh vi → worker #max từ lần 1.
- Test-only: chỉ thêm test cho hành vi chưa có; script chạy test mới trên base, **phải trượt** (có ca failed, không phải lỗi biên dịch). Lệnh Nghiệm thu không chạy test mới đó. Test giữ hành vi hiện có (phải xanh) → khai Loại: code.
- Cỡ: một lát tính năng trọn vẹn (thường 1 màn / 1 module). Các task cùng hàng đợi không phụ thuộc nhau, không chồng phạm vi.
- `factory-run.mjs` kiểm phạm vi theo glob, chặn sửa test có sẵn, chạy đúng lệnh trong Nghiệm thu; e2e mỗi worker một cổng (`E2E_PORT`), giới hạn luồng bằng `E2E_WORKERS` khi chạy song song.

## BLOCKED

Worker gặp luật mâu thuẫn/thiếu hoặc test bắt buộc trái luật → kết thúc bằng `BLOCKED: <câu hỏi>`. Script: dừng ngay, **không tăng mức suy luận, không tính trượt**, mã thoát 3, task sang `tasks/blocked/`, câu hỏi đứng đầu report. Lead trả lời (hỏi Curtis nếu là luật nghiệp vụ), sửa mục Luật/Hợp đồng của task, xoá worktree cũ (`git worktree remove ../wt-<ID> && git branch -D agent/<ID>`), đưa lại vào `tasks/queue/`.

## Review theo rủi ro (trước khi merge task loại code)

Gate xanh ≠ đúng. 4 điểm kiểm, **chỉ chặn khi vi phạm xương sống**:
1. Luật nghiệp vụ + số chuẩn đúng không; có luật nào worker tự bịa không.
2. Hợp đồng, phạm vi, hàng rào có bị phá không.
3. Test có kiểm thật không (không pass rỗng).
4. "Quyết định thiết kế" trong `logs/<ID>-<n>.report.md` có hợp lý không (khác cách Lead làm không phải lỗi).

| Rủi ro | Ai review | Merge |
|---|---|---|
| thấp | `factory-review.mjs` (flash#max) | Không cờ → `factory-merge.mjs` **tự merge** (batch làm luôn). Có cờ → Lead đọc cờ + diff |
| vừa | Reviewer máy, rồi Lead đọc cờ + diff | Lead chạy `factory-merge.mjs agent/<ID>` |
| cao | Lead đọc kỹ toàn bộ (cờ máy chỉ để tham khảo) | Lead chạy `factory-merge.mjs agent/<ID>` |

```bash
node scripts/factory-review.mjs tasks/done/<ID>.md            # → logs/<ID>-review.json {verdict: ok|flag|block, flags:[{point,severity,file,detail}]}
node scripts/factory-merge.mjs agent/<ID> [agent/<ID2> ...]   # rebase lên factory → npm run check + npm run e2e → merge --no-ff; 1 dòng/nhánh; không push
```

`factory-merge.mjs` chạy trong worktree tạm, không đụng repo chính; nhánh trượt/xung đột thì bỏ qua, nhánh sau vẫn chạy; cuối cùng fast-forward `factory`. Không loại vì khác phong cách. Góp ý nhỏ ghi `docs/factory-metrics.md`, không chạy lại task.

## Luật đã học

1. Đối chiếu yêu cầu với repo trước khi giao; dùng module có sẵn.
2. Kiểm ca test bắt buộc với luật nghiệp vụ — đặc tả mâu thuẫn là lý do số 1 khiến worker bẻ luật.
3. Task test-only phải chạy trên code cũ và thấy trượt rồi mới merge.
4. Đồng bộ/offline/nhiều máy: đặc tả ghi rõ lúc gửi bù, lúc máy khác nhận; e2e 2 browser context + `setOffline`.
5. Migration, kiến trúc, dữ liệu/đồng bộ/auth: Lead làm hoặc ghi hợp đồng rất rõ; migration theo D-026: chỉ thêm + staging đạt → Lead tự chạy production, có rollback; xoá/sửa dữ liệu hàng loạt hoặc đổi cấu trúc lớn → Curtis duyệt, sau backup.
6. UI/UX: Lead mô tả mục tiêu + ràng buộc (Design System, nhãn, 360px + desktop, sáng/tối); bố cục lớn thì Curtis duyệt trước. Chi tiết giao diện để worker tự làm.
7. Test chập chờn ở file worker không đụng → chạy lại 1 lần (script đã làm).
8. Danh sách nghiệm thu cho Curtis ghi rõ dữ liệu nhập; số kỳ vọng do Lead chạy ra từ đúng dữ liệu đó.
9. Không push/merge `main` khi Curtis chưa duyệt.
10. Tính năng có số tiền: hiện rõ khi máy tự giới hạn đầu vào.
11. Không bịa task để lấp hàng đợi.
12. (Repo này) Chữ hiển thị nằm ở `src/domain`/`src/config` thì đặc tả phải nói rõ — worker có thể che bằng regex ở UI (M1-03).

## Chạy qua đêm

```bash
node scripts/factory-batch.mjs --dry-run --worker haiku --fallback luna   # kiểm task + đăng nhập, chưa tốn hạn mức
nohup caffeinate -dimsu node scripts/factory-batch.mjs --worker haiku --fallback luna > logs/overnight-$(date +%F).log 2>&1 &
cat "$(ls -t reports/overnight-*.md | head -1)"                 # xem tiến độ / kết quả
node --test scripts/                                            # test của chính script Factory
```

Không push. Task ĐẠT → review tự động; rủi ro thấp + không cờ → tự merge vào `factory` (`--no-merge` để tắt). Task xong → `tasks/done/`, `tasks/blocked/` hoặc `tasks/failed/`. Report có cột Rủi ro · Worker · Reviewer · Suy luận · Chi phí API · Token · Phút worker · Review · Auto-merge, và mục cờ review cho từng task.

- **Chọn worker mỗi đợt:** `--worker <deepseek|haiku|luna>` + `--fallback <mã>`. Không truyền → dòng `Worker: …` / `Dự phòng: …` ở đầu task → mặc định deepseek. `factory-run.mjs` nhận cùng cờ.
- **Kiểm đăng nhập trước khi chạy** (mọi worker + dự phòng; lệnh trạng thái, không tốn hạn mức): `opencode auth list` (có DeepSeek) · `claude auth status` (`loggedIn: true`) · `codex login status` (exit 0, "Logged in"). Thiếu → batch dừng, in lệnh: `opencode auth login` · `claude auth login` · `codex login`.
- **Hết hạn mức / hết tiền:** không tính trượt. Có dự phòng → chuyển sang dự phòng, chạy lại kế hoạch 3 lần của nó trên cùng worktree. Không còn dự phòng → `factory-run` mã 4, batch **TẠM DỪNG**: task để lại `tasks/queue/`, worktree dở bị xoá (log giữ), các task sau không chạy. Nạp tiền / chờ hạn mức rồi chạy lại đúng lệnh.
- **Trần `--max-cost`** chỉ tính tiền API (deepseek worker + reviewer). haiku/luna chạy bằng gói → report ghi token + phút; haiku còn ghi "giá gói" (giá niêm yết tương đương, không bị tính tiền). Giờ thấp điểm DeepSeek (giá 1/2): ngoài 01–04h và 06–10h UTC thứ Hai–Sáu — batch qua đêm giờ Việt Nam nằm trong giờ thấp điểm.

## Buổi sáng

1. Đọc report. Cột Auto-merge ✓ → đã vào `factory`. ĐẠT chưa merge (rủi ro vừa/cao hoặc có cờ) → đọc cờ + diff → `factory-merge.mjs`. BLOCKED → gom câu hỏi. TRƯỢT → phân loại lỗi đặc tả / lỗi worker / test chập chờn; sửa mục tiêu hoặc hàng rào (không thêm chỉ dẫn cách code), xếp lại.
2. Gửi Curtis: bảng task (đạt/trượt/BLOCKED/chi phí), tiến độ milestone, câu hỏi cần quyết, lệnh push `factory`, link preview, danh sách nghiệm thu ngắn.
3. Ghi `docs/factory-metrics.md`.

## Điều kiện dừng Factory (báo Curtis ngay)

- Worker sửa ngoài phạm vi, phá hợp đồng hoặc bẻ luật nghiệp vụ mà lọt qua Lead review.
- Trung vị nghiệm thu > 20 phút/task.
- Lead phải loại > 2 lần chạy trên 5 task liên tiếp.

## Sự thật kỹ thuật (OpenCode 2.x, đã kiểm chứng)

- Không có `--dir`: chạy trong worktree **và đặt `PWD` = worktree** (script đã làm).
- Chốt chặn: `git status --porcelain` repo chính trước/sau mỗi lần thử, khác thì dừng.
- `opencode run --standalone --format json --auto --model <provider/model#variant>`; chi phí = cộng `cost` ở `step_finish`; câu trả lời cuối = phần `text` cuối.
- **Mức suy luận (reasoning effort) = variant trong `--model`** (`opencode run --help`: "Model to use in the format provider/model#variant"). Không có cờ `--variant`/`--reasoning-effort` riêng; không cần sửa `opencode.json`.
  - `deepseek/deepseek-flash` có variant `high` và `max` (OpenCode 2.0.29 gửi `thinking: enabled` + `reasoning_effort` cho DeepSeek; thiếu variant = mặc định của provider).
  - Kiểm thật 2026-10-22 (1 câu hỏi nhỏ mỗi mức): `#high` và `#max` đều chạy, phiên lưu đúng `"variant":"high"` / `"variant":"max"` (bảng `session_message` trong `~/.local/share/opencode/opencode.db`), có phần suy luận `reasoning_content`; `#bogus` → `VariantUnavailableError: Variant unavailable for deepseek/deepseek-flash: bogus`, exit 1 (sai tên variant không bị bỏ qua ngầm).
  - Lệnh trả lời 1 bước có thể không in `step_finish` trong `--format json` → chi phí = 0 trong log; chi phí thật vẫn ghi trong DB.
- Model deepseek: **chỉ `deepseek/deepseek-flash`** (không v4-pro). Worker: lần 1–2 `#high`, lần 3 `#max`; task "Khó: có" → `#max` cả 3 lần. Reviewer (khi worker là haiku/luna): `#max`. Ghi đè: `FACTORY_MODEL`, `FACTORY_MODELS`, `FACTORY_REVIEW_MODEL`; model haiku/luna: `FACTORY_HAIKU_MODEL`, `FACTORY_LUNA_MODEL`. DeepSeek có thể đổi model ngầm sau cùng tên: theo dõi tỉ lệ đạt trong metrics.

## Worker pool — sự thật kỹ thuật (kiểm trên máy Curtis 2026-10-22)

Phiên bản: claude 2.1.308 · codex-cli 0.162.1 · opencode 2.0.29. Mỗi mục dưới đây đã chạy thật trong một repo nháp (không đoán).

| | haiku | luna |
|---|---|---|
| Lệnh | `claude -p --model claude-haiku-5-5 --effort <mức> --permission-mode dontAsk --tools Bash,Read,Edit,Write,Glob,Grep --settings <file> --setting-sources project --strict-mcp-config --no-session-persistence --output-format stream-json --verbose "<prompt>"` (cwd = worktree, stdin rỗng) | `codex exec --ignore-user-config -m gpt-6-luna -c model_reasoning_effort="<mức>" -c approval_policy="never" -c web_search="disabled" -s workspace-write --ephemeral --json -C <worktree> -o <file> "<prompt>"` (stdin phải rỗng, nếu không codex chờ đọc stdin) |
| Mức suy luận | `--effort low\|medium\|high\|xhigh\|max`. Worker high → high → max | `-c model_reasoning_effort=…`; `high`, `xhigh` chạy được (`max` cũng không báo lỗi). Worker high → high → xhigh |
| Sửa không hỏi | `--permission-mode dontAsk`: chỉ chạy tool được `allow`, còn lại tự từ chối (không treo chờ duyệt) | `approval_policy="never"` |
| Giới hạn ghi | Luật `Edit(./**)`/`Write(./**)` + deny chuyển từ `opencode.worker.json` (đã mở phạm vi task). Kiểm: tạo `docs/x.txt` → "denied by your permission settings"; file ngoài thư mục → từ chối. **Bash** không bị luật Edit chặn → bật `sandbox` của Claude Code: ghi ngoài worktree/`$TMPDIR` → "operation not permitted" | Sandbox `workspace-write`: ghi ngoài worktree → "operation not permitted"; `.git` chỉ đọc → `git commit` lỗi `index.lock: Operation not permitted` |
| git commit/push | `Bash(git commit:*)` deny → bị từ chối (kiểm thật) | Không ghi được `.git` (kiểm thật) |
| Mạng / tìm web | `--tools` không có WebSearch/WebFetch + deny; sandbox chặn mạng ngoài (`curl example.com` → 403 sandbox), **cho máy chủ localhost** (`network.allowLocalBinding`) → e2e chạy được | `web_search="disabled"` + `--ignore-user-config` (bỏ MCP cá nhân): không còn tool web. Sandbox mặc định chặn **cả localhost** (`listen EPERM`) → task có e2e/playwright thì script bật `sandbox_workspace_write.network_access=true` (localhost chạy; mạng ngoài cũng mở — chấp nhận, prompt cấm gọi mạng) |
| Không dùng được | `--bare`: chỉ nhận `ANTHROPIC_API_KEY`, **không nhận gói claude.ai** | — |
| Kết quả cuối | dòng `{"type":"result"}`: `result` (chữ), `is_error`, `usage`, `total_cost_usd` (giá niêm yết, gói không tính tiền) | sự kiện `item.completed` loại `agent_message` cuối; token ở `turn.completed.usage` |
| Đăng nhập | `claude auth status` → JSON `loggedIn` | `codex login status` → "Logged in using ChatGPT", exit 0 (chưa đăng nhập: exit ≠ 0) |
| Hết hạn mức | Chuỗi trong bản cài: "You've hit your limit / monthly limit / spend limit…", "usage limit reached", `rate_limit_error` | Mã lỗi trong bản cài: `usage_limit_reached`, `rate_limit_exceeded`, `quota_exceeded`, `usage_not_included`; "usage limit" |

- deepseek hết tiền: DeepSeek API trả 402 "Insufficient Balance" (429 khi giới hạn tốc độ).
- Nhận diện hết hạn mức (`isQuotaError`): chỉ khi lần chạy **thất bại** (exit ≠ 0, `is_error`, hoặc không có câu trả lời) **và** khớp chuỗi trên. Worker làm xong mà báo cáo có chữ "429" không bị tính. HYPOTHESIS: chưa gặp hết hạn mức thật trên máy — chuỗi lấy từ chính bản cài; lần đầu gặp thật thì đối chiếu log và sửa `QUOTA_PATTERNS`.
- Settings của haiku ghi ra `logs/<ID>-<n>.claude-settings.json` (ngoài worktree, không bị tính là file worker sửa). `--setting-sources project` để không nạp hook/plugin/settings cá nhân của Curtis.
- Prompt mọi worker mở đầu bằng `WORKER MODE` + "bỏ qua mục Lead trong CLAUDE.md" (haiku tự đọc CLAUDE.md, luna tự đọc AGENTS.md).

