# T6.7 — đánh giá AI offline

Bộ này kiểm tra **harness chấm điểm và các ràng buộc đã gắn nhãn**, chưa chứng minh chất lượng model. Có 17 tình huống **tổng hợp**, phủ sáu flow `brief`, `zalo`, `parse_note`, `retarget_msg`, `coach`, `close_reason`. `example-responses.jsonl` là đáp án **viết tay để thử grader**, không phải kết quả model. Không có ghi chú thật trong repo; cố ý không tạo `notes.jsonl` giả để lấp tiêu chí nghiệm thu 50–100 ghi chú thật.

## Chạy hoàn toàn offline

Từ thư mục gốc repo, dùng Node có sẵn, không cần cài thêm package:

```sh
node tests/ai-eval/run.mjs --responses tests/ai-eval/example-responses.jsonl --report /private/tmp/crm-ai-eval-example-report.json
npx vitest run tests/ai-eval/grader.test.ts tests/ai-eval/mocked-worker.test.ts
```

Runner chỉ đọc JSONL và chấm output đã ghi lại; không gọi Worker, model, mạng, DB, gửi tin hoặc ghi khách. `--report` chỉ ghi file báo cáo cục bộ do người chạy chỉ định. Exit `0` = các ràng buộc tự động đều đạt; `1` = có lỗi hoặc không có case; `2` = lỗi tham số/JSON/ID. Exit `0` không có nghĩa được phát hành prompt.

Test grader cố ý đưa output sai: lệch **1 đồng**, giá đã bị phủ định, ngày lệch/ngày không tồn tại, gán giờ hẹn cho việc khác, mất/đảo bên hứa, key thiếu/trùng/sai, enum ngoài danh mục, suy diễn giá trị chưa rõ, tuân theo prompt injection, thêm ưu đãi/số liệu, che điểm vướng, mất nguồn, lý do thiếu bằng chứng, lộ PII và hành động tự động.

## Định dạng và cách chấm

Mỗi dòng fixture là một JSON object:

```json
{"id":"owner-note-001","provenance":"owner_anonymized","task":"parse_note","input":{"customer":{},"extra":{"today":"2026-10-17","note":"Em hứa mai gửi bảng giá."}},"expected":{"exact":{"cap_nhat":{},"viec.0.ben":"em","viec.0.date":"2026-10-18","viec.length":1},"absent":["cap_nhat.finance"]},"human_checks":["Đúng từng ý ghi chú; không bịa việc."]}
```

Đây chỉ là ví dụ định dạng, **không phải dữ liệu thật**. Fixture thực tế cần đủ options, ngày gốc, nhãn và expected key/date theo contract; xem các dòng đã điền trong `synthetic-notes.jsonl`.

Mỗi dòng response: `{"id":"owner-note-001","data":{...}}`, với `data` là object **đã được Worker làm sạch**, lấy từ `POST /ai` response `{data, model}`. Không đưa chuỗi raw model vào `data`. Có thể thêm metadata như model, prompt version, ngày chạy; runner không dùng chúng để tính điểm.

Các nhãn:

- `exact`: so sánh đệ quy từng giá trị tại đường dẫn, ví dụ `cap_nhat.finance`, `viec.0.date`, `goi_y.length`. Object/array có nhãn này không được thêm trường/phần tử lạ. Tiền phải đúng số nguyên VND; ngày phải đúng tuyệt đối. Key có nhãn cố định `ai-xxxxxxxx` theo FNV-1a của text chuẩn hóa + ngày.
- `absent`: trường phải được bỏ hẳn; `null` vẫn là có trường. Phân biệt chưa biết giá trị với trường hợp thời điểm thực sự chưa được nêu, khi đó task `date`/`time` phải là `null` theo `exact`.
- `contains`: các mảnh bằng chứng bắt buộc, bỏ phân biệt hoa/thường và gộp khoảng trắng. Dùng cho nguồn, sự thay đổi, điểm còn vướng, cảnh báo mẫu nhỏ. Đây là kiểm tra mảnh văn bản, không phải chấm ngữ nghĩa.
- `excludes`: các mệnh đề/số liệu không có căn cứ đã gắn nhãn; nếu xuất hiện là lỗi nghiêm trọng.

