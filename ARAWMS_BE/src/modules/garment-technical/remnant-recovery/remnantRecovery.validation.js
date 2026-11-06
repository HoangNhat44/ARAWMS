/*
 * File: remnantRecovery.validation.js
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Description: Validation helpers for Garment Outbound Requests and Cutting Remnant Recovery.
 */

export function validateCreateOutboundRequest(body = {}) {
  const purpose = String(body.purpose || '').trim();
  const lines = Array.isArray(body.lines) ? body.lines : [];

  if (!purpose) {
    const error = new Error('Vui lòng nhập mục đích xuất nguyên phụ liệu (VD: Cắt may đơn hàng, may mẫu...)');
    error.status = 400;
    error.code = 'INVALID_PURPOSE';
    throw error;
  }

  if (lines.length === 0) {
    const error = new Error('Danh sách nguyên phụ liệu cần xuất không được để trống.');
    error.status = 400;
    error.code = 'EMPTY_LINES';
    throw error;
  }

  const validatedLines = lines.map((line, idx) => {
    const rawMaterialId = String(line.rawMaterialId || '').trim();
    const quantity = Number(line.quantity);

    if (!rawMaterialId) {
      const error = new Error(`Dòng ${idx + 1}: Vui lòng chọn nguyên phụ liệu.`);
      error.status = 400;
      error.code = 'INVALID_MATERIAL';
      throw error;
    }

    if (Number.isNaN(quantity) || quantity <= 0) {
      const error = new Error(`Dòng ${idx + 1}: Số lượng yêu cầu xuất phải lớn hơn 0.`);
      error.status = 400;
      error.code = 'INVALID_QUANTITY';
      throw error;
    }

    return {
      rawMaterialId,
      quantity,
      note: String(line.note || '').trim(),
    };
  });

  return {
    purpose,
    department: String(body.department || 'XƯỞNG MAY').trim(),
    lines: validatedLines,
  };
}

export function validateRecordCutting(body = {}) {
  const outboundTicketId = String(body.outboundTicketId || '').trim();
  const rollId = String(body.rollId || '').trim();
  const consumedCuttingLengthMeters = Number(body.consumedCuttingLengthMeters);
  const measuredRemnantLengthMeters = Number(body.measuredRemnantLengthMeters);
  const measuredRemnantWeightKg = body.measuredRemnantWeightKg != null ? Number(body.measuredRemnantWeightKg) : undefined;

  if (!outboundTicketId) {
    const error = new Error('Thiếu ID phiếu xuất nguyên liệu gốc.');
    error.status = 400;
    error.code = 'MISSING_TICKET_ID';
    throw error;
  }

  if (!rollId) {
    const error = new Error('Thiếu ID cuộn vải được chỉ định để cắt.');
    error.status = 400;
    error.code = 'MISSING_ROLL_ID';
    throw error;
  }

  if (Number.isNaN(consumedCuttingLengthMeters) || consumedCuttingLengthMeters < 0) {
    const error = new Error('Chiều dài vải đã cắt may phải là số không âm.');
    error.status = 400;
    error.code = 'INVALID_CUTTING_LENGTH';
    throw error;
  }

  if (Number.isNaN(measuredRemnantLengthMeters) || measuredRemnantLengthMeters < 0) {
    const error = new Error('Chiều dài vải thừa đo được phải là số không âm.');
    error.status = 400;
    error.code = 'INVALID_REMNANT_LENGTH';
    throw error;
  }

  return {
    outboundTicketId,
    rollId,
    consumedCuttingLengthMeters,
    measuredRemnantLengthMeters,
    measuredRemnantWeightKg,
  };
}

