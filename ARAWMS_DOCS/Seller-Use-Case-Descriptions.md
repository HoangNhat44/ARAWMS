# Seller – Use Case Descriptions

Primary actor for every use case: **Seller**.
Common precondition for every use case: *Seller is logged in with the SELLER role.*
UI labels are quoted in Vietnamese exactly as they appear on screen.

---

# FT-08 – Conversational Commerce

## UC: View Customer's Information

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller looks up customer profiles (name, phone, email, delivery address, classification tags, total orders, total spending) to support sales and customer care.
**Preconditions:**
1. Seller is logged in.
2. At least one customer profile exists in the system.

**Normal Flow:**
1. Seller opens the "Khách hàng" (Customers) page.
2. System displays the paginated customer list with customer code, name, phone and address, tags, total orders and total spending.
3. Seller enters a keyword in the search box (name, phone, customer code CUST-…, email or address).
4. System filters and displays the matching customers.
5. Seller selects a customer.
6. System opens the customer drawer on the "Hồ sơ" (Profile) tab, showing contact details, addresses, tags and previous chat sessions with the customer.

**Alternative Flows:**
AF-01 – Filter list: Seller filters by classification tag or by customer source (Facebook Messenger / direct), and the system refreshes the list.
AF-02 – Sort list: Seller sorts by newest, total spending or total orders.
AF-03 – Open chat: Seller clicks the Messenger icon on a customer row and the system opens that customer's conversation.
AF-04 – No result: No customer matches the keyword, so the system shows "Không tìm thấy khách hàng nào phù hợp".

**Postconditions:** Seller sees up-to-date information of the selected customer. No data is changed.

---

## UC: Update Customer's Information

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller edits the profile of an existing customer (name, phone, email, delivery addresses, classification tags).
**Preconditions:**
1. Seller is logged in.
2. The customer profile exists and is open in the customer drawer or chat side panel.

