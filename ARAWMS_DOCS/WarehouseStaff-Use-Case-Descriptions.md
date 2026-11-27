# Warehouse Staff – Use Case Descriptions

Primary actor for every use case: **Warehouse Staff** (Nhân viên kho).
Common precondition for every use case: *Warehouse Staff is logged in with the WAREHOUSE_STAFF role.*
UI labels are quoted in Vietnamese exactly as they appear on screen.

Warehouse Staff has use cases in four features: FT-05, FT-06, FT-07 and FT-09. Warehouse Staff does not create, approve or cancel warehouse documents, and does not resolve shortages or incidents; the Warehouse Manager does these. Warehouse Staff does not count stock during stocktaking either; the Garment Technician does that. The FT-07 stocktake lock appears as alternative flows in Pack Order and the putaway use cases.

---

# FT-05 – Raw Material Warehousing

## UC: Print Raw Material Labels

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff prints barcode labels for the fabric rolls and accessory lots of a raw material receipt that the Warehouse Manager has confirmed. The labels are attached to the material before it goes onto a shelf.
**Preconditions:**
1. Warehouse Staff is logged in.
2. The Warehouse Manager has confirmed a raw material receipt (from a supplier, an inbound plan or a leftover-fabric return) and assigned a target shelf to each roll/lot.
3. The receipt still has rolls or lots waiting to be put away.

**Normal Flow:**
1. Warehouse Staff opens "Nhập nguyên phụ liệu và thành phẩm" and selects the "Nguyên phụ liệu" tab.
2. In section "1 – In tem hàng chờ xếp", the system lists the receipts that still have rolls or lots waiting to be put away.
3. Warehouse Staff clicks "Xem và in tem" on a receipt.
4. System opens "Chi tiết tem nguyên phụ liệu" with every roll/lot barcode of the receipt (material, supplier lot/roll code, supplier, width), all ticked.
5. Warehouse Staff ticks the barcodes to print ("Chọn tất cả … barcode" to select all) and enters "Số bản mỗi barcode" (1–10).
6. Warehouse Staff clicks "In tem đã chọn".
7. System generates the labels using the barcode stored on the receipt for each roll or lot, opens the print view, and shows "Đã mở … tem của phiếu …".

**Alternative Flows:**
AF-01 – Empty queue: No roll or lot is waiting for putaway. The system shows "Không có phiếu chờ xếp."
AF-02 – No label left on the receipt: The receipt's rolls/lots have all been put away meanwhile. The system shows "Phiếu không còn tem nguyên phụ liệu chờ xếp."
AF-03 – Invalid selection: No barcode is ticked, or "Số bản mỗi barcode" is outside 1–10, so the button "In tem đã chọn" stays disabled.
AF-04 – Print window blocked: The browser blocks the print window. The system shows "Trình duyệt đang chặn cửa sổ in tem." Warehouse Staff allows pop-ups and prints again.
AF-05 – Cancel: Warehouse Staff clicks "Hủy" or "×", and the dialog closes without printing.

**Postconditions:** Labels are printed. No stock data is changed.

---

## UC: Put Away Raw Materials

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff puts a fabric roll or accessory lot of a receipt confirmed by the Warehouse Manager onto the shelf the manager assigned, by scanning the shelf barcode and then the roll/lot barcode. Warehouse Staff cannot choose another shelf. The system records the material at that shelf.
**Preconditions:**
1. Warehouse Staff is logged in.
2. The Warehouse Manager has confirmed the raw material receipt and assigned a target shelf to every accepted roll/lot.
3. The roll or lot is waiting for putaway (QC passed, or a leftover-fabric return).
4. The roll/lot has its printed label.

**Normal Flow:**
1. On the "Nguyên phụ liệu" tab, in section "2 – Quét mã và xếp hàng", Warehouse Staff clicks "Quét xếp kệ" on a roll or lot (the list shows material, receipt, target shelf ("Kệ đích") and "Còn chờ").
2. System shows the target shelf ("KỆ ĐÍCH"), the waiting quantity ("SỐ LƯỢNG CHỜ") and the steps "1. Quét barcode kệ" and "2. Quét barcode cây/lô".
3. For an accessory lot, Warehouse Staff enters "Số lượng lô xếp lần này" (default: the whole remaining quantity). A fabric roll is always put away whole.
4. Warehouse Staff scans the target shelf barcode with the camera ("Mở camera quét mã"), or enters it and clicks "Xác nhận mã".
5. System checks that the scanned shelf is the target shelf assigned by the Warehouse Manager and shows "Đúng kệ (…). Quét barcode cây vải hoặc lô nguyên phụ liệu."
6. Warehouse Staff scans the barcode of the roll/lot.
7. System checks that the barcode is the task's own roll/lot (the internal barcode, or the supplier roll/lot code of that same object) and that the shelf is still the assigned one.
8. System confirms the putaway in one transaction: the material is recorded on the shelf and the shelf occupancy is updated.
9. System shows "Đã xếp … tại …" and removes the item (or the placed part of the lot) from the queue.

