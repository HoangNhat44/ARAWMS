# FT-07 Inventory Auditing – Use Case Descriptions

Actors of this feature: **Warehouse Manager** (Quản lý kho), **Garment Technician** (Nhân viên kỹ thuật xưởng) and **Owner**.
Common precondition for every use case: *the actor is logged in with the role named in Primary Actors.*
Only button labels are quoted in Vietnamese exactly as they appear on screen; screens, forms, fields and messages are described in English.

Stocktake flow: the Warehouse Manager creates a stocktake session and assigns a Garment Technician → the Garment Technician scans each shelf and counts the stock, then submits the result → the Warehouse Manager reviews the variance report, approves it, and adjusts inventory. The Owner only views sessions and variance reports. Warehouse Staff does not take part in this feature; they only see the stocktake notice and the packing lock.

| UC-ID | Use Case | Actor |
|---|---|---|
| UC-068 | Create Stocktake Sessions | Warehouse Manager |
| UC-069 | Update Stocktake Sessions | Warehouse Manager |
| UC-070 | View Stocktake Sessions | Warehouse Manager, Garment Technician, Owner |
| UC-071 | Execute Physical Stocktake Count | Garment Technician |
| UC-072 | Scan Barcode to Count | Garment Technician |
| UC-073 | View Inventory Variance Report | Warehouse Manager, Owner |
| UC-074 | Approve Inventory Variance | Warehouse Manager |
| UC-075 | Adjust Inventory | Warehouse Manager |

---

## UC-068: Create Stocktake Sessions

**Primary Actors:** Warehouse Manager
**Secondary Actors:** Garment Technician, Warehouse Staff (receive notifications)
**Description:** The Warehouse Manager creates a stocktake order: a one-time session or a recurring schedule. The manager chooses the scope (whole warehouse, a zone or a rack), the time window, the Garment Technician who counts and the approver. A one-time order creates a session immediately; a recurring schedule creates sessions on its dates.
**Preconditions:**
1. The Warehouse Manager is logged in.
2. At least one active Garment Technician account exists.
3. The chosen scope has at least one warehouse location.

**Normal Flow:**
1. The Warehouse Manager opens the stocktake page and clicks "Tạo lệnh kiểm kê".
2. The system opens the create stocktake form with the latest locations, racks and people.
3. The Warehouse Manager enters the order name and chooses the scope: whole warehouse (raw materials and finished goods), one zone or one rack.
4. For a zone or a rack, the Warehouse Manager chooses the warehouse type, then the zone or the rack.
5. The Warehouse Manager chooses the frequency: once, weekly (choose the weekday), monthly (choose the day of the month) or quarterly (choose the month of the quarter).
6. The Warehouse Manager chooses the date, the start time and the end time; for a recurring schedule, optionally the date the schedule stops.
7. The Warehouse Manager chooses the Garment Technician who counts and the approver, and optionally enters instructions.
8. The Warehouse Manager clicks "Phát lệnh" (one-time) or "Tạo lịch định kỳ" (recurring).
9. The system validates the data, creates the session with a code "KK…" in the waiting status, or the schedule in the running status, and shows a success message.
10. For a one-time session, the system notifies the assigned Garment Technician and Warehouse Staff.

**Alternative Flows:**
**Step 6.1_Finished Goods Scope**  
The scope includes the finished goods warehouse.  
System shows a warning that packing is locked during the time window (handover still works) and that orders being packed at that time must be packed again.  
The use case continues at step 7.

**Step 8.1_Cancel**  
The Warehouse Manager clicks "Đóng" or "×" instead of submitting.  
System closes the form without creating anything, and the use case ends.

**Step 9.1_Start Date In The Past**  
System validates that the start date is before today.  
System shows an error that the start date cannot be in the past.  
The use case returns to step 6.

**Step 9.2_Invalid Stop Date**  
System validates that the stop date of the recurring schedule is before the start date.  
System shows an error that the end date must be on or after the start date.  
The use case returns to step 6.

**Step 9.3_Invalid Time Window**  
System validates that the end time is not at least 15 minutes after the start time on the same day.  
System shows an error.  
The use case returns to step 6.