**Normal Flow:**
1. Seller opens a customer profile (extends View Customer's Information).
2. Seller chooses to edit the profile.
3. Seller changes name, phone, email, addresses and/or tags.
4. Seller saves the changes.
5. System validates the data.
6. System saves the profile and records an audit log entry (before/after snapshot).
7. System refreshes the profile and the related conversation view in real time.

**Alternative Flows:**
AF-01 – Remove a tag: When Seller removes a tag from the customer, the system also removes that tag from all of the customer's conversations.
AF-02 – Customer not found: The profile was deleted meanwhile, so the system shows "Khách hàng không tồn tại".
AF-03 – Protected identity: The Facebook PSID (Messenger identity) cannot be changed. The system rejects the change with "Không thể thay đổi định danh Facebook PSID".

**Postconditions:** The customer profile holds the latest information, and the change is logged.

---

## UC: Create New Customer's Information

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller creates a new customer profile, either from the Customers page or from an open Messenger conversation with an unknown customer.
**Preconditions:**
1. Seller is logged in.

**Normal Flow:**
1. Seller chooses to add a new customer.
2. System displays the form: full name, phone, email, default delivery address, customer classification.
3. Seller enters the information and submits.
4. System checks that the full name is provided.
5. System generates a customer code (CUST-xxxxx), creates the profile with the default tag "Khách mới" if no tag is chosen, and records an audit log entry.
6. System adds the new customer to the list.

**Alternative Flows:**
AF-01 – Create from a conversation: When created from an open chat, the system links the new profile to that conversation.
AF-02 – Missing name: The full name is empty, so the system rejects the form with "Họ tên khách hàng là bắt buộc".

**Postconditions:** A new customer profile exists with a unique customer code, linked to the conversation if one was open.

---

## UC: View Customer's Order History

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller views all orders a customer has placed, to give advice, upsell, or handle complaints.
**Preconditions:**
1. Seller is logged in.
2. The customer profile is open.

**Normal Flow:**
1. Seller opens a customer profile.
2. Seller selects the "Đơn hàng" (Orders) tab in the customer drawer (or the order history block in the chat side panel).
3. System displays the customer's orders, newest first: order code, created date, status, items, total amount and the seller in charge.

**Alternative Flows:**
AF-01 – No orders: The customer has no orders, so the system shows an empty list.
AF-02 – Confirm a pending order: For an order in "Chờ xác nhận", Seller can click "Xác nhận chốt đơn" directly in the history (same rules as Update Order – AF-05).

**Postconditions:** Seller sees the full purchase history of the customer.

---

## UC: View Detail Customer's Orders

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller opens one order from the customer's history to see its full details.
**Preconditions:**
1. Seller is logged in.
2. The customer's order history is displayed.

**Normal Flow:**
1. Seller selects an order in the customer's order history.
2. System opens the order detail window showing:
   - order code, channel and created time;
   - items (SKU, product name, color, size, quantity, price);
   - recipient information;
   - financial summary (subtotal, shipping fee, discount, total);
   - payment method and payment status;
   - current status and status history;
   - GHN waybill code and GHN status, if any.

**Alternative Flows:**
AF-01 – Order not found: The order no longer exists, so the system shows "Đơn hàng không tồn tại".
AF-02 – Continue processing: From the detail window, Seller can continue with Update Order, Create A Return Order or Create An Exchange Order if the order status allows.

**Postconditions:** Seller sees complete details of the selected order. No data is changed.

---

## UC: View Conversations

**Primary Actors:** Seller
**Secondary Actors:** Facebook Messenger (Meta)
**Description:** Seller views Messenger conversations from the shop's Fanpage in a shared inbox that all sellers can see.
**Preconditions:**
1. Seller is logged in.
2. The Fanpage is connected to the system.

**Normal Flow:**
1. Seller opens "Hội Thoại & Bán Hàng" (Chat).
2. System displays the conversation list sorted by latest message: customer name, last message preview, time, tags and unread count.
3. Seller selects a conversation.
4. System displays the message history (text, images, videos, files, order notifications) and the customer profile panel.
5. System marks the conversation as read.
6. When a customer sends a new message, the system pushes it to the screen in real time.

**Alternative Flows:**
AF-01 – Search: Seller searches by customer name, phone, customer code or message content, and the system filters the list.
AF-02 – Filter: Seller filters by conversation status, by tag, or by "only my chats" (conversations assigned to the Seller).
AF-03 – Conversation not found: The system shows "Cuộc hội thoại không tồn tại".

**Postconditions:** Seller sees the latest conversations, and the opened conversation is marked as read.

---

## UC: Reply Conversations

**Primary Actors:** Seller
**Secondary Actors:** Facebook Messenger (Meta)
**Description:** Seller replies to a customer directly from the system. The message is delivered to the customer's Messenger.
**Preconditions:**
1. Seller is logged in.
2. A conversation is open (View Conversations).

**Normal Flow:**
1. Seller types a message in the chat box.
2. Seller sends the message.
3. System validates that the message is not empty.
4. System saves the message and sends it to Messenger through the Meta API.
5. System displays the message in the conversation with its delivery status.

**Alternative Flows:**
AF-01 – Send attachments:
1. Seller clicks the paperclip button and selects files: images, videos, PDF, Word, Excel or ZIP.
2. System displays the selected files, with a preview for images.
3. Seller may also type a caption.
4. Seller sends.
5. System sends the caption first, then each file, to the customer's Messenger, and displays them in the conversation.

AF-02 – Empty message: If Seller has not typed any text or selected any file, the Send button is disabled and nothing is sent.
AF-03 – Too many or too large files: The system rejects the selection and does not send:
- more than 5 files: "Chỉ được chọn tối đa 5 tệp mỗi lần";
- a file larger than 25 MB: "Tệp "…" vượt quá dung lượng 25MB cho phép".

AF-04 – Unsupported file type: The file type is not supported, so the system rejects it with "Định dạng tệp không được hỗ trợ: …".
AF-05 – Conversation not found: The conversation no longer exists, so the system shows "Cuộc hội thoại không tồn tại".

**Postconditions:** The reply (text and/or attachments) is stored in the conversation and sent to the customer's Messenger.

---

## UC: Manage Conversation Tags

*(To be updated later – this reflects current system behavior.)*

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller labels conversations with tags to classify customers and track their status (for example: new customer, waiting for transfer).
**Preconditions:**
1. Seller is logged in.
2. A conversation is open.

**Normal Flow:**
1. Seller opens the tag menu in the chat box.
2. System displays the available tags (default tags and custom tags).
3. Seller selects a tag to add to the conversation.
4. System attaches the tag and updates the conversation list.

**Alternative Flows:**
AF-01 – Remove tag: Seller removes a tag from the conversation, and the system updates the conversation list.
AF-02 – Create custom tag: Seller enters a new tag name, picks a color and clicks "Tạo". The system creates the tag and adds it to the conversation.
AF-03 – Empty tag name: If the tag name is empty, the "Tạo" button is disabled and nothing is created.
AF-04 – Duplicate tag: The tag name already exists, so the system rejects it with "Thẻ "…" đã tồn tại".

**Postconditions:** The conversation carries the updated tags, and the tag list is up to date.

---

## UC: View Product Available Quantity

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller checks real-time available stock of SKUs, in the chat widget or while creating an order, to know whether a product can be sold.
**Preconditions:**
1. Seller is logged in.

**Normal Flow:**
1. Seller opens the stock lookup widget (chat side panel or the product picker in the order form).
2. Seller enters a keyword: product name, product code, category, SKU code, barcode, style, color or size.
3. System searches active SKUs and calculates **available quantity = on-hand − reserved**.
4. System displays up to 50 results (24 when no keyword is entered), items in stock first. Each result shows image, product name, SKU, color, size, price, available quantity and stock status:
   - **Còn hàng** (in stock);
   - **Sắp hết** (low stock: at or below the safety threshold, default 10);
   - **Hết hàng** (out of stock: 0 available).

**Alternative Flows:**
AF-01 – No result: No SKU matches, so the system shows an empty result.
AF-02 – Add to order: While creating or editing an order, Seller adds a SKU from the result directly to the order. The system warns if the quantity exceeds the available stock.

**Postconditions:** Seller knows the current available quantity of the searched products. No data is changed.

---

# FT-09 – Order Fulfillment

## UC: Create Order

**Primary Actors:** Seller
**Secondary Actors:** Facebook Messenger (Meta), GHN (shipping carrier)
**Description:** Seller creates a sales order. There are two kinds of order: an **online order** (delivered by GHN), or a **POS order** (sold at the counter). An online order can be confirmed immediately (automatic confirmation) or left waiting for customer confirmation (manual confirmation later).
**Preconditions:**
1. Seller is logged in.
2. The products to sell exist as active SKUs.

**Normal Flow (online order, confirm immediately):**
1. Seller clicks "Tạo đơn" on the Orders page, or opens the quick order panel inside a chat.
2. System displays the order form.
3. Seller selects or creates the customer.
4. Seller adds products and quantities (includes View Product Available Quantity).
5. Seller enters the recipient's name, phone and address, the shipping fee (default 30,000 VND) and the discount.
6. System calculates the total: subtotal + shipping fee − discount.
7. Seller clicks "Tạo & Chốt đơn ngay".
8. System validates the recipient, phone, items and available stock.
9. System creates the order in status "Đã xác nhận, đã giữ hàng" (CONFIRMED_RESERVED) and reserves stock for each SKU.
10. System creates the GHN waybill and sends an order confirmation message to the customer's Messenger.
11. System adds the order to the order list.

**Alternative Flows:**
AF-01 – Wait for customer confirmation: Seller clicks "Chờ khách xác nhận". The system creates the order in "Chờ xác nhận" (PENDING) without reserving stock or creating a waybill. If the order comes from a chat, the system sends an order confirmation slip to the customer's Messenger. Seller later confirms the order manually (Update Order – AF-05).
AF-02 – POS order: Seller chooses the "Tại quầy POS" channel and clicks "Xuất Kho & Thanh Toán Ngay". The system checks available stock, deducts on-hand stock immediately, and creates the order in "Hoàn thành (Bán tại quầy)" (COMPLETED), marked as paid. The shipping fee is 0.
AF-03 – Missing recipient information (online order): The system does not create the order and shows the missing field:
- "Vui lòng nhập Họ và tên người nhận ở mục "Thông tin người nhận hàng".";
- "Vui lòng nhập Số điện thoại người nhận ở mục "Thông tin người nhận hàng".";
- "Vui lòng nhập Địa chỉ giao hàng chi tiết ở mục "Thông tin người nhận hàng".".

AF-04 – Invalid phone (online order): The system shows "Số điện thoại không đúng định dạng. Vui lòng nhập đúng 10 chữ số (đầu số 03, 05, 07, 08, 09) ở mục "Số điện thoại"."
AF-05 – No product: While no product has been added, the create buttons are disabled.
AF-06 – Inactive SKU: A selected SKU was deactivated before the order was submitted. The system rejects with "Sản phẩm SKU … không tồn tại hoặc đã ngừng kinh doanh".
AF-07 – Not enough stock:
- When confirming immediately, the system shows "Không thể tạo và chốt đơn ngay: sản phẩm … không đủ tồn khả dụng (còn …, cần …). Vui lòng chọn "Chờ khách xác nhận" hoặc điều chỉnh số lượng."
- For a POS order, the system shows "Sản phẩm … không đủ tồn khả dụng tại quầy (Tồn khả dụng: …, Cần: …)".

AF-08 – Stock taken by another order at the same moment (confirm immediately): The system rejects with "Sản phẩm … vừa có đơn khác chốt trước và không còn đủ tồn khả dụng."

**Postconditions:** A new order exists with a unique order code. Depending on the choice, it is in one of three states:
- confirmed, with stock reserved and a GHN waybill;
- pending customer confirmation;
- completed at the POS, with stock deducted.

---

## UC: Update Order

**Primary Actors:** Seller
**Secondary Actors:** Facebook Messenger (Meta), GHN (shipping carrier)
**Description:** Seller processes an existing order from the order detail window. Seller can edit products, edit the recipient, manually confirm a pending order, or cancel the order.
**Preconditions:**
1. Seller is logged in.
2. The order exists. Seller can see orders of all sellers and filter or sort by seller.

**Normal Flow (edit products):**
1. Seller opens the Orders page, finds the order (search or filter) and opens its detail.
2. System displays the order detail. For an order in "Chờ xác nhận", the product section shows "Cho phép sửa khi chờ xác nhận".
3. Seller changes the quantity of a product or removes a product line.
4. Seller clicks "Lưu thay đổi sản phẩm".
5. System checks that the order is still in "Chờ xác nhận" and that the SKUs are still active.
6. System saves the items, recalculates the totals and shows "Đã lưu thay đổi sản phẩm và tính lại tổng tiền đơn hàng thành công!".

**Alternative Flows:**
AF-01 – Order already confirmed: Products can only be edited while the order is "Chờ xác nhận". After confirmation, the product section shows "Đã chốt đơn - Khóa sửa sản phẩm" and cannot be edited.
AF-02 – Remove the last product: An order must keep at least one product. The system shows "Đơn hàng phải chứa ít nhất 1 sản phẩm. Nếu không muốn lấy, vui lòng hủy đơn."
AF-03 – Edit recipient: Seller clicks "Sửa" (or "Bổ sung thông tin thật" when the data is masked with *), edits the recipient's name, phone and address, and saves.
- The button only appears from "Chờ xác nhận" up to "Đã đóng hàng, chờ bàn giao", and only while GHN has not yet picked up the parcel.
- If a draft waybill was created with the old data, the system cancels and resets it so a new one can be created with the correct data.
- On success, the system shows "Đã cập nhật thông tin người nhận thành công!".

AF-04 – Invalid recipient data: The system rejects the change with one of these messages:
- "Vui lòng nhập Họ tên người nhận thật (không chứa ký tự che *).";
- "Vui lòng nhập Số điện thoại thật (không chứa ký tự che *).";
- "Số điện thoại người nhận không đúng định dạng Việt Nam (10 chữ số, đầu số 03, 05, 07, 08, 09).";
- "Vui lòng nhập Địa chỉ giao hàng chi tiết thật (tối thiểu 5 ký tự, không chứa ký tự che *).".

AF-05 – Manual confirmation: For an order in "Chờ xác nhận", Seller clicks "Xác nhận chốt đơn".
- The system checks available stock, reserves it and moves the order to "Đã xác nhận, đã giữ hàng".
- The system shows "Đã xác nhận chốt đơn và kích hoạt giữ chỗ tồn kho thành công!".
- If stock is insufficient, the system shows "Không thể chốt đơn …: sản phẩm … không đủ tồn khả dụng (còn …, khách đặt …, thiếu …). Hướng dẫn: (1) báo khách thời gian chờ hàng, (2) giảm số lượng hoặc đổi sang SKU/size khác ở mục chỉnh sửa đơn, hoặc (3) liên hệ Kho để nhập thêm hàng rồi chốt lại."

AF-06 – Send confirmation slip: For a Facebook order in "Chờ xác nhận", Seller clicks "Gửi phiếu vào Chat" to send the order summary to the customer's Messenger. The system shows "Đã gửi phiếu xác nhận chốt đơn vào khung chat Messenger của khách!".
AF-07 – Cancel order:
1. Seller clicks "Hủy Đơn Hàng". The button only appears for "Chờ xác nhận", "Đã xác nhận, đã giữ hàng" or "Đang soạn hàng", and only before the shipper picks up the parcel.
2. System opens the "Xác nhận hủy đơn hàng" dialog and asks Seller to check with the customer first.
3. Seller enters the cancellation reason and ticks "Tôi xác nhận đã hỏi và thống nhất với khách hàng trước khi hủy đơn này". The "Xác nhận hủy đơn" button stays disabled until both are done.
4. Seller clicks "Xác nhận hủy đơn".
5. System sets the order to "Đã hủy", releases reserved stock, cancels the GHN waybill if one exists, and notifies the customer in chat.
6. System shows "Đã hủy đơn hàng và giải phóng tồn kho giữ chỗ thành công!".

AF-08 – Ask the customer before cancelling: For a Facebook order, inside the cancel dialog, Seller clicks "Gửi tin hỏi xác nhận hủy vào Chat". The system sends the question, including the entered reason, to the customer's Messenger, and shows "Đã gửi tin nhắn hỏi xác nhận hủy vào khung chat Messenger của khách!".
AF-09 – Parcel picked up meanwhile: GHN picks up the parcel while the cancel dialog is open. The system rejects the cancellation with "Không thể hủy đơn hàng vì shipper đã lấy kiện hàng đi giao…".

**Postconditions:** The order reflects the change (new items, new recipient, confirmed with stock reserved, or cancelled with stock released). The change is recorded in the order's status history and in the audit log.

---

## UC: Import Marketplace Orders via Excel

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller imports many orders at once from e-commerce marketplaces (Shopee, TikTok Shop) or from a custom Excel file, instead of typing each order.
**Preconditions:**
1. Seller is logged in.
2. Seller has an Excel file exported from the marketplace, or a file filled from the system template.

**Normal Flow:**
1. Seller clicks "Import đơn Excel" on the Orders page.
2. System displays the import window with the list of sales channels.
3. Seller selects the channel (Shopee, TikTok Shop or custom Excel).
4. Seller uploads the Excel file.
5. System reads the file and displays a preview of each order: marketplace order code, customer, products, total. The preview also marks orders that were already imported and products that do not match any SKU.
6. Seller selects the orders to import and confirms.
7. System matches every product line to an active SKU.
8. System creates or reuses the customer, then creates each valid order directly in "Đã xác nhận, đã giữ hàng" with stock reserved. The order keeps the marketplace order code and the source name.
9. System reports the number of orders created and lists the skipped orders with the reason for each.

**Alternative Flows:**
AF-01 – Download template: Seller downloads the Excel template of the selected channel before filling the data.
AF-02 – Skipped order: An order is skipped entirely (no partial order is created) for any of these reasons:
- "Sản phẩm "…" chưa khớp SKU trong kho" (a product line does not match a SKU);
- "SKU … đã ngừng bán" (the SKU is inactive);
- "Đơn không có sản phẩm" (the order has no products).

AF-03 – Duplicate order: The marketplace order code was imported before. The preview warns "Mã đơn sàn … đã được import trước đó (…)".
AF-04 – Invalid file: The system rejects it with "File Excel rỗng hoặc không có bảng tính hợp lệ" or "Không tìm thấy dữ liệu đơn hàng trong file Excel…".
AF-05 – Nothing selected: The system shows "Không có đơn hàng hợp lệ nào được chọn để xử lý".
AF-06 – Masked customer data: Marketplace data hides the phone or address (***). Seller must complete the real recipient information (Update Order – AF-03) before the GHN waybill can be created.

**Postconditions:** Valid marketplace orders exist in the system, confirmed and with stock reserved. Skipped orders are reported to the Seller.

---

## UC: Export List Order

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller exports the order list to a CSV file that opens in Excel with correct Vietnamese characters, for reporting or for sharing with other departments.
**Preconditions:**
1. Seller is logged in.
2. The Orders page is displaying at least one order.

**Normal Flow:**
1. Seller filters the order list as needed (status, channel, seller, keyword).
2. Seller clicks "Xuất danh sách".
3. System builds a CSV file (UTF-8) of the orders currently displayed. The columns are:
   - order code, waybill code, channel, created time, last updated time;
   - customer name, phone, telecom carrier, delivery address;
   - product details;
   - subtotal, shipping fee, discount, total;
   - payment method, payment status, order status, internal notes.
4. System downloads the file (don-hang-ara-<channel>-<date>.csv) and shows a success message with the number of exported orders.

**Alternative Flows:**
AF-01 – Export selected orders: Seller ticks some orders and clicks "Xuất file đã chọn". The system exports only those orders.
AF-02 – Nothing to export: The list is empty, so the system shows "Không có đơn hàng nào để xuất file".

**Postconditions:** A CSV file with the chosen orders is saved on the Seller's computer. No data in the system is changed.

---

# FT-10 – Reverse Logistics

## UC: Create A Return Order

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller creates a return request (RMA) of type "Trả Hàng Hoàn Tiền" when a customer returns products from a delivered order and wants a refund.
**Preconditions:**
1. Seller is logged in.
2. The original order is in "Đã giao thành công" (DELIVERED) or "Hoàn thành (Bán tại quầy)" (COMPLETED).
3. The order has no other return/exchange request in progress.

**Normal Flow:**
1. Seller opens the return window: click "Đổi / Trả" on the Orders page and search the order by code, phone or name, or click "Tạo Đổi / Trả Hàng" in the order detail.
2. System displays the original order.
3. Seller chooses "Trả Hàng Hoàn Tiền".
4. Seller ticks the products and enters the quantity to return.
5. Seller selects or types the return reason.
6. Seller enters the refund bank account: bank, account number and account holder.
7. System classifies the fault and calculates the refund:
   - store fault (fabric defect, loose stitching, wrong item, damaged in transit): full refund;
   - customer fault (wrong size, changed mind…): a 10% fee is deducted.
8. Seller submits.
9. System creates the RMA in "Chờ xử lý" (REQUESTED) and changes the original order to "Khách yêu cầu trả hàng" (RETURN_REQUESTED).
10. System shows "Đã Tiếp Nhận Yêu Cầu Đổi / Trả Hàng!" with the request code ("Mã phiếu"). The original order now appears in the Garment Technician's return inspection list, ready for the returned parcel to be scanned.

**Alternative Flows:**
AF-01 – Order not eligible: The order has not been delivered. The system rejects with "Không thể tạo yêu cầu đổi trả vì đơn hàng … chưa giao thành công…".
AF-02 – Request already in progress: The system shows "Đơn … đã có phiếu … đang xử lý…".
AF-03 – Quantity exceeded: The return quantity is greater than the quantity still returnable (bought minus already returned). The system shows the allowed quantity.
AF-04 – Missing data: The system rejects with one of these messages:
- no product selected ("Yêu cầu đổi/trả phải có ít nhất một sản phẩm…");
- no reason ("Vui lòng nhập lý do đổi hoặc trả hàng rõ ràng.");
- incomplete bank information ("Thiếu thông tin tài khoản nhận hoàn tiền…").

**Postconditions:** A refund-type RMA exists in "Chờ xử lý", and the original order is marked "Khách yêu cầu trả hàng". The Garment Technician can then receive and inspect the returned parcel. Seller can continue with Send Payment Request To Accountant.

---

## UC: Send Payment Request To Accountant

**Primary Actors:** Seller
**Secondary Actors:** Accountant
**Description:** Seller sends the refund of a return request to the Accountant for approval and payment. Seller never refunds the customer directly.
**Preconditions:**
1. Seller is logged in.
2. A refund-type RMA exists (Create A Return Order) with the refund bank account filled in.

**Normal Flow:**
1. After the return request is created, the system shows the result screen with the note "Seller không tự hoàn tiền".
2. Seller clicks "Gửi yêu cầu hoàn tiền cho Kế toán".
3. System checks the RMA type, its status, the bank account and the refund amount.
4. System sets the refund request to "Chờ Kế toán duyệt" (PENDING_ACCOUNTANT) and notifies the Accountant.
5. System confirms "Đã gửi yêu cầu hoàn tiền cho Kế toán".
6. The Accountant then approves the request and creates a payment voucher, or rejects it with a reason.

**Alternative Flows:**
AF-01 – Exchange request: The request is an exchange, so no refund applies. The system rejects with "…là phiếu ĐỔI HÀNG nên không phát sinh hoàn tiền…".
AF-02 – Already sent or approved: The system shows "…đang chờ Kế toán duyệt…" or "…đã được Kế toán duyệt và lập phiếu chi. Không cần gửi lại."
AF-03 – Request closed: The RMA is rejected or completed, so the refund request cannot be sent.
AF-04 – Missing bank account: The system shows "…thiếu thông tin tài khoản nhận hoàn tiền…".
AF-05 – Zero refund: The refund amount is 0, so no request is needed.
AF-06 – Rejected by Accountant: Seller corrects the information (for example the account number) and sends the request again.

**Postconditions:** The refund request is waiting for Accountant approval, and the Accountant is notified.

---

## UC: Create An Exchange Order

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller handles a product exchange (different size, color or model). The system creates an exchange request and a new order for the replacement products. The returned products are later received and inspected by the Garment Technician.
**Preconditions:**
1. Seller is logged in.
2. The original order is in "Đã giao thành công" or "Hoàn thành (Bán tại quầy)".
3. The order has no other return/exchange request in progress.

**Normal Flow:**
1. Seller opens the exchange window. Seller either clicks "Đổi / Trả" on the Orders page and finds the original order with "Tìm đơn", or clicks "Tạo Đổi / Trả Hàng" in the order detail.
2. In "2. Hình thức xử lý", Seller chooses "Đổi Sản Phẩm Mới".
3. In "3. Chọn sản phẩm cần đổi trong đơn", Seller ticks the products to exchange and enters the quantities.
4. In "4. Chọn sản phẩm mới gửi cho khách", Seller searches for and adds the replacement products (includes View Product Available Quantity).
5. System shows the old and new totals and the price difference: "Khách bù thêm …", "Hoàn lại khách …" or "Ngang giá".
6. Seller enters "Họ tên người đổi / trả" (written in capitals automatically) and selects the "Lý do đổi / trả hàng" (a common reason, or "Lý do khác…" with a description).
7. Seller clicks "Tạo Phiếu Đổi / Trả Hàng".
8. System creates the exchange request (RMA) in "Chờ xử lý", and changes the original order to "Đang đổi hàng".
9. System creates a new exchange order in "Đã xác nhận, đã giữ hàng". The order reserves stock for the replacement products, is delivered to the original order's address, and has a shipping fee of 0.
10. System shows "Đã Tiếp Nhận Yêu Cầu Đổi / Trả Hàng!" with the request code ("Mã phiếu") and the new order code ("Mã đơn mới").

**Alternative Flows:**
AF-01 – No order selected: The system shows "Vui lòng chọn một đơn hàng để thực hiện đổi/trả".
AF-02 – No product to exchange: Seller has not entered a quantity for any product of the original order. The system shows "Vui lòng chọn số lượng ít nhất một sản phẩm cần hoàn/đổi".
AF-03 – No replacement product: The system shows "Khi đổi sản phẩm, vui lòng chọn ít nhất một sản phẩm mới thay thế".
AF-04 – Out-of-stock replacement: In the replacement search, each SKU shows its available quantity ("Còn …"). Out-of-stock SKUs are labelled "Hết hàng" and cannot be selected, and the quantity cannot exceed the available stock.
AF-05 – Order not eligible: The original order has not been delivered. The system shows "Không thể tạo yêu cầu đổi trả vì đơn hàng … chưa giao thành công. Chức năng đổi hoặc trả hàng chỉ có thể thực hiện khi khách hàng đã nhận được sản phẩm thành công nhằm đảm bảo có sản phẩm thực tế để kiểm tra và đối chiếu."
AF-06 – Request already in progress: The system shows "Đơn … đã có phiếu … đang xử lý. Hướng dẫn: hoàn tất hoặc từ chối phiếu đó trước khi tạo phiếu mới."
AF-07 – Quantity exceeded: The system shows "Sản phẩm …: số lượng yêu cầu trả là …, vượt quá số lượng còn được phép trả là … trong tổng số … sản phẩm đã mua, số lượng đã trả trước đó là …. Hướng dẫn: giảm số lượng trả xuống bằng hoặc thấp hơn số còn lại."

**Postconditions:**
1. An exchange request (RMA) exists in "Chờ xử lý".
2. The original order is marked "Đang đổi hàng" and appears in the Garment Technician's return inspection list, ready for the returned parcel to be scanned.
3. A new exchange order is created in "Đã xác nhận, đã giữ hàng", with stock reserved for the replacement products. Its order code is shown on the result screen ("Mã đơn mới").
