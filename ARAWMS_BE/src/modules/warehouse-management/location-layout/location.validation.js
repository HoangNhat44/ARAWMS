/*
 * File: location.validation.js
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: Input validation for warehouse layout and putaway requests that is not done by the services.
 */
import mongoose from 'mongoose';
import { requestError } from '../shared/warehouseHttp.js';

/** Rotating a bin barcode invalidates printed labels, so a reason is required. */
export const parseRotateReason = (body) => {
  const reason = String(body?.reason || '').trim();
  if (!reason) throw requestError('Cần ghi lý do đổi mã', 'REASON_REQUIRED');
  return reason;
};

export const assertReceiptId = (value) => {
  if (!mongoose.isValidObjectId(value)) throw requestError('Phiếu nhập không hợp lệ', 'INVALID_RECEIPT');
};

/** A manager accepts a reported shortage (true) or sends the line back for picking (false). */
export const parseShortageDecision = (body) => {
  if (typeof body?.accept !== 'boolean') throw requestError('Cần chọn chấp nhận hoặc trả lại để xếp tiếp', 'INVALID_DECISION');
  return body.accept;
};