**Step 9.4_Time Window Already Passed**  
System validates that the end time of a one-time order has already passed.  
System asks the Warehouse Manager to choose another time.  
The use case returns to step 6.

**Step 9.5_Same Person Counts And Approves**  
System validates that the counter and the approver are the same person.  
System shows an error that the counter cannot approve their own report.  
The use case returns to step 7.

**Step 9.6_Inactive Assignee**  
System validates that the chosen Garment Technician or approver is no longer active.  
System shows an error.  
The use case returns to step 7.

**Step 9.7_Invalid Scope**  
System validates that the chosen rack is inactive or the scope has no warehouse location.  
System shows an error.  
The use case returns to step 3.

**Postconditions:** A stocktake session (waiting) or a recurring schedule (running) exists. The assigned Garment Technician sees the session in their stocktake list.

---

## UC-069: Update Stocktake Sessions

**Primary Actors:** Warehouse Manager
**Secondary Actors:** Garment Technician, Warehouse Staff (receive notifications)
**Description:** The Warehouse Manager edits or cancels a stocktake session that has not started counting, or edits, pauses, resumes or cancels a recurring stocktake schedule. A session that has started counting can no longer be changed.
**Preconditions:**
1. The Warehouse Manager is logged in.
2. The session is still waiting (the Garment Technician has not scanned any shelf yet), or the recurring schedule is not cancelled.

**Normal Flow:**
1. The Warehouse Manager opens the stocktake page. On the sessions tab, a waiting session shows the buttons "Sửa" and "Hủy phiên".
2. The Warehouse Manager clicks "Sửa" on a waiting session.
3. The system opens the edit session form filled with the current name, scope, date, time window, counter, approver and instructions. The frequency is fixed to one time.
4. The Warehouse Manager changes the data (for example chooses another date, start time, end time or Garment Technician).
5. The Warehouse Manager clicks "Lưu thay đổi".
6. The system validates the data with the same rules as creating a session (UC-068), recalculates the shelves in the scope, saves the session and shows a success message.
7. The system sends the new schedule to the assigned Garment Technician and Warehouse Staff.

**Alternative Flows:**
**Step 2.1_Cancel A Session**  
The Warehouse Manager clicks "Hủy phiên" on a waiting session.  
System asks for confirmation.  
The Warehouse Manager confirms. If they do not confirm, nothing is changed and the use case ends.  
System changes the session to cancelled, notifies the assigned Garment Technician and shows a success message.  
The use case ends.

**Step 2.2_Edit A Recurring Schedule**  
The Warehouse Manager selects the recurring schedules tab and clicks "Sửa" on a schedule.  
System opens the edit schedule form with the current data; the frequency can be weekly, monthly or quarterly but not one time.  
The Warehouse Manager changes the data and clicks "Lưu thay đổi".  
System validates the data (an unchanged start date may stay in the past), saves the schedule and shows a success message.  
The use case ends.

**Step 2.3_Pause A Schedule**  
The Warehouse Manager selects the recurring schedules tab and clicks "Tạm dừng" on a running schedule.  
System changes the schedule to paused and shows that sessions already created are kept.  
The use case ends.

**Step 2.4_Resume A Schedule**  
The Warehouse Manager selects the recurring schedules tab and clicks "Tiếp tục" on a paused schedule.  
System changes the schedule back to running.  
The use case ends.

**Step 2.5_Cancel A Schedule**  
The Warehouse Manager selects the recurring schedules tab and clicks "Hủy lịch".  
System asks for confirmation.  
The Warehouse Manager confirms. If they do not confirm, nothing is changed and the use case ends.  
System changes the schedule to cancelled; it cannot be resumed or edited again, and sessions already created are kept.  
The use case ends.

**Step 5.1_Close Without Saving**  
The Warehouse Manager clicks "Đóng" or "×" instead of saving.  
System closes the form without changing anything, and the use case ends.

**Step 6.1_Invalid Data**  
System validates that the data breaks a rule of UC-068 (date in the past, invalid time window, same counter and approver, inactive assignee, invalid scope).  
System shows the error and does not save.  
The use case returns to step 4.

