# FT-08 Conversational Commerce – Use Case Descriptions

Actor of this feature: **Seller**. Other roles have no screen for these functions.
Common precondition for every use case: *Seller is logged in with the SELLER role.*
Only button labels are quoted in Vietnamese exactly as they appear on screen; screens, forms, fields and messages are described in English.

Customer messages arrive from the shop's Facebook Fanpages through the Messenger webhook. The system creates the customer profile and the conversation automatically; this is not a use case of its own but the data source of View Conversations.

| UC-ID | Use Case | Primary Actor | Secondary Actor | Status |
|---|---|---|---|---|
| UC-076 | Create New Customer's Information | Seller | — | Implemented |
| UC-077 | View Customer's Information | Seller | — | Implemented |
| UC-078 | Update Customer's Information | Seller | — | Implemented |
| UC-079 | View Customer's Order History | Seller | — | Implemented |
| UC-080 | View Detail Customer's Orders | Seller | — | Implemented |
| UC-081 | View Conversations | Seller | Facebook Messenger | Implemented |
| UC-082 | Reply Conversations | Seller | Facebook Messenger, Customer | Implemented |
| UC-083 | View Product Available Quantity | Seller | — | Implemented |
| UC-084 | Add Tag | Seller | — | Implemented |
| UC-085 | Update Tag | Seller | — | Planned (tag configuration page not developed) |
| UC-086 | Delete Tag | Seller | — | Planned (API exists, no UI yet) |

---

## UC-076: Create New Customer's Information

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller creates a new customer profile from the customers page, for a customer who buys outside Messenger (for example by phone or at the shop).
**Preconditions:**
1. Seller is logged in.

**Normal Flow:**
1. Seller opens the customers page and clicks "Thêm khách hàng mới".
2. The system opens the new customer form: full name, phone, email, default delivery address and customer classification.
3. Seller enters the information and clicks "Lưu khách hàng".
4. The system checks that the full name is provided.
5. The system generates a customer code (CUST-xxxxx), creates the profile with the tag "new customer" when no classification is chosen, and records an audit log entry.
6. The system adds the new customer to the list.

**Alternative Flows:**
**Step 3.1_Cancel**  
Seller clicks "Hủy" instead of saving.  
System closes the form without creating a customer, and the use case ends.

**Step 4.1_Missing Name**  
System validates that the full name is empty.  
System shows that the customer name is required and does not save.  
The use case returns to step 3.

**Postconditions:** A new customer profile exists with a unique customer code.

---

## UC-077: View Customer's Information

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller looks up customer profiles (name, phone, email, delivery addresses, classification tags, total orders, total spending) and the customer's interaction history, to support sales and customer care.
**Preconditions:**
1. Seller is logged in.
2. At least one customer profile exists.

**Normal Flow:**
1. Seller opens the customers page.
2. The system shows the paginated customer list with customer code, name, phone, address, tags, total orders and total spending.
3. Seller enters a keyword (name, phone, customer code, email or address).
4. The system shows the matching customers.
5. Seller selects a customer.
6. The system opens the customer drawer on the profile tab with contact details, addresses and tags.
7. The system shows the customer's interaction history: previous chat sessions with time and the seller in charge.

**Alternative Flows:**
**Step 1.1_View In Chat**  
Seller opens a conversation on the chat page instead of the customers page.  
System shows the same profile and interaction history of that customer in the side panel.  
The use case ends.

**Step 3.1_Filter And Sort**  
Seller filters by classification tag or customer source (Facebook Messenger or direct), and sorts by newest, total spending or total orders.  
System refreshes the list.  
The use case continues at step 5.

**Step 3.2_Clear Search**  
Seller clicks the clear button in the search box.  
System removes the keyword and shows the full list again.  
The use case returns to step 2.

**Step 4.1_No Result**  
System finds no customer matching the keyword.  
System shows that no customer was found.  
The use case returns to step 3.

**Step 5.1_Open Chat**  
Seller clicks the Messenger icon on a customer row instead of selecting the customer.  
System opens that customer's conversation (UC-081), and the use case ends.

**Postconditions:** Seller sees the latest information of the customer. No data is changed.

---

