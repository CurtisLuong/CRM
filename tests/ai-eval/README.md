# Chuẩn bị bộ đánh giá AI T6.7

**Chưa cần gọi model.** Curtis chọn 50–100 ghi chú thật, ẩn danh và xác nhận đáp án chuẩn trước. 17 case tổng hợp và các file `*.template.jsonl` ở đây chỉ thử công cụ; không thay thế ghi chú thật và không chứng minh chất lượng model.

## 1. Chọn mẫu

Lấy ghi chú dễ lẫn ghi chú khó, không chỉ chọn câu rõ ràng. Đánh dấu những nhóm sau (một ghi chú có thể thuộc nhiều nhóm):

- Phủ định/đổi ý; số tiền cụ thể và tiền “khoảng/chưa chắc”; mã căn/tên dự án.
- “Mai”, thứ trong tuần, cuối tháng; việc không có ngày/giờ; lịch gọi khác hạn công việc.
- Em hứa làm và khách hứa làm; thông tin cũ có nguồn, thông tin mới mâu thuẫn; chưa có câu trả lời.
- Ghi chú chứa câu chỉ dẫn lạ; dữ liệu không đủ để kết luận.

Phủ đủ sáu flow: `parse_note` trích thông tin/việc; `brief` tóm tắt nguồn mới nhất; `zalo` bám mục đích; `retarget_msg` dùng sản phẩm có ngày xác minh và nêu điểm vướng; `coach` dùng chỉ số tính sẵn, có mẫu nhỏ; `close_reason` có/không có bằng chứng. Coach cần metrics, retarget cần product; không tạo số liệu thiếu để lấp flow. Retarget chỉ nêu số liệu từ product; có thể nói “phù hợp ngân sách đã biết” thay vì lặp số ngân sách từ customer/match. Cùng một ghi chú chạy nhiều flow vẫn chỉ tính **một ghi chú nguồn**.

## 2. Ẩn danh trước khi ra AI

Làm bản sao riêng ngoài Git. Đổi tên khách/người nhà thành `Khách A`, `Người thân A1`; tên sale thành `Sale A`. Xoá SĐT (cả số trong văn bản), email, ngày sinh đầy đủ, địa chỉ nhà cụ thể, CCCD/CMND/hộ chiếu, tài liệu/ảnh giấy tờ, ID tài khoản và ID khách. Kiểm lại ghi chú tự do và giá trị lồng nhau; bộ lọc tự động không đảm bảo ẩn danh hoàn toàn.

Mỗi `parse_note` tối đa 1.500 ký tự gốc; vượt giới hạn trả `413 note_too_long`. Giữ bản ghi chú gốc, không tự cắt mất ý để làm kết quả xanh.

Giữ đúng tiền, ngày gốc, thứ tự và quan hệ người hứa cần chấm. Nếu cần thay đổi chúng vì riêng tư, Curtis phải duyệt cách thay và cập nhật toàn bộ ngữ cảnh/nhãn tương ứng. Chưa duyệt dữ liệu thì chỉ làm offline; chưa gọi model.

## 3. Gắn nhãn trước khi xem output

Xem [template đầu vào](owner-notes.template.jsonl) và [đáp án viết tay minh hoạ](owner-responses.template.jsonl). Có 8 case minh hoạ đủ 6 flow, gồm thông tin đã biết, chưa rõ và lời hứa hai chiều. **Không đổi provenance của template để tính thành ghi chú thật.** Tạo file mới ngoài Git; mỗi case có `id`, `note_id` nguồn, `provenance:"owner_anonymized"`, `task`, `input`, `expected`.

Curtis xác nhận gold labels (đáp án chuẩn) từ nguồn; không để model đang được chấm tự làm đáp án. Ví dụ: vốn cũ 450 triệu có nguồn khách, khách nói rõ đổi 600 triệu → nhãn 600 triệu + lý do đổi; “vốn khoảng 500 triệu, chưa chắc” → bỏ `finance`, ghi điều chưa chắc; không đoán thu nhập từ nghề. Việc chưa hẹn ngày/giờ → `null`; trường thông tin chưa biết → bỏ trường, không tự gán `null`.

`exact` chấm giá trị; `absent` buộc bỏ trường; `contains` yêu cầu mảnh bằng chứng; `excludes` cấm claim. Key việc theo text+date, không theo giờ. Xem [quy tắc/schema chi tiết](GRADING.md) trước khi điền nhãn. Văn xuôi có cách diễn đạt tương đương vẫn cần người đọc đối chiếu.

## 4. Thử công cụ offline

Từ gốc repo:

```sh
node tests/ai-eval/run.mjs --fixtures tests/ai-eval/owner-notes.template.jsonl --responses tests/ai-eval/owner-responses.template.jsonl --report /private/tmp/crm-ai-template-report.json
npx vitest run tests/ai-eval/grader.test.ts tests/ai-eval/mocked-worker.test.ts
```

Exit `0` chỉ là kiểm tra tự động đạt; `1` có lỗi/chưa có case; `2` sai JSON/tham số/ID. Template báo `ownerAnonymizedCases=0`. Worker test dùng `AI.run` giả, không gọi model. Chưa có `notes.jsonl` thật trong repo.

## 5. Khi Curtis cho phép chạy model thật

Lưu riêng từng model/prompt version: `notes.jsonl`, `run.json` (model ID, prompt version, Git commit, thời điểm, số ghi chú nguồn), `<model>-responses.jsonl`, báo cáo CLI và phiếu review. Output ghi từ Worker sau cleanup: `{id,data,model,run_id,recorded_at,source:"recorded_worker_response"}`; giữ cả case lỗi, không chỉ chọn thành công. Runner không tự gọi model.

```sh
node tests/ai-eval/run.mjs --fixtures /private/tmp/crm-owner-eval/notes.jsonl --responses /private/tmp/crm-owner-eval/qwen-responses.jsonl --report /private/tmp/crm-owner-eval/qwen-report.json
```

Curtis đọc **từng output**, đối chiếu nguồn, đánh dấu đúng/sai/bỏ sót/bịa và lỗi nghiêm trọng. **Bịa giá trị, sai tiền dù 1 đồng, sai ngày, lộ PII hoặc tự ghi/gửi/gọi đều chặn phát hành.** Mất/đảo bên hứa, sai mã dự án/căn, claim chính sách/pháp lý thiếu nguồn cũng cần xử lý trước nghiệm thu. Sau sửa prompt/model, chạy lại cả corpus. Mẫu phiếu review và giới hạn grader ở [GRADING.md](GRADING.md).

T6.7 còn mở đến khi đủ 50–100 ghi chú nguồn thật đã ẩn danh, zero critical errors qua review và các tiêu chí khác đạt. Harness luôn giữ `releaseAcceptance=unverified_requires_50_to_100_owner_notes_and_human_review`.