**Alternative Flows:**
AF-01 – Wrong shelf: Warehouse Staff scans a shelf other than the target shelf. The system shows "Sai kệ. Hãy quét …" (with the target shelf code). Warehouse Staff scans the target shelf again.
AF-02 – Target shelf unavailable: The target shelf has been deactivated or frozen for stocktaking since the receipt was confirmed. The system shows "Kệ … hiện không hoạt động hoặc đang kiểm kê. Hãy báo Quản lý kho."
AF-03 – Wrong material: The system shows "Barcode … không phải nguyên phụ liệu của công việc này, không thuộc kệ đang xếp. Hãy quét đúng …".
AF-04 – Invalid lot quantity: The quantity is 0 or larger than "SỐ LƯỢNG CHỜ", so "Mở camera quét mã" and "Xác nhận mã" stay disabled. If another device has placed part of the lot meanwhile, the system shows "Số lượng cất vượt phần lô còn lại".
AF-05 – Re-scan the shelf: After the shelf is accepted, Warehouse Staff clicks "Quét lại kệ" to go back to step 4.
AF-06 – Task changed: Another device has already handled the task while scanning the shelf. The system shows "Công việc xếp kệ đã thay đổi, hãy tải lại", and Warehouse Staff clicks "↻ Làm mới".
AF-07 – No confirmation: The connection drops or the server fails before it confirms the roll/lot scan. The system shows "Chưa rõ kết quả. Thử lại cùng mã thao tác để tránh cộng tồn hai lần." Warehouse Staff clicks "Thử lại cùng mã". If the first attempt had already been saved, the system shows "Mã này đã được xác nhận trước đó, không cộng tồn thêm." and does not add the stock twice.
AF-08 – No shelf assigned (old data): A roll/lot from a receipt confirmed before shelves became mandatory has no target shelf. The list shows "Chờ Quản lý kho chọn kệ" and "Quét xếp kệ" is disabled. Warehouse Staff reports to the Warehouse Manager.

**Postconditions:** The roll or lot is in stock at the shelf assigned by the Warehouse Manager, and it leaves the putaway queue.

---

## UC: View Assigned Outbound Tasks

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff views the raw material outbound requests that the Warehouse Manager has approved and assigned to them.
**Preconditions:**
1. Warehouse Staff is logged in.
2. The Warehouse Manager has approved a Garment Technician's outbound request and assigned it ("Duyệt và giao việc xuất kho").

**Normal Flow:**
1. Warehouse Staff opens "Lệnh xuất nguyên phụ liệu và thành phẩm".
2. System displays the tasks assigned to Warehouse Staff, and the tasks not yet assigned to anyone: request code, receiving department ("Bộ phận nhận"), purpose, assigned time, number of lines and status.
3. Warehouse Staff opens a task.
4. System shows "Các dòng nguyên phụ liệu cần lấy": material, unit, approved quantity ("Cần lấy lần này") and quantity already picked.

**Alternative Flows:**
AF-01 – No task: The system shows "Không có công việc xuất kho nào cần thực hiện."
AF-02 – Real-time update: When the Warehouse Manager assigns a task, Warehouse Staff receives the notification "Nhiệm vụ lấy hàng mới: …" and the list refreshes without reloading the page.

**Postconditions:** Warehouse Staff sees their current outbound tasks. No data is changed.

---

## UC: Pick And Scan Raw Materials

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff picks the fabric rolls and accessory lots of an outbound request that the Warehouse Manager has approved and assigned to them, and scans each one, so the system knows exactly which rolls/lots and quantities leave the warehouse.
**Preconditions:**
1. Warehouse Staff is logged in.
2. The Warehouse Manager has approved the outbound request and assigned it to Warehouse Staff.
3. The task is in "Chờ lấy hàng" or is already being picked.

**Normal Flow:**
1. Warehouse Staff opens the task and starts picking ("Lấy hàng và quét barcode xuất kho").
2. System changes the task from waiting to picking and shows the FIFO suggestion ("Gợi ý FIFO") for each line.
3. Warehouse Staff scans the barcode on the roll or lot label ("CAMERA QUÉT MÃ" or manual input).
4. System checks that the roll/lot is the right material and specification, is in a valid warehouse location, and has available stock.
5. Warehouse Staff enters the quantity actually taken from that source (for example, metres cut from a roll).
6. System records the source and updates "Còn phải lấy" for the line.
7. Warehouse Staff repeats steps 3–6 until every line is fully picked.

**Alternative Flows:**
AF-01 – Empty input: The system shows "Vui lòng nhập hoặc quét mã barcode".
AF-02 – Wrong material: The system shows "Sai nguyên phụ liệu, sai quy cách hoặc sai kho".
AF-03 – Source not eligible: The roll/lot is quarantined, already used or in an invalid location. The system shows "Nguồn hàng không đủ điều kiện xuất".
AF-04 – Invalid quantity: The system shows "Số lượng thực lấy phải lớn hơn 0".
AF-05 – Remove a source: Warehouse Staff removes a wrongly scanned source, and the system restores the line's remaining quantity.
AF-06 – Pause: Warehouse Staff pauses the task ("Tạm dừng"). The picked sources are kept, and the task can be continued later.
AF-07 – Shortage: Not enough material can be found. Warehouse Staff continues with Report Outbound Shortage.
AF-08 – Task waiting for the manager: The task has an unresolved shortage. The system shows "Công việc không ở trạng thái lấy hàng" until the Warehouse Manager resolves it.

**Postconditions:** Each picked roll/lot and its quantity are recorded on the task. Stock is not deducted yet; it is deducted in Confirm Handover To Garment Technician.

---

## UC: Report Outbound Shortage

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff reports that a line of an outbound task assigned by the Warehouse Manager cannot be fully picked (not enough stock, or a wrong/damaged barcode label). The Warehouse Manager then decides how to continue.
**Preconditions:**
1. Warehouse Staff is logged in.
2. The Warehouse Manager has assigned the outbound task to Warehouse Staff, and the task is being picked.

