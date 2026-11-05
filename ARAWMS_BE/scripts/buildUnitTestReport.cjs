/*
 * File: buildUnitTestReport.cjs
 * Author: Duy Anh
 * Date: 2026-10-29
 * Description: Fills the supplied unit-test workbook from executed case results.
 */
const ExcelJS = require('exceljs');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '../..');
const source = path.join(root, 'Report-5.1_Unit Test.xlsx');
const destination = path.join(root, 'outputs', 'unit-test-report-2026-10-29', 'Report-5.1_Unit Test_Revised.xlsx');

// Each row records the observed code contract. Pending means its behavior has not been executed.
const inbound = [
  ['FG01','receivingQuantityError','SKU hợp lệ; kiểm nhận một dòng','expectedQty=10; receivedQty=8; quantity=6','Không có lỗi; số trả xưởng suy ra là 2','Normal','Passed'],
  ['FG02','POST /documents (IN)','SKU tồn đầu kỳ 4; kho hợp lệ; khóa xác nhận mới','Phiếu nhập hợp lệ, đạt 6','Tạo phiếu, lô, 6 mã riêng và giao dịch; tồn SKU thành 10','Normal','Pending'],
  ['FG03','receivingQuantityError','Một dòng kiểm nhận','expectedQty=8; receivedQty=8; quantity=8','Không có lỗi; số trả xưởng 0','Boundary','Passed'],
  ['FG04','receivingQuantityError','Một dòng kiểm nhận','expectedQty=5; receivedQty=6; quantity=4','Báo thực nhận vượt số xưởng bàn giao','Abnormal','Passed'],
  ['FG05','receivingQuantityError','Một dòng kiểm nhận','expectedQty=6; receivedQty=5; quantity=6','Báo số đạt vượt thực nhận','Abnormal','Passed'],
  ['FG06','receivingQuantityError','Một dòng kiểm nhận','Lần lượt thiếu expectedQty, receivedQty, quantity','Mỗi trường hợp đều trả lỗi trường bắt buộc','Abnormal','Passed'],
  ['FG07','receivingQuantityError','Một dòng kiểm nhận','expectedQty hoặc receivedQty lần lượt là 0, -1, 1.5, abc','Từ chối từng số lượng không hợp lệ','Abnormal','Passed'],
  ['FG08','receivingQuantityError','Một dòng kiểm nhận','expectedQty=8; receivedQty=8; quantity=0','Hợp lệ ở bước kiểm số lượng; 8 chiếc được tính trả xưởng','Boundary','Passed'],
  ['FG09','receivingQuantityError','Một dòng kiểm nhận','expectedQty/receivedQty/quantity=500; sau đó expectedQty=501','500 hợp lệ; 501 bị từ chối theo giới hạn code hiện tại','Boundary','Passed'],
  ['FG10','POST /documents (IN)','Ba SKU khác nhau; request hợp lệ còn lại','Tổng thực nhận=1001, tổng đạt=0','400 TOO_MANY_RECEIVED_UNITS; không ghi dữ liệu','Boundary','Passed'],
  ['FG11','POST /documents (IN)','Hai SKU khác nhau; request hợp lệ còn lại','Tổng đạt=501, tổng thực nhận=1000','400 TOO_MANY_UNITS; không ghi dữ liệu','Boundary','Passed'],
  ['FG12','POST /documents (IN)','Không có phiếu đã lưu cùng khóa','Lần lượt thiếu confirmationKey, documentCode sai, items=[]','400 INVALID_CONFIRMATION hoặc INVALID_BULK_DOCUMENT','Abnormal','Passed'],
  ['FG13','POST /documents (IN)','Có kho hợp lệ','productId không tồn tại; skuId không tồn tại/khác sản phẩm','PRODUCT_NOT_FOUND hoặc SKU_NOT_FOUND; không cộng tồn','Abnormal','Passed'],
  ['FG14','POST /documents (IN)','Sản phẩm và SKU hợp lệ','locationId là ObjectId không tồn tại','404 LOCATION_NOT_FOUND; không cộng tồn','Abnormal','Passed'],
  ['FG15','POST /documents (IN)','Chưa có phiếu cùng khóa','Hai dòng cùng productId và skuId','400 DUPLICATE_LINE; không ghi dữ liệu','Abnormal','Passed'],
  ['FG16','POST /documents (IN)','Đã xác nhận phiếu với confirmationKey K','Gửi lại K và cùng nội dung; rồi K với nội dung khác','Lần đầu trả phiếu cũ, không chạy ghi tồn; lần sau 409 CONFIRMATION_REUSED','Boundary','Passed'],
  ['FG17','POST /documents (IN)','Đã có documentCode NK-UT-001','Khóa xác nhận mới; documentCode=NK-UT-001','Từ chối mã phiếu trùng; không cộng tồn lại','Abnormal','Pending'],
  ['FG18','POST /documents (IN)','Có transaction MongoDB; gây lỗi khi lưu lô/mã/phiếu','Phiếu hợp lệ','Rollback phiếu, tồn, giao dịch, lô và barcode; không cập nhật dở dang','Abnormal','Pending'],
  ['FG19','receiptAllocationError','Hai SKU có 6 và 2 chiếc đạt','Không phân bổ; phân bổ thiếu; phân bổ đủ nhiều ô','Thiếu ô trả ALLOCATION_INCOMPLETE; phân bổ đủ hợp lệ','Abnormal','Passed'],
  ['FG20','BulkStockForm / POST /documents (IN)','Đã nhập số đạt của tất cả SKU; chưa chọn kệ','Gửi phiếu với phân bổ rỗng hoặc thiếu','Giao diện/API không xác nhận nhập khi chưa chọn đủ kệ','Abnormal','Pending'],
];
const packing = [
  ['PK01','openPackingSession','Đơn CONFIRMED_RESERVED, đủ FIFO, bàn rảnh','order; stationId hợp lệ','Mở phiên SCANNING, giữ đơn tại bàn','Normal','Pending'],
  ['PK02','openPackingSession','Đơn thiếu FIFO hoặc sai trạng thái','Mở phiên đóng hàng','ORDER_NOT_PACKABLE','Abnormal','Passed'],
  ['PK03','evaluatePackingBarcodeScan','Phiên cần SKU kem L, lô 1, ô 1','Mã CODE_128 AVAILABLE đúng SKU/lô/ô','Trả lineKey=0 và batchId=batch-1','Normal','Passed'],
  ['PK04','scanProductBarcodeForPacking','Phiên còn lease, chưa quét mã','Barcode hợp lệ; clientEventId mới','ACCEPTED; tăng một scannedUnit và lưu một scan event','Normal','Pending'],
  ['PK05','evaluatePackingBarcodeScan','Phiên đang quét','Barcode không tìm thấy unit','BARCODE_NOT_FOUND','Abnormal','Passed'],
  ['PK06','evaluatePackingBarcodeScan','Đơn cần SKU kem L','Unit của SKU kem M','ITEM_NOT_IN_ORDER','Abnormal','Passed'],
  ['PK07','evaluatePackingBarcodeScan','Đơn đã giữ lô 1, ô 1','Đúng SKU nhưng lô 2 hoặc ô 2','UNIT_NOT_RESERVED','Abnormal','Passed'],
  ['PK08','evaluatePackingBarcodeScan','Phiên đang quét','Unit UNAVAILABLE hoặc nhãn không phải CODE_128','UNIT_UNAVAILABLE','Abnormal','Passed'],
  ['PK09','evaluatePackingBarcodeScan','Barcode ARA-001 đã có trong scannedUnits','Quét lại ARA-001','BARCODE_ALREADY_SCANNED; không tăng số đã quét','Abnormal','Passed'],
  ['PK10','scanProductBarcodeForPacking','Sự kiện quét đã được lưu','Gửi lại cùng clientEventId','Trả kết quả cũ với duplicate=true; không quét thêm','Boundary','Passed'],
  ['PK11','evaluatePackingBarcodeScan','Đã đủ định mức dòng hoặc định mức lô FIFO','Quét barcode thứ ba cùng SKU/lô','QTY_EXCEEDED; nếu chuyển sang lô còn định mức thì được nhận','Boundary','Passed'],
  ['PK12','scanProductBarcodeForPacking','Không có phiên hợp lệ','sessionId sai định dạng; barcode còn lại hợp lệ','INVALID_SESSION; không ghi scan event','Abnormal','Passed'],
  ['PK21','scanProductBarcodeForPacking','Phiên không tồn tại hoặc thời hạn bàn đã hết','sessionId hợp lệ; quét barcode hợp lệ','SESSION_NOT_FOUND hoặc LEASE_EXPIRED; không nhận mã','Abnormal','Passed'],
  ['PK13','scanProductBarcodeForPacking','Phiên còn lease','Thiếu/sai stationId, clientEventId hoặc barcode','INVALID_STATION/INVALID_EVENT_ID/INVALID_BARCODE','Abnormal','Passed'],
  ['PK14','scanProductBarcodeForPacking','Đơn đổi trạng thái/updatedAt sau khi mở phiên','Quét barcode hợp lệ','ORDER_CHANGED; không nhận mã','Abnormal','Pending'],
  ['PK15','scanProductBarcodeForPacking','Barcode đã gắn vào đơn khác','Quét barcode đó','BARCODE_ASSIGNED_OTHER_ORDER; không tăng số đã quét','Abnormal','Pending'],
  ['PK16','scanProductBarcodeForPacking','Còn thiếu một chiếc','Quét chiếc cuối hợp lệ','Trước khi đủ: SCANNING; khi đủ: READY_TO_RECORD','Boundary','Pending'],
  ['PK17','discardPackingAttempt','Phiên có mã đã quét; chưa có video lưu','Bỏ lần đóng, mở lại đơn và quét lại mã','Xóa allocation/tiến độ cũ, trở về SCANNING; mã có thể dùng lại','Normal','Pending'],
  ['PK18','discardPackingAttempt','Phiên đã có video lưu','Yêu cầu bỏ lần đóng','VIDEO_ALREADY_SAVED; mã đã dùng không bị xóa','Abnormal','Pending'],
  ['PK19','completeVideo / consumePackedStock','Phiên còn thiếu mã','Yêu cầu trừ tồn khi đóng hàng','SCAN_INCOMPLETE; chưa thực hiện cập nhật tồn','Abnormal','Passed'],
  ['PK20','completeVideo / consumePackedStock','Đã quét đủ đúng mã; video hợp lệ','Đồng bộ video','Đơn PACKED; trừ đúng SKU/lô/ô, mã chuyển UNAVAILABLE','Normal','Pending'],
];

