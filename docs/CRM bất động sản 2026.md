# CRM bất động sản 2026

*Thiết kế CRM giải phóng thời gian bán hàng*

**Nghiên cứu làm nền tảng nâng cấp CRM riêng của Curtis — môi giới bất động sản độc lập và đội nhỏ tại Việt Nam. Mốc nghiên cứu: 15/10/2026.**

Một CRM thông minh đáng xây trong năm 2026 phải giúp môi giới trả lời ngay bốn câu: **hôm nay chăm ai, vì sao lúc này, nên nói gì và sau đó hệ thống tự làm gì**. Giá trị lớn nhất nằm ở vòng làm việc khép kín: nhận lead, hiểu nhu cầu, bảo vệ lịch hẹn, chuẩn bị hội thoại, ghi nhận kết quả và tổ chức bước tiếp theo. CRM lâu đời đã làm tốt dữ liệu, quy trình và quyền hạn; CRM bất động sản biến chúng thành danh sách chăm khách; CRM thế hệ mới giảm nhập liệu bằng trí nhớ hội thoại và AI. Nên học cả ba, nhưng thiết kế quanh thực tế Việt Nam: số điện thoại quan trọng, Zalo phổ biến, tồn kho phân tán và nhiều người cùng quyết định mua. Đích đến là sale dành phần lớn sự chú ý cho quan hệ khách hàng, còn CRM gánh việc hành chính có thể kiểm chứng. **Ưu tiên đầu tư là độ tin cậy và hành động hữu ích, sau đó mới đến dự đoán hay agent tự chủ.**