**Normal Flow:**
1. Warehouse Staff chooses to report a shortage on a line.
2. System asks for the reason.
3. Warehouse Staff enters the reason and submits.
4. System records the shortage on the line and moves the task to "Chờ xử lý sai lệch".
5. System notifies the Warehouse Manager: "Báo thiếu hàng: …".

**Alternative Flows:**
AF-01 – Missing reason: The system shows "Vui lòng nêu lý do thiếu hàng hoặc sai lệch tem barcode".
AF-02 – Resolve the shortage: Warehouse Staff tries to approve or re-allocate the shortage. The system rejects this with "Chỉ Quản lý kho mới có quyền xử lý sai lệch / duyệt xuất thiếu".

**Postconditions:** The task waits for the Warehouse Manager. Handover is blocked until the shortage is resolved.

---

## UC: Confirm Handover To Garment Technician

**Primary Actors:** Warehouse Staff
**Secondary Actors:** Garment Technician
**Description:** Warehouse Staff hands the materials of an outbound request approved by the Warehouse Manager over to the receiving department and confirms the outbound. The system deducts the materials from stock.
**Preconditions:**
1. Warehouse Staff is logged in.
2. The Warehouse Manager has approved the outbound request and assigned it to Warehouse Staff.
3. Every line of the task has been picked and scanned.
4. The task has no unresolved shortage (or the Warehouse Manager has resolved it).

**Normal Flow:**
1. Warehouse Staff hands the materials to the receiving department.
2. Warehouse Staff clicks to confirm the handover and outbound.
3. System checks each line: every line has scanned sources, the picked quantity matches the approved quantity, and each source still has enough available stock in a valid location.
4. System deducts the picked rolls/lots from stock, records the inventory movements, and changes the task to "Hoàn thành".
5. System notifies the Garment Technician who requested the materials ("Đã bàn giao NPL: …") and the Warehouse Manager ("Hoàn tất xuất kho: …").

**Alternative Flows:**
AF-01 – Unresolved shortage: The system shows "Yêu cầu đang có báo thiếu chưa được Quản lý duyệt lại số lượng".
AF-02 – Line not picked: The system shows "Mặt hàng … chưa được lấy và quét barcode".
AF-03 – Quantity mismatch: The system shows "Số lượng thực lấy (…) không khớp số lượng duyệt (…) cho mặt hàng …".
AF-04 – Stock changed: The system shows "Cây vải … không còn đủ tồn khả dụng", "Tồn cây vải … đã thay đổi" or "Lô … đang bị từ chối / cách ly". Warehouse Staff picks another source.
AF-05 – Task already closed: The system shows "Yêu cầu đã được xác nhận hoặc đã hủy".

**Postconditions:** The task is "Hoàn thành", the materials are deducted from stock, and the outbound appears in "Lịch sử phiếu xuất nguyên phụ liệu".

---

# FT-06 – Product Warehousing

## UC: View Putaway Tasks

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff views the finished goods of the receipts that the Warehouse Manager has received and allocated to bins, and that are waiting to be put away.
**Preconditions:**
1. Warehouse Staff is logged in.

**Normal Flow:**
1. Warehouse Staff opens "Nhập nguyên phụ liệu và thành phẩm" (the home page of the role) on the "Thành phẩm" tab.
2. In section "1 – In tem hàng chờ xếp", the system lists the receipts with goods waiting: receipt code ("Mã phiếu nhập"), number of items waiting ("Hàng chờ xếp") and number of lines to put away ("Công việc").
3. In section "2 – Quét mã và xếp hàng", the system lists each putaway line: product and attributes ("Sản phẩm & thuộc tính"), receipt, target bin ("Vị trí đích"), progress and status.
4. Warehouse Staff searches by receipt code, product or location, filters the lines by status ("Tất cả", "Chưa bắt đầu", "Đang xếp", "Chờ xử lý") or by receipt ("Tất cả phiếu nhập").

**Alternative Flows:**
AF-01 – Empty queue: No receipt matches, so the system shows "Không có phiếu phù hợp."
AF-02 – Line waiting for the manager: A line with a reported shortage is shown under "Chờ xử lý" and cannot be scanned.
AF-03 – Refresh: Warehouse Staff clicks "↻ Làm mới" to reload the queue.
AF-04 – Clear filters: Warehouse Staff clicks "Xóa bộ lọc".

**Postconditions:** Warehouse Staff sees the current putaway work. No data is changed.

---

## UC: Print Putaway Labels

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff prints the barcode label of each finished-goods item of a receipt that the Warehouse Manager has allocated to bins. Every item has its own barcode.
**Preconditions:**
1. Warehouse Staff is logged in.
2. The Warehouse Manager has confirmed the putaway allocation of the receipt (target bin for each item).
3. The receipt has items waiting to be put away.

**Normal Flow:**
1. On the "Thành phẩm" tab, in section "1 – In tem hàng chờ xếp", Warehouse Staff clicks "Xem và in tem" on a receipt (extends View Putaway Tasks).
2. System gets the item barcodes already issued for the receipt ("Đang lấy tem…") and opens the label dialog, with each item's product, SKU, color, size and barcode.
3. Warehouse Staff ticks the barcodes to print ("Chọn tất cả … barcode đang hiển thị" to select all) and enters "Số bản mỗi barcode" (1–10).
4. Warehouse Staff clicks "In tem đã chọn".
5. System opens the print view. Printing does not change stock ("In tem không làm thay đổi tồn kho").
6. System shows "Vừa in … tem của phiếu …. Dán tem xong, đặt hàng lên kệ rồi quét mã ô một lần." with the buttons "Xếp … tem vừa in" and "Bỏ qua".

