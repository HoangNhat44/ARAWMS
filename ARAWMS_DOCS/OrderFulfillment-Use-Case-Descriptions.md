# FT-09 Order Fulfillment – Use Case Descriptions

Actors of this feature: **Seller**, **Warehouse Staff**, **Warehouse Manager**.
Only button labels are quoted in Vietnamese exactly as they appear on screen; screens, forms, fields and messages are described in English.

Order statuses used below: Pending confirmation (PENDING) → Confirmed and reserved (CONFIRMED_RESERVED) → Picking (PICKING) → Packed (PACKED) → Handed over to carrier (HANDED_OVER_CARRIER) → Delivered / Completed. An order can also be Cancelled.

| UC-ID | Use Case | Primary Actor | Secondary Actor | Status |
|---|---|---|---|---|
| UC-087 | Create Order | Seller | Customer | Implemented |
| UC-088 | Update Order | Seller | Customer, GHN | Implemented (includes Cancel Order and Get GHN Waybill) |
| UC-089 | Import Marketplace Orders via Excel | Seller | — | Implemented |
| UC-090 | Export List Order | Seller | — | Implemented |
| UC-091 | View Sales Order Pick-list | Warehouse Staff | — | Implemented |
| UC-092 | Scan Order Packaging With Video | Warehouse Staff | — | Implemented |
| UC-093 | Print Waybill Label | Warehouse Staff | — | Implemented (includes create, bulk create and replace order QR label) |
| UC-094 | View Carrier Shipment | Warehouse Staff, Warehouse Manager | — | Implemented for Warehouse Staff |
| UC-095 | Handover Carrier Shipment | Warehouse Staff | — | Implemented |
| UC-096 | Export Parcel Handover | Warehouse Staff, Warehouse Manager | GHN | Planned |

---

## UC-087: Create Order

**Primary Actors:** Seller
**Secondary Actors:** Customer
**Description:** Seller creates a sales order, either an online order delivered to the customer or a counter sale at the shop.
**Preconditions:**
1. Seller is logged in with the SELLER role.

**Normal Flow:**
1. Seller opens the orders page and clicks "Tạo đơn".
2. The system opens the quick order form with the delivery mode "Giao hàng tận nơi" selected and shows the products available in stock.
3. Seller enters the recipient's name, phone and delivery address.
4. Seller searches and selects products, and sets the quantity of each product.
5. Seller enters the shipping fee and discount; the system recalculates the subtotal and the COD total.
6. Seller clicks "Chờ khách xác nhận".
7. The system checks that at least one product is selected, and that the recipient's name, phone (10 digits starting with 03, 05, 07, 08 or 09) and address are provided.
8. The system generates an order code (ORD-xxxxx) and creates the order with the status Pending confirmation.
9. When the order is created from a Messenger conversation, the system sends the order confirmation to the customer in the chat.
10. The system shows that the order was created successfully.

**Alternative Flows:**
**Step 2.1_Counter Sale**  
Seller clicks "Bán tại quầy".  
System hides the shipping fee and allows an empty recipient.  
Seller selects products and clicks "Xuất Kho & Thanh Toán Ngay".  
System checks the available stock at the counter, creates the order and deducts the stock immediately.  
The use case continues at step 10.

**Step 6.1_Create And Confirm**  
Seller clicks "Tạo & Chốt đơn ngay" instead.  
System checks that every product has enough available stock, creates the order and reserves the stock (Confirmed and reserved).  
The use case continues at step 10.

**Step 6.2_Cancel**  
Seller clicks "Hủy bỏ" or closes the form.  
System closes the form without creating an order, and the use case ends.

**Step 7.1_No Product**  
System validates that no product is selected.  
The create buttons stay disabled, and the system asks Seller to select at least one product.  
The use case returns to step 4.

**Step 7.2_Missing Or Invalid Recipient**  
System validates that the recipient's name, phone or address is empty, or the phone format is invalid.  
System shows which field must be corrected and does not create the order.  
The use case returns to step 3.