Đi nhanh: [Thị trường và 11 CRM](#thi-truong) · [Năng lực đáng xây](#nang-luc) · [Dữ liệu và trí thông minh](#du-lieu) · [Khả thi tại Việt Nam](#viet-nam) · [Lộ trình và pilot](#lo-trinh)

<a id="thi-truong"></a>

## 1. Thị trường đã chuyển từ lưu hồ sơ sang tổ chức hành động

### Cách đọc nghiên cứu này

Đây là nghiên cứu tài liệu sản phẩm, tài liệu hỗ trợ và nguồn chính thức được kiểm tra tại mốc trên. Mục tiêu là rút ra yêu cầu nâng cấp CRM riêng, không chọn phần mềm để mua. “Có tài liệu” nghĩa là hãng đã mô tả năng lực và điều kiện sử dụng; không có nghĩa tính năng nằm trong mọi gói, phù hợp tiếng Việt hay đã chứng minh tăng doanh thu. Tính năng **beta/preview**, thông điệp quảng bá và đề xuất thiết kế được phân biệt tại nơi xuất hiện. Các trang trực tuyến có thể thay đổi sau ngày nghiên cứu.

Báo cáo **không audit mã nguồn, schema hay trạng thái triển khai CRM hiện tại của Curtis**; không kết luận chức năng nào đang thiếu. Định hướng giao diện gọn, phục vụ sale, tóm tắt trước gọi và nháp Zalo có thể sửa được dùng làm bối cảnh sản phẩm, không phải kết quả kiểm tra hệ thống mới. Chưa thử tài khoản trả phí, chất lượng AI tiếng Việt, điện thoại thật, quyền tích hợp cụ thể hay ROI. Những con số nghiệm thu và pilot phía sau là đề xuất để đo, không phải kết quả đã đạt.

### Mười một sản phẩm cho thấy ba hướng tiến hóa

| Nhóm / sản phẩm | Năng lực đáng học đã được tài liệu hóa | Chuyển thành giá trị cho CRM riêng | Điều cần đọc đúng |
|---|---|---|---|
| **Legacy — Salesforce / Agentforce** | Lead/contact/opportunity, routing, activity capture, flows và Agentforce Engagement cho outreach, follow-up, hỏi đáp, booking. ([Sales pricing](https://www.salesforce.com/sales/pricing/), [Engagement](https://help.salesforce.com/s/articleView?id=sf.sales_agent_sdr_parent.htm&language=en_US&type=5)) | Mỗi cơ hội có chủ sở hữu, lịch sử và bước tiếp theo; agent có quyền, phạm vi và giám sát rõ. | Điều kiện edition/add-on phức tạp; tài liệu help và pricing dùng hệ tên chưa đồng nhất. Có sản phẩm không đồng nghĩa tự chủ hiệu quả ở Việt Nam. |
| **Legacy — Microsoft Dynamics 365 Sales** | Sales accelerator có workspace, danh sách việc, sequence; Copilot hỗ trợ tóm tắt, chuẩn bị gặp, nháp email và ngữ cảnh. ([Sales accelerator](https://learn.microsoft.com/en-us/dynamics365/sales/enable-configure-sales-accelerator), [Sales pricing](https://www.microsoft.com/en-us/dynamics-365/products/sales/pricing)) | Đưa hỗ trợ vào ngay nơi sale làm việc; mở CRM là biết việc nên làm. | Sales Close Agent trên trang giá vẫn ghi **Preview**; calling/Teams/agent có điều kiện cấp phép. |
| **Mainstream — HubSpot / Breeze** | Sequences kết hợp email định thời và follow-up task, có cơ chế thoát khi reply/đặt lịch; dedupe contact mặc định theo email. ([Sequences](https://knowledge.hubspot.com/sequences/create-and-edit-sequences), [Dedupe](https://knowledge.hubspot.com/records/deduplication-of-records)) | Tách lịch chăm sóc khỏi AI soạn lời; luôn thiết kế điều kiện dừng. | Lead nhà đất chỉ có điện thoại cần khóa định danh khác. Prospecting Agent thiên về tìm người/công ty B2B, cần credits/quyền dữ liệu. ([Agent help](https://knowledge.hubspot.com/prospecting/use-the-prospecting-agent)) |
| **Mainstream — Zoho CRM / Zia** | Gợi ý giờ liên hệ từ lịch sử; các loại summary, extraction, scoring và anomaly phân theo edition/điều kiện. ([Best time](https://help.zoho.com/portal/en/kb/crm/zia-artificial-intelligence/communication/best-time-to-contact-customers/articles/using-best-time-to-contact), [Feature list](https://www.zoho.com/crm/complete-feature-list.html)) | Ưu tiên giờ khách muốn, sau đó mới dùng lịch sử; dữ liệu chưa đủ phải nói rõ. | Một tương tác đủ điều kiện có thể tạo gợi ý nhưng chưa tạo bằng chứng thống kê mạnh; một số chức năng có ngưỡng số license. |
| **Mainstream — Pipedrive / Pulse** | Feed gom reply, việc hôm nay, deal thiếu follow-up/quá hạn; custom scoring do người dùng định nghĩa, sequences và enrichment. ([Pulse](https://support.pipedrive.com/en/article/pulse)) | Một hàng đợi có thể xử lý xong phù hợp solo hơn dashboard lớn. | Một số phần beta, quyền theo plan; custom score không phải xác suất chốt đã kiểm định. |
| **Bất động sản — Follow Up Boss** | Smart Lists lọc động theo stage, thời gian, hoạt động; Action Plans tạo task/email và có lựa chọn pause khi phát sinh tương tác. ([Smart Lists](https://help.followupboss.com/hc/en-us/articles/360034301034-Working-Your-Smart-Lists), [Action Plans](https://help.followupboss.com/hc/en-us/articles/1500008539982-Action-Plans-Overview)) | Phân nhóm “nên chăm hôm nay” tự cập nhật; quy trình nhường lại cho hội thoại thật. | Smart summaries còn được hãng ghi **beta**; ưu tiên AI cho một số lead Zillow không chứng minh áp dụng toàn bộ khách Việt. ([FUB AI](https://www.followupboss.com/features/ai)) |
| **Bất động sản — Lofty** | Assistant sử dụng hồ sơ, task, tìm listing và chèn listing vào tin; Lead Health kiểm dữ liệu thiếu và giải thích ưu tiên. ([Assistant](https://help.lofty.com/hc/en-us/articles/33090360187675-AI-Assistant), [Lead Health](https://help.lofty.com/hc/en-us/articles/44068001384603-AI-Lead-Health-Analysis-Understand-and-Prioritize-Your-Leads)) | Ghép trí nhớ khách với hàng đang có và hành động cụ thể. | Multi-Step Tasks ghi **BETA**; plan được sửa/duyệt trước kích hoạt, lead reply thì dừng. Lead Health tối đa 500 lead/lần, một lần/ngày. ([Multi-Step Tasks](https://help.lofty.com/hc/en-us/articles/40528908682907-Using-AI-Assistant-Multi-Step-Tasks)) |
| **Bất động sản — CINC** | Website IDX, lead generation, CRM, routing và automation trong một bộ; Solo một user, Ramp tối đa bốn. ([Solutions](https://www.cincpro.com/pricing)) | Học luồng nhận lead → phân trách nhiệm → chăm sóc; team nhỏ mới cần routing nhiều người. | Nguồn listing IDX là giả định hạ tầng khác Việt Nam. Giá nền cần báo giá, AI/dialer là add-on. |
| **Thế hệ mới — Attio** | Đồng bộ email/calendar, first/last interaction, connection strength; custom objects/relations theo gói. Call Intelligence có recorder cho họp trực tuyến. ([Plans](https://attio.com/help/reference/workspace-settings-billing/attio-plans-and-features), [Recording](https://attio.com/help/reference/productivity-collaborating/call-intelligence/recording-calls-with-attio)) | Dữ liệu quan hệ linh hoạt, một tương tác nuôi được nhiều màn hình và quy tắc. | Recorder Zoom/Meet/Teams không đồng nghĩa ghi mọi cuộc gọi SIM/Zalo. |
| **Thế hệ mới — folk** | Follow-up Assistant phát hiện trao đổi dang dở; mobile voice note chuyển lời nói thành note có thể sửa. ([Follow-up](https://help.folk.app/en/articles/10304768-follow-up-assistant), [Voice note](https://help.folk.app/en/articles/15899229-record-a-voice-note)) | Hệ thống tự phát hiện cần chăm ai; sale nói ngắn sau gặp thay vì nhập form dài. | Assistant cần dữ liệu kênh đã nối; nút WhatsApp mở WhatsApp Web để người dùng gửi. Recap hiện tối ưu tiếng Anh, phải refresh và không sửa trực tiếp. ([Recap](https://help.folk.app/en/articles/12893225-recap-assistant)) |
| **Thế hệ mới — Day AI** | Dùng lịch sử liên lạc/quan hệ để tạo và duy trì opportunity; custom properties tự điền từ ngữ cảnh, import mapping/dedupe. ([Relationship update](https://www.day.ai/resources/the-ai-native-way-to-bring-your-deals-into-day-ai), [Custom properties](https://www.day.ai/resources/new-now-day-ai-fits-your-business)) | Hồ sơ là bộ nhớ sống, cập nhật có lý do từ hội thoại. | Hướng B2B/Gmail/họp; chưa có bằng chứng trong nguồn về Zalo hoặc inventory nhà đất. “Import notes” được ghi “next up” ở bài 2025 không được coi là đã phát hành từ bài đó. |

Điểm chung đáng học là **tự động thu ngữ cảnh → đưa ra việc nên làm → cho hành động ngay → cập nhật lại trí nhớ**. Sự đột phá không chỉ nằm ở model AI: Smart Lists dựa trên luật của FUB và feed của Pipedrive đã giải quyết đúng câu hỏi hằng ngày. AI thế hệ mới làm vòng đó ít nhập liệu hơn, nhưng vẫn phụ thuộc dữ liệu mà hệ thống thực sự tiếp cận được.

Hướng B2B như enrichment quy mô công ty, doanh thu hay vòng gọi vốn ít giúp hiểu một gia đình mua căn hộ. Ngược lại, ngân sách, vốn tự có, lý do mua, người cùng quyết định, hạn cần nhà và phản đối từng căn là dữ liệu trực tiếp tạo giá trị. Đó là cơ sở để **xây sâu cho môi giới Việt Nam**, thay vì tái tạo một Salesforce thu nhỏ.

<a id="nang-luc"></a>

## 2. Các năng lực tạo tiền bằng cách bảo vệ cuộc hội thoại

Toàn bộ thiết kế trong phần này là **đề xuất cho CRM Curtis**, tổng hợp từ mô thức thị trường; chưa phải chức năng đã xây. Giá trị kinh doanh được lý giải theo cơ chế giảm bỏ sót, giảm thời gian và tăng chất lượng chăm sóc, không gán phần trăm doanh thu chưa đo.

### 2.1. Hàng đợi Hôm nay phải biết cả mức ưu tiên và sức làm việc

Màn hình chính nên là danh sách ngắn: hẹn có giờ cụ thể, lead mới trong ca, khách đang chờ lời hứa, cơ hội có tín hiệu mới và khách bị bỏ quên. Mỗi thẻ trả lời “làm gì, vì sao, nguồn nào, mất khoảng bao lâu”, có nút gọi/nháp tin, hoàn tất, dời và bỏ qua có lý do. Dashboard vẫn hữu ích để kiểm tra tình hình, nhưng không nên là bước bắt buộc trước khi bắt đầu chăm khách. Tìm kiếm trên điện thoại phải nhanh theo tên, số, dự án hoặc nội dung note; các view cá nhân như “chờ căn 2PN”, “hẹn tuần này”, “khách cũ quay lại” nên lưu được và tự cập nhật. Mở từ kết quả tìm kiếm cần gọi, xem brief và ghi outcome ngay, không đi qua nhiều màn hình.

Lập lịch phải kết hợp lịch sale, giờ khách muốn, thời lượng cuộc gọi, thời gian ghi note và di chuyển. Một khung 90 phút không chứa 80 cuộc gọi chỉ vì hệ thống thấy 80 khách đến hạn. Hẹn khách đã xác nhận có ưu tiên cao; phần vượt khả năng đi vào backlog nhìn thấy được. Không tự dời hạn cũ rồi báo “đúng hẹn”: giữ cả hạn gốc và lịch mới để biết cam kết nào đã trễ.

**Nghiệm thu:** khách hẹn 18:30, sale chỉ còn 30 phút rảnh và có thêm lead mới. CRM giữ hẹn, xếp phần làm được, chỉ rõ phần tồn; không tạo công việc trùng. Với team, khách có owner hoặc người nhận xử lý để hai sale không đồng thời gọi. Thay đổi owner phải có bàn giao, không chỉ đổi tên trên hồ sơ.

### 2.2. Nhập lead tự động phải có chống trùng và đối soát

Input gồm form, CSV, đoạn chat được dán, ghi chú giọng nói hoặc thông tin nhập nhanh. Hệ thống chuẩn hóa số điện thoại, giữ ID nguồn, phát hiện cùng người và tách lần đăng ký khỏi hồ sơ người. Một khách hỏi hai dự án không thành hai người; cũng không mất dấu hai lần quan tâm. Chống trùng tên đơn thuần là nguy hiểm. Cùng số điện thoại là tín hiệu mạnh nhưng vẫn cần xét số dùng chung/nhập sai và giữ khả năng sửa.

Cần một nơi xem đường thu lead: lần thành công cuối, số chờ, lỗi quyền/token, bản ghi chưa map được, retry và kết quả đối soát nguồn. “Không có lead mới” phải phân biệt với “connector đã hỏng”. Một event gửi lại ba lần chỉ tạo một lần tiếp nhận hợp lệ, trong khi lịch sử thử xử lý vẫn được giữ. HubSpot cho thấy dedupe có khóa rõ ràng là nền tảng, nhưng mặc định email của họ không tự giải bài toán lead chỉ có số điện thoại ở Việt Nam. ([HubSpot deduplication](https://knowledge.hubspot.com/records/deduplication-of-records))

**Nghiệm thu:** cùng lead xuất hiện ở định dạng 0… và +84…, webhook bị gửi lại, sau đó người đó hỏi dự án khác. Hệ thống giữ đúng người, hai nhu cầu/đợt quan tâm có nguồn, không nhân task; trường hợp mơ hồ vào hàng duyệt. Import có preview và khả năng hoàn tác theo lô.

### 2.3. Bộ nhớ trước gọi phải gồm cả lời hứa hai chiều

Trước khi gọi, sale cần đọc trong khoảng vài chục giây: người này là ai, mua để ở hay đầu tư, cần gì, đã xem gì, phản đối điều gì, ai quyết định và lần trước hẹn gì. Mỗi dữ kiện quan trọng mở được note/tin/sự kiện nguồn cùng ngày; tóm tắt có thể sửa. Hệ thống hiển thị “chưa biết vốn tự có” thay vì tự suy từ nghề nghiệp hoặc cách nói.

**Lời hứa của sale và việc đang chờ khách là hai loại khác nhau.** “Em gửi bảng giá tối nay” là nghĩa vụ của sale. “Chị hỏi chồng rồi trả lời thứ Sáu” là mốc chờ và lý do follow-up. “Thứ Bảy gọi cho chồng chị” cần đúng người, quyền liên hệ và thời điểm. Không nên gom tất cả thành một task “chăm khách”. FUB Smart Messages dùng timeline, notes, calls và messages làm ngữ cảnh; bài học là tận dụng trí nhớ có sẵn, vẫn để người gửi kiểm tra nội dung. ([Smart Messages](https://help.followupboss.com/hc/en-us/articles/32113758342167-Smart-Messages))

**Nghiệm thu:** cùng lời hứa xuất hiện trong hai lần tóm tắt không tạo hai việc; câu “thứ Sáu” được hiện thành ngày tuyệt đối để duyệt; thông tin đổi ý mới không làm mất dấu lời cũ và người đã nói.

### 2.4. Sau gọi, một ghi chú ngắn nên thay nhiều màn nhập liệu

Thiết kế nên cho chọn kết quả một chạm rồi nói: “Anh Nam cần 2PN, tài chính hai tỷ tám, có chín trăm triệu, tối thứ Sáu gọi lại, chưa chốt khu vực.” Hệ thống đề xuất nhu cầu, ngân sách, vốn tự có, ghi chú, lịch gọi và nháp tin xác nhận. Sale xem một preview gọn, sửa phần cần thiết rồi lưu cùng lúc. Đây là giảm thao tác, không bắt người dùng duyệt từng dấu câu.

Phải phân biệt không nghe, bận, đã kết nối và hội thoại có ý nghĩa. Mở dialer không chứng minh cuộc gọi xảy ra; có thời lượng không chứng minh khách đủ điều kiện. Ghi chú sau gọi là lời sale kể lại, không giả thành transcript nguyên văn khách nói. Voice note là con đường thực dụng đã có trong sản phẩm mới như folk, ít phụ thuộc khả năng thu âm cuộc gọi hai chiều. ([folk voice note](https://help.folk.app/en/articles/15899229-record-a-voice-note))

**Nghiệm thu:** “không phải ba tỷ, tối đa hai tỷ tám”, “chưa biết vay bao nhiêu”, tên dự án và ngày tương đối được xử lý đúng hoặc đánh dấu chưa chắc. AI không ghi đè trường đã xác minh bằng suy đoán; mất mạng sau lưu không làm mất note.

### 2.5. Follow-up thích ứng phải biết dừng và biết nhường

Chuỗi chăm sóc nên tự tính lại khi khách trả lời, đã gọi được, đổi yêu cầu, đặt hẹn, xin nghỉ, từ chối hoặc căn được đề xuất hết hàng. Điều kiện được kiểm tra **ngay trước thực thi**, không chỉ khi lên lịch. HubSpot có cơ chế thoát sequence khi reply/booking; FUB có lựa chọn pause theo tương tác nhưng một số cuộc gọi ghi tay vẫn cần pause thủ công. Không kết nối được kênh thì CRM cần nút “đã phản hồi ở ngoài”. ([HubSpot unenrollment](https://knowledge.hubspot.com/sequences/unenroll-from-sequence), [FUB Action Plans](https://help.followupboss.com/hc/en-us/articles/1500008539982-Action-Plans-Overview))

Nên có một bước tiếp theo chính cho mỗi nhu cầu, ngoài các sự kiện cam kết riêng. Giới hạn liên hệ tính theo người trên nhiều kênh: gọi, Zalo và SMS cùng ngày không phải ba hệ độc lập được tự do làm phiền. Khung giờ liên hệ, tần suất và thời gian nghỉ là cấu hình sản phẩm phù hợp khách/team, không dùng một cadence cứng cho mọi người.

**Nghiệm thu:** khách trả lời 5 phút trước lịch gửi, hoặc sale xác nhận đã nói chuyện ngoài CRM; tác vụ cũ phải dừng/tính lại. Opt-out có hiệu lực trên các automation liên quan. Một lần bấm lại hoặc retry không gửi hai tin.

### 2.6. Ghép khách với căn phải dựa trên hàng còn thật

Matching gồm hai tầng. Luật lọc ràng buộc cứng: trần tài chính, loại căn, khu vực bắt buộc, điều kiện pháp lý, trạng thái còn hàng. Sau đó mới xếp các sở thích mềm như tầng, hướng, view, tiện ích và đánh đổi. Kết quả nên là ba lựa chọn có lý do “đúng ở đâu, vướng ở đâu, giá xác minh khi nào”, thay vì “phù hợp 97%” không có nghĩa rõ.

Mỗi căn cần nguồn, người xác nhận, lần cập nhật, trạng thái và lịch sử giá/chính sách. Dữ liệu cũ phải gắn cần xác nhận; thiếu pháp lý không tự được hiểu là đạt. Khi có căn mới hoặc giảm giá, chạy matching ngược để tìm ai đáng liên hệ rồi chuẩn bị nháp. Lofty mô tả Assistant tìm listing/chèn listing vào tin, còn Custom Agents giới thiệu ghép buyer–listing và báo giảm giá; phần sau là mô tả sản phẩm của hãng, chưa có kiểm thử runtime trong nghiên cứu. ([Assistant help](https://help.lofty.com/hc/en-us/articles/33090360187675-AI-Assistant), [Custom Agents](https://lofty.com/ai/custom-agents?hsLang=en))

**Nghiệm thu:** căn đã bán, giá quá cũ hoặc vượt trần không lọt vào nhóm “đạt yêu cầu”. Một căn bị khách chê vì tầng phải giữ phản đối tại cặp khách–căn; không biến thành kết luận khách ghét mọi căn trong dự án. Giá, chính sách thanh toán và nội dung pháp lý lấy từ dữ liệu đã kiểm tra, không để LLM tạo.

### 2.7. Hộ gia đình phải có nhiều người, một tiến trình mua

Một giao dịch có thể gồm người ở, người trả tiền, người vay và người ảnh hưởng. Vợ quan tâm trường học, chồng xem dòng tiền, bố mẹ góp vốn. CRM cần người riêng, vai trò riêng và nhu cầu mua chung, vẫn biết ai đã nói gì và ai nên được gọi. Một người cũng có thể vừa mua vừa bán hoặc đầu tư nhiều đợt.

FUB Relationships giảm trùng trong Smart Lists nhưng có đánh đổi: merge relationship không có unmerge và email tracking không phân biệt ai mở. Lofty có family members nhưng cảnh báo hoạt động liên hệ người nhà có thể hiển thị như primary lead. Đó là lý do nên học mô hình quan hệ mà giữ attribution rõ, thay vì ép cả nhà thành một contact. ([FUB Relationships](https://help.followupboss.com/hc/en-us/articles/1500008593181-Contact-Relationships-Overview), [Lofty family members](https://help.lofty.com/hc/en-us/articles/360021258652-How-to-Manage-the-Family-Members-of-a-Lead))

**Nghiệm thu:** chồng đổi lịch không tự sửa lời hẹn của vợ; một lượt xem chung không nhân đôi báo cáo cơ hội. Quyền liên hệ và sở thích kênh được lưu theo người.

### 2.8. Cứu cơ hội đứng yên cần một lý do hành động

Hệ thống nên tìm lead chưa có người xử lý, khách có nhu cầu nhưng không có next step, sau xem chưa follow-up, đang chờ tài liệu quá hạn, hoặc khách chờ căn phù hợp trong khi hàng vừa xuất hiện. Cảnh báo phải kèm hành động cứu: “đã xem 4 ngày, chưa ghi nhận phản hồi; hỏi đúng hai điểm còn vướng”. Khách chỉ muốn quay lại sau ba tháng không nên bị coi là lỗi pipeline mỗi ngày.

Hãy lưu lý do mất/chưa tiến triển có cấu trúc nhẹ: tài chính, thời điểm, không có hàng, pháp lý, vị trí, chọn đối thủ, không liên lạc được, chưa rõ. AI có thể gợi ý lý do từ note nhưng sale xác nhận. Đây là cách biến “khách nguội” thành thông tin sửa quy trình hoặc nguồn hàng, thay vì trách sale gọi chưa đủ nhiều.

### 2.9. Lịch xem, tài liệu, giao dịch và sau bán phải nối liền

Hẹn xem cần người tham dự, căn, địa chỉ, người mở cửa, tài liệu, lịch nhắc và kết quả thực tế. “Đã đặt lịch” khác “đã đến xem”. Sau xem, CRM chuẩn bị câu hỏi phản hồi và bước kế tiếp. Khi giao dịch tiến triển, các mốc giữ chỗ, đặt cọc, ký, thanh toán và hoa hồng theo dõi bằng dữ liệu và xác nhận thực, không dựa vào giọng điệu tích cực trong hội thoại.

Tài liệu cần nằm đúng ngữ cảnh khách–căn: bảng giá, chính sách, mặt bằng, báo giá đã gửi, phiên bản và ngày hiệu lực. Khi chính sách đổi, sale thấy khách nào từng nhận bản cũ và việc cần cập nhật. Bộ tính thanh toán/vay dùng công thức, đầu vào và giả định hiển thị rõ; lưu kịch bản đã gửi để không nhầm với con số mới. AI giải thích hoặc tạo nháp từ nguồn đã xác minh, không tự thêm điều kiện bán hàng.

Sau bán nên có bàn giao, giấy tờ còn thiếu, lịch chăm lại và lời nhắc xin giới thiệu khi phù hợp. Đây là sự tiếp nối quan hệ, không cần biến phiên bản đầu thành hệ thống kế toán hay soạn hợp đồng tự động. Số tiền, thuế/phí, điều kiện vay và hạn hợp đồng phải tính/kiểm bằng công thức và dữ kiện có nguồn.

### 2.10. Ma trận ưu tiên biến ý tưởng thành yêu cầu nghiệm thu

P0 là điều kiện để vòng hằng ngày đáng tin; P1 làm sâu nghiệp vụ và tự động hóa; P2 là lớp học hỏi/dự đoán sau khi dữ liệu đủ tốt. Đây là thứ tự phụ thuộc, không phải cam kết thời gian xây.

| Ưu tiên / năng lực | Lợi ích trực tiếp | Dữ liệu phải có | Mức tự động đề xuất | Tình huống nghiệm thu trọng tâm |
|---|---|---|---|---|
| **P0 — Thu lead + chống trùng + đối soát** | Không mất khách, bớt nhập | SĐT, ID nguồn, submission, thời gian | Tự nhận/chuẩn hóa; merge mơ hồ cần duyệt | Retry ba lần vẫn một submission; hai nhu cầu không bị mất nguồn |
| **P0 — Hôm nay + lịch theo sức làm** | Biết gọi ai, giữ hẹn | Lịch sale, lời hẹn, thời lượng, owner | Luật xếp việc; sale dời/ghi lý do | Hết ca không nhồi việc; lịch gốc còn để đo trễ |
| **P0 — Trí nhớ + cam kết** | Chuẩn bị nhanh, chăm đúng | Note, tương tác, nguồn từng fact | AI tóm tắt/trích draft | Mở được nguồn; không nhân đôi cùng lời hứa |
| **P0 — Kết quả nhanh + voice note** | Bớt admin sau gọi | Outcome, note/audio tự ghi | AI đề xuất trường/task, một lượt duyệt | Phủ định/số tiền/ngày không tự ghi sai |
| **P0 — Next step + stop rules** | Không quên, không làm phiền | Trạng thái, reply có bằng chứng, opt-out | Task nội bộ tự động; gửi tùy quyền | Reply trước giờ gửi làm dừng bước cũ |
| **P0 — Đồng bộ, phân quyền, phục hồi** | Tin dùng được ngoài hiện trường | Lịch sử sửa, hàng chờ, access | Tự sync/retry có trạng thái | Offline không mất note; sửa xung đột hiện rõ; restore đọc được |
| **P1 — Catalog + độ mới + matching** | Gửi đúng hàng, cứu lead | Project/building/unit, giá, tồn, nhu cầu | Lọc luật + AI diễn giải; sale duyệt gửi | Căn hết/giá cũ không bị giới thiệu như đã xác minh |
| **P1 — Nhóm mua và vai trò** | Chăm đúng người quyết định | Person, quan hệ, vai trò, opportunity | Liên kết có duyệt | Không gộp mất người; không nhân đôi giao dịch |
| **P1 — Hẹn xem + mốc giao dịch** | Đưa quan tâm thành bước thật | Lịch, căn, người, kết quả/mốc | Nhắc/checklist tự động | Đặt lịch khác đến xem; thu hoa hồng khác ký deal |
| **P1 — Tài liệu + báo giá có phiên bản** | Tránh gửi nhầm giá/chính sách | File, căn, ngày hiệu lực, bản đã gửi, công thức/giả định | Tự gắn tài liệu/nhắc đổi bản; sale duyệt gửi | Khách nhận bản cũ được đánh dấu; tính lại theo đúng đầu vào |
| **P1 — Cứu cơ hội + bàn giao** | Giảm rò rỉ pipeline | Stage events, cam kết, owner | Phát hiện bằng luật, đề xuất hành động | Đang nurture đúng hẹn không bị báo rác |
| **P1 — Phân tích nguồn/cohort** | Biết nghẽn nằm ở đâu | Submission, chi phí, outcome, thời gian | Tính xác định; AI viết diễn giải | Luôn có tử/mẫu số, tuổi lead, dữ liệu thiếu |
| **P2 — Giờ liên hệ/ưu tiên học từ lịch sử** | Tối ưu khi đủ dữ liệu | Lịch sử hai chiều, kết quả nhất quán | Gợi ý có lý do/độ chắc | Lời hẹn khách thắng gợi ý; ít mẫu thì nói chưa đủ |
| **P2 — Agent có công cụ / nurture giới hạn** | Giảm thao tác nhiều bước | Quyền, playbook, log, giới hạn | Tự làm trong phạm vi đã cho phép | Dừng được, kiểm tra trước chạy, audit và xử lý thất bại |
| **P2 — Dự báo đã kiểm định** | Hỗ trợ kế hoạch nguồn lực | Cohort đủ chín, won/lost, thu thực | Mô hình ngoài mẫu, theo dõi sai lệch | Không biến LLM confidence thành xác suất thắng |

<a id="du-lieu"></a>

## 3. Trí thông minh hữu ích phải giải thích được bằng dữ liệu

### Bộ dữ liệu tối thiểu phải phản ánh cách người ta mua nhà

Giao diện nên gọn dù dữ liệu phía sau đủ quan hệ. Sale chỉ cần thấy khách, nhu cầu, căn và việc; hệ thống giữ cấu trúc để không báo cáo nhầm.

| Thành phần logic | Cần giữ điều gì | Sai lầm cần tránh |
|---|---|---|
| **Người — Person** | Thông tin liên hệ, định danh, kênh/giờ ưa thích, không liên hệ | Một tên trùng thành một người; có SĐT nghĩa là được gửi mọi loại tin |
| **Nhóm mua — Buying group** | Người tham gia, vai trò, quan hệ và ai nói gì | Gộp vợ/chồng làm mất nguồn phát ngôn |
| **Nhu cầu/cơ hội — Opportunity** | Mục tiêu, tiêu chí, tài chính xác nhận, timeline, stage, owner | Một người chỉ được một nhu cầu suốt đời |
| **Nguồn hàng — Property** | Dự án/tòa/căn hoặc tài sản, giá, trạng thái, nguồn, ngày xác minh | AI nhớ giá cũ nhưng coi là giá hiện hành |
| **Cặp khách–căn — Match** | Đã giới thiệu/xem, phù hợp, phản đối, bước kế tiếp | Chê một căn thành chê toàn dự án |
| **Tương tác — Interaction** | Ai, kênh, lúc nào, attempt hay kết nối, nội dung/outcome, bằng chứng | Mở app gọi thành một hội thoại thành công |
| **Công việc/cam kết — Task** | Bên chịu trách nhiệm, hạn gốc, lịch mới, trạng thái, lý do | Dời hạn rồi xóa dấu trễ; tạo nhiều việc cùng mục đích |
| **Nguồn + đồng ý + xuất xứ** | Submission, form/ad/referral, mục đích, tùy chọn liên hệ, nguồn field và lịch sử sửa | Ghi đè first source bởi lần import mới; fact AI không có nguồn |

Các trường quan trọng nên biết dữ liệu được quan sát lúc nào, trích lúc nào, ai xác nhận và còn mới hay không. Thông tin “khách nói”, “sale diễn giải” và “AI suy ra chưa duyệt” có trạng thái khác nhau. Chỉ lưu thông tin cần cho công việc, tránh biến trí nhớ CRM thành kho đời tư.

### Tách bốn câu hỏi thay vì gom thành “khách nóng 92%”

**Phù hợp nhu cầu** đo khách có khớp nguồn hàng không. **Sẵn sàng mua** đo thời điểm, động lực và bước thực đã cam kết. **Khả năng liên hệ** phản ánh số/kênh hợp lệ, giờ khách muốn và lịch sử liên lạc. **Độ tin cậy dữ liệu** phản ánh đủ, mới và được xác nhận đến đâu. Ưu tiên hành động còn chịu lời hẹn và nguy cơ bỏ sót; nó không đồng nghĩa khả năng thắng.

Một khách rất phù hợp nhưng mua năm sau không cần chăm như người đang chờ đặt lịch xem tuần này. Khách chưa rõ vốn tự có cần một câu hỏi tốt, không cần AI đoán khả năng vay. HubSpot đã tách fit và engagement trong scoring; Salesforce có thể không chấm hoặc không cập nhật khi thiếu dữ liệu. Đây là mô thức đáng học: hệ thống được phép nói “chưa biết”. ([HubSpot lead scores](https://knowledge.hubspot.com/scoring/build-lead-scores), [Einstein scoring](https://help.salesforce.com/s/articleView?id=sf.einstein_sales_els_how_it_works.htm&language=en_US&type=5))

Ngưỡng kỹ thuật của hãng cũng không phải ngưỡng khoa học cho Curtis. Dynamics yêu cầu tối thiểu 40 qualified + 40 disqualified cho lead scoring, hoặc 40 won + 40 lost cho opportunity scoring trong dữ liệu gần đây. Đủ điều kiện chạy tính năng không bảo đảm mô hình chính xác với tệp B2C nhà đất nhỏ. Ưu tiên luật minh bạch trước; chỉ phát triển xác suất khi nhãn nhất quán, đủ dữ liệu, kiểm tra ngoài mẫu và hiệu chuẩn được. ([Dynamics scoring](https://learn.microsoft.com/en-us/dynamics365/sales/digital-selling-scoring))

### Insight phải kết thúc bằng quyết định, không chỉ biểu đồ

Phễu nên phân biệt lead hợp lệ → hội thoại hai chiều → nhu cầu đủ rõ → hẹn xem → thực sự xem → booking/đặt cọc → ký → hoa hồng thực thu. Các mốc được định nghĩa rõ và lưu ngày. Đo tỷ lệ từng bước với cả số đếm và mẫu số; giữ trạng thái chưa biết riêng. Báo cáo theo nguồn, owner và nhóm lead có cùng thời điểm bắt đầu — **cohort**, tức nhóm cùng kỳ để so công bằng hơn.

First touch và last touch mô tả quy tắc ghi nhận nguồn đầu/cuối; không tự chứng minh kênh nào gây ra giao dịch. Khi cùng khách quay lại qua nguồn mới, giữ cả submission và lịch sử. So sale cũng cần xét nguồn được giao, tuổi lead, số lượng, ca trực và độ đầy đủ dữ liệu; bảng xếp hạng conversion thô dễ thưởng phạt sai.

**Ví dụ hoàn toàn giả định, không phải dữ liệu CRM Curtis:** nhóm lead tháng 8 đã theo dõi đủ 30 ngày có nguồn A: 6/24 đủ điều kiện, 3/24 đã đi xem; nguồn B: 2/8 đủ điều kiện, 2/8 đã đi xem. Cả hai cùng **25% đủ điều kiện**; tỷ lệ đi xem lần lượt **12,5% và 25%**. Với B, chỉ thêm một lượt đã thay đổi 12,5 điểm phần trăm; chưa đủ cơ sở kết luận B tốt hơn hoặc tăng ngân sách. Nếu đang có năm khách đủ điều kiện của A quá hẹn gọi lại hơn 48 giờ, insight hành động hợp lý là xử lý năm cam kết đó trước. Vẫn phải kiểm tra chất lượng định nghĩa, thời gian theo dõi, chi phí và nguồn dữ liệu.

Những phân tích có ích sớm gồm thời gian phản hồi trong ca, số khách active không có next step, lời hứa trễ, thời gian nằm ở stage, lý do không đi xem và hàng thiếu cho nhu cầu đang có. Forecast doanh thu cần phản ánh độ trễ đến lúc thu tiền; không lấy số cơ hội nhân một tỷ lệ đẹp rồi trình bày như doanh thu chắc chắn.

### Workflow, AI và agent làm ba việc khác nhau

**Workflow** là “khi điều kiện này xảy ra, làm các bước đã định”: lead mới hợp lệ thì gán owner và tạo task. **AI** hiểu ngôn ngữ không cấu trúc: nghe note tiếng Việt, tóm tắt nhu cầu, đề xuất câu hỏi và nháp tin. **Agent có công cụ** dùng AI để chọn các bước trong phạm vi cho phép, chẳng hạn tìm khách phù hợp với căn mới, kiểm lịch và chuẩn bị kế hoạch chăm sóc.

Ngày, tiền, lãi vay, quyền gửi, trạng thái hợp lệ và công thức báo cáo dùng luật/tính toán xác định. AI có thể giải thích kết quả nhưng không sáng tác số. Agent phải có phạm vi, công cụ, giới hạn lần chạy, nhật ký và nút dừng. Nội dung giá/pháp lý/tài chính có ảnh hưởng quyết định cần nguồn đáng tin và kiểm tra phù hợp; “AI thấy tự tin” không phải cơ chế phê duyệt.

<a id="viet-nam"></a>

## 4. Tại Việt Nam, tự động hóa phải bám đúng kênh và thiết bị

### Zalo cá nhân, OA và ZBS là các đường khác nhau

Danh mục chính thức có OA, ZBS Template Message và Zalo Social; danh mục đó **không xác nhận quyền đọc toàn bộ hộp thư Zalo cá nhân**. Vì vậy phiên bản thực dụng cho Zalo cá nhân là tạo nháp có thể sửa, mở liên hệ, để sale gửi và xác nhận kết quả. CRM không tự biết khách đã trả lời ở ngoài hệ thống nếu không có tích hợp hợp lệ hoặc xác nhận của sale. Đây là giới hạn dữ liệu cần thể hiện trong sản phẩm, không che bằng chữ “omnichannel”. ([Zalo Developers](https://developers.zalo.me/))

Với **riêng Tin Tư vấn OA**, tài liệu nêu người dùng phải có tương tác phù hợp và không chặn OA; OA Manager gửi trong 365 ngày từ tương tác cuối, còn OA OpenAPI trong 7 ngày. Tin trong 48 giờ miễn phí, ngoài đó theo biểu phí. Không áp các mốc này thành giới hạn của toàn bộ tin Zalo. Với tin doanh nghiệp theo mẫu, thông báo Zalo cho biết ZBS Template Message hợp nhất ZNS và UID giao dịch/truyền thông từ 01/01/2026; định dạng UID cũ dừng từ 01/03/2026. Thiết kế cần chọn đúng loại tin, mẫu đã duyệt, điều kiện và biểu phí tại lúc triển khai. ([Tin Tư vấn](https://oa.zalo.me/home/documents/guides/tin-tu-van), [Thông báo ZBS 22/01/2026](https://zalo.solutions/news/thong-bao-hop-nhat-dinh-nghia-tin-uid-va-zns-thanh-zbs-template-message/cp1zx4bq8mzhhszgz0br1ocd))

### Thu lead quảng cáo cần kiểm chứng đường production

Mẫu chính thức Meta thể hiện webhook báo leadgen ID rồi gọi Graph API lấy dữ liệu; repo mẫu đã archive, nên chỉ dùng làm bằng chứng mô thức. Nguồn developer hiện hành không truy cập được đầy đủ trong nghiên cứu này: quyền, app review, phiên bản và phạm vi dữ liệu cụ thể phải kiểm tra lại khi tích hợp thật. Một test webhook thành công chưa chứng minh tất cả lead production đang về. ([Meta sample](https://github.com/fbsamples/lead-ads-webhook-sample/blob/main/postman/FB%20Lead%20Ads%20%28Part%201%20-%20The%20Webhook%29.postman_collection.json), [Meta integration checker](https://github.com/facebookincubator/catalogue-of-api-solutions/blob/main/solutions/leads/leads-retrieval-set-up-checker.md))

Đề xuất nghiệm thu bao gồm lead thật từ form được dùng, mapping trường, nguồn ad/form, xử lý trùng, quyền hết hạn, đối soát tổng số và cảnh báo lỗi có người nhận. Sau khi dữ liệu nền đã ổn, connector này có thể được ưu tiên rất sớm nếu đó là nguồn lead chính của Curtis.

### Nhật ký cuộc gọi, âm thanh và ghi chú là ba nguồn khác nhau

| Đường liên lạc | CRM có thể thiết kế theo hướng nào | Phần chưa được quyền mặc định suy ra |
|---|---|---|
| **Android gọi SIM** | Nút mở dialer, lưu attempt, outcome nhanh, voice memo sau gọi; call log khi quyền và cơ chế phân phối phù hợp | Mở dialer không phải kết nối; quyền microphone không đồng nghĩa ghi hai đầu cuộc gọi |
| **iPhone gọi SIM** | Mở cuộc gọi, sale xác nhận outcome, tự ghi note sau gọi | Không có supported API để app thứ ba đọc toàn bộ call log hay live audio của cuộc gọi app đó không vận chuyển |
| **VoIP/tổng đài** | Dùng callback/log/recording nếu provider hỗ trợ và triển khai phù hợp | Có provider không có nghĩa ghi được cuộc gọi trên SIM cá nhân |
| **Họp trực tuyến** | Recorder/transcript qua nền tảng có hỗ trợ và quyền tương ứng | Recorder trong Zoom/Meet/Teams không bao phủ Zalo/SIM |
| **Voice memo sau gặp/gọi** | Sale nói lại thông tin; AI chuyển thành draft fields/task | Không phải bằng chứng nguyên văn khách phát biểu |

Android phân biệt ACTION_DIAL và ACTION_CALL; Google Play hạn chế SMS/Call Log, còn thu voice-call uplink/downlink có yêu cầu quyền đặc biệt. Phải tách quyền hệ điều hành, điều kiện phân phối và độ ổn định trên máy thật. Không đưa thay đổi chính sách có hiệu lực 27/01/2027 thành trạng thái của tháng 10/2026. ([Android intents](https://developer.android.com/guide/components/intents-common.html), [Play policy](https://support.google.com/googleplay/android-developer/answer/10208820), [Android audio input](https://developer.android.com/media/platform/sharing-audio-input))

Các giới hạn iPhone ở bảng dựa trên trả lời Apple DTS về call log và live call audio; CallKit hỗ trợ dịch vụ VoIP của chính app. Google Speech-to-Text có vi-VN, nhưng đó chỉ là bằng chứng hỗ trợ ngôn ngữ, chưa phải benchmark tên dự án, giọng vùng miền hay số tiền của Curtis. ([Apple call log](https://developer.apple.com/forums/thread/808429), [Apple audio](https://developer.apple.com/forums/thread/841340), [CallKit](https://developer.apple.com/documentation/callkit), [Google languages](https://docs.cloud.google.com/speech-to-text/docs/v1/speech-to-text-supported-languages?hl=en))

Một giới hạn thực tế khác: FUB Calling chỉ outbound call/text đến Mỹ/Canada; môi giới ngồi Việt Nam không vì thế gọi được khách Việt bằng tính năng này. Mô thức hay từ phần mềm quốc tế vẫn cần lớp liên lạc địa phương. ([FUB international calling](https://help.followupboss.com/hc/en-us/articles/10321054750487-International-Calling-and-Texting))

### Một ngày làm việc minh họa phải có cả đường lỗi

| Thời điểm / đầu vào | Hệ thống chuẩn bị và xử lý | Sale làm gì | Nếu có ngoại lệ |
|---|---|---|---|
| Đầu ngày: lịch và khách active | Gom cam kết, lead chưa xử lý, cơ hội cần cứu; xếp theo sức làm | Xem ngắn, chọn khung gọi, xử lý việc chính | Lịch quá tải hiện backlog và việc có nguy cơ trễ |
| Lead mới từ form | Chuẩn hóa, gợi ý trùng, giữ source, gán owner, tạo việc | Gọi/nhắn với brief sẵn | Token hỏng vào hàng lỗi; lead mơ hồ chờ duyệt; không âm thầm bỏ |
| Trước cuộc gọi | Brief có nguồn, hai câu hỏi còn thiếu, lời hứa đang mở | Đọc nhanh và quan tâm khách | Dữ liệu cũ/thiếu được gắn rõ, không đoán tài chính |
| Sau cuộc gọi | Trích note thành trường, task, draft | Chọn outcome, nói note, sửa/duyệt một lượt | Ngày mơ hồ được hỏi xác nhận; mạng yếu lưu chờ đồng bộ |
| Có căn mới/đổi giá | Lọc khách phù hợp, kiểm độ mới, tạo đề xuất | Chọn người đáng gửi, điều chỉnh giọng tin | Hàng chưa xác minh chỉ tạo việc kiểm tra; không gửi giá cũ |
| Trước follow-up | Kiểm reply, lịch, opt-out, trạng thái và quyền gửi lần nữa | Duyệt/gửi khi cần; xác nhận phản hồi ngoài CRM | Thiếu event thì giữ trạng thái chưa biết; không giả đã gửi/đã đọc |
| Cuối ngày | Đối soát lời hứa, việc lỗi, note chưa sync, lịch ngày mai | Xử lý ngoại lệ quan trọng trong một chỗ | Job thất bại có lý do/người phụ trách và replay an toàn |

### Tin cậy là một phần của trải nghiệm sale

Mỗi playbook cần trigger, điều kiện, owner, hạn, quy tắc dừng, giới hạn tiếp xúc, nhật ký và nút pause. Retry phải tránh nhân bản hành động; tác vụ đến muộn phải kiểm trạng thái hiện tại. Đây là nguyên tắc thiết kế hệ thống sự kiện, không suy rằng mọi nhà cung cấp có cùng cơ chế. Stripe là ví dụ tài liệu sơ cấp mô tả event có thể trùng/không theo thứ tự. ([Stripe webhooks](https://docs.stripe.com/webhooks))

Với CRM dùng trên điện thoại và desktop, phải có pending/synced/failed, hàng lưu chờ bền vững và đối soát sau nối mạng. Websocket nhanh không tự bảo đảm mọi business record đã được lưu và đồng bộ. Supabase Broadcast có acknowledgement của server, nhưng không nên diễn giải nó thành bằng chứng cập nhật bền vững trên mọi máy. Sửa note có thể nối lịch sử; xung đột ngân sách, owner hoặc ngày hẹn cần hiện rõ. ([Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast))

Quyền theo người/team, thu hồi tài khoản, log thay đổi, export, backup và thử restore giúp tránh mất khách khi sự cố xảy ra. Export phải giữ quan hệ người–nhu cầu–tương tác, không chỉ một danh sách số điện thoại; API cần quyền giới hạn và lịch sử sử dụng để tích hợp sau này. Đây là đường rút và đường mở rộng của dữ liệu, tránh phụ thuộc một giao diện hoặc nhà cung cấp. Luật Bảo vệ dữ liệu cá nhân có hiệu lực 01/01/2026 là bối cảnh pháp lý phải xét trong năm nghiên cứu. Đề xuất sản phẩm là giữ nguồn/mục đích/tùy chọn liên hệ, cơ chế không liên hệ, sửa/xóa theo quy trình, retention và kiểm soát audio đưa lên AI. Đây chưa phải kết luận tuân thủ: luồng ghi âm, xử lý cloud và chuyển dữ liệu cần đánh giá theo triển khai cụ thể. ([Cổng Chính phủ](https://xaydungchinhsach.chinhphu.vn/quoc-hoi-da-thong-qua-luat-bao-ve-du-lieu-ca-nhan-119250626153701582.htm))

<a id="lo-trinh"></a>

## 5. Nâng cấp theo vòng khép kín, đo trước khi mở rộng

### Lộ trình nên có cổng nghiệm thu thay vì danh sách tính năng dài

| Mốc đề xuất | Đầu vào và đầu ra | Điều kiện đi tiếp |
|---|---|---|
| **P0 — Tin cậy và hoàn tất một ngày sale** | Đầu vào: lead, lịch, note, hồ sơ hiện có. Đầu ra: một người/nhu cầu đúng, Today, brief, outcome, note-to-fields, next action, log/sync rõ | Không mất lead/note trong bộ test; chống trùng đúng; lời hẹn được giữ; AI sai có thể sửa; lỗi có người xử lý |
| **P1 — Nghiệp vụ bất động sản và tự động hóa có kiểm soát** | Đầu vào: nguồn hàng đủ mới, nhóm mua, tương tác đáng tin. Đầu ra: matching, hẹn xem, cứu cơ hội, handover, nguồn/cohort; mở connector chính thức theo nhu cầu | Hard constraints không bị vi phạm trong nghiệm thu; gửi có eligibility/stop rules; báo cáo có mẫu số và ngày; máy thật dùng được |
| **P2 — Hệ thống học và agent có phạm vi** | Đầu vào: kết quả đủ nhất quán và đủ chín. Đầu ra: gợi ý giờ/ưu tiên dựa lịch sử, agent chuẩn bị nhiều bước, dự báo khi đạt điều kiện | Có kiểm tra ngoài mẫu, giới hạn quyền/chi phí, theo dõi sai lệch, dừng và quay về thao tác tay được |

Một bản phát hành nên khép kín một vòng thật. “Có AI note” nhưng không lưu được task đúng ngày chưa giải xong sau gọi. “Có matching” nhưng tồn kho không mới chưa giải xong giới thiệu căn. Các phần CRM hiện có cần được đối chiếu với tiêu chí trước khi quyết định giữ, bổ sung hay thay đổi; nghiên cứu này không mặc định viết lại stack.

### Pilot 4–6 tuần là đề xuất đo vận hành, không hứa tăng conversion

Đề xuất dùng Curtis hoặc 1–2 người, bắt đầu bằng hai luồng: **lead mới → lần liên hệ đầu** và **sau gọi → note + bước tiếp theo**. Tuần đầu ghi baseline phút admin/ngày, thời gian chuẩn bị, số thao tác sau gọi, khách active thiếu next step và cam kết trễ. AI chạy ở chế độ chỉ đề xuất trước khi bật cập nhật nội bộ; chỉ mở thêm matching/cứu cơ hội khi vòng đầu đáng tin. Đây là kế hoạch thử nghiệm đề xuất, chưa phải lịch triển khai hoặc lời hứa kết quả.

Đầu vào thử AI nên có khoảng 50–100 note thực tế được chọn để chứa phủ định, đổi ý, số tiền, mã căn, tên dự án, ngày tương đối và câu chưa rõ; số lượng đó là quy mô tập nghiệm thu gợi ý, không bảo đảm thống kê. Kiểm lỗi theo field quan trọng và mức sửa, thay vì một điểm “AI chính xác 95%” chung chung. Review mẫu ngẫu nhiên hằng tuần cùng toàn bộ lỗi nghiêm trọng. Với lượng lead thấp, so cùng tác vụ trước/sau và ghi các yếu tố mùa vụ/nguồn thay đổi; chưa nên tuyên bố quan hệ nhân quả.

| Nhóm đo | Chỉ số nên theo dõi | Cách đọc kết quả |
|---|---|---|
| **Hiệu quả công việc** | Phút chuẩn bị/nhập note, số thao tác sau gọi, giờ admin/tuần | Đo thao tác tương đương; tính cả thời gian sửa AI |
| **Chất lượng chăm sóc** | Cam kết đúng hẹn, active có next step, phản hồi lead trong ca, hội thoại có ý nghĩa | Cuộc bấm gọi không thay hội thoại; giữ hạn gốc khi dời |
| **Độ tin cậy** | Lead đối soát thiếu, note mất, task/gửi trùng, lỗi tiền/ngày/tên, bản nháp phải sửa | Mục tiêu không mất note/không gửi trùng áp dụng bộ nghiệm thu; không tuyên bố SLA production từ vài test |
| **Kết quả kinh doanh** | Hẹn đã diễn ra, booking/chốt, thời gian đến mốc, hoa hồng thực thu | Theo cohort đủ chín; chu kỳ chuyển đổi có thể dài hơn pilot |
| **Kinh tế vận hành** | API/AI, calling, storage, connector, giờ bảo trì/duyệt | Tính chi phí trên lead được phục vụ và hội thoại đủ chất lượng |

Các ca bắt buộc gồm webhook lặp và token hết, đổi hẹn, reply sát giờ gửi, opt-out, mở gọi rồi hủy, không nghe, offline rồi đóng app, hai máy sửa cùng khách, căn hết hàng, giá cũ, merge nhầm, thu hồi thành viên và restore backup mẫu. **Không mất note, không nhân việc/gửi, không lọt ràng buộc cứng** là mục tiêu trong bộ nghiệm thu, cần chạy lại trên máy thật trước kết luận sử dụng ngoài hiện trường. Các mục tiêu giảm admin bao nhiêu phần trăm phải đặt sau baseline.

### Chi phí và quyền truy cập thường là phần bị bỏ quên

Không cần bảng giá mua CRM để thiết kế sản phẩm riêng, nhưng cần học các rào cản đóng gói. Salesforce có API/flow/AI theo plan và add-on; HubSpot có seat, onboarding, calling, credits và một số transcript enrichment beta; Attio có AI/workflow credits. Một tính năng hiện trên trang giới thiệu không có nghĩa solo agent mua gói cơ bản là dùng trọn. ([Salesforce pricing](https://www.salesforce.com/sales/pricing/), [HubSpot catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog/products), [Attio pricing](https://attio.com/pricing?abtest=true))

Zoho liệt kê một số analytics/gợi ý với ngưỡng hơn 10 hoặc hơn 20 license; cần đọc đúng từng feature, không gộp tất cả Zia vào một edition. CINC còn tách AI/dialer khỏi giá nền. Những ví dụ này cho thấy chi phí ẩn thường nằm ở điều kiện sử dụng và đường dữ liệu, không chỉ giá mỗi chỗ ngồi. ([Zoho feature list](https://www.zoho.com/crm/complete-feature-list.html), [CINC pricing](https://www.cincpro.com/pricing))

Đối với CRM riêng, ngân sách gồm thu lead/connectors, số gọi/provider, chuyển giọng nói, AI jobs, lưu audio, bảo mật/backup, đối soát/retry, theo dõi lỗi và thời gian người duyệt. Nên ghi chi phí từng loại job và giới hạn theo ngày/tháng. Nếu agent chạy nhiều bước để tạo một gợi ý ít giá trị, token rẻ vẫn có thể thành sản phẩm đắt.

### Chín ưu tiên dành cho Curtis

| Thứ tự | Năng lực nên đặt làm chuẩn | Tiêu chí giá trị |
|---|---|---|
| **1** | Thu lead đáng tin, có nguồn, chống trùng và đối soát | Lead không rơi mất; sửa/hoàn tác được |
| **2** | Hôm nay gọi ai, theo sức làm và lời hẹn thật | Sale mở CRM là hành động được |
| **3** | Brief trước gọi với bộ nhớ và cam kết hai chiều | Không phải đọc lại timeline dài |
| **4** | Outcome một chạm + voice note thành draft fields/task | Sau gọi hoàn tất công việc nhanh, dễ sửa |
| **5** | Follow-up thích ứng với stop rules và xác nhận ngoài CRM | Không bỏ quên, không chăm sai lúc |
| **6** | Catalog mới + matching hai chiều có lý do | Đưa đúng căn và biết điều phải đánh đổi |
| **7** | Nhóm mua + hẹn xem + mốc giao dịch/sau bán | Quan hệ nhiều người vẫn có một tiến trình rõ |
| **8** | Cứu cơ hội + báo cáo nguồn/cohort gắn hành động | Chỉ ra chỗ rò và việc cần làm hôm nay |
| **9** | Đồng bộ máy thật, audit, quyền, backup và cổng AI | Hệ thống đáng tin trước khi tăng tự chủ |

Nên hoãn auto-send mọi kênh vì reply ngoài hệ thống và quyền gửi chưa chắc quan sát được; hoãn điểm số hộp đen vì khó ra quyết định và dữ liệu nhỏ; hoãn enrichment B2B vì không sát nhu cầu người mua nhà; hoãn dashboard đồ sộ vì tăng việc đọc mà chưa giảm việc làm. Voice agent gọi thay chỉ đáng thử sau khi có nhu cầu rõ, dữ liệu/kênh phù hợp và cách đo chất lượng quan hệ. Các mục này có thể hữu ích về sau, nhưng chưa nên đứng trước vòng chăm sóc cơ bản.

Nếu chỉ chọn một nguyên tắc để dẫn đường, hãy chọn: **mỗi tương tác hữu ích phải để lại trí nhớ đáng tin và một bước tiếp theo phù hợp, với ít thao tác nhất từ sale**. Khi vòng đó hoạt động, AI sẽ có dữ liệu để giúp tốt hơn; khi vòng đó chưa hoạt động, thêm agent thường chỉ tự động hóa sự rối rắm. Nghiên cứu này vì thế đề xuất một CRM chủ động chuẩn bị và dọn việc, còn Curtis giữ sự tinh tế trong hội thoại và quyền quyết định các bước quan trọng.

### Nguồn đọc tiếp theo mục đích

| Muốn đào sâu | Nguồn chính thức nên đọc trước |
|---|---|
| Thiết kế màn hình hành động | [Dynamics sales accelerator](https://learn.microsoft.com/en-us/dynamics365/sales/enable-configure-sales-accelerator), [Pipedrive Pulse](https://support.pipedrive.com/en/article/pulse), [FUB Smart Lists](https://help.followupboss.com/hc/en-us/articles/360034301034-Working-Your-Smart-Lists) |
| Chăm sóc biết dừng và giảm nhập liệu | [HubSpot sequence exit](https://knowledge.hubspot.com/sequences/unenroll-from-sequence), [folk voice note](https://help.folk.app/en/articles/15899229-record-a-voice-note), [Day AI custom properties](https://www.day.ai/resources/new-now-day-ai-fits-your-business) |
| Bất động sản và quan hệ nhiều người | [Lofty Assistant](https://help.lofty.com/hc/en-us/articles/33090360187675-AI-Assistant), [FUB Relationships](https://help.followupboss.com/hc/en-us/articles/1500008593181-Contact-Relationships-Overview) |
| Tích hợp Việt Nam | [Zalo Tin Tư vấn](https://oa.zalo.me/home/documents/guides/tin-tu-van), [ZBS 2026](https://zalo.solutions/news/thong-bao-hop-nhat-dinh-nghia-tin-uid-va-zns-thanh-zbs-template-message/cp1zx4bq8mzhhszgz0br1ocd), [Android call intents](https://developer.android.com/guide/components/intents-common.html), [Apple call log](https://developer.apple.com/forums/thread/808429) |
| Scoring và giới hạn dữ liệu | [HubSpot lead scores](https://knowledge.hubspot.com/scoring/build-lead-scores), [Dynamics scoring](https://learn.microsoft.com/en-us/dynamics365/sales/digital-selling-scoring), [Einstein lead scoring](https://help.salesforce.com/s/articleView?id=sf.einstein_sales_els_how_it_works.htm&language=en_US&type=5) |