**Alternative Flows:**
AF-01 – Put away the printed labels: Warehouse Staff clicks "Xếp … tem vừa in" and continues with Bulk Put Away Finished Goods.
AF-02 – Receipt has nothing to put away: The system shows "Phiếu chưa có hàng được giao xếp".
AF-03 – Cancel: Warehouse Staff clicks "Hủy" and the dialog closes without printing.

**Postconditions:** Labels are printed. No stock data is changed.

---

## UC: Put Away Finished Goods

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff puts finished goods onto the bin allocated by the Warehouse Manager, by scanning the bin QR code and then the barcode of each item. Each scan moves one item from the staging area to the bin.
**Preconditions:**
1. Warehouse Staff is logged in.
2. The Warehouse Manager has confirmed the putaway allocation of the receipt.
3. The line has items still to be placed and no pending shortage report.
4. The items have their barcode labels attached.

**Normal Flow:**
1. In section "2 – Quét mã và xếp hàng", Warehouse Staff clicks "Bắt đầu" on a line ("Tiếp tục" if the line is already partly placed).
2. System shows the target bin ("Ô ĐÍCH") and the progress (placed / allocated).
3. Warehouse Staff scans the bin QR code ("CAMERA QUÉT MÃ Ô").
4. System checks that the bin is the allocated one and is active, and shows "Đúng ô. Quét từng sản phẩm khi đặt vào ô."
5. Warehouse Staff places an item in the bin and scans its barcode ("2 · Quét barcode từng chiếc").
6. System checks that the item belongs to the line's SKU and receipt, and is still in the staging area.
7. System moves the item to the bin in one transaction: it updates the FIFO batch of the bin, the occupancy of the staging area and of the bin, and the line progress. It also logs the scan.
8. System shows "Đã xếp — …/…" and adds the barcode to "Lượt quét trong phiên này".
9. Warehouse Staff repeats steps 5–8 until the line is complete.

**Alternative Flows:**
AF-01 – Wrong bin: The system shows "Sai ô. Hãy quét …" and asks Warehouse Staff to scan the bin again ("Quét lại ô").
AF-02 – Bin not active: The bin is disabled or frozen for stocktaking. The system shows "Ô cần xếp hiện không hoạt động".
AF-03 – Wrong product: The system shows "Sai sản phẩm. Cần …".
AF-04 – Wrong receipt: The system shows "Sản phẩm không thuộc phiếu nhập của dòng này".
AF-05 – Already placed: The system shows "Chiếc này đã được xác nhận. Không cộng thêm." The quantity is not increased.
AF-06 – Barcode not found: The system shows "Không tìm thấy barcode sản phẩm".
AF-07 – Line complete: The system shows "Đã đủ số lượng, không cần xếp thêm." and closes the camera.
AF-08 – No confirmation: The connection drops, or another device changed the progress. The system shows "Chưa nhận được xác nhận. Hãy thử lại cùng mã quét." Retrying with the same scan does not place the item twice.
AF-09 – Shortage: There are fewer items than allocated. Warehouse Staff continues with Report Putaway Shortage.
AF-10 – Wrong scan already accepted: Warehouse Staff continues with Report Putaway Incident.

**Postconditions:** The scanned items are on the bin and are available for sale (FIFO by inbound time). The line is complete when the placed quantity equals the allocated quantity.

---

## UC: Bulk Put Away Finished Goods

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff puts many items of a receipt allocated by the Warehouse Manager into one bin at once: they tick the labels already attached and scan the bin QR code once, instead of scanning every item.
**Preconditions:**
1. Warehouse Staff is logged in.
2. The Warehouse Manager has confirmed the putaway allocation of the receipt.
3. The labels are attached to the items.

**Normal Flow:**
1. In section "1 – In tem hàng chờ xếp", Warehouse Staff clicks "Xếp hàng loạt" on a receipt.
2. System opens the label list of the receipt. Warehouse Staff ticks the labels already attached to the items and clicks "Xếp các tem đã chọn vào kệ".
3. System checks the selected labels ("Đang kiểm tra các tem đã chọn…") and groups them by target bin. Stock is not changed yet.
4. Warehouse Staff scans the bin QR code once.
5. System places all selected items into the bin in one transaction, as in Put Away Finished Goods, step 7.
6. System shows the number of items placed for the bin.

**Alternative Flows:**
AF-01 – No label selected: The system shows "Chọn ít nhất một tem để xếp".
AF-02 – Too many items: The system shows "Mỗi lần tối đa … chiếc".
AF-03 – Bin full: The system shows "…: ô … không còn chỗ được phân bổ cho sản phẩm này. Hãy kiểm tra lại các tem đã chọn."
AF-04 – Bin not active: The system shows "Ô … hiện không hoạt động".
AF-05 – Nothing can be placed: The system shows "Không có tem nào xếp được. Hãy làm mới và chọn lại."
AF-06 – Start from printed labels: Right after Print Putaway Labels, Warehouse Staff clicks "Xếp … tem vừa in" to start at step 3 with the labels just printed.
AF-07 – Wrong bin: The scanned bin is not one of the bins the Warehouse Manager allocated to the selected labels. The system shows "Mã ô này không thuộc các ô được phân bổ cho tem đã chọn."