**Step 7.3_Not Enough Stock**  
System validates that a product does not have enough available stock for "Tạo & Chốt đơn ngay" or for a counter sale.  
System shows the product, the available quantity and the requested quantity, and does not create the order.  
The use case returns to step 4.

**Step 7.4_Product Unavailable**  
System validates that a selected SKU no longer exists or has stopped selling.  
System shows an error and does not create the order.  
The use case returns to step 4.

**Postconditions:** A new sales order exists with a unique order code; confirmed orders have their stock reserved.

---

## UC-088: Update Order

**Primary Actors:** Seller
**Secondary Actors:** Customer, GHN
**Description:** Seller views an order and updates it: changes the products or the recipient, confirms the order, gets the GHN waybill, or cancels the order.
**Preconditions:**
1. Seller is logged in with the SELLER role.
2. The order exists.

**Normal Flow:**
1. Seller opens the orders page and clicks "Xem" on an order.
2. The system opens the order detail: status, recipient, products, payment summary, GHN waybill and status history.
3. Seller changes the quantity of a product with the plus and minus buttons, or removes a product.
4. Seller clicks "Lưu thay đổi sản phẩm".
5. The system checks that the order is still Pending confirmation and that every product still exists.
6. The system saves the products, recalculates the order total and records an audit log entry.
7. The system shows that the products were updated.

**Alternative Flows:**
**Step 3.1_Edit Recipient**  
Seller clicks "Sửa" (or "Bổ sung thông tin thật" when the marketplace masked the recipient).  
System opens the recipient form: name, phone and delivery address.  
Seller changes the information and clicks "Lưu thông tin".  
System checks that the order has not been picked up by GHN, saves the recipient and cancels any draft GHN waybill created with the old information.  
The use case ends.

**Step 3.2_Confirm Order**  
The order is Pending confirmation.  
Seller clicks "Xác nhận chốt đơn".  
System checks that every product has enough available stock, reserves the stock and changes the order to Confirmed and reserved.  
The use case ends.

**Step 3.3_Send Confirmation To Customer**  
The order comes from Facebook Messenger and is Pending confirmation.  
Seller clicks "Gửi phiếu vào Chat".  
System sends the order summary with a confirm button to the customer's Messenger.  
The use case ends.

**Step 3.4_Get GHN Waybill**  
The order is confirmed and is not a counter sale.  
Seller clicks "Lấy mã vận đơn từ GHN" (or "Lấy mã GHN" on the order row; "Đồng bộ từ GHN" when a waybill already exists).  
System creates or refreshes the shipment at GHN, saves the waybill code and GHN status, and sends the waybill code to the customer.  
The use case ends.

**Step 3.5_Cancel Order**  
Seller clicks "Hủy Đơn Hàng".  
System opens the cancel dialog with the cancel reason.  
Seller may click "Gửi tin hỏi xác nhận hủy vào Chat" to ask the customer, ticks that the customer has confirmed, enters the reason and clicks "Xác nhận hủy đơn".  
System checks that the order has not left the warehouse, releases the reserved stock, cancels the GHN waybill if any, changes the order to Cancelled and notifies the customer in the chat.  
The use case ends.

**Step 3.6_Remove Last Product**  
Seller tries to remove the only product of the order.  
System shows that an order needs at least one product and suggests cancelling the order instead.  
The use case returns to step 3.

**Step 3.7_Not Enough Stock To Confirm**  
System validates that a product does not have enough available stock when confirming.  
System shows the missing quantity with suggestions (tell the customer to wait, change the quantity or SKU, or ask the warehouse to restock) and does not confirm.  
The use case returns to step 3.

**Step 3.8_Waybill Not Allowed**  
System validates that the order is still Pending confirmation, or the recipient information is masked by the marketplace.  
System shows that the order must be confirmed or the real recipient must be entered first, and does not create the waybill.  
The use case returns to step 3.

**Step 3.9_Cannot Cancel**  
System validates that the carrier has already picked up the parcel, or the order is in a status that cannot be cancelled.  
System shows that the order cannot be cancelled, and the use case ends.

**Step 5.1_Order Already Confirmed**  
System validates that the order is no longer Pending confirmation.  
System shows that products can only be changed before the order is confirmed and does not save.  
The use case ends.

