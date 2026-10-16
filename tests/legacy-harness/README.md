# Golden test logic v1 (T0.4)

Chạy code v1 **thật** (`js/*.js`, không sửa) trong `node:vm` trên dữ liệu **tổng hợp**, ghi đầu ra vào `tests/golden/*.json`. Khi port sang v2 (T2.B1–B5, T3.13…), test Vitest của v2 đọc cùng fixture và so với các file golden này.

```bash
node tests/legacy-harness/run.js            # chạy mọi ca, ghi golden, in ca nào đổi (= / + / ~)
node tests/legacy-harness/run.js --check    # chỉ so sánh; exit 1 nếu khác golden đã lưu
node tests/legacy-harness/run.js search     # chỉ chạy ca có tên chứa "search"
```

Yêu cầu: Node ≥ 20 (đã chạy với Node 24). Không cần `npm install`, không mạng, không trình duyệt.

## Thành phần

| File | Vai trò |
|---|---|
| `tests/fixtures/legacy-customers.json` | 20 khách bịa phủ các biến thể dữ liệu cũ (mỗi khách có `_case` mô tả) + giỏ hàng nhỏ. `now` = đồng hồ giả. |
| `load-v1.js` | Nạp script v1 theo thứ tự `index.html` vào vm: đồng hồ giả (`setNow`), múi giờ `Asia/Ho_Chi_Minh`, DOM giả "nuốt mọi thứ", `localStorage` trong bộ nhớ, không mạng. |
| `cases.js` | Danh sách ca golden. Mỗi ca nhận context v1 **mới** và trả về 1 object. |
| `run.js` | Chạy ca, chuẩn hoá JSON (khoá sắp xếp, `Date` → ISO, `NaN` giữ là chuỗi `"NaN"` để khác `null`), ghi / so sánh. |

## Các ca hiện có

| Ca | Kiểm tra |
|---|---|
| `deadlines` | `countdownTag`, `taskDueInfo`, `callReminder` (D-010) ở 10:00 và 23:50 |
| `followup` | `FOLLOWUP.firstCall/afterCall/forStage/suggestTemplates`, chuỗi 1–7 cuộc hỏng cho khách mới/tiềm năng |
| `velocity` | `VELOCITY.phaseOf/status/autoAction/bookingSteps/stageEnteredAt` trên dữ liệu **thô** (bậc cũ chưa đổi), `newLeadStart` theo giờ |
| `sla-automation` | `runSlaAutomation`: payload gửi `CRM.update`, chỉ khách mình phụ trách, chạy lại lần 2 không làm gì |
| `dashboard` | `dashActionGroups`, `NOTIF.compute`, số liệu trong `relationshipHealthHtml` / `analyticsInsightsHtml` |
| `search` | `CRMSearch.compile/match` trên `customerSearchDoc` của app.js (34 truy vấn, nhiều phạm vi) |
| `property-match` | `CRMPropertySearch.typeCompatible/price/match`, `apartmentGroup` |
| `lunar` | `LunarUtil` (gồm dob thiếu năm `--MM-DD`, ngày không hợp lệ) |
| `phone` | `normalizePhone`, `normalizePhoneVN`, `phoneDigits`, `CRMSearch.phone` |
| `preservation` | Ghi lại `next_tasks` / `notes_manual` / `care_stage_history` / `call_attempts` bằng `CRM.*` và `CRMCalls.ingest` **không làm rơi thuộc tính lạ** `x_*` (assert — ca lỗi nếu mất) |

Hành vi v1 đã biết (ghi trong `golden/preservation.json` → `knownV1Behavior`): khi ghi lại `call_attempts` qua nhật ký máy (`ingest`), phần tử `null` hoặc thiếu `at` bị bỏ (do `callAttemptsOf()` lọc). Thuộc tính lạ của phần tử hợp lệ vẫn giữ. v2 không được làm tệ hơn.

## Thêm ca mới

1. **Dữ liệu:** thêm khách vào `customers` trong fixture — id dạng `f0000000-0000-4000-8000-0000000000NN`, có `_case` mô tả, **không dùng dữ liệu thật** (tên/SĐT bịa, SĐT `09000000NN`). Thuộc tính "lạ" đặt tên `x_…`.
2. **Logic mới cần chốt đầu ra:** thêm 1 khối `add('tên', 'mô tả', (h, fx) => {...})` trong `cases.js`. Dùng `h.ctx.<hàm v1>` (hàm khai báo top-level) hoặc `h.run('<biểu thức>')` (cho `const`/`let` top-level như `allCustomers`). `setupCustomers(h, fx)` nạp khách như `refreshList` (đổi bậc cũ trong bộ nhớ); `h.setNow(iso)` đổi đồng hồ.
3. Chạy `node tests/legacy-harness/run.js` → xem diff golden bằng `git diff tests/golden` → chắc chắn thay đổi là **đúng ý** (thêm khách vào fixture làm đổi golden của nhiều ca — bình thường) → chạy lại `--check` phải ra `0 khác`.
4. Commit fixture + `cases.js` + golden cùng nhau.

Golden đổi mà **không** sửa fixture/ca = v1 đã đổi hành vi (hoặc Node đổi dữ liệu ICU cho chữ ngày giờ tiếng Việt). Đọc diff trước khi chấp nhận.

## Giới hạn

- Chỉ chạy logic; không vẽ giao diện (DOM giả trả chuỗi rỗng). Ca nào đọc HTML chỉ lấy **chữ/số** trong các class cụ thể.
- `IndexedDB`, hàng đợi, Supabase được thay bằng bản giả trong ca `preservation`; tương thích DB/queue thật kiểm ở T2.A2.
