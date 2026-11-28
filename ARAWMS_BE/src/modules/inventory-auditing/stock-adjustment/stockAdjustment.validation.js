/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Report 3 — UC-075. Kiểm tra dữ liệu gửi duyệt và điều kiện phê duyệt kiểm kê.
 */
import { objectFields, textField, numberField, versionField } from '../../../common/utils/ownerValidation.js';
import { httpError } from '../../../common/utils/httpError.js';

/** Nhận phiên bản, dấu băm và lý do phê duyệt. Chuẩn hóa nội dung kế hoạch tồn lâu nếu có. */
export const validateApproval = (body) => {
  objectFields(body, ['expectedVersion', 'reportHash', 'adjustmentReason', 'agingStockActionPlan']);
  if (typeof body.reportHash !== 'string' || !/^[a-f0-9]{64}$/.test(body.reportHash)) throw httpError(400, 'Cần mở lại báo cáo kiểm kê trước khi duyệt.');
  return { expectedVersion: versionField(body.expectedVersion), reportHash: body.reportHash,
    adjustmentReason: textField(body.adjustmentReason, 'Lý do duyệt điều chỉnh', 2000, 10),
    agingStockActionPlan: body.agingStockActionPlan === '' || body.agingStockActionPlan === undefined ? ''
      : textField(body.agingStockActionPlan, 'Kế hoạch xử lý tồn lâu', 2000, 10) };
};

// [BR: GBR-22] Cộng trị tuyệt đối từng dòng để hàng thừa và hàng thiếu không bù trừ khi phân cấp duyệt.
/**
 * Tính tổng lượng chênh lệch và tổng giá trị chênh lệch, rồi xác định phiên có cần thẩm quyền Owner hay không.
 * @param {object[]} rows Dòng kiểm đếm có số tồn chốt, thực đếm, đơn giá và dấu hiệu tồn lâu.
 * @param {object} settings Cấu hình ngưỡng chênh lệch lượng và giá trị.
 * @param {string} [agingPlan] Nội dung kế hoạch xử lý tồn lâu có trong phiên.
 */
export const varianceSummary = (rows, settings, agingPlan = '') => {
  let absoluteQuantity = 0; let absoluteValue = 0;
  for (const row of rows) {
    if (row.itemType === 'SKU_BATCH' && (!Number.isSafeInteger(row.actualScannedQty) || !Number.isSafeInteger(row.systemSnapshotQty))) throw httpError(409, 'Số lượng thành phẩm phải là số nguyên an toàn.');
    numberField(row.systemSnapshotQty, 'Số lượng chốt', 0, 1e12);
    numberField(row.actualScannedQty, 'Số thực đếm', 0, 1e12);
    numberField(row.unitCost, 'Đơn giá kiểm kê', 0, 1e12);
    const delta = row.actualScannedQty - row.systemSnapshotQty;
    absoluteQuantity += Math.abs(delta); absoluteValue += Math.abs(delta) * row.unitCost;
  }
  // [BR: GBR-22] Phiên thuộc Owner nếu vượt một trong hai ngưỡng hoặc có kế hoạch/tình trạng tồn lâu.
  const hasAging = Boolean(agingPlan?.trim()) || rows.some((row) => row.isAgingThresholdExceeded);
  return { absoluteQuantity, absoluteValue, hasAging,
    requiresOwner: hasAging || absoluteQuantity > settings.minorStocktakeVarianceLimitQty
      || absoluteValue > settings.minorStocktakeVarianceLimitValue };
};
/**
 * Yêu cầu phiên đang chờ duyệt, đã kiểm đếm đầy đủ và còn trùng phiên bản cùng dấu băm. Kiểm tra thẩm quyền và nội dung kế hoạch tồn lâu trước khi cho lưu.
 * @param {string} hash Dấu băm tính lại từ các dòng báo cáo vừa đọc trong giao dịch.
 */
export const assertApprovalAllowed = (stocktake, rows, summary, input, hash) => {
  // Trạng thái chờ duyệt và thời điểm quét là điều kiện để xác nhận báo cáo đã sẵn sàng.
  if (stocktake.status !== 'VARIANCE_REVIEW' || stocktake.approvalInfo?.approvedAt) throw httpError(409, 'Phiên không còn ở trạng thái chờ duyệt.');
  if (!rows.length || rows.some((row) => !row.scannedAt)) throw httpError(409, 'Cần kiểm đếm đầy đủ mọi dòng trước khi duyệt.');
  if ((stocktake.approvalRevision || 0) !== input.expectedVersion || input.reportHash !== hash) throw httpError(409, 'Báo cáo đã thay đổi. Cần tải lại và kiểm tra trước khi duyệt.');
  // [BR: GBR-22] Phiên nhỏ thuộc quản lý kho, trừ khi báo cáo đã được xác định cần cấp Owner.
  if (!summary.requiresOwner && stocktake.approvalInfo?.approvalLevelRequired !== 'MAJOR_OWNER') throw httpError(409, 'Chênh lệch nhỏ không có kế hoạch tồn lâu thuộc thẩm quyền quản lý kho.');
  // [BR: GBR-22] Phải có nội dung kế hoạch xử lý cụ thể khi phiên có hàng tồn lâu.
  if (summary.hasAging && !input.agingStockActionPlan) throw httpError(400, 'Cần nhập kế hoạch xử lý hàng tồn lâu theo GBR-19.');
};