**Postconditions:** The order shows the updated products, recipient, status or waybill; a cancelled order has its reserved stock released.

---

## UC-089: Import Marketplace Orders via Excel

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller imports orders exported from Shopee, TikTok Shop or the ARAWMS standard Excel template, checks them in a preview and creates them in the system.
**Preconditions:**
1. Seller is logged in with the SELLER role.

**Normal Flow:**
1. Seller opens the orders page and clicks "Import đơn Excel".
2. The system opens the import window with the sales channels and the template download buttons.
3. Seller selects the sales channel and chooses an Excel file (.xlsx, .xls or .csv).
4. Seller clicks "Kiểm tra dữ liệu".
5. The system reads the file and shows a preview of each order: recipient, products, matched SKU, available stock and whether the order can be imported.
6. Seller clicks "Tiến Hành Xử Lý Đơn".
7. The system checks again that every product of each valid order matches an active SKU.
8. The system creates the valid orders in one import batch, links or creates the customers, reserves the stock and sets the orders to Confirmed and reserved.
9. The system shows the number of orders imported; Seller clicks "Hoàn Tất & Đóng".

**Alternative Flows:**
**Step 2.1_Download Template**  
Seller clicks "Mẫu Shopee", "Mẫu TikTok Shop" or the ARAWMS template button.  
System downloads the Excel template of that channel.  
The use case returns to step 3.

**Step 4.1_No File**  
Seller has not chosen a file.  
System asks Seller to choose an Excel file.  
The use case returns to step 3.

**Step 5.1_File Cannot Be Read**  
System validates that the file is empty or has no order data.  
System shows an error and no preview.  
The use case returns to step 3.

**Step 5.2_SKU Not Matched**  
A product in the file does not match any SKU in stock.  
Seller clicks "+ Ghép SKU kho" (or "[Đổi]" to change a matched SKU), searches and clicks "Chọn SKU này".  
System links the product to that SKU and recalculates whether the order can be imported.  
The use case returns to step 5.

**Step 5.3_Edit Recipient**  
Seller clicks the edit button of an order's recipient, changes the name, phone or address and clicks "Lưu".  
System updates the preview.  
The use case returns to step 5.

**Step 5.4_Duplicate Or Invalid Orders**  
An order already exists in the system or still has an unmatched SKU.  
System marks it as not importable and skips it; a low-stock product only shows a warning.  
The use case continues at step 6.

**Step 6.1_Cancel**  
Seller clicks "Hủy bỏ".  
System closes the window without importing, and the use case ends.

**Step 7.1_No Valid Order**  
System validates that there is no valid order to process.  
System shows an error and imports nothing.  
The use case returns to step 3.

**Postconditions:** The valid orders exist in the system with their stock reserved; invalid orders are not created.

---

## UC-090: Export List Order

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller exports the order list to a CSV file that opens in Excel.
**Preconditions:**
1. Seller is logged in with the SELLER role.

**Normal Flow:**
1. Seller opens the orders page.
2. Seller filters the orders by channel, status or keyword.
3. Seller clicks "Xuất danh sách".
4. The system creates a UTF-8 CSV file of the orders shown: order code, waybill code, channel, created and updated time, customer, phone, address, products, amounts, payment and order status.
5. The system downloads the file and shows how many orders were exported.

**Alternative Flows:**
**Step 3.1_Export Selected Orders**  
Seller ticks some orders and clicks "Xuất file đã chọn".  
System exports only the selected orders and clears the selection.  
The use case continues at step 5.

**Step 4.1_No Order**  
System validates that there is no order to export.  
System shows that there is nothing to export, and the use case ends.

**Postconditions:** A CSV file of the orders is downloaded to Seller's device.

---

## UC-091: View Sales Order Pick-list

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff views the list of sales orders and the products of each order (product, color, size, SKU, quantity) to pick the goods and choose the orders to print labels for. When Seller confirms an order (UC-087 "Tạo & Chốt đơn ngay", UC-088 "Xác nhận chốt đơn") or imports it (UC-089), the order appears in this list automatically; Seller does not send or print anything for the warehouse.
**Preconditions:**
1. Warehouse Staff is logged in with the WAREHOUSE_STAFF role.

