# Nghiên cứu đối thủ — UI/UX — 2026-10-18 (Luồng B · B2)

> Mục tiêu: xem đối thủ giải quyết thế nào đúng 4 điểm Curtis không thích (`docs/v3/feedback.md` F1–F4): Hôm nay rối · Hồ sơ dài/mã lạ · Danh sách khách · trang Công việc/Hiệu quả dài.
> Nhãn: **FACT** kèm link · **HYPOTHESIS** = suy luận của Lead. Không chép thương hiệu, giao diện, nội dung của đối thủ — chỉ học cách giải quyết.
> Nền: `docs/CRM bất động sản 2026.md` đã phân tích HubSpot, Lofty, Salesforce, Zoho, Pipedrive (không lặp lại).

## 1. Từng sản phẩm

| Sản phẩm | Điều đáng học (FACT + nguồn) | Điểm yếu người dùng phàn nàn |
|---|---|---|
| **Follow Up Boss** (CRM BĐS, Mỹ) | Smart List = danh sách lưu sẵn theo bậc; mở list → làm từ người đầu → ghi chú → mũi tên sang người kế ([FUB](https://FollowUpBoss.com/features/smart-list)). App mobile 2025 đưa tin nhắn gần nhất lên đầu hồ sơ ([FUB updates](https://updates.followupboss.com/en/new-iphone-and-android-app-updates-better-communication-on-mobile)). Lọc dòng thời gian theo loại ([FUB blog](https://www.followupboss.com/blog/september-2018-product-update)) | App mobile hay treo, mất kết nối không tự nối lại, thiếu tính năng trên mobile ([justuseapp](https://justuseapp.com/en/app/966131499/follow-up-boss/reviews) — tổng hợp bên thứ ba) |
| **Follow Up Ace** (app phụ trên FUB) | Hàng đợi xếp hạng "làm ai tiếp", mỗi người có sẵn tin nhắn nháp, nhắn 1 chạm ([followupace](https://followupace.com/app/) — quảng cáo) | — |
| **Lofty** (CRM BĐS, Mỹ) | Hồ sơ mobile: 3 nút icon Gọi/Nhắn/Email ngay dưới thông tin cơ bản; tab Tổng quan = tóm tắt AI + dòng thời gian ([Lofty help](https://help.lofty.com/hc/en-us/articles/53175318803483-Navigating-the-Lead-Profile-Lofty-AOS)). Dashboard chỉ hiện **số** cơ hội hôm nay, bấm vào mở danh sách đã lọc ([Lofty help](https://help.lofty.com/hc/en-us/articles/115003018292)). Việc loại "Gọi" tự vào Smart Call List ([Lofty help](https://help.lofty.com/hc/en-us/articles/53175356771355-Managing-Tasks-Lofty-AOS)) | — (không tìm thấy nguồn độc lập) |
| **Close** (CRM bán hàng qua điện thoại) | Power Dialer: gọi xong tự xếp cuộc kế, tạm dừng để ghi rồi tiếp tục đúng chỗ, không nghe máy thì tự đi tiếp ([Close](https://close.com/calling)). Gợi ý **mỗi hành động hằng ngày = 1 danh sách** (khách mới chưa gọi, chưa liên lạc được…) và làm lần lượt như to-do ([Close help](https://help.close.com/docs/creating-smart-views-for-calling)) | — |
| **Superhuman** (email) | Phân loại mỗi mục: **hôm nay / ngày khác / xong**; mọi thao tác có phím tắt, ⌘K tìm lệnh ([Superhuman blog](https://blog.superhuman.com/inbox-zero-in-7-steps/)) | Mục quan trọng bị chìm ở tab phụ ([AWS reviews](https://aws.amazon.com/marketplace/reviews/reviews-list/prodview-r7e62ikdwulig?page=20)) → bài học: đừng chia quá nhiều tab |
| **Todoist** (việc cá nhân) | Dời việc bằng kéo-thả giữa các ngày; "Sắp tới" là tuần, vuốt sang tuần sau ([Todoist](https://www.todoist.com/zh-CN/inspiration/todoist-upcoming-view)) | Mục "Quá hạn" thu gọn nhìn như rỗng ([blog](https://blog.vghaisas.com/til-todoist-overdue/)) |
| **Bitrix24** (phổ biến ở VN) | Kanban theo giai đoạn được khen rõ ràng ([OMR](https://omr.com/de/reviews/product/bitrix24/all)) | Giao diện rối, học lâu ([softwarefinder](https://softwarefinder.com/crm/bitrix24/reviews?page=19)); app mobile crash, chậm ([mwm.ai](https://mwm.ai/apps/bitrix24/561683423)) |
| **Meey CRM** (BĐS VN, miễn phí) | Lưu nhu cầu từng khách, **so khớp nhu cầu ↔ quỹ căn**, gợi ý từ danh bạ, nhắc lịch hẹn ([Toà án](https://tapchitoaan.vn/ra-mat-ung-dung-quan-ly-khach-hang-va-nguon-hang-danh-rieng-cho-nha-moi-gioi-bat-dong-san-meey-crm)) — thông cáo 2021 | Không có nguồn độc lập |
| **Getfly CRM**, **CRMViet** | Nguồn chỉ là bài quảng bá chung (pipeline, nhắc việc, SMS/email tự động) ([MISA](https://amis.misa.vn/231489/getfly-crm/), [MISA](https://amis.misa.vn/232737/crmviet/)). Không thấy module riêng BĐS | Không tìm thấy đánh giá UX độc lập |

**FACT về giới hạn:** nguồn cho sản phẩm Việt Nam chỉ là thông cáo/quảng bá; muốn so UX thật cần dùng thử (Getfly, Meey có bản miễn phí). HYPOTHESIS: các CRM Việt Nam là CRM đa ngành, nặng biểu mẫu — Sổ Khách nên học từ CRM gọi điện (Close, FUB) hơn.

## 2. Bảng đề xuất (tối đa 10) — Curtis chọn

Lọc theo việc thật của Curtis: gọi ~10–30 khách/ngày trên điện thoại, ghi kết quả, hẹn lại (HYPOTHESIS về số lượng, cần xác nhận).

| # | Ý tưởng | Học từ | Sửa điểm | Giá trị cho việc thật | Công sức | Rủi ro |
|---|---|---|---|---|---|---|
| I1 | **Hôm nay = 1 dòng/khách**: tên · lý do ngắn · giờ hạn · **1 nút chính** theo ngữ cảnh (thường là Gọi); thao tác khác vào vuốt/menu "…". Bỏ nhãn P0 ở mọi dòng | Lofty, Follow Up Ace | F1 | Thấy 8–10 khách/màn thay vì 3; ít bấm nhầm | M | Thấp (chỉ trình bày) |
| I2 | **Hàng đợi theo hành động**: "Khách mới chưa gọi" · "Gọi lại (chưa liên lạc được)" · "Hẹn hôm nay" · "Lời hứa đến hạn" — mỗi nhóm có số, thay 4 tab Ưu tiên/Khách mới/Lời hứa/Cơ hội | Close | F1 | Biết ngay việc nào trước, làm hết nhóm này sang nhóm khác | M | Vừa: phải đọc đúng `src/domain/signals` (không đổi luật) |
| I3 | **Phiên gọi lên đầu**: nút lớn "Gọi lần lượt N khách"; ghi kết quả xong tự sang khách kế, có Tạm dừng | Close Power Dialer, FUB | F1 | Gọi liền mạch, không quay về danh sách sau mỗi cuộc | S–M | Thấp (Phiên gọi đã có, chỉ đổi vị trí + tự chuyển) |
| I4 | **Mỗi việc 3 lối: Làm · Dời · Xong** (vuốt phải = Xong, vuốt trái = Dời) trên Hôm nay + Công việc | Superhuman, Todoist | F1, F4 | Dọn quá hạn nhanh; 1 chạm | M | Vừa: cử chỉ vuốt cần thử trên máy thật |
| I5 | **Hồ sơ mới**: đầu = tên + 4 nút Gọi/Zalo/Ghi chú/Hẹn (cố định, thẳng cột) · "Việc tiếp theo" · **tương tác gần nhất**; Brief chỉ hiện ô **đã biết** + 1 dòng "Còn thiếu: tài chính, người quyết định" bấm để hỏi | Lofty, FUB mobile | F2 | Mở hồ sơ là thấy cần làm gì và lần trước nói gì, không cuộn | M | Thấp |
| I6 | **Không bao giờ hiện mã**: kết quả gọi, nguồn, ngày giờ đều qua nhãn tiếng Việt từ `src/config`; ẩn trường trống trong "Thông tin thêm" | — (lỗi của mình) | F2 | Đọc hiểu ngay | S | Thấp |
| I7 | **Lọc dòng thời gian** theo loại (Cuộc gọi · Ghi chú · Bậc · Zalo) | FUB | F2 | Tìm lại khách nói gì nhanh | S | Thấp |
| I8 | **Danh sách khách = tệp lưu sẵn dạng chip 1 chạm** + ô tìm; bộ lọc chi tiết vào sheet "Lọc"; danh sách khách lên màn đầu | FUB Smart List, Close Smart View | F3 | Mở là thấy khách, đổi tệp 1 chạm | M | Thấp (tệp đã lưu đã có — T3.3) |
| I9 | **Hiệu quả = 4 con số + xu hướng**, mỗi số bấm được → danh sách khách tương ứng; chi tiết vào trang con | Lofty dashboard | F4 | Nhìn 5 giây biết tuần này tốt/xấu ở đâu | M | Thấp |
| I10 | **Không trắng màn**: lỗi một khối chỉ ẩn khối đó + báo nhẹ; mọi màn chịu được dữ liệu lạ | Bài học từ FUB/Bitrix24 (app mobile hay treo) | U13 | Dùng được kể cả khi dữ liệu cũ có trường lạ | S | Thấp |

Không đề xuất (SKIP): gọi dự đoán nhiều số cùng lúc (Close Predictive — không hợp sale 1 người), AI tự soạn & gửi tin (trái luật AI chỉ đề xuất), Kanban kéo-thả đổi bậc (đổi bậc có SLA/tự chuyển D-008, kéo nhầm rủi ro).