**Step 6.2_Session Already Started**  
System validates that the Garment Technician has started counting before the change was saved.  
System shows that only a session that has not started can be edited or cancelled.  
The use case ends.

**Step 6.3_Data Changed**  
System validates that another user changed the session or schedule first.  
System asks the Warehouse Manager to reload.  
The Warehouse Manager clicks "Làm mới", and the use case returns to step 1.

**Postconditions:** The session or schedule is updated or cancelled. A session that has started counting is not changed.

---

## UC-070: View Stocktake Sessions

**Primary Actors:** Warehouse Manager, Garment Technician, Owner
**Secondary Actors:** None
**Description:** Each actor views the stocktake sessions they are concerned with. The Warehouse Manager sees all sessions, the Garment Technician sees only the sessions assigned to them, and the Owner sees the sessions that have started.
**Preconditions:**
1. The actor is logged in.

**Normal Flow:**
1. The Warehouse Manager opens the stocktake page.
2. The system shows the sessions tab with session code, scope, time window, counter, progress, status and whether the shelves are locked.
3. The Warehouse Manager can switch to the reports tab to see only the sessions that have finished counting.
4. The Warehouse Manager clicks a session to open its report (UC-073).

**Alternative Flows:**
**Step 1.1_Garment Technician View**  
The Garment Technician opens their stocktake page.  
System lists only the sessions assigned to them with code and name, warehouse type and scope, schedule and deadline, manager in charge, status and actions.  
The Garment Technician filters by status or clicks "Làm mới danh sách" to reload.  
The Garment Technician opens a session to count (UC-071), and the use case ends.

**Step 1.2_Owner View**  
The Owner opens the stocktake reports page.  
System lists the sessions that have started, with code, warehouse type, status, number of items, number of variance lines and creation date.  
The Owner searches by session code, filters by warehouse type and status, and clicks "Tìm kiếm".  
System shows the matching sessions.  
The Owner clicks "Xem báo cáo" to open a report (UC-073), and the use case ends.

**Step 2.1_No Session**  
System finds no session to show.  
System shows that there is no data, and the use case ends.

**Postconditions:** No data is changed.

---

## UC-071: Execute Physical Stocktake Count

**Primary Actors:** Garment Technician
**Secondary Actors:** Warehouse Manager (receives the result)
**Description:** The Garment Technician counts the stock shelf by shelf in a session assigned by the Warehouse Manager, corrects counted quantities where needed, records damaged goods, and submits the result to the Warehouse Manager for review.
**Preconditions:**
1. The Garment Technician is logged in.
2. The Warehouse Manager has created a session and assigned it to this Garment Technician.
3. The session is waiting or being counted.

**Normal Flow:**
1. In the stocktake list, the Garment Technician clicks "Vào kiểm kê" (or "Tiếp tục kiểm") on a session.
2. The system opens the counting screen at step 1 (scan shelf).
3. The Garment Technician scans each shelf and its items (UC-072).
4. When one shelf is done, the Garment Technician clicks "Đổi kệ khác", confirms, and scans the next shelf. Data already scanned is kept.
5. When all shelves are counted, the Garment Technician clicks "Hoàn thành & Gửi quản lý duyệt".
6. The system shows a confirmation dialog with the counted total, the system total, the number of items with variance and the number of uncounted lines.
7. If every line is counted and matches, no note is required.
8. The Garment Technician clicks "Gửi duyệt ngay".
9. The system changes the session to pending approval, unlocks the shelves, notifies the Warehouse Manager, and shows a summary of the result.

**Alternative Flows:**
**Step 1.1_Session Closed**  
The session has been approved or cancelled, so it shows "Xem kết quả" instead of "Vào kiểm kê".  
The Garment Technician clicks "Xem kết quả".  
System shows the counted result as read-only; nothing can be scanned, edited or submitted.  
The use case ends.

**Step 3.1_Correct A Quantity**  
The Garment Technician clicks "Sửa" on a line.  
System opens the quantity dialog with the system quantity and the current count.  
The Garment Technician enters the counted quantity and clicks "Lưu số lượng".  
System validates that the quantity is not negative, updates the line and its variance.  
If the quantity is negative, the system shows an error and keeps the dialog open.  
The use case returns to step 3.

