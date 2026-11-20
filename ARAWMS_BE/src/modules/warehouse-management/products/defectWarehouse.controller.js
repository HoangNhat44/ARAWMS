/*
 * File: defectWarehouse.controller.js
 * Author: Duy Anh
 * Date: 2026-11-19
 * Description: HTTP handlers for the finished-goods defect warehouse: list defective units and take them out
 * with a typed reason. Business rules live in defectWarehouse.service.js.
 */
import { handle, requestError } from '../shared/warehouseHttp.js';
import { listDefectUnits, takeOutDefectUnits } from './defectWarehouse.service.js';

/** Validates the defect outbound body: 1-500 distinct unit barcodes and a 1-500 character reason. */
const parseDefectOutbound = (body) => {
  const reason = String(body?.reason ?? '').trim();
  if (!reason) throw requestError('Vui lòng nhập lý do xuất hàng lỗi', 'REASON_REQUIRED');
  if (reason.length > 500) throw requestError('Lý do xuất tối đa 500 ký tự', 'REASON_TOO_LONG');
  const barcodes = Array.isArray(body?.barcodes)
    ? [...new Set(body.barcodes.map((value) => String(value ?? '').trim()).filter(Boolean))] : [];
  if (!barcodes.length) throw requestError('Chưa quét tem hàng lỗi nào', 'BARCODES_REQUIRED');
  if (barcodes.length > 500) throw requestError('Mỗi lần xuất tối đa 500 chiếc', 'TOO_MANY_BARCODES');
  if (barcodes.some((barcode) => !/^[A-Za-z0-9_-]{3,128}$/.test(barcode))) throw requestError('Tem không hợp lệ', 'INVALID_BARCODE');
  return { barcodes, reason };
};

export const defectUnits = handle('Kho hàng lỗi', () => listDefectUnits());
export const defectOutbound = handle('Đã xuất hàng lỗi', (req) => takeOutDefectUnits(parseDefectOutbound(req.body), req.user),
  { status: 201, conflict: { message: 'Hàng lỗi vừa được thay đổi, hãy thử lại', code: 'DEFECT_OUTBOUND_CONFLICT' } });
