/*
 * File: layout.controller.js
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: HTTP handlers for the warehouse layout editor, shelf bin labels and putaway plans (managers).
 */
import { handle, sendKnownError } from '../shared/warehouseHttp.js';
import { LAYOUT_CAPABILITIES, roleAllows } from './layoutPermission.js';
import { parseRotateReason } from './location.validation.js';
import { getLayoutOverview, listLayoutSkus, openDraft, resetDraft, addRack, saveDraft, removeDraftRack,
  resizeDraftRack, validateDraft, publishDraft } from './layout.service.js';
import { allocationOptions, listAllocations, createAllocation, updateAllocation, confirmAllocation, cancelAllocation,
  binOccupancy, getAllocationHistory } from './allocation.service.js';
import { getBinHistory, getBinLabel, renderBinLabelPng, recordLabelPrint, rotateBinBarcode } from './binLabel.service.js';

const layoutErrors = {
  invalidId: { message: 'ID không hợp lệ', code: 'INVALID_ID' },
  conflict: { message: 'Dữ liệu vừa thay đổi, hãy tải lại và thử lại', code: 'VERSION_CONFLICT' },
  duplicate: { message: (error) => error.message || 'Dữ liệu trùng', code: 'DUPLICATE' },
};
const run = (message, task, status) => handle(message, task, { ...layoutErrors, ...(status ? { status } : {}) });

export const layout = run('Sơ đồ kho', async (req) => ({ ...(await getLayoutOverview()),
  capabilities: Object.fromEntries(LAYOUT_CAPABILITIES.map((name) => [name, roleAllows(req.layoutRolePermissions, name)])) }));
export const openLayoutDraft = run('Đã mở bản nháp', async (req) => ({ layout: await openDraft(req.user) }));
export const resetLayoutDraft = run('Đã làm mới bản nháp từ sơ đồ đang áp dụng',
  async (req) => ({ layout: await resetDraft(req.user, req.body?.version) }));
export const saveLayoutDraft = run('Đã lưu bản nháp', async (req) => ({ layout: await saveDraft(req.user, req.body || {}) }));
export const addDraftRack = run('Đã thêm kệ và ô', async (req) => ({ layout: await addRack(req.user, req.body || {}) }), 201);
export const removeRack = run('Đã bỏ kệ khỏi bản nháp',
  async (req) => ({ layout: await removeDraftRack(req.user, req.params.id, req.query.version) }));
export const resizeRack = run('Đã đổi số tầng và ô',
  async (req) => ({ layout: await resizeDraftRack(req.user, req.params.id, req.body || {}) }));
export const validateLayoutDraft = run('Kết quả kiểm tra', () => validateDraft());
export const publishLayoutDraft = run('Đã áp dụng sơ đồ', (req) => publishDraft(req.user, req.body?.version));

export const bin = run('Chi tiết ô', (req) => binOccupancy(req.params.id));
export const binHistory = run('Lịch sử ô', (req) => getBinHistory(req.params.id));
export const binLabel = run('Tem ô', (req) => getBinLabel(req.params.id));
/** Sends the bin label as a PNG file instead of the JSON envelope. */
const binLabelImage = (kind) => async (req, res, next) => {
  try {
    const { png, filename } = await renderBinLabelPng(req.params.id, kind);
    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', `inline; filename="${filename}"`);
    res.send(png);
  } catch (error) {
    if (!sendKnownError(error, res, layoutErrors)) next(error);
  }
};
export const binLabelCode128 = binLabelImage('code128');
export const binLabelQr = binLabelImage('qr');
export const binPrintIntent = run('Đã ghi nhận yêu cầu in tem', (req) => recordLabelPrint(req.params.id, req.user));
export const rotateBin = run('Đã đổi barcode; hãy thay tem cũ trên ô',
  (req) => rotateBinBarcode(req.params.id, parseRotateReason(req.body), req.user));

export const allocationSources = run('Nguồn và ô phân bổ', () => allocationOptions());
export const skus = run('SKU cấu hình ô', () => listLayoutSkus());
export const allocations = run('Danh sách phân bổ', async () => ({ allocations: await listAllocations() }));
export const allocationHistory = run('Lịch sử phân bổ', (req) => getAllocationHistory(req.params.id));
export const createPlan = run('Đã tạo phân bổ nháp', async (req) => ({ allocation: await createAllocation(req.user, req.body || {}) }), 201);
export const updatePlan = run('Đã cập nhật phân bổ',
  async (req) => ({ allocation: await updateAllocation(req.user, req.params.id, req.body || {}) }));
export const confirmPlan = run('Đã giữ chỗ chờ xếp',
  async (req) => ({ allocation: await confirmAllocation(req.user, req.params.id, req.body || {}) }));
export const cancelPlan = run('Đã hủy phân bổ',
  async (req) => ({ allocation: await cancelAllocation(req.user, req.params.id, req.body || {}) }));