**Step 3.2_Record Damaged Goods**  
In the quantity dialog, the Garment Technician enters the damaged quantity and describes the condition, then clicks "Lưu số lượng".  
System validates that the damaged quantity is not greater than the counted quantity and that the condition is described.  
If not, the system shows an error and keeps the dialog open.  
System saves the damaged quantity, and the use case returns to step 3.

**Step 3.3_Back To List**  
The Garment Technician clicks "Quay lại danh sách".  
System keeps the scanned data and shows the session list; the Garment Technician can continue later with "Tiếp tục kiểm".  
The use case ends.

**Step 7.1_Result Has Issues**  
Some lines differ, are not counted or have damaged goods.  
System requires the Garment Technician to enter a reason; the Warehouse Manager reads it when approving.  
The Garment Technician enters the reason, and the use case continues at step 8.  
If the reason is empty when "Gửi duyệt ngay" is clicked, the system shows an error and the use case returns to step 7.

**Step 8.1_Continue Counting**  
The Garment Technician clicks "Tiếp tục kiểm tra" instead of submitting.  
System closes the dialog without submitting.  
The use case returns to step 3.

**Step 9.1_Session Closed While Counting**  
System validates that the session has been approved or cancelled meanwhile.  
System shows that the session can no longer be changed, and the use case ends.

**Postconditions:** The session is pending approval with the counted quantity, variance and damaged quantity of every line, and the submission note. The shelves are unlocked. Inventory is not changed yet.

---

## UC-072: Scan Barcode to Count

**Primary Actors:** Garment Technician
**Secondary Actors:** None
**Description:** The Garment Technician scans the barcode of a shelf in the session scope, then scans each item on it. Each scan adds one to the counted quantity of that item at that shelf. The first scan of a shelf starts the session and locks the shelf for stocktaking.
**Preconditions:**
1. The Garment Technician is logged in and has opened a session (UC-071).
2. The session is not closed.

**Normal Flow:**
1. At step 1, the Garment Technician scans the shelf barcode with the camera ("Mở camera") or a handheld scanner, or enters the code and clicks "Xác nhận kệ".
2. The system checks that the shelf belongs to the session scope, locks it for stocktaking and confirms the shelf. If the session was waiting, it becomes counting.
3. The system shows the items expected on the shelf with barcode, item name, system quantity, counted quantity and variance.
4. The Garment Technician scans the barcode of a product unit, fabric roll or accessory lot, or enters it and clicks "Đếm +1".
5. The system adds one to the counted quantity and shows the item with its new count and variance (match, over or short).
6. The Garment Technician repeats steps 4–5 for every item on the shelf.

**Alternative Flows:**
**Step 1.1_Camera Unavailable**  
The Garment Technician clicks "Mở camera", but the browser cannot open the camera.  
System shows that the camera cannot be opened.  
The Garment Technician uses a handheld scanner or enters the code, and the use case continues at step 2.

**Step 2.1_Empty Barcode**  
System validates that no shelf code was scanned or entered.  
System asks the Garment Technician to scan or enter the shelf barcode.  
The use case returns to step 1.

**Step 2.2_Product Barcode At Shelf Step**  
System validates that the scanned code is a product barcode, not a shelf barcode.  
System explains this, shows the shelf the product belongs to, and asks to scan the shelf first.  
The use case returns to step 1.

**Step 2.3_Unknown Shelf**  
System validates that no location matches the code.  
System shows an error.  
The use case returns to step 1.

**Step 2.4_Shelf Out Of Scope**  
System validates that the shelf is in another warehouse, another zone, or not in the session's locations.  
System shows an error naming the shelf and the session scope.  
The use case returns to step 1.

**Step 2.5_Session Closed**  
System validates that the session has been approved or cancelled.  
System shows that the session can no longer be changed, and the use case ends.

**Step 4.1_Item Step Before Shelf**  
No shelf has been confirmed yet.  
System asks the Garment Technician to finish step 1 first.  
The use case returns to step 1.

**Step 5.1_Item Not Expected On This Shelf**  
System validates that the scanned barcode is not in the shelf's system stock.  
System adds a new line with system quantity 0 and shows it as over.  
The use case continues at step 6.