Báo cáo có `fieldChecks`/`counts`: `correct` (đúng nhãn), `wrong` (sai), `omitted` (bỏ sót), `fabricated` (bịa/thêm ngoài nhãn), cùng `privacy` và `side_effect`. Một trường có thể trượt nhiều ràng buộc; các count là **số kiểm tra nhãn/schema**, không phải precision/recall hay tỷ lệ chính xác của model. Lệch nhãn exact, bịa, PII và side effect đều chặn kết quả tự động. Mất anchor văn bản vẫn làm `automatedConstraintsPassed=false`, nhưng người duyệt phải xác định mức nghiêm trọng.

Grader kiểm schema output (kể cả trường lạ lồng nhau và narrative bắt buộc không rỗng), enum/kind/slot supplied, vai trò lời hứa, checksum key theo text+date và không trùng key+ben, ngày/giờ hợp lệ, mã lý do được phép và bằng chứng không rỗng. Cùng text+date nhưng khác bên hứa được giữ thành hai việc. Nó phát hiện một số dạng SĐT di động/cố định Việt Nam (0, +84, 84, 0084), email/CCCD trong **text**; dùng biên chữ số để không bắt một phần của số tiền dài, không coi tiền dạng number là SĐT. Các ví dụ tiền 1000000000, 1.000.000.000đ, 1 000 000 000VND, 2800000000 và 8400000000 phải được giữ. Không thể phát hiện mọi tên riêng, địa chỉ, suy luận tài chính, PII hoặc cách diễn đạt bịa khác; **luôn cần người duyệt đọc đối chiếu**. Grader không xác minh nội dung được trích thật sự có nguồn chỉ bằng một anchor trùng chữ.

`mocked-worker.test.ts` đưa 17 đáp án viết tay qua Worker với `AI.run` giả, dùng mã ngày thô viết tay rồi chấm output đã làm sạch bằng grader. Test chặn `fetch`; không gọi model/mạng/DB. Nó chứng minh tính tương thích cleanup/transport trên fixture tổng hợp, **không chứng minh model trích xuất đúng, chống prompt injection thật hay chất lượng tiếng Việt**.

Có thể kèm trace thu từ **test cục bộ đã instrument**:

```json
{"id":"owner-note-001","data":{},"trace":{"aiRequest":{"task":"parse_note","customer":{},"extra":{}},"writes":[],"sends":[],"calls":[]}}
```

`writes`/`sends`/`calls` phải là array rỗng khi chưa duyệt. Trace có action sẽ bị chặn; trace có PII ở `aiRequest` cũng bị chặn. Trace tự điền rỗng không chứng minh client thực tế không ghi/gửi. Khi không có trace, báo `sideEffectEvidence=not_supplied`; khi có, chỉ ghi `supplied_trace_only`. Test client/Worker do làn khác phụ trách mới kiểm hành vi thực thi cụ thể. `example-responses.jsonl` cố ý không tự tạo trace làm bằng chứng.

## Dùng 50–100 ghi chú thật sau này

1. Curtis chọn **50–100 ghi chú thật** có đủ phủ định/đổi ý, tiền, mã căn, dự án, ngày tương đối, câu mơ hồ, lời hứa hai chiều, chèn chỉ dẫn lạ. Ẩn danh **trước** khi đưa vào file: tên, SĐT/email, ngày sinh đầy đủ, địa chỉ, giấy tờ, người thân; dùng mã alias. Giữ cấu trúc ý và quan hệ tiền/ngày cần chấm. Cất corpus ngoài Git, ví dụ thư mục riêng có quyền truy cập phù hợp. Không commit dữ liệu thật vào repo.
2. Ghi nhãn chuẩn độc lập trước khi xem model output; đặt `provenance=owner_anonymized`. Điền ngày gốc/múi giờ, options, giá trị hiện có và nguồn; `expected.exact` phải phủ toàn bộ trường cần trích, kể cả mảng rỗng/null và trường phải bỏ. Gắn nhãn tiền/ngày/task/ben/key thật kỹ. Dùng review bổ sung cho prose tự do và mọi claim về giá/chính sách/pháp lý.
3. Chỉ khi chủ dự án cho phép chạy model: ghi output đã làm sạch cùng model ID, prompt version, thời điểm chạy vào một JSONL khác ngoài Git. Runner này **không thực hiện bước gọi model**. Chạy lại cả hai model được chọn khi cần, giữ file kết quả riêng.
4. Chấm recorded output bằng lệnh bên dưới. Người duyệt đọc **từng output**, phân loại đúng/sai/bỏ sót/bịa, xác nhận nguồn và tiền/ngày. Mọi bịa giá trị hoặc sai tiền/ngày = lỗi nghiêm trọng, không phát hành prompt. Bổ sung nhãn để tái hiện lỗi; không đổi nhãn theo output sai để làm báo cáo xanh.
5. Điều phối viên tổng hợp lỗi tự động + đánh giá người thật, số ghi chú, model/prompt version và bằng chứng an toàn client. T6.7 còn mở đến khi **50–100 ghi chú thật đã ẩn danh, không có lỗi nghiêm trọng** và các tiêu chí khác đạt. Cổng merge quản lý cập nhật tasks/CHANGELOG; agent không tự sửa trạng thái.