## UC-078: Update Customer's Information

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller edits the profile of an existing customer (name, phone, email, delivery addresses, classification tags).
**Preconditions:**
1. Seller is logged in.
2. The customer profile is open in the customer drawer or the chat side panel (UC-077).

**Normal Flow:**
1. Seller clicks "Chỉnh sửa hồ sơ".
2. The system turns the profile into an edit form with the current data.
3. Seller changes the name, phone, email, addresses and/or classification tags.
4. Seller clicks "Lưu thay đổi".
5. The system validates the data, saves the profile and records an audit log entry with the data before and after.
6. The system refreshes the profile and the related conversation in real time.

**Alternative Flows:**
**Step 1.1_Quick Tag**  
Seller clicks a quick classification tag (new customer, returning customer, VIP, needs advice) on the profile instead of editing.  
System adds or removes the tag immediately; "new customer" and "returning customer" replace each other.  
System saves the profile and records an audit log entry, and the use case ends.

**Step 4.1_Cancel**  
Seller clicks "Hủy sửa" instead of saving.  
System discards the changes and shows the profile again, and the use case ends.

**Step 5.1_Protected Identity**  
System validates that the change touches the customer's Facebook Messenger identity.  
System rejects the change.  
The use case returns to step 3.

**Step 5.2_Customer Not Found**  
System validates that the profile no longer exists.  
System shows an error, and the use case ends.

**Step 5.3_Tag Removed**  
Seller removed a classification tag from the customer.  
System also removes that tag from the customer's conversations.  
The use case continues at step 6.

**Postconditions:** The customer profile holds the latest information, and the change is logged.

---

## UC-079: View Customer's Order History

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller views all orders a customer has placed, to give advice, upsell or handle complaints.
**Preconditions:**
1. Seller is logged in.
2. The customer profile is open (UC-077).

**Normal Flow:**
1. Seller selects the orders tab in the customer drawer, or the order history block in the chat side panel.
2. The system shows the customer's orders, newest first: order code, created date, status, items, total amount and the seller in charge.

**Alternative Flows:**
**Step 2.1_No Orders**  
The customer has no orders.  
System shows that the customer has no orders yet, and the use case ends.

**Step 2.2_Confirm A Pending Order**  
An order is waiting for confirmation.  
Seller clicks "Xác nhận đơn" on that order.  
System confirms the order with the same rules as Update Order and refreshes the history.  
The use case ends.

**Step 2.3_Return Or Exchange**  
An order is delivered or completed.  
Seller clicks "Đổi / Trả" on that order.  
System opens the return or exchange form (FT-10), and the use case ends.

**Postconditions:** Seller sees the full purchase history of the customer.

---

## UC-080: View Detail Customer's Orders

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller opens one order from the customer's order history to see its full details.
**Preconditions:**
1. Seller is logged in.
2. The customer's order history is shown (UC-079).

**Normal Flow:**
1. Seller clicks "Chi tiết" on an order.
2. The system opens the order detail window with:
   - order code, sales channel and created time;
   - items (SKU, product name, color, size, quantity, price);
   - recipient information;
   - financial summary (subtotal, shipping fee, discount, total);
   - payment method and payment status;
   - current status and status history;
   - GHN waybill code and GHN status, if any.

**Alternative Flows:**
**Step 2.1_Order Not Found**  
System cannot find the order.  
System shows an error, and the use case ends.

**Step 2.2_Continue Processing**  
The order status allows further processing.  
From the detail window, Seller continues with Update Order, Create A Return Order or Create An Exchange Order.  
The use case ends.

**Postconditions:** Seller sees the complete details of the order. No data is changed.

---

## UC-081: View Conversations

**Primary Actors:** Seller
**Secondary Actors:** Facebook Messenger (Meta)
**Description:** Seller views the Messenger conversations of the shop's Fanpages in a shared inbox. Opening a conversation marks it as read.
**Preconditions:**
1. Seller is logged in.
2. At least one Fanpage is connected to the system.

**Normal Flow:**
1. Seller opens the chat page.
2. The system shows the conversation list sorted by latest message: customer name, last message preview, time, tags and unread count.
3. Seller selects a conversation.
4. The system shows the message history (text, images, videos, files, order notices) and the customer profile panel.
5. The system marks the conversation as read and clears its unread count.
6. When a customer sends a new message, the system receives it from Messenger and shows it on screen in real time.

