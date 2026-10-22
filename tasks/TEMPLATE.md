# <ID> — <tên ngắn>
Loại: code | test-only. Rủi ro: thấp | vừa | cao. Khó: có | không. Base: factory. Milestone: <M#>.

<!--
Mẫu task AI Factory (skill ai-factory-lead). Lead vạch XƯƠNG SỐNG + HÀNG RÀO; worker tự quyết cách cài đặt.
- Không viết code mẫu, không chỉ dẫn từng dòng. Thấy mình đang mô tả code → viết lại thành mục tiêu + hợp đồng + hàng rào.
- Hàng rào chung (PHẢI/CẤM, BLOCKED, báo cáo 4 mục) đã ở AGENTS.md — chỉ ghi phần RIÊNG của task.
- Dòng đầu (scripts/factory-run.mjs đọc; thiếu → coi là code, rủi ro vừa, không khó):
  · Rủi ro thấp = chỉ giao diện/chữ/hàm thuần trong 1 màn, không đụng luật nghiệp vụ, dữ liệu/đồng bộ/auth, hợp đồng chung
    → review tự động không cờ thì TỰ MERGE (factory-merge: rebase + check + e2e). Vừa = có luật nghiệp vụ/số chuẩn hoặc
    nhiều màn → Lead đọc diff. Cao = dữ liệu/đồng bộ/auth/migration/kiến trúc → Lead làm hoặc đọc kỹ; không bao giờ tự merge.
  · Khó: có = thuật toán/luật nhiều nhánh, dễ sai tinh vi → worker dùng flash#max từ lần 1 (mặc định high → high → max).
- Loại test-only: CHỈ thêm test cho hành vi CHƯA có; script chạy test mới trên code base và đòi nó TRƯỢT (có ca failed,
  không phải lỗi biên dịch). Lệnh Nghiệm thu của test-only không được chạy test mới đó (vd. `npx tsc -b && npx biome check .`).
  Test giữ hành vi hiện có (phải xanh) → khai Loại: code, phạm vi là thư mục test.
- Phạm vi: glob/thư mục bọc `...` (scripts/factory-run.mjs đọc đúng các mục này).
- Lệnh kiểm tra: code block trong "## Nghiệm thu".
- Các task cùng hàng đợi không phụ thuộc nhau, không chồng phạm vi. Cỡ: một lát tính năng trọn vẹn (thường 1 màn / 1 module).
Xoá khối chú thích này khi chép sang tasks/queue/<ID>.md.
-->

## Mục tiêu

Người dùng thấy / làm được gì khi xong (1–3 câu). Vì sao cần (phản hồi nào của Curtis, luật nào của Design System).

## Bối cảnh

Module/màn hình liên quan, file nên đọc trước (`docs/ARCHITECTURE.md` §0, bản mẫu, test có sẵn). Không chỉ dẫn cách sửa.

## Luật nghiệp vụ (nếu có)

Trích SPEC / quyết định (D-xxx), kèm **ví dụ số chuẩn**. Đây là sự thật, không được diễn giải lại.

## Hợp đồng (không được đổi)

Type/API/schema/hàm public mà phần khác đang dùng. API mới nếu task tạo ra (chỉ chữ ký, không phần thân).

## Phạm vi

Được sửa: `<thư mục hoặc glob>`. Được tạo test mới trong `<thư mục test>`.

## PHẢI

- … (ràng buộc riêng của task, ngoài Hàng rào chung trong AGENTS.md)

## CẤM

- … (riêng của task, ngoài Hàng rào chung)

## Nghiệm thu

- Hành vi phải đúng (đo được).
- Test bắt buộc phải có (chứa đúng số chuẩn nếu có).

```bash
npm run check
<lệnh e2e / test riêng của task>
```

## Tự do

Cách cài đặt, cấu trúc nội bộ, ca test bổ sung, refactor nhỏ trong phạm vi: worker tự quyết.

## Báo cáo cuối của worker

1. Đã làm gì. 2. Quyết định thiết kế đã tự đưa ra + lý do. 3. Điều chưa chắc / đề xuất ngoài phạm vi.
4. Checklist nghiệm thu: mỗi mục ở "## Nghiệm thu" một dòng ✓/✗ + bằng chứng (lệnh + kết quả, hoặc tên test).
Bị chặn bởi luật/test: kết thúc bằng một dòng `BLOCKED: <câu hỏi>`.