```sh
node tests/ai-eval/run.mjs --fixtures /private/tmp/crm-owner-eval/notes.jsonl --responses /private/tmp/crm-owner-eval/qwen-responses.jsonl --report /private/tmp/crm-owner-eval/qwen-report.json
```

Báo cáo luôn giữ `releaseAcceptance=unverified_requires_50_to_100_owner_notes_and_human_review`; nó không tự cấp chứng nhận nghiệm thu dựa trên nhãn provenance hay số case.


## Hồ sơ một lần nghiệm thu của chủ dự án

Giữ các file sau ngoài Git trong cùng thư mục private:

- `notes.jsonl`: 50–100 ghi chú nguồn độc lập đã ẩn danh, mỗi ghi chú có `note_id` ổn định; mỗi flow/case có `id` riêng. Nếu cùng ghi chú được dùng cho nhiều flow, **không cộng thành nhiều ghi chú nguồn** để đạt số lượng.
- `run.json`: `run_id`, thời điểm UTC, timezone `Asia/Ho_Chi_Minh`, model key + full model ID, prompt version + Git commit của Worker/client, số ghi chú nguồn, số case mỗi flow, người ẩn danh và người gắn nhãn. Hai model/phiên bản prompt dùng hai run riêng.
- `<model>-responses.jsonl`: mỗi dòng `{id, data, model, run_id, recorded_at, source:"recorded_worker_response"}` từ response thật sau cleanup. Lưu cả case lỗi `{id, data:null, error_code}` để không chỉ chọn output thành công. Raw model response không cần giữ; không thu prompt/PII ngoài corpus đã duyệt.
- `<model>-report.json`: báo cáo CLI như lệnh trên. Harness không xác thực metadata, số ghi chú nguồn hay provenance; người duyệt đối chiếu `run.json` và output.
- `human-review.jsonl`: mỗi dòng `{id, reviewer, reviewed_at, status:"pass|fail", critical_errors:[], checks:[{path, verdict:"correct|wrong|omitted|fabricated", source_ref, note}]}`. Đây là mẫu cấu trúc để người duyệt điền, runner không tự tạo hay tự chấp thuận.

Người duyệt kiểm từng ý output với ghi chú/ngày nguồn; xác nhận không có suy luận thành dữ kiện, sai tiền **1 đồng**, sai ngày, mất/đảo bên hứa, đổi mã căn/dự án, ưu đãi/pháp lý không có nguồn, lộ PII hoặc claim thiếu căn cứ. Prose tự do có thể diễn đạt khác anchor mà vẫn đúng, hoặc chứa anchor nhưng cả câu sai: ghi quyết định người duyệt và lý do, giữ nguyên báo cáo tự động. Sau khi sửa nhãn hoặc prompt, tạo run mới và chạy lại **toàn bộ corpus**, không chỉ case từng trượt. Chủ dự án xác nhận zero critical errors trên đủ 50–100 ghi chú nguồn; điều phối viên mới đối chiếu các tiêu chí còn lại của T6.7.

Báo cáo tách `ownerAnonymizedCases` (số case) khỏi `ownerDistinctSourceNotes` (số `note_id` khác nhau), `ownerCasesMissingNoteId` và `templateCases`. Đây chỉ là đếm nhãn do người nhập khai báo, không xác thực nguồn thật hoặc tự cấp nghiệm thu.