**Normal Flow:**
1. Warehouse Staff opens the order labels page.
2. The system shows the order list from newest to oldest: order code, recipient, number of items, status, whether the order is ready to pack, and whether a label has been created.
3. Warehouse Staff searches by order code, ID, recipient or status, or filters by packed or not packed.
4. The system filters the list.
5. Warehouse Staff clicks "Xem đơn" on an order.
6. The system opens the order detail: recipient, note, packing video link if any, and the product list with color, size, SKU and quantity.

**Alternative Flows:**
**Step 3.1_Reload**  
Warehouse Staff clicks "Tải lại danh sách".  
System loads the latest orders.  
The use case returns to step 2.

**Step 4.1_No Result**  
System finds no order matching the search or filter.  
System shows an empty list.  
The use case returns to step 3.

**Step 6.1_Order Cannot Be Loaded**  
System cannot load the order or Warehouse Staff is not allowed to view it.  
System shows an error in the detail window, and the use case ends.

**Step 6.2_Continue To Print**  
Warehouse Staff continues to create and print the label of the order (UC-093), and the use case ends.

**Postconditions:** None (view only).

---

## UC-092: Scan Order Packaging With Video

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff scans the order QR, scans the barcode of every unit and records a packing video as evidence.
**Preconditions:**
1. Warehouse Staff is logged in with the WAREHOUSE_STAFF role.
2. The order has a QR label (UC-093) and is allocated to stock on the shelves.
3. The finished goods warehouse is not being counted (no stocktake lock).

**Normal Flow:**
1. Warehouse Staff opens the packing page and clicks "Mở camera".
2. The system asks for camera permission and shows the camera.
3. Warehouse Staff scans the order QR (or enters it and clicks "Mở đơn").
4. The system opens a packing session for this station, starts recording video and shows the order: customer, recipient, shipping, payment and the products to pack.
5. Warehouse Staff scans the barcode of each unit (or enters it and clicks "Gắn sản phẩm với đơn").
6. The system checks the unit and links it to the order, and updates the scanned count of each product.
7. When every unit is scanned, the system shows that the order is complete; Warehouse Staff keeps recording until the parcel is sealed.
8. Warehouse Staff clicks "Lưu video và hoàn tất đơn" (or scans the next order QR).
9. The system stops recording, keeps the video on the device and uploads it in the background.
10. When the upload finishes, the system saves the video to the order and changes the order to Packed.

**Alternative Flows:**
**Step 2.1_Camera Unavailable**  
The camera cannot be opened.  
System shows the reason; Warehouse Staff can use a handheld scanner, but recording needs the camera.  
The use case returns to step 1.

**Step 3.1_Stocktake Lock**  
The finished goods warehouse is being counted.  
System shows the stocktake banner and disables packing until the counting time ends.  
The use case ends.

**Step 4.1_Order Cannot Be Packed**  
System validates that the QR is invalid, the order is being packed at another station, the station holds another order, or the order is not fully allocated to stock.  
System shows the reason and opens nothing.  
The use case returns to step 3.

**Step 6.1_Invalid Unit**  
System validates that the barcode is unknown, already scanned, assigned to another order, not on a shelf, not in this order, or the product quantity is already enough.  
System shows the reason and does not link the unit.  
The use case returns to step 5.

**Step 6.2_Remove A Scanned Unit**  
Warehouse Staff clicks "Gỡ mã" on a scanned barcode while recording.  
System removes the unit from the order.  
The use case returns to step 5.

**Step 8.1_Not All Units Scanned**  
Warehouse Staff scans the next order QR before every unit is scanned.  
System shows how many units are scanned and does not switch the order.  
The use case returns to step 5.

**Step 8.2_Discard This Attempt**  
Warehouse Staff clicks "Kết thúc".  
System discards the video and the scans of this attempt; the order can be packed again.  
The use case ends.

**Step 9.1_Upload Fails**  
The network is lost or the video cannot be uploaded.  
System keeps the video on the device, shows the upload status and retries automatically; Warehouse Staff can click "Thử lưu lại".  
The use case continues at step 10.