**Step 5.2_Empty Item Barcode**  
System validates that no item barcode was scanned or entered.  
System asks the Garment Technician to scan or enter the item barcode.  
The use case returns to step 4.

**Postconditions:** The counted quantity and variance of the scanned items are saved. The shelf stays locked for putaway and packing until the session is submitted.

---

## UC-073: View Inventory Variance Report

**Primary Actors:** Warehouse Manager, Owner
**Secondary Actors:** None
**Description:** The Warehouse Manager or the Owner opens the report of a stocktake session to compare system stock with counted stock line by line. The report also shows when the variance exceeds the minor threshold or includes aging stock (major variance).
**Preconditions:**
1. The actor is logged in.
2. The session has started counting.

**Normal Flow:**
1. The Warehouse Manager clicks a session on the stocktake page.
2. The system shows the report: status, counter, assigned approver, schedule, counting progress and the Garment Technician's submission note.
3. The system shows the totals: system quantity, counted quantity, and missing or uncounted quantity.
4. The system shows every line: location, item, system quantity, counted quantity, variance, damaged quantity, unit cost, aging, counting time, and the planned adjustment.
5. The Warehouse Manager can choose to show only lines with variance.

**Alternative Flows:**
**Step 1.1_Owner View**  
The Owner clicks "Xem báo cáo" on a session in the stocktake reports page.  
System shows the total absolute variance quantity and value, and the minor threshold.  
System shows every line with item code, system quantity, counted quantity, variance, unit cost, aging and counting time.  
The Owner only views the report, and the use case ends.

**Step 1.2_Session Not Found**  
System cannot find the session.  
System shows an error and the button "Quay lại danh sách".  
The Warehouse Manager clicks "Quay lại danh sách", and the use case ends.

**Step 2.1_Still Counting**  
The Garment Technician has not submitted the session yet.  
System shows that the figures are the results recorded so far.  
The use case continues at step 3.

**Step 4.1_Major Variance**  
The variance exceeds the minor threshold or includes aging stock.  
System shows a warning on the report.  
The use case continues at step 5.

**Step 4.2_Missing Unit Cost**  
Some lines have no unit cost.  
System warns that the variance value cannot be calculated.  
The use case continues at step 5.

**Step 4.3_Uncounted Lines**  
Some lines have not been counted.  
System marks them as not counted and warns that they will count as missing when approved.  
The use case continues at step 5.

**Step 5.1_No Variance Line**  
The Warehouse Manager chooses to show only lines with variance, and there is none.  
System shows that there is no variance line, and the use case ends.

**Postconditions:** No data is changed.

---

## UC-074: Approve Inventory Variance

**Primary Actors:** Warehouse Manager
**Secondary Actors:** Garment Technician (receives notification)
**Description:** The Warehouse Manager approves the variance report submitted by the Garment Technician, including a major variance. Approving does not change inventory yet; the session waits for adjustment (UC-075).
**Preconditions:**
1. The Warehouse Manager is logged in.
2. The Garment Technician has submitted the session and it is pending approval.

**Normal Flow:**
1. The Warehouse Manager opens the report (UC-073).
2. The Warehouse Manager clicks "Duyệt báo cáo".
3. The system shows the approval dialog with the total variance, the issues of the report and the Garment Technician's note.
4. The Warehouse Manager enters the approval reason and clicks "Xác nhận duyệt".
5. The system saves the approval with the report data the manager has seen, changes the session to approved and waiting for adjustment, notifies the people concerned, and shows a success message.

**Alternative Flows:**
**Step 3.1_Report Has Issues**  
The variance exceeds the threshold, some lines are not counted, or unit costs are missing.  
System lists the issues in the dialog and still allows approval; the issues will be saved with the approval.  
The use case continues at step 4.

**Step 4.1_No Reason**  
The Warehouse Manager clicks "Xác nhận duyệt" without entering a reason.  
System asks the Warehouse Manager to enter the approval reason.  
The use case returns to step 4.

**Step 4.2_Cancel**  
The Warehouse Manager clicks "Quay lại" or "×" instead of confirming.  
System closes the dialog without approving, and the use case ends.