const workbook = new ExcelJS.Workbook();
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const set = (sheet, address, value) => { sheet.getCell(address).value = value; };
const formula = (sheet, address, expression, result) => { sheet.getCell(address).value = { formula: expression, result }; };
const count = (rows, typeOrStatus, column) => rows.filter((row) => row[column] === typeOrStatus).length;
const testDate = new Date('2026-10-29T00:00:00Z');
const round2Inbound = new Set(['FG01','FG03','FG04','FG05','FG06','FG07','FG08','FG09','FG10','FG11','FG12','FG15','FG16']);
const round2Packing = new Set(['PK02','PK03','PK05','PK06','PK07','PK08','PK09','PK10','PK11','PK12','PK13','PK19','PK21']);
const typeLabel = { Normal: 'Thông thường', Abnormal: 'Bất thường', Boundary: 'Giá trị biên' };

const cloneDetail = (template, name) => {
  const sheet = workbook.addWorksheet(name);
  for (let col = 1; col <= 20; col++) {
    const src = template.getColumn(col);
    sheet.getColumn(col).width = src.width;
    sheet.getColumn(col).hidden = src.hidden;
  }
  for (let rowNo = 1; rowNo <= 24; rowNo++) {
    const sourceRow = template.getRow(rowNo);
    const targetRow = sheet.getRow(rowNo);
    targetRow.height = sourceRow.height;
    sourceRow.eachCell({ includeEmpty: true }, (cell, col) => {
      const dest = targetRow.getCell(col);
      dest.value = clone(cell.value);
      dest.style = clone(cell.style);
    });
  }
  for (const merge of Object.values(template._merges)) sheet.mergeCells(merge.range);
  return sheet;
};