**Postconditions:** All selected items are on the scanned bin and available for sale.

---

## UC: Report Putaway Shortage

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff reports that a putaway line has fewer items than the Warehouse Manager allocated. The Warehouse Manager reviews the report.
**Preconditions:**
1. Warehouse Staff is logged in.
2. The line still has items to place and has no pending shortage report.

**Normal Flow:**
1. On the putaway screen, Warehouse Staff clicks "Báo thiếu hàng".
2. System shows the remaining quantity and the field "Lý do để quản lý xử lý".
3. Warehouse Staff enters the reason and clicks "Gửi báo thiếu".
4. System records the shortage (remaining quantity, reason, reporter, time) and logs the action.
5. System sends a high-priority notification to the Warehouse Manager: "Báo thiếu khi xếp kệ: …".

**Alternative Flows:**
AF-01 – Missing reason: The system shows "Cần ghi lý do thiếu hàng".
AF-02 – Already reported: The system shows "Đã báo thiếu, đang chờ quản lý xử lý".
AF-03 – Line complete: The system shows "Dòng này đã hoàn tất".
AF-04 – Progress changed: The system shows "Tiến độ vừa thay đổi, hãy tải lại".

**Postconditions:** The line is blocked for scanning ("Dòng này đang chờ quản lý xử lý thiếu hàng") until the Warehouse Manager accepts the shortage or sends the line back for scanning. The reserved bin capacity is kept until then.

---

## UC: Report Putaway Incident

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff reports a problem with a scan that the system has already accepted (for example, an item placed in the wrong bin or a damaged label). The system does not undo the stock; the Warehouse Manager reviews the incident.
**Preconditions:**
1. Warehouse Staff is logged in.
2. The putaway line exists.

**Normal Flow:**
1. On the putaway screen, Warehouse Staff clicks "Báo sự cố".
2. System shows the form "Báo sự cố xếp hàng".
3. Warehouse Staff enters "Mô tả sự cố" and, optionally, "Barcode chiếc liên quan (nếu có)".
4. Warehouse Staff clicks "Gửi sự cố".
5. System creates an open incident and logs the action.
6. System sends a high-priority notification to the Warehouse Manager: "Sự cố khi xếp kệ".

**Alternative Flows:**
AF-01 – Missing description: The system shows "Cần ghi rõ sự cố".
AF-02 – Barcode not in the line: The barcode was never accepted for this line. The system shows "Barcode này chưa được xác nhận trong dòng".

**Postconditions:** An open incident is waiting for the Warehouse Manager. Stock is unchanged; any correction is a separate, audited action by the manager.

---

## UC: View Finished Goods Inventory

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff views the finished goods stock by SKU, including the quantity available on the shelves, to find where goods are stored.
**Preconditions:**
1. Warehouse Staff is logged in.

**Normal Flow:**
1. Warehouse Staff opens "Kho thành phẩm".
2. System displays "Kho thành phẩm (Tồn kho theo SKU)": product, SKU, on-hand, reserved and available quantity.
3. Warehouse Staff searches for or filters the products.
4. Warehouse Staff selects a product to see its detail (continues with View Product Detail).

**Alternative Flows:**
AF-01 – Read-only: Warehouse Staff cannot import, issue stock or edit the product configuration; these actions are only available to the Warehouse Manager.

**Postconditions:** Warehouse Staff sees the current stock. No data is changed.

---

## UC: View Product Detail

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff views one product: its variants and stock, the items currently on the shelves, and the receipts that brought it in. Warehouse Staff can also reprint item labels.
**Preconditions:**
1. Warehouse Staff is logged in.
2. The product exists.

**Normal Flow:**
1. Warehouse Staff selects a product in "Kho thành phẩm".
2. System displays "CHI TIẾT SẢN PHẨM": images, product code, category, price, and "Biến thể và tồn kho" (color/size, available quantity).
3. Warehouse Staff opens "Hàng đang trên kệ" to see the items on the shelves and their bins.
4. Warehouse Staff opens the receipts ("Lệnh nhập") to see the items received by each receipt.

**Alternative Flows:**
AF-01 – Reprint labels: Warehouse Staff ticks items in "Chọn hàng còn trong kho" and prints their labels. The system shows "Đang chuẩn bị tem..." and then the print view.
AF-02 – Nothing on the shelves: The system shows "Chưa có chiếc nào của sản phẩm này trên kệ."
AF-03 – No receipt: The system shows "Chưa có phiếu nhập kho nào được xác nhận cho sản phẩm này."
AF-04 – Read-only: Price, images and product information are shown but cannot be edited by Warehouse Staff.

**Postconditions:** Warehouse Staff sees the product detail. No stock data is changed.

---

## UC: Track Product Barcode

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff looks up one item barcode and sees its full history in the warehouse, from receipt to shipment or write-off.
**Preconditions:**
1. Warehouse Staff is logged in.