**Postconditions:** The order is Packed, each unit is linked to the order, and the packing video is saved.

---

## UC-093: Print Waybill Label

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff creates the order label (sender, recipient, waybill barcode, product list and order QR) and prints it at 60 × 95 mm to stick on the parcel.
**Preconditions:**
1. Warehouse Staff is logged in with the WAREHOUSE_STAFF role.
2. The order is Confirmed and reserved, Picking or Packed.

**Normal Flow:**
1. Warehouse Staff opens the order labels page and clicks "Xem đơn" on an order.
2. The system shows the order detail.
3. Warehouse Staff clicks "Tạo / lấy tem đơn này".
4. The system creates the order QR, or returns the existing one, and shows the label in the detail window.
5. The system adds the label to the print list at the bottom of the page.
6. Warehouse Staff clicks "In tem" (or "In … tem" on the print list).
7. The system opens the browser print dialog with only the labels.
8. Warehouse Staff prints the labels.

**Alternative Flows:**
**Step 1.1_Bulk Labels**  
Warehouse Staff ticks several orders (or all orders shown) and clicks "Tạo / lấy tem hàng loạt".  
System creates or returns the labels in batches of 100 and adds them to the print list.  
The use case continues at step 6.

**Step 3.1_Replace Label**  
Warehouse Staff clicks "Thu hồi và tạo tem mới" and confirms.  
System revokes the old QR, so the old label no longer works, and creates a new label.  
The use case continues at step 5.

**Step 3.2_Order Not Eligible**  
The order is Pending confirmation or in a later status.  
The create button is not available; Warehouse Staff may click "Thêm tem vào danh sách in" to print the order information without a new QR.  
The use case continues at step 6.

**Step 4.1_Stock Not On Shelf**  
System validates that the stock of a product is not yet on a shelf that can be picked.  
System shows that the goods must be put on a shelf first and does not create the label.  
The use case ends.

**Step 4.2_Some Bulk Labels Fail**  
Some selected orders cannot get a label.  
System shows the failed orders with the reason and keeps them selected; the other labels are added to the print list.  
The use case continues at step 6.

**Step 6.1_Clear Print List**  
Warehouse Staff clicks "Xóa danh sách in" and confirms, or removes one label from the list.  
System removes the labels from the print list.  
The use case returns to step 1.

**Postconditions:** The order has an active QR label; the printed label is stuck on the parcel.

---

## UC-094: View Carrier Shipment

**Primary Actors:** Warehouse Staff, Warehouse Manager
**Secondary Actors:** None
**Description:** The warehouse views the packed orders waiting for the carrier and the orders already handed over.
**Preconditions:**
1. The actor is logged in with the WAREHOUSE_STAFF or WAREHOUSE_MANAGER role.

**Normal Flow:**
1. The actor opens the shipping and handover page.
2. The system shows the number of orders waiting for handover and handed over.
3. The system shows the tab "Đơn có thể bàn giao": order code, recipient and phone, products, COD amount and packed time.
4. The actor clicks the tab "Đơn đã bàn giao".
5. The system shows the handed-over orders with the handover time and the person who handed them over.

**Alternative Flows:**
**Step 3.1_Empty List**  
There is no order in the tab.  
System shows that there is no order waiting for handover (or no order handed over yet).  
The use case ends.

**Step 3.2_Refresh**  
The actor clicks "Làm mới".  
System loads both lists again.  
The use case returns to step 2.

**Step 3.3_Load Error**  
System cannot load the lists.  
System shows an error, and the use case ends.

**Postconditions:** None (view only).

---

## UC-095: Handover Carrier Shipment

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff scans each packed parcel when the carrier picks it up, to record the handover.
**Preconditions:**
1. Warehouse Staff is logged in with the WAREHOUSE_STAFF role.
2. The order is Packed.