const fillDetail = (sheet, rows, label) => {
  // Template example section headings merged through result columns; case rows need independent round cells.
  sheet.unMergeCells('D20:L20');
  sheet.unMergeCells('D23:L23');
  set(sheet,'A1',null); set(sheet,'A2','Chức năng'); set(sheet,'A3','Số ca kiểm thử');
  set(sheet,'A4','Vòng kiểm thử'); set(sheet,'A5','Vòng 1');
  set(sheet,'A6','Vòng 2'); set(sheet,'A7','Vòng 3');
  set(sheet,'B4','Đạt'); set(sheet,'C4','Không đạt'); set(sheet,'D4','Chưa chạy');
  set(sheet,'A8','Loại ca'); set(sheet,'B8','Thông thường');
  set(sheet,'C8','Bất thường'); set(sheet,'D8','Giá trị biên');
  const headings = ['Mã ca','Điều kiện ban đầu','Dữ liệu đầu vào','Kết quả mong đợi','Loại',
    'Vòng 1','Ngày kiểm thử','Người kiểm thử','Vòng 2','Ngày kiểm thử','Người kiểm thử',
    'Vòng 3','Ngày kiểm thử','Người kiểm thử','Mã lỗi','Ghi chú'];
  headings.forEach((heading, index) => set(sheet,`${String.fromCharCode(65+index)}11`,heading));
  set(sheet,'T2','Đạt'); set(sheet,'T3','Chưa chạy'); set(sheet,'T4','Không áp dụng');
  set(sheet,'T8',null);
  set(sheet, 'B2', label);
  formula(sheet, 'B3', 'COUNTIF(A13:A200,"UTC*")', rows.length);
  const passed = count(rows, 'Passed', 6);
  const pending = count(rows, 'Pending', 6);
  const historical = label === 'Nhập kho thành phẩm' ? round2Inbound : round2Packing;
  for (const [row, column] of [[5,'F'],[6,'I'],[7,'L']]) {
    formula(sheet, `B${row}`, `COUNTIF($${column}$13:$${column}$200,B$4)`, row === 5 ? 0 : row === 6 ? historical.size : passed);
    formula(sheet, `C${row}`, `COUNTIF($${column}$13:$${column}$200,C$4)`, 0);
    formula(sheet, `D${row}`, `COUNTIF($${column}$13:$${column}$200,D$4)`, row === 7 ? pending : 0);
  }
  for (const [col, type] of [['B','Normal'],['C','Abnormal'],['D','Boundary']])
    formula(sheet, `${col}9`, `COUNTIF($E$13:$E$200,${col}8)`, count(rows, type, 5));
  for (let row = 12; row <= 80; row++)
    for (let col = 1; col <= 16; col++) sheet.getRow(row).getCell(col).value = null;
  let currentRow = 12;
  let lastFunction = '';
  for (const entry of rows) {
    const [id, fn, pre, input, expected, type, status] = entry;
    if (fn !== lastFunction) {
      const group = sheet.getRow(currentRow);
      group.getCell(1).value = fn;
      group.getCell(1).style = clone(sheet.getCell('A12').style);
      group.height = 23;
      lastFunction = fn;
      currentRow++;
    }
    const target = sheet.getRow(currentRow);
    for (let col = 1; col <= 16; col++) target.getCell(col).style = clone(sheet.getRow(13).getCell(col).style);
    target.getCell(1).value = `UTC-${id}`;
    target.getCell(2).value = pre;
    target.getCell(3).value = input;
    target.getCell(4).value = expected;
    target.getCell(5).value = typeLabel[type];
    if (historical.has(id)) {
      target.getCell(9).value = 'Đạt';
      target.getCell(10).value = testDate;
      target.getCell(10).numFmt = 'dd/mm/yyyy';
      target.getCell(11).value = 'Duy Anh';
    }
    target.getCell(12).value = status === 'Passed' ? 'Đạt' : 'Chưa chạy';
    if (status === 'Passed') {
      target.getCell(13).value = testDate;
      target.getCell(13).numFmt = 'dd/mm/yyyy';
      target.getCell(14).value = 'Duy Anh';
    }
    const round2Commit = id.startsWith('FG') ? '79bace4' : 'c156e63';
    const round2Log = id.startsWith('FG') ? 'round2-inbound-79bace4.log' : 'round2-packing-c156e63.log';
    const notes = ['Chưa có dữ liệu kiểm thử lịch sử.'];
    if (historical.has(id)) notes.push(`Vòng 2: chạy ngày 29/10/2026 trên commit ${round2Commit}; nhật ký ${round2Log}.`);
    if (status === 'Passed') notes.push('Vòng 3: chạy ngày 29/10/2026 trên mã hiện tại; nhật ký round3-node-test.log.');
    if (id.startsWith('FG') && status === 'Passed') notes.push('Mã nhập kho hiện tại gồm 7bc00e8 và thay đổi chưa commit.');
    if (id === 'FG09' || id === 'FG10' || id === 'FG11') notes.push('Giới hạn hiện có trong mã; chưa xác nhận là quy định nghiệp vụ.');
    if (id === 'FG19' || id === 'FG20') notes.push('Đã sửa yêu cầu chọn đủ kệ ở bản làm việc chưa commit; chưa có commit sửa để ghi.');
    if (status === 'Pending') notes.push('Chưa chạy ca này trên môi trường MongoDB thử biệt lập.');
    target.getCell(16).value = notes.join(' ');
    target.height = 65;
    target.alignment = { vertical: 'middle', wrapText: true };
    currentRow++;
  }
  sheet.getColumn(1).width = 27;
  sheet.getColumn(2).width = 44;
  sheet.getColumn(3).width = 48;
  sheet.getColumn(4).width = 60;
  sheet.getColumn(5).width = 14;
  sheet.getColumn(6).width = 15;
  sheet.getColumn(16).width = 52;
  sheet.views = [{ state: 'frozen', ySplit: 11, xSplit: 1 }];
  return { passed, pending, total: rows.length,
    normal: count(rows,'Normal',5), abnormal: count(rows,'Abnormal',5), boundary: count(rows,'Boundary',5) };
};