**Normal Flow:**
1. Warehouse Staff opens "Tra cứu barcode".
2. Warehouse Staff scans or enters an item barcode.
3. System displays the item's current state ("HIỆN TẠI") and "Hành trình trong kho" in time order, for example:
   - "Vào kho" with the receipt ("Phiếu nhập …" / "Lệnh nhập …");
   - "Xếp lên kệ" with the bin and the Warehouse Staff who scanned it;
   - "Ra kho · Đóng vào đơn" with the order;
   - "Bàn giao vận chuyển" with the waybill;
   - "Ra kho · Xuất kho theo phiếu" with the outbound document;
   - "Vào lại kho (hàng hoàn)", "Vào kho hàng lỗi" or the stocktake events ("Kiểm kê", "Loại khỏi kho · …").
4. Warehouse Staff clicks "Xem chi tiết sản phẩm" to open the product.

**Alternative Flows:**
AF-01 – Barcode not found: The system shows that no item matches the barcode.
AF-02 – Old data: An item created before receipts were recorded shows "Dữ liệu cũ, không có phiếu nhập".

**Postconditions:** Warehouse Staff sees the history of the item. No data is changed.

---

## UC: Execute Finished Goods Outbound

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff picks the finished goods listed on an outbound document created by the Warehouse Manager, scans each item, and confirms the outbound. The system deducts the scanned items from stock.
**Preconditions:**
1. Warehouse Staff is logged in.
2. The Warehouse Manager has created a finished-goods outbound document.
3. The document is in "Chờ lấy hàng & quét mã" or "Đang quét mã".

**Normal Flow:**
1. Warehouse Staff opens the "Lệnh xuất thành phẩm" tab in "Lệnh xuất nguyên phụ liệu và thành phẩm".
2. System displays the outbound documents with their status ("Chờ lấy hàng & quét mã", "Đang quét mã", "Đã xuất kho").
3. Warehouse Staff opens a document ("Lấy hàng & Quét mã xuất kho thành phẩm").
4. System shows "Danh sách sản phẩm xuất kho": each SKU with its requested and scanned quantity.
5. Warehouse Staff picks an item and scans its barcode.
6. System checks that the item is available and belongs to an SKU of the document, and shows "Đã quét thành công …".
7. Warehouse Staff repeats steps 5–6 for all items.
8. Warehouse Staff confirms the outbound.
9. System deducts the scanned items from stock, records the inventory movements, and changes the document to "Đã xuất kho".
10. System shows "Đã xuất kho thành công … sản phẩm thành phẩm".

**Alternative Flows:**
AF-01 – Empty input: The system shows "Vui lòng quét hoặc nhập mã barcode".
AF-02 – Already scanned: The system shows "Mã tem … đã được quét trong yêu cầu này rồi".
AF-03 – Not on the document: The system shows "Sản phẩm quét (…) không thuộc danh sách yêu cầu xuất kho này".
AF-04 – Not available: The system shows "Không tìm thấy sản phẩm khả dụng với mã: …".
AF-05 – SKU complete: The system shows "Mặt hàng … đã quét đủ số lượng (… chiếc)".
AF-06 – Remove a scan: Warehouse Staff removes a wrong scan, and the system shows "Đã gỡ mã quét thành công".
AF-07 – Nothing scanned: The system shows "Chưa quét sản phẩm nào. Vui lòng quét mã sản phẩm trước khi xuất kho".
AF-08 – Partial outbound: Fewer items are scanned than requested. The system asks "Yêu cầu xuất … sản phẩm, hiện mới quét được … sản phẩm. Bạn có chắc chắn muốn xác nhận xuất kho phần đã quét không?". If Warehouse Staff confirms, only the scanned items are issued.
AF-09 – Stock changed: The system shows "Tồn kho đã thay đổi, vui lòng thử lại".
AF-10 – Document closed: The system shows "Yêu cầu xuất kho này đã hoàn tất" or "Yêu cầu xuất kho này đã bị hủy".

**Postconditions:** The document is "Đã xuất kho", the scanned items leave stock, and each item's barcode history shows "Ra kho · Xuất kho theo phiếu".

---

# FT-09 – Order Fulfillment

## UC: View Order List

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff views the sales orders to find the orders that need labels or packing.
**Preconditions:**
1. Warehouse Staff is logged in.

**Normal Flow:**
1. Warehouse Staff opens "Đơn hàng & In tem".
2. System displays "Xem đơn, tạo và in tem đơn hàng" with the order list: order code, recipient, items, status, packing status ("Sẵn sàng đóng", "Đã đóng hàng"…).
3. Warehouse Staff searches by order code, ID, recipient or status ("Tìm theo mã đơn, ID, người nhận hoặc trạng thái").
4. Warehouse Staff filters by packing status ("Tất cả đơn hàng", "Đã đóng hàng", "Chưa đóng hàng").

**Alternative Flows:**
AF-01 – No result: The system shows "Không có đơn hàng phù hợp."
AF-02 – Reload: Warehouse Staff clicks "Tải lại danh sách".

**Postconditions:** Warehouse Staff sees the orders. No data is changed.

---

## UC: View Order Detail

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff opens one order to check its content before printing the label or packing.
**Preconditions:**
1. Warehouse Staff is logged in.
2. The order list is displayed.

**Normal Flow:**
1. Warehouse Staff clicks "Xem đơn" on an order.
2. System displays the order detail:
   - recipient information ("Người nhận", "Điện thoại", "Địa chỉ");
   - items (product code, product, quantity, price, discount, line total);
   - customer note ("Ghi chú khách hàng");
   - status and the active order QR, if any;
   - the packing video ("Video đóng hàng: Mở video"), if the order is packed.

