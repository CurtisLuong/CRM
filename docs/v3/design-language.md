# Chọn ngôn ngữ thiết kế cho v3 — 2026-10-19 (M0, vòng 2)

> Curtis 2026-10-19: công năng bản mẫu v4 tạm được, **thẩm mĩ chưa ổn**. Tiêu chí (theo thứ tự): (1) dễ đọc, nắm thông tin nhanh · (2) phân cấp thị giác rõ: trong thẻ khách, **Tên + nút hành động** là cấp 1; cấp 2 = lần gọi gần nhất, số lần gọi, ghi chú cuối, SLA; mỗi khách **tách biệt** khỏi khách khác · (3) cảm giác công nghệ, hiện đại, tương lai, tối giản.
> So sánh trực quan: `docs/v3/mockups/huong-thiet-ke.html` (ảnh: `shots/huong-thiet-ke-light.png`, `-dark.png`) — cùng nội dung, chỉ khác ngôn ngữ thiết kế.

## 1. Ứng viên

| Ngôn ngữ | Điểm mạnh (FACT + nguồn) | Điểm yếu với Sổ Khách | Kết luận |
|---|---|---|---|
| **Material 3 Expressive** (Google, 2025) | Google báo cáo 46 nghiên cứu, hơn 18.000 người; người dùng tìm thấy phần tử chính nhanh hơn tới 4 lần (vd. nút to, khác màu, gần ngón tay) — số liệu từ bản concept của Google ([Android Authority](https://www.androidauthority.com/google-material-3-expressive-details-3554486/), [9to5Google](https://9to5google.com/?p=671309)) | Bo tròn nhiều, màu tầng → thân thiện hơn là "công nghệ" | Lấy **cách phân cấp** |
| **Linear / Vercel Geist** | Linear tái thiết kế để giảm nhiễu, tăng phân cấp; chuyển màu sang LCH cho độ sáng đồng đều ([Linear](https://linear.app/now/how-we-redesigned-the-linear-ui)); Geist: Geist Sans + Mono, lưới là nền thẩm mĩ ([Vercel](https://vercel.com/geist)) | Chữ xám mờ trên nền đen có chỗ ~3.6:1, dưới chuẩn 4.5:1 (nguồn thứ ba, [buildmvpfast](https://www.buildmvpfast.com/blog/linear-aesthetic-tokens-density-keyboard-first-ux-2026)); nút nhỏ, hợp chuột hơn ngón tay | Lấy **vẻ ngoài** |
| **IBM Carbon** (+ kiểu chữ Thuỵ Sĩ) | Bộ chữ "productive" cho người tập trung làm việc, ưu tiên dày thông tin, đo bằng thời gian hoàn thành việc ([Carbon](https://carbondesignsystem.com/elements/typography/type-sets/)) | Nghiêm, ít cảm giác tương lai | Lấy **cách trình bày số liệu** |
| Apple Liquid Glass (2025) | Hiện đại, "tương lai" | Kính trong làm giảm tương phản; có nơi đo được 1.5:1 so với chuẩn 4.5:1 ([Infinum](https://infinum.com/blog/apples-ios-26-liquid-glass-sleek-shiny-and-questionably-accessible/)) | **Loại** — trái tiêu chí 1 |
| Glassmorphism / Neumorphism / Neo-brutalism | Bắt mắt | Tương phản thấp hoặc ồn ào; DS v3 đã cấm kính làm nền nội dung | **Loại** |

## 2. Bốn hướng đã dựng (cùng nội dung)

| | A · Swiss Precision | B · Expressive Tonal | C · Dark Console | **D · Precision Tonal (đề xuất)** |
|---|---|---|---|---|
| Gốc | Thuỵ Sĩ + Carbon | Material 3 Expressive | Linear / Geist | B + C (+ số liệu kiểu Carbon) |
| Dễ đọc (1) | ★★★ | ★★★ | ★★ (chữ nhỏ, nhãn mono) | ★★★ |
| Phân cấp (2) | ★★ (nút đen mạnh, tách bằng vạch kẻ) | ★★★ (nút to, chip màu) | ★★ (nút Gọi chìm) | ★★★ (tên to + nút Gọi to có chữ; cấp 2 nằm dưới vạch chia) |
| Tách từng khách | Vạch kẻ đậm | Thẻ bo 26px | Thẻ viền mảnh | Thẻ bo 18px + **vạch màu thời hạn bên trái** |
| Công nghệ / tương lai (3) | ★ | ★ | ★★★ | ★★ |
| Tối giản | ★★★ | ★★ | ★★★ | ★★★ |

**D — Precision Tonal**, quy tắc chính:
1. **Cấp 1** = tên 18/650 + nút Gọi 48px có chữ, màu nhấn (thứ duy nhất có màu nhấn trong thẻ). Thời hạn ngay dưới tên (đỏ = quá hạn).
2. **Cấp 2** = lưới nhãn nhỏ/giá trị (Gọi gần nhất · Đã gọi), giờ dùng chữ đơn cách; dưới một vạch chia mảnh.
3. **Cấp 3** = ghi chú cuối (1 dòng, chữ phụ) + SLA dạng **thanh đoạn** (7 đoạn = 7 ngày mục tiêu) đơn sắc.
4. Mỗi khách là một thẻ; **vạch dọc 3px bên trái** mang màu thời hạn (đỏ/vàng/không màu) để quét nhanh.
5. Nền gần đơn sắc (xám lạnh), một màu nhấn; tối là bản chính ngang hàng với sáng; không kính, không gradient, không phát sáng.
6. Font giữ Be Vietnam Pro + JetBrains Mono (đã cài, hỗ trợ dấu tiếng Việt tốt, không cần thêm thư viện).

## 3. Đánh đổi phải chọn

Thẻ D cao ~250px ở 360px → màn đầu Hôm nay thấy **~3 khách** (bản v4 trước: 6 dòng nhưng ít thông tin). Cách giải đề xuất: **nhóm gấp nhất** (quá giờ hẹn, khách mới chưa gọi) hiện thẻ đầy đủ; các nhóm sau hiện **thẻ gọn** (tên + nút Gọi + 1 dòng cấp 2), chạm để mở rộng. Luật L1 của DS v4 sẽ sửa theo lựa chọn này.
