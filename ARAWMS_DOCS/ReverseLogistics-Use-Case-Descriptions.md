# FT-10 Reverse Logistics – Use Case Descriptions

Actors of this feature: **Seller**, **Garment Technician**. Secondary actors: **Accountant**, **Warehouse Manager**.
Only button labels are quoted in Vietnamese exactly as they appear on screen; screens, forms, fields and messages are described in English.

Overall flow: Seller creates a return or exchange request for a delivered order → the customer sends the goods back → Garment Technician unboxes and inspects the returned goods on video → Garment Technician classifies each unit and sends the inbound request to Warehouse Manager. For a return, Seller sends the refund request to Accountant, who creates the payment voucher.

| UC-ID | Use Case | Primary Actor | Secondary Actor | Status |
|---|---|---|---|---|
| UC-097 | Create A Return Order | Seller | — | Implemented |
| UC-098 | Create A Exchange Order | Seller | — | Implemented |
| UC-099 | Send Payment Request To Accountant | Seller | Accountant | Implemented (Accountant's review screen planned) |
| UC-100 | Record The Inspection Process | Garment Technician | — | Implemented (includes view inspection history) |
| UC-101 | Create Product Inbound Request (Returned Goods) | Garment Technician | Warehouse Manager | Implemented |

---

## UC-097: Create A Return Order

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller creates a return request (RMA) for a delivered order when the customer returns products for a refund.
**Preconditions:**
1. Seller is logged in with the SELLER role.
2. The original order is Delivered or Completed.

**Normal Flow:**
1. Seller opens the orders page and clicks the return and exchange icon on a delivered order row (or "Tạo Đổi / Trả Hàng" in the order detail).
2. The system opens the return and exchange form with the original order: customer, phone, address and products.
3. Seller selects "Trả Hàng Hoàn Tiền".
4. Seller ticks the products to return and enters the quantity of each.
5. The system calculates the refund: the product value, minus a 10% surcharge when the reason is the customer's fault (no surcharge for store faults such as fabric defect, wrong item or damaged goods).
6. Seller enters the customer's bank, account number and account holder, the return waybill code, and chooses the return reason (or "Lý do khác..." with a description).
7. Seller clicks "Tạo Phiếu Đổi / Trả Hàng".
8. The system checks that the order is Delivered or Completed, that at least one product is selected, that each quantity does not exceed the quantity still returnable, that the reason is provided, that the bank information is complete, and that the order has no other active return or exchange request.
9. The system generates the RMA code, creates the return request with status Requested, changes the original order to Return requested, and sends a real-time alert.
10. The system shows the result with the RMA code and the refund amount, and offers to send the refund request to Accountant (UC-099).

**Alternative Flows:**
**Step 1.1_Search Original Order**  
Seller clicks "Đổi / Trả" on the page header, so the form opens without an order.  
Seller enters the order code or the customer's phone and clicks "Tìm đơn".  
System shows the matching orders; Seller selects one (or clicks "Đổi đơn khác" to choose again).  
The use case continues at step 2.

**Step 7.1_Cancel**  
Seller clicks "Hủy bỏ".  
System closes the form without creating a request, and the use case ends.

**Step 8.1_No Product Selected**  
System validates that no product has a return quantity.  
System asks Seller to select at least one product.  
The use case returns to step 4.

**Step 8.2_Order Not Delivered**  
System validates that the original order is not Delivered or Completed.  
System shows that only delivered orders can be returned, and the use case ends.

**Step 8.3_Quantity Exceeds Returnable**  
System validates that a quantity is larger than the quantity not yet returned.  
System shows the remaining returnable quantity.  
The use case returns to step 4.

**Step 8.4_Missing Reason Or Bank Information**  
System validates that the reason or the bank information is empty.  
System shows which information is missing.  
The use case returns to step 6.

**Step 8.5_Active Request Exists**  
System validates that the order already has a return or exchange request in progress.  
System shows the existing RMA code, and the use case ends.

**Postconditions:** A return request exists with its refund amount; the original order is Return requested.

---

## UC-098: Create A Exchange Order

**Primary Actors:** Seller
**Secondary Actors:** None
**Description:** Seller creates an exchange request for a delivered order and a new order with the replacement products for the customer.
**Preconditions:**
1. Seller is logged in with the SELLER role.
2. The original order is Delivered or Completed.

**Normal Flow:**
1. Seller opens the orders page and clicks the return and exchange icon on a delivered order row (or "Tạo Đổi / Trả Hàng" in the order detail).
2. The system opens the return and exchange form with the original order.
3. Seller selects "Đổi Sản Phẩm Mới".
4. Seller ticks the products to exchange and enters the quantity of each.
5. Seller searches the replacement products (with real-time stock) and sets their quantities.
6. Seller chooses the exchange reason and clicks "Tạo Phiếu Đổi / Trả Hàng".
7. The system checks the request as in UC-097 (delivered order, products, quantities, reason, no active request) and checks that at least one replacement product is selected.
8. The system creates the exchange request and changes the original order to Exchange requested.
9. The system checks that each replacement product has enough available stock, creates the exchange order with the recipient of the original order and free shipping, reserves the stock and sets it to Confirmed and reserved.
10. The system shows the RMA code and the new exchange order code.

**Alternative Flows:**
**Step 1.1_Search Original Order**  
Seller clicks "Đổi / Trả" on the page header.  
Seller enters the order code or the customer's phone and clicks "Tìm đơn", then selects the order.  
The use case continues at step 2.

**Step 5.1_Remove A Replacement Product**  
Seller clicks the remove button on a replacement product.  
System removes it from the list.  
The use case returns to step 5.

**Step 6.1_Cancel**  
Seller clicks "Hủy bỏ".  
System closes the form without creating a request, and the use case ends.

**Step 7.1_No Replacement Product**  
System validates that no replacement product is selected.  
System asks Seller to select at least one new product.  
The use case returns to step 5.

**Step 7.2_Invalid Request**  
System validates that the order is not delivered, the quantity exceeds the returnable quantity, the reason is missing, or an active request exists.  
System shows the reason as in UC-097 Step 8.1 to 8.5.  
The use case returns to step 4.

**Step 9.1_Not Enough Stock For Replacement**  
System validates that a replacement product does not have enough available stock.  
System keeps the exchange request but does not create the exchange order.  
The use case continues at step 10.

**Postconditions:** An exchange request exists and the original order is Exchange requested; the exchange order is Confirmed and reserved and goes to the warehouse for packing (FT-09).

---

## UC-099: Send Payment Request To Accountant

**Primary Actors:** Seller
**Secondary Actors:** Accountant
**Description:** Seller does not refund the customer directly; after creating a return request, Seller sends the refund request to Accountant, who reviews it and creates the payment voucher.
**Preconditions:**
1. Seller is logged in with the SELLER role.
2. A return request (Trả Hàng Hoàn Tiền) was just created (UC-097).

**Normal Flow:**
1. The system shows the result of the return request with the refund notice.
2. Seller clicks "Gửi yêu cầu hoàn tiền cho Kế toán".
3. The system checks that the request is a return for refund, is not rejected or completed, has not been sent before, has complete bank information and has a refund amount above zero.
4. The system saves the refund request with status Waiting for Accountant, the requested amount, the bank information and Seller's note, and records an audit log entry.
5. The system adds the request to the Accountant dashboard ("Hoàn tiền trả hàng chờ duyệt": number of requests and total amount).
6. The system shows that the request was sent and that Accountant will review it and create the transfer payment voucher.
7. Seller clicks "Đóng Cửa Sổ".

**Alternative Flows:**
**Step 2.1_Close Without Sending**  
Seller clicks "Đóng Cửa Sổ" without sending.  
System closes the window; the refund request is not sent, and the use case ends.

**Step 3.1_Exchange Request**  
System validates that the request is an exchange.  
System shows that exchanges have no refund, and the use case ends.

**Step 3.2_Already Sent Or Approved**  
System validates that the refund request is already waiting for Accountant or already approved.  
System shows that it does not need to be sent again, and the use case ends.

**Step 3.3_Missing Bank Information Or Zero Amount**  
System validates that the bank information is incomplete or the refund amount is zero.  
System shows the reason and does not send the request, and the use case ends.

**Step 5.1_Accountant Reviews (Planned)**  
Accountant opens the refund requests and approves or rejects a request.  
When approving, the system creates a cash-out payment voucher "Chi hoàn tiền đổi trả" linked to the order and the return request, and changes the request to Accountant approved.  
When rejecting, Accountant must enter a reason so Seller can correct and send again.  
The use case ends.

**Postconditions:** The refund request is waiting for Accountant to create the payment voucher.

---

## UC-100: Record The Inspection Process

**Primary Actors:** Garment Technician
**Secondary Actors:** None
**Description:** Garment Technician unboxes the returned parcel on camera, scans each returned unit against the order, and saves the video as evidence. Garment Technician can also view the history of inspection records.
**Preconditions:**
1. Garment Technician is logged in with the GARMENT_TECHNICIAN role.
2. The order is Exchange requested, Return requested or Returned.

**Normal Flow:**
1. Garment Technician opens the return inspection page and clicks "Mở Camera quay & quét".
2. The system shows the camera and the list of recent orders waiting for return inspection.
3. Garment Technician scans the order QR, the waybill code or the RMA code (or enters it), and clicks "Mở đơn & Quay".
4. The system opens an inspection session, starts recording video and shows the products expected back.
5. Garment Technician scans the barcode of each returned unit (or clicks "Quét sản phẩm").
6. The system checks the unit against the order and adds it to the scanned list.
7. Garment Technician clicks "Dừng quay & Lưu đơn này".
8. The system stops recording, keeps the video on the device and uploads it in the background.
9. When the upload finishes, the system links the video to the inspection record, and the order appears in the classification list (UC-101).

**Alternative Flows:**
**Step 2.1_View Inspection History**  
Garment Technician opens the inspection history and filters by result (for example "Hoàn thành công").  
System shows the inspection records with result, passed and defect quantities.  
Garment Technician clicks "Xem video" or "Chi tiết" on a record.  
System plays the evidence video or shows the record detail, and the use case ends.

**Step 3.1_Open From Recent Orders**  
Garment Technician clicks an order in the recent orders list.  
The use case continues at step 4.

**Step 3.2_Order Not Found**  
System cannot find an order matching the code.  
System shows that no order was found.  
The use case returns to step 3.

**Step 3.3_Order Not Waiting For Inspection**  
System validates that the order is not in a return or exchange status, or has already been inspected.  
System shows the reason and opens no session.  
The use case returns to step 3.

**Step 6.1_Invalid Unit**  
System validates that the barcode is invalid, already scanned, belongs to another order, is not in this order, or the product quantity is already enough.  
System shows the reason and does not add the unit.  
The use case returns to step 5.

**Step 6.2_Remove A Scanned Unit**  
Garment Technician clicks "Gỡ" on a scanned unit.  
System removes it from the scanned list.  
The use case returns to step 5.

**Step 7.1_Switch To The Next Order**  
Garment Technician scans the next order and clicks "Chuyển đơn & Quay".  
System saves the current order's video and opens the next order.  
The use case continues at step 4.

**Step 7.2_Cancel Recording**  
Garment Technician clicks "Hủy quay" while recording and confirms.  
System stops recording, discards the video and the draft session; the order can be inspected again.  
The use case ends.

**Step 8.1_Upload Fails**  
The network is lost or the upload fails.  
System keeps the video on the device and retries automatically.  
The use case continues at step 9.

**Postconditions:** The inspection record has the scanned units and the evidence video, waiting for classification.

---

## UC-101: Create Product Inbound Request (Returned Goods)

**Primary Actors:** Garment Technician
**Secondary Actors:** Warehouse Manager
**Description:** Garment Technician classifies each returned unit as passed (restock for sale) or defective, finalizes the inspection, and sends inbound requests for the passed goods and the defective goods to Warehouse Manager.
**Preconditions:**
1. Garment Technician is logged in with the GARMENT_TECHNICIAN role.
2. The order has an inspection record with its video saved (UC-100).

**Normal Flow:**
1. Garment Technician opens the classification section of the return inspection page.
2. The system shows the inspected orders waiting for classification, with their units; every unit is passed by default.
3. Garment Technician clicks "✓ Đạt (Nhập kho bán)" or "✕ Hàng lỗi (Nhập kho lỗi)" on each unit, chooses the condition and adds a note if needed.
4. Garment Technician ticks the orders to finalize (or clicks "Chọn tất cả đơn đã có video").
5. Garment Technician clicks "Chốt & Gửi nhập kho" (showing the number of orders, passed units and defective units).
6. The system checks that at least one order is selected and that each record is valid and not yet sent.
7. The system finalizes each record and sets the result: all units passed → return completed; some units passed → partially returned; no unit passed → return failed and the request is rejected.
8. The system creates the restock inbound ticket (PNHH) for the passed units to the finished goods warehouse, and the defect inbound ticket (PNHL) for the defective units to the defect warehouse, both ready for Warehouse Manager to confirm.
9. The system shows the created tickets and removes the orders from the classification list.

**Alternative Flows:**
**Step 3.1_View Evidence Video**  
Garment Technician clicks "Xem video bằng chứng".  
System plays the inspection video.  
The use case returns to step 3.

**Step 4.1_Finalize One Order**  
Garment Technician clicks "Chốt riêng đơn này" on one order.  
The use case continues at step 6.

**Step 4.2_Video Not Ready**  
The order's video has not finished uploading.  
The finalize buttons for that order stay disabled.  
The use case returns to step 4.

**Step 6.1_No Order Selected**  
System validates that no order is selected.  
System asks to select at least one inspected order.  
The use case returns to step 4.

**Step 6.2_Invalid Or Already Sent Record**  
System validates that a record does not exist, the order is not found, or the record was already sent for inbound.  
System shows the record code and the reason and finalizes nothing.  
The use case returns to step 4.

**Step 8.1_No Active Location**  
System validates that there is no active finished goods or defect warehouse location.  
System shows the error and finalizes nothing, and the use case ends.

**Postconditions:** The inspection records are finalized; the order and request statuses are updated; the inbound tickets PNHH and PNHL wait for Warehouse Manager to confirm.

---

## Notes – parts planned for later development

1. **Accountant review of refund requests (UC-099 Step 5.1):** the backend already has the approve and reject APIs (`/returns/rma/:id/refund-approve`, `/refund-reject`) and the list `/returns/rma/refund-requests`; the Accountant screen will be developed later. Today the Accountant dashboard only shows the number of pending refund requests.
2. **Seller's list of return and exchange requests:** the API `GET /returns/rma` exists; a screen to reopen a request and send the refund request later will be developed later. Today the send button only appears right after creating the return request.
3. **UC-098 Step 9.1:** when the exchange order cannot be created (for example not enough stock), Seller is not yet shown the error; this will be improved later.
4. **Real-time alert:** the return request alert is currently sent to every connected user, not only to Accountant.
5. **Other roles in the backend:** OWNER can call the return and exchange APIs; WAREHOUSE_MANAGER and OWNER can call the return inspection APIs. They have no screen for these functions. The module `reverse-logistics/unboxing-inspection` is empty; the inspection is implemented in `garment-technical/return-inspection`.