**Normal Flow:**
1. Warehouse Staff opens the shipping and handover page and clicks "Bật camera".
2. The system shows the camera.
3. Warehouse Staff scans the order QR or the waybill barcode on the parcel.
4. The system finds the order and checks that it is Packed.
5. The system changes the order to Handed over to carrier, records the handover time and Warehouse Staff, and adds the status history.
6. The system moves the order from "Đơn có thể bàn giao" to "Đơn đã bàn giao" and shows that the order was handed over.

**Alternative Flows:**
**Step 1.1_Handheld Scanner Or Manual Code**  
Warehouse Staff scans with a handheld scanner or types the order code, then clicks "Bàn giao".  
The use case continues at step 4.

**Step 3.1_Same Code Read Again**  
The camera reads the same code again within 3 seconds.  
System ignores the repeated read.  
The use case returns to step 3.

**Step 4.1_Invalid Code**  
System validates that the QR is invalid, the code is empty, or no order is found.  
System shows the reason and hands over nothing.  
The use case returns to step 3.

**Step 4.2_Already Handed Over**  
System validates that the order is already handed over.  
System shows that the order was handed over before.  
The use case returns to step 3.

**Step 4.3_Not Packed**  
System validates that the order is not Packed.  
System shows that the order must be packed first.  
The use case returns to step 3.

**Postconditions:** The order is Handed over to carrier with the handover time and the person who handed it over.

---

## UC-096: Export Parcel Handover

*Status: Planned. The handover record API (`/shipping/handovers`: create, scan parcel, remove parcel, confirm) exists in the backend, but there is no screen or export yet. The flow below follows the planned design.*

**Primary Actors:** Warehouse Staff, Warehouse Manager
**Secondary Actors:** GHN
**Description:** The warehouse creates a parcel handover record for a carrier pickup, lists the parcels handed over, and exports it for the carrier to sign.
**Preconditions:**
1. The actor is logged in with the WAREHOUSE_STAFF or WAREHOUSE_MANAGER role.
2. There are orders handed over to the carrier.

**Normal Flow:**
1. The actor opens the shipping and handover page and clicks the export handover button.
2. The system shows the handover record form: carrier, handover date and the parcels handed over in that time.
3. The actor checks the parcels and clicks the export button.
4. The system checks that the record has at least one parcel.
5. The system creates the handover record with a record code, carrier, time, staff, and each parcel's order code, waybill code and COD amount, and the totals.
6. The system downloads the record as a file to print and sign with the carrier.

**Alternative Flows:**
**Step 3.1_Remove A Parcel**  
The actor removes a parcel that the carrier did not take.  
System removes it from the record.  
The use case returns to step 3.

**Step 3.2_Cancel**  
The actor closes the form.  
System creates nothing, and the use case ends.

**Step 4.1_No Parcel**  
System validates that the record has no parcel.  
System shows that there is nothing to export.  
The use case returns to step 2.

**Postconditions:** A handover record exists and its file is downloaded.

---

## Notes – differences between the code and this description

1. **UC-094, Warehouse Manager:** the backend allows WAREHOUSE_MANAGER on `/shipping/*`, but the shipping page is only in the Warehouse Staff menu (`/warehouse/shipping`); the manager has no screen yet.
2. **UC-091, UC-093:** the order labels page `/orders/qr` is only routed for Warehouse Staff. Its code also has "Chốt đơn và tạo tem" for SELLER and OWNER, but those roles cannot open the page, so that button never shows.
3. **UC-096:** the backend handover record API is not called by any screen, and there is no export.
4. **Extra roles in the backend:** OWNER can call the create, update, cancel and import order APIs; OWNER and WAREHOUSE_MANAGER can call the packing APIs. None of them has a screen for these functions.
5. **Orders page, "In phiếu" (redundant, to be removed):** when Seller ticks orders, the floating bar shows "In phiếu", which only shows a message and prints nothing. It is a leftover from the first Seller module and is not part of any use case: confirmed orders go to the warehouse list automatically (UC-091) and labels with the order QR are printed by Warehouse Staff (UC-093). The button will be removed from `SellerOrdersPage.jsx`; "Xuất file đã chọn" (UC-090) stays.
6. **GHN print token:** `POST /shipping/shipments/:id/print-token` (GHN's own label) exists but is not used; the printed label is the ARAWMS 60 × 95 mm label.