**Alternative Flows:**
**Step 2.1_Search**  
Seller searches by customer name, phone, customer code or message content.  
System filters the conversation list.  
The use case continues at step 3.

**Step 2.2_Filter**  
Seller filters by conversation status, by tag, or by conversations assigned to them.  
System filters the conversation list.  
The use case continues at step 3.

**Step 4.1_Hide Or Show Panels**  
Seller clicks the toggle buttons to hide or show the conversation list or the order panel.  
System hides or shows the panel.  
The use case continues at step 5.

**Step 4.2_Conversation Not Found**  
System cannot find the conversation.  
System shows that the conversation does not exist, and the use case ends.

**Postconditions:** Seller sees the latest conversations, and the opened conversation is marked as read.

---

## UC-082: Reply Conversations

**Primary Actors:** Seller
**Secondary Actors:** Facebook Messenger (Meta), Customer
**Description:** Seller replies to a customer from the system. The message is delivered to the customer's Messenger.
**Preconditions:**
1. Seller is logged in.
2. A conversation is open (UC-081).

**Normal Flow:**
1. Seller types a message in the chat box.
2. Seller clicks the send button (or presses Enter).
3. The system checks that the message is not empty.
4. The system saves the message and sends it to the customer through the Messenger API.
5. The system shows the message in the conversation with its delivery status.

**Alternative Flows:**
**Step 1.1_Send Attachments**  
Seller clicks the attachment button and selects files: images, videos, PDF, Word, Excel or ZIP.  
System shows the selected files, with a preview for images.  
Seller may type a caption and clicks the send button.  
The use case continues at step 3; in step 4 the system sends the caption first, then each file.

**Step 1.2_Send A Product**  
In the stock lookup (UC-083), Seller clicks "Gửi đính kèm vào khung Chat" on a product.  
System sends the product information to the customer's Messenger.  
The use case continues at step 5.

**Step 2.1_Empty Message**  
Seller has not typed any text or selected any file.  
The send button is disabled, and nothing is sent.  
The use case returns to step 1.

**Step 3.1_Too Many Or Too Large Files**  
System validates that more than 5 files are selected, or a file is larger than 25 MB.  
System rejects the selection.  
The use case returns to step 1.

**Step 3.2_Unsupported File Type**  
System validates that a file type is not supported.  
System rejects the file.  
The use case returns to step 1.

**Step 4.1_Conversation Not Found**  
System cannot find the conversation.  
System shows that the conversation does not exist, and the use case ends.

**Postconditions:** The reply is stored in the conversation and delivered to the customer's Messenger.

---

## UC-083: View Product Available Quantity

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller checks the real-time available stock of SKUs, in the chat side panel or while creating an order, to know whether a product can be sold.
**Preconditions:**
1. Seller is logged in.

**Normal Flow:**
1. Seller opens the stock lookup in the chat side panel, or the product picker in the order form.
2. Seller enters a keyword: product name, product code, category, SKU code, barcode, style, color or size.
3. The system searches active SKUs and calculates available quantity = on-hand − reserved.
4. The system shows up to 50 results (24 without a keyword), in-stock items first. Each result shows image, product name, SKU, color, size, price, available quantity and stock status: in stock, low stock (at or below the safety threshold, default 10) or out of stock.

**Alternative Flows:**
**Step 4.1_No Result**  
System finds no SKU matching the keyword.  
System shows an empty result.  
The use case returns to step 2.

**Step 4.2_Add To Order**  
Seller clicks "Thêm vào đơn hàng nhanh" on a result.  
System adds the SKU to the quick order and warns if the quantity exceeds the available stock.  
The use case ends.

**Step 4.3_Send To Customer**  
Seller clicks "Gửi đính kèm vào khung Chat" on a result.  
System sends the product information to the open conversation (UC-082), and the use case ends.

**Postconditions:** Seller knows the current available quantity of the products. No data is changed.

---

## UC-084: Add Tag

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller attaches a tag to a conversation to classify the customer and track the conversation (for example new customer, waiting for transfer). Seller can also create a new tag and attach it at once.
**Preconditions:**
1. Seller is logged in.
2. A conversation is open (UC-081).