**Alternative Flows:**
AF-01 – Order not found: The system shows "Không tìm thấy đơn hàng".
AF-02 – No permission: The system shows "Tài khoản chưa có quyền với đơn hàng này".
AF-03 – Continue processing: From the detail, Warehouse Staff continues with Generate Order QR Label or Replace Order QR Label.

**Postconditions:** Warehouse Staff sees the order detail. No data is changed.

---

## UC: Generate Order QR Label

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff creates (or gets the existing) QR code of an order and prints the 60×95 mm order label to attach to the parcel.
**Preconditions:**
1. Warehouse Staff is logged in.
2. The order is "Đã xác nhận, đã giữ hàng" or "Đang soạn hàng" and every line is ready for packing; or the order is already "Đã đóng hàng, chờ bàn giao".

**Normal Flow:**
1. Warehouse Staff opens the order detail and clicks "Tạo / lấy tem đơn này".
2. System creates the order QR, or returns the active one ("QR đơn hàng đang hiệu lực").
3. Warehouse Staff clicks "Thêm tem vào danh sách in".
4. Warehouse Staff prints the labels in the print list.
5. System prints the 60×95 mm label: shop and warehouse ("Kho Tổng TP.HCM"), recipient, items, total, QR code, and the footer "Kí tên / Xác nhận hàng nguyên vẹn".

**Alternative Flows:**
AF-01 – Bulk labels: Warehouse Staff ticks several orders (or "Chọn tất cả đơn có thể tạo tem đang hiển thị") and clicks "Tạo / lấy tem hàng loạt (…)". The system issues a QR for each eligible order and returns the result for each order.
AF-02 – Too many orders: The bulk selection is empty or above 100. The system shows "Chọn từ 1 đến 100 đơn không trùng nhau".
AF-03 – Order not eligible: The order is not reserved or not fully allocated. The system shows "Không thể cấp QR cho đơn hàng này".
AF-04 – Download QR: Warehouse Staff clicks "Tải ảnh QR" to download the QR image.
AF-05 – Clear the print list: Warehouse Staff clicks "Xóa danh sách in".
AF-06 – Confirm order: "Chốt đơn và tạo tem" is shown only to Seller and Owner. If Warehouse Staff calls it, the system rejects it with "Không có quyền chốt đơn".

**Postconditions:** The order has an active QR code, and its label is printed and ready to be attached.

---

## UC: Replace Order QR Label

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff revokes the current QR code of an order (for example, when the label is lost or damaged) and issues a new one.
**Preconditions:**
1. Warehouse Staff is logged in.
2. The order has an active QR and is eligible for a label (same as Generate Order QR Label).

**Normal Flow:**
1. Warehouse Staff opens the order detail and clicks "Thu hồi và tạo tem mới".
2. System revokes the old QR and issues a new one.
3. System shows "Đã thu hồi QR cũ và cấp QR mới".
4. Warehouse Staff prints the new label (as in Generate Order QR Label, steps 3–5).

**Alternative Flows:**
AF-01 – Order not eligible: The system shows "Không thể thay QR cho đơn hàng này".
AF-02 – Old label scanned: Anyone who later scans the old label gets "QR không hợp lệ hoặc không còn hiệu lực".

**Postconditions:** Only the new QR is valid for the order.

---

## UC: Pack Order

**Primary Actors:** Warehouse Staff
**Secondary Actors:** Cloudinary (video storage)
**Description:** Warehouse Staff packs an order at the packing station with two-layer verification: scan the order QR, then scan the barcode of every item. Packing is recorded on video as evidence. When packing finishes, the system deducts the items from stock and marks the order as packed.
**Preconditions:**
1. Warehouse Staff is logged in.
2. The order is "Đã xác nhận, đã giữ hàng" or "Đang soạn hàng", has an order QR label, and is fully allocated to FIFO batches and bins.
3. No finished-goods stocktake is in progress.
4. The device has a camera.

**Normal Flow:**
1. Warehouse Staff opens "Đóng hàng".
2. Warehouse Staff scans the order QR ("1 Quét QR đơn").
3. System opens a packing session for the station, locks the order to this station, and shows "Sản phẩm cần đóng" with the quantity of each SKU.
4. Warehouse Staff starts recording ("Quay video").
5. Warehouse Staff scans the barcode of each item while putting it in the parcel ("2 Quét đủ từng chiếc").
6. System checks that each item is on a shelf, belongs to an SKU of the order, is reserved for this order, and that the SKU quantity is not exceeded. It adds the item to "Barcode đã quét".
7. When every item is scanned, Warehouse Staff stops recording and saves ("Lưu và chờ tải").
8. System uploads the video and, in one transaction, deducts the scanned items from stock (SKU, FIFO batch and bin), records the inventory movements, and changes the order to "Đã đóng hàng, chờ bàn giao".
9. System sends the packing-completed message with the waybill to the customer's chat.