**Step 5.1_Report Changed**  
System validates that the report changed after the Warehouse Manager opened it.  
System asks to reload and review again.  
The Warehouse Manager clicks "Làm mới", and the use case returns to step 1.

**Step 5.2_Already Processed**  
System validates that the session is no longer pending approval.  
System shows an error, and the use case ends.

**Step 5.3_Adjustment Already Recorded**  
System validates that the session already has adjustment transactions.  
System asks to reconcile before approving, and the use case ends.

**Postconditions:** The session is approved and waiting for adjustment, with the approver, time, reason and any issues recorded. Inventory is not changed yet.

---

## UC-075: Adjust Inventory

**Primary Actors:** Warehouse Manager
**Secondary Actors:** Garment Technician, Accountant (receive notifications)
**Description:** The Warehouse Manager applies an approved stocktake result to inventory. Lost or damaged finished goods units are written off, accessory lot quantities are corrected, and lines the system cannot adjust automatically are marked for manual handling. The session then ends.
**Preconditions:**
1. The Warehouse Manager is logged in.
2. The session is approved and waiting for adjustment (UC-074).

**Normal Flow:**
1. The Warehouse Manager opens the report. The system shows that inventory has not changed yet.
2. The Warehouse Manager clicks "Điều chỉnh tồn kho".
3. The system shows the adjustment dialog with each line to adjust: item, action (write off, change quantity or manual handling), reason and note.
4. For a missing unit, the Warehouse Manager chooses the reason (lost or damaged; the reason of a unit reported damaged is fixed) and optionally enters a note.
5. The Warehouse Manager clicks "Xác nhận điều chỉnh (… dòng)".
6. The system deducts SKU stock, lot stock and shelf occupancy, records stocktake adjustment transactions, ends the session, notifies the Accountant and the Garment Technician, and shows a success message.

**Alternative Flows:**
**Step 3.1_Nothing To Adjust**  
Every count matches the system.  
System shows that there is nothing to adjust.  
The Warehouse Manager clicks "Xác nhận điều chỉnh (… dòng)".  
System ends the session without changing inventory, and the use case ends.

**Step 3.2_Manual Line**  
A unit counted on this shelf is recorded on another shelf, a fabric roll differs, or a unit changed status after counting.  
System shows the reason on that line and will not adjust it automatically.  
The use case continues at step 4.

**Step 5.1_Cancel**  
The Warehouse Manager clicks "Quay lại" or "×" instead of confirming.  
System closes the dialog; inventory is not changed, and the use case ends.

**Step 6.1_Not Enough Stock To Deduct**  
System validates that the SKU or raw material stock is lower than the quantity to deduct.  
System asks to reconcile first; nothing is adjusted, and the use case ends.

**Step 6.2_Session Changed**  
System validates that the session changed after the Warehouse Manager opened it.  
System asks to reload before adjusting.  
The Warehouse Manager clicks "Làm mới", and the use case returns to step 1.

**Step 6.3_Wrong Status**  
System validates that the session is not waiting for adjustment.  
System shows an error, and the use case ends.

**Postconditions:** Inventory matches the approved stocktake result, except lines marked for manual handling. Adjustment transactions are recorded. The session is ended and cannot be undone.

---

## Notes – code differences to resolve

These points differ from the agreed rules; the descriptions above follow the rules, not the current code:
1. **Owner approval:** The Owner's report page still has an approval form and the API `POST /owner/stock-adjustments/:id/approve`. Rule: the Owner only views.
2. **Owner on manager APIs:** `/stocktake` routes (create, update or cancel sessions and schedules, approve, recount, adjust) accept the OWNER role. The Owner has no screen for them.
3. **Approver choice:** The create form allows choosing an Owner as approver.
4. **Recurring schedules do not create sessions:** No job creates sessions from a recurring schedule yet; only one-time orders create sessions.
5. **Recount:** The report page still has the button "Yêu cầu kiểm kê lại"; it is not in the UC list.
6. **Hide system quantity:** The option to hide system quantity from the counter is saved but not applied; the Garment Technician still sees the system quantity.