**Normal Flow:**
1. The system shows the available tags (default and custom) in the chat box.
2. Seller clicks a tag that is not attached yet.
3. The system attaches the tag to the conversation and updates the conversation list.

**Alternative Flows:**
**Step 2.1_Remove From Conversation**  
Seller clicks a tag that is already attached to the conversation.  
System removes the tag from the conversation and updates the conversation list.  
The use case ends.

**Step 2.2_Create A New Tag**  
Seller clicks "Thêm thẻ".  
System opens the new tag form.  
Seller enters the tag name, chooses a color and clicks "Tạo".  
System creates the tag and attaches it to the conversation.  
The use case continues at step 3.

**Step 2.3_Empty Tag Name**  
Seller has not entered a tag name in the new tag form.  
The button "Tạo" stays disabled.  
The use case returns to step 2.

**Step 2.4_Duplicate Tag**  
System validates that the tag name already exists.  
System shows an error and does not create the tag.  
The use case returns to step 2.

**Postconditions:** The conversation carries the updated tags, and new tags are available for every conversation.

---

## UC-085: Update Tag

*(Planned – the tag configuration page is not developed yet. This describes the intended design.)*

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller manages the tag list on a separate tag configuration page and changes the name or color of a tag. Tags are used for both conversations and customer profiles, so a change applies everywhere the tag is attached.
**Preconditions:**
1. Seller is logged in.
2. The tag exists.

**Normal Flow:**
1. Seller opens the tag configuration page.
2. The system lists all tags with name, color, type (default or custom) and the number of conversations and customers using each tag.
3. Seller clicks the edit button on a tag.
4. The system opens the edit form with the current name and color.
5. Seller changes the name and/or color and clicks the save button.
6. The system checks the data, saves the tag, updates the tag on every conversation and customer profile that uses it, and shows a success message.

**Alternative Flows:**
**Step 4.1_Default Tag**  
The selected tag is a default system tag.  
System opens the edit form with the name locked; only the color can be changed.  
The use case continues at step 5.

**Step 5.1_Cancel**  
Seller closes the form instead of saving.  
System changes nothing, and the use case ends.

**Step 6.1_Empty Name**  
System validates that the tag name is empty.  
System asks for a tag name and does not save.  
The use case returns to step 5.

**Step 6.2_Duplicate Name**  
System validates that another tag already has this name.  
System shows an error and does not save.  
The use case returns to step 5.

**Postconditions:** The tag has its new name and color on every conversation and customer profile.

---

## UC-086: Delete Tag

*(Planned – the delete API exists but there is no button in the UI yet. This describes the intended design.)*

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller deletes a custom tag that is no longer used from the tag configuration page. The tag is removed from the tag list and from every conversation and customer profile.
**Preconditions:**
1. Seller is logged in.
2. The tag exists and is a custom tag.

**Normal Flow:**
1. Seller opens the tag configuration page.
2. Seller clicks the delete button on a custom tag.
3. The system asks for confirmation and shows how many conversations and customers use the tag.
4. Seller confirms.
5. The system deletes the tag, removes it from every conversation and customer profile, and shows a success message.

**Alternative Flows:**
**Step 2.1_Default Tag**  
The tag is a default system tag.  
The delete button is not available for it, and the use case ends.

**Step 4.1_Cancel**  
Seller does not confirm the deletion.  
System closes the confirmation and deletes nothing, and the use case ends.

**Step 5.1_Tag Not Found**  
System validates that the tag was already deleted.  
System shows an error and refreshes the tag list, and the use case ends.

**Postconditions:** The tag no longer exists and is not attached to any conversation or customer profile.

---

## Notes – code differences to resolve

1. **Roles in the backend:** The conversation and customer APIs also accept OWNER and WAREHOUSE_MANAGER; the stock lookup also accepts WAREHOUSE_MANAGER and WAREHOUSE_STAFF; order detail also accepts ACCOUNTANT. None of these roles has a screen for FT-08.
2. **Update Tag:** No API and no page yet.
3. **Delete Tag:** `DELETE /conversations/tags/:tagId` exists but the UI never calls it; it does not remove the tag from conversations and customers yet.
