/*
 * File: fabricRollExcelImport.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Creates and previews the fabric-roll receipt workbook. Validates each row against active warehouse locations before the user adds rolls to a draft.
 */
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { getReceiptOptions, ReceiptError } from './inboundExecution.service.js';

const headings = ['Mã cây NCC', 'Mã lô', 'Khổ (cm)', 'Chiều dài (m)', 'Cân nặng (kg)', 'Kết quả', 'Lý do không đạt', 'Mã vị trí'];

/** Produces a blank, documented template without inserting demo receipt records. */
export async function createFabricRollTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Cây vải');
  sheet.addRow(headings);
  sheet.getRow(1).font = { bold: true };
  sheet.columns = headings.map((heading) => ({ header: heading, width: Math.max(18, heading.length + 5) }));
  return workbook.xlsx.writeBuffer();
}

/** Reads supplier roll rows as a preview; no stock or ticket data is written. */
export async function previewFabricRollImport(buffer, user) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer.subarray(0, 2).toString() !== 'PK') {
    throw new ReceiptError('Cần file .xlsx hợp lệ', 'INVALID_EXCEL_FILE');
  }
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); }
  catch { throw new ReceiptError('Không đọc được file Excel', 'INVALID_EXCEL_FILE'); }
  const sheet = workbook.worksheets[0];
  if (!sheet || headings.some((heading, index) => String(sheet.getRow(1).getCell(index + 1).text || '').trim() !== heading)) {
    throw new ReceiptError('Tiêu đề cột không khớp file mẫu', 'INVALID_EXCEL_HEADERS');
  }
  if (sheet.rowCount > 501) throw new ReceiptError('Tối đa 500 cây vải mỗi lần nhập', 'TOO_MANY_ROLLS');
  const { locations } = await getReceiptOptions(user);
  const byCode = new Map(locations.map((item) => [String(item.locationCode).toUpperCase(), item]));
  const rolls = [];
  const errors = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (row.values.slice(1).every((value) => value == null || String(value).trim() === '')) continue;
    const text = (column) => String(row.getCell(column).text || '').trim();
    const quality = text(6).toUpperCase();
    const location = byCode.get(text(8).toUpperCase());
    const widthCm = Number(row.getCell(3).value);
    const lengthMeters = Number(row.getCell(4).value);
    const weightKg = text(5) ? Number(row.getCell(5).value) : 0;
    const validNumber = (value, required) => Number.isFinite(value) && (required ? value > 0 : value >= 0) &&
      Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001;
    if (!validNumber(widthCm, true) || !validNumber(lengthMeters, true) || !validNumber(weightKg, false) ||
      !['ACCEPTED', 'REJECTED'].includes(quality) || !location ||
      location.warehouseType !== (quality === 'ACCEPTED' ? 'RAW_MATERIAL' : 'DEFECT_QUARANTINE') ||
      (location.capacityUnit && location.capacityUnit !== 'METER') ||
      (quality === 'REJECTED' && !text(7))) {
      errors.push({ row: rowNumber, message: 'Kiểm tra khổ, chiều dài, cân nặng, kết quả, lý do và mã vị trí' });
      continue;
    }
    rolls.push({ clientLineId: randomUUID(), supplierRollCode: text(1), lotCode: text(2), widthCm,
      lengthMeters, weightKg, quality, defectReason: text(7), locationId: String(location._id) });
  }
  return { rolls, errors };
}