(async () => {
  await workbook.xlsx.readFile(source);
  const cover = workbook.getWorksheet('Cover');
  const cases = workbook.getWorksheet('Test Cases');
  const stats = workbook.getWorksheet('Test Statistics');
  const inboundSheet = workbook.getWorksheet('ModuleName1');
  const packingSheet = cloneDetail(inboundSheet, 'Quet ma dong hang');
  inboundSheet.name = 'Nhap kho thanh pham';
  const i = fillDetail(inboundSheet, inbound, 'Nhập kho thành phẩm');
  const p = fillDetail(packingSheet, packing, 'Quét mã đóng hàng');

  set(cover,'B2','TÀI LIỆU KIỂM THỬ ĐƠN VỊ');
  for (const [address, value] of Object.entries({ A4:'Tên dự án', A5:'Mã dự án',
    A6:'Mã tài liệu', E4:'Người lập', E5:'Ngày lập', E6:'Phiên bản',
    A9:'Lịch sử cập nhật', A10:'Ngày hiệu lực', B10:'Phiên bản',
    C10:'Nội dung thay đổi', D10:'Loại', E10:'Mô tả', F10:'Tài liệu tham chiếu' })) set(cover,address,value);
  set(cover,'B4','ARAWMS'); set(cover,'B5','ARAWMS');
  formula(cover,'B6','B5&"_KTĐV_v1.1"','ARAWMS_KTĐV_v1.1');
  set(cover,'F4','Duy Anh'); set(cover,'F5',testDate);
  set(cover,'F6','1.1');
  set(cover,'A11',testDate);
  set(cover,'B11','1.1'); set(cover,'C11','Đối chiếu lịch sử mã nguồn và nhật ký kiểm thử'); set(cover,'D11','S');
  set(cover,'E11','Tách ba vòng theo bằng chứng, sửa quy tắc chọn kệ và cập nhật thống kê vòng 3');
  set(cover,'F11','Git và nhật ký kiểm thử ngày 29/10/2026');

  set(cases,'B1','DANH SÁCH CA KIỂM THỬ');
  set(cases,'B2','DANH SÁCH CA KIỂM THỬ');
  set(cases,'B3','Tên dự án'); set(cases,'B4','Mã dự án');
  set(cases,'B5','Môi trường kiểm thử');
  formula(cases,'D3','Cover!B4','ARAWMS');
  formula(cases,'D4','Cover!B5','ARAWMS');
  set(cases,'D5','Node.js (bộ chạy kiểm thử tích hợp); dữ liệu mô phỏng cho kiểm thử đơn vị. Chưa có MongoDB thử biệt lập để xác minh giao dịch nhiều bảng.');
  for (const [address,value] of Object.entries({ B8:'STT', C8:'Chức năng', D8:'Tên trang',
    E8:'Nội dung', F8:'Điều kiện ban đầu' })) set(cases,address,value);
  set(cases,'C9','Nhập kho thành phẩm'); set(cases,'D9',inboundSheet.name);
  set(cases,'E9',`${i.total} ca: kiểm nhận số lượng, tạo phiếu, tồn kho, mã từng chiếc và chọn kệ.`);
  set(cases,'F9','Sản phẩm/SKU và kho hợp lệ; khóa xác nhận riêng; dữ liệu thử biệt lập.');
  set(cases,'C10','Quét mã đóng hàng'); set(cases,'D10',packingSheet.name);
  set(cases,'E10',`${p.total} ca: phiên đóng, đối chiếu mã với đơn/lô đã giữ, đóng lại và hoàn tất.`);
  set(cases,'F10','Đơn đã phân bổ theo thứ tự nhập trước xuất trước; mã hàng và phiên bàn đóng hợp lệ.');

  set(stats,'A2','THỐNG KÊ KIỂM THỬ ĐƠN VỊ');
  for (const [address,value] of Object.entries({ A4:'Tên dự án',A5:'Mã dự án',A6:'Mã tài liệu',
    D4:'Người lập',D5:'Người duyệt',D6:'Ngày lập',A7:'Ghi chú',
    A9:'Vòng đang tổng hợp',B9:'Vòng 3',A11:'STT',B11:'Chức năng',
    C11:'Đạt',D11:'Không đạt',E11:'Chưa chạy',F11:'Thông thường',
    G11:'Bất thường',H11:'Giá trị biên',I11:'Tổng số ca',
    B16:'Tổng cộng',B18:'Tỷ lệ đã kiểm thử',B19:'Tỷ lệ đạt',
    B20:'Ca thông thường',B21:'Ca bất thường',B22:'Ca giá trị biên' })) set(stats,address,value);
  set(stats,'E4','Duy Anh'); set(stats,'F6',testDate);
  set(stats,'B7','Chỉ tổng hợp Vòng 3. Vòng 1 chưa có nhật ký lịch sử; Vòng 2 chạy lại snapshot commit ngày 29/10/2026.');
  for (const [row, sheetName, result] of [[12,inboundSheet.name,i],[13,packingSheet.name,p]]) {
    set(stats,`B${row}`,sheetName);
    const quoted = `'${sheetName}'`;
    for (const [col, cell, value] of [
      ['C','B7',result.passed],['D','C7',0],['E','D7',result.pending],
      ['F','B9',result.normal],['G','C9',result.abnormal],['H','D9',result.boundary],['I','B3',result.total]])
      formula(stats,`${col}${row}`,`${quoted}!${cell}`,value);
  }
  const total = i.total+p.total;
  for (const [col, value] of [['C',i.passed+p.passed],['D',0],['E',i.pending+p.pending],
    ['F',i.normal+p.normal],['G',i.abnormal+p.abnormal],['H',i.boundary+p.boundary],['I',total]])
    formula(stats,`${col}16`,`SUM(${col}12:${col}13)`,value);
  formula(stats,'D18','(C16+D16)*100/I16',(i.passed+p.passed)*100/total);
  formula(stats,'D19','C16*100/I16',(i.passed+p.passed)*100/total);
  formula(stats,'D20','F16*100/I16',(i.normal+p.normal)*100/total);
  formula(stats,'D21','G16*100/I16',(i.abnormal+p.abnormal)*100/total);
  formula(stats,'D22','H16*100/I16',(i.boundary+p.boundary)*100/total);
  workbook.calcProperties.fullCalcOnLoad = true;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  await workbook.xlsx.writeFile(destination);
  console.log(JSON.stringify({ destination, inbound: i, packing: p, total }));
})().catch((error) => { console.error(error); process.exitCode=1; });
