/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: OWNER-EXT-06; GBR-18/19 - Kiểm tra điều kiện và dữ liệu duyệt kiểm kê lớn.
 */
import { objectFields, textField, numberField, versionField } from '../../../common/utils/ownerValidation.js';
import { httpError } from '../../../common/utils/httpError.js';

export const validateApproval = (body) => {
  objectFields(body, ['expectedVersion', 'reportHash', 'adjustmentReason', 'agingStockActionPlan']);
  if (typeof body.reportHash !== 'string' || !/^[a-f0-9]{64}$/.test(body.reportHash)) throw httpError(400, 'Cần mở lại báo cáo kiểm kê trước khi duyệt.');
  return { expectedVersion: versionField(body.expectedVersion), reportHash: body.reportHash,
    adjustmentReason: textField(body.adjustmentReason, 'Lý do duyệt điều chỉnh', 2000, 10),
    agingStockActionPlan: body.agingStockActionPlan === '' || body.agingStockActionPlan === undefined ? ''
      : textField(body.agingStockActionPlan, 'Kế hoạch xử lý tồn lâu', 2000, 10) };
};

// GBR-19: Cộng trị tuyệt đối từng dòng; không bù trừ hàng thừa với hàng thiếu để hạ mức duyệt.
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
  const hasAging = Boolean(agingPlan?.trim()) || rows.some((row) => row.isAgingThresholdExceeded);
  return { absoluteQuantity, absoluteValue, hasAging,
    requiresOwner: hasAging || absoluteQuantity > settings.minorStocktakeVarianceLimitQty
      || absoluteValue > settings.minorStocktakeVarianceLimitValue };
};
export const assertApprovalAllowed = (stocktake, rows, summary, input, hash) => {
  // GBR-18: Không duyệt lại, không duyệt khi chưa hoàn tất kiểm đếm tất cả các dòng.
  if (stocktake.status !== 'VARIANCE_REVIEW' || stocktake.approvalInfo?.approvedAt) throw httpError(409, 'Phiên không còn ở trạng thái chờ duyệt.');
  if (!rows.length || rows.some((row) => !row.scannedAt)) throw httpError(409, 'Cần kiểm đếm đầy đủ mọi dòng trước khi duyệt.');
  if ((stocktake.approvalRevision || 0) !== input.expectedVersion || input.reportHash !== hash) throw httpError(409, 'Báo cáo đã thay đổi. Cần tải lại và kiểm tra trước khi duyệt.');
  if (!summary.requiresOwner && stocktake.approvalInfo?.approvalLevelRequired !== 'MAJOR_OWNER') throw httpError(409, 'Chênh lệch nhỏ không có kế hoạch tồn lâu thuộc thẩm quyền quản lý kho.');
  // GBR-19: Tất cả kế hoạch xử lý hàng tồn lâu phải được Owner xem và xác nhận nội dung cụ thể.
  if (summary.hasAging && !input.agingStockActionPlan) throw httpError(400, 'Cần nhập kế hoạch xử lý hàng tồn lâu theo GBR-19.');
};