**Alternative Flows:**
AF-01 – Order not ready: The system shows "Đơn chưa được phân bổ đủ lô và vị trí kho để đóng hàng."
AF-02 – Order at another station: The system shows "Đơn đang được xử lý ở bàn kho khác."
AF-03 – Station busy: The system shows "Bàn này đang giữ một đơn khác. Hãy kết thúc đơn hiện tại trước."
AF-04 – Wrong item: The system shows "Mẫu/màu/size trên tem không có trong đơn hàng này."
AF-05 – Quantity exceeded: The system shows "Đơn đã đủ số lượng của biến thể này."
AF-06 – Item already used: The system shows "Vật phẩm này đã được quét trong đơn.", "Vật phẩm này đã được quét cho đơn khác." or "Vật phẩm đã được đóng/xuất hoặc không còn trong kho."
AF-07 – Item not on a shelf: The system shows "Sản phẩm này chưa được xếp lên kệ (còn ở khu chờ xếp)."
AF-08 – Stock reserved for another order: The system shows "Hàng ở kệ này đã được giữ hết cho đơn khác. Hãy lấy cây cùng mẫu ở kệ khác."
AF-09 – Remove a scan: Warehouse Staff removes a wrong barcode from "Barcode đã quét", and the system frees that item.
AF-10 – Not complete: Warehouse Staff scans another order before finishing. The system shows "Đơn hiện tại mới quét …/… sản phẩm. Quét đủ trước khi chuyển đơn, hoặc bấm "Kết thúc" để bỏ lần đóng hàng này."
AF-11 – Discard the attempt: Warehouse Staff clicks "Kết thúc". The system discards the video and the scans; the order can be packed again.
AF-12 – Session expired: The system shows "Phiên tại bàn đã hết hạn. Quét lại QR để tiếp tục."
AF-13 – Stocktake lock (FT-07): A finished-goods stocktake starts. The system shows "Kho thành phẩm đang kiểm kê nên chức năng đóng hàng tạm khóa. Lần đóng dở (nếu có) đã bị hủy, đơn vẫn chưa đóng; hết giờ kiểm kê hãy quét QR và đóng lại từ đầu."
AF-14 – Video upload delayed: The upload fails. The video is kept on the device ("Trạng thái lưu video") and Warehouse Staff clicks "Thử lưu lại". The order becomes packed when the upload is confirmed.
AF-15 – Video too large: The system shows "Video vượt giới hạn 512 MB. Cần quay đoạn ngắn hơn."
AF-16 – Device storage full: The system shows "Thiết bị không đủ dung lượng để lưu video an toàn. Hãy báo quản lý trước khi quay tiếp."

**Postconditions:**
1. The order is "Đã đóng hàng, chờ bàn giao" and appears in "Đơn chờ bàn giao".
2. The scanned items are deducted from stock, and each item's barcode history shows "Ra kho · Đóng vào đơn".
3. The packing video is stored and linked to the order.

---

## UC: View Packing Video

**Primary Actors:** Warehouse Staff
**Secondary Actors:** Cloudinary (video storage)
**Description:** Warehouse Staff replays the packing video of an order, for example to answer a complaint about missing items.
**Preconditions:**
1. Warehouse Staff is logged in.
2. The order has been packed and its video uploaded.

**Normal Flow:**
1. Warehouse Staff opens the order detail ("Video đóng hàng: Mở video") or the packing session ("Xem video đã lưu").
2. System streams the stored video.

**Alternative Flows:**
AF-01 – Video unavailable: The storage service cannot return the video, so the system shows an error and the video cannot be played.

**Postconditions:** Warehouse Staff watches the packing video. No data is changed.

---

## UC: Hand Over Orders To Carrier

**Primary Actors:** Warehouse Staff
**Secondary Actors:** Shipping carrier (GHN)
**Description:** Warehouse Staff scans the QR label of each packed parcel when giving it to the shipping carrier. The system records who handed over the order and when.
**Preconditions:**
1. Warehouse Staff is logged in.
2. The order is "Đã đóng hàng, chờ bàn giao".

**Normal Flow:**
1. Warehouse Staff opens "Vận chuyển & Bàn giao".
2. System displays the tab "Đơn có thể bàn giao (…)" with the packed orders: order code, recipient, products and packing time ("Đóng hàng lúc").
3. Warehouse Staff turns on the camera ("Bật camera") and scans the QR on the parcel ("Quét đơn bàn giao").
4. System checks that the order is packed.
5. System changes the order to "Đã bàn giao cho bên vận chuyển" and records the handover time and the Warehouse Staff.
6. System moves the order to the handed-over list.

**Alternative Flows:**
AF-01 – Empty input: The system shows "Hãy quét QR đơn hàng hoặc nhập mã đơn."
AF-02 – Invalid QR: The system shows "QR không đúng định dạng QR đơn hàng."
AF-03 – Order not found: The system shows "Không tìm thấy đơn hàng tương ứng với mã đã quét."
AF-04 – Not packed: The system shows "Đơn chưa đóng hàng thành công nên chưa thể bàn giao."
AF-05 – Already handed over: The system shows "Đơn này đã được bàn giao cho bên vận chuyển trước đó."

**Postconditions:** The order is "Đã bàn giao cho bên vận chuyển", with the handover time and Warehouse Staff recorded.

---

## UC: View Handed-over Orders

**Primary Actors:** Warehouse Staff
**Secondary Actors:** None
**Description:** Warehouse Staff views the orders already handed over to the carrier, to check the parcels picked up in a shift.
**Preconditions:**
1. Warehouse Staff is logged in.

**Normal Flow:**
1. Warehouse Staff opens "Vận chuyển & Bàn giao" and selects the handed-over tab ("Đơn đã bàn giao").
2. System displays the handed-over orders: order code, recipient, products, "Bàn giao lúc" and "Người bàn giao".

**Alternative Flows:**
AF-01 – Refresh: Warehouse Staff clicks "Làm mới" to reload the list.
AF-02 – Empty list: No order has been handed over, so the list is empty.

**Postconditions:** Warehouse Staff sees the handover history. No data is changed.
