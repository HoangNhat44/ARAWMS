/*
 * File: stocktakeLockGuard.js
 * Description: Shared stocktake freeze guard preventing stock-in/stock-out mutations while a warehouse is FROZEN_COUNTING.
 */
import StocktakeSession from '../../models/StocktakeSession.model.js';

const WAREHOUSE_LABELS = {
  FINISHED_GOODS: 'Kho thành phẩm',
  RAW_MATERIAL: 'Kho nguyên phụ liệu',
};

/**
 * Finds an active FROZEN_COUNTING stocktake session affecting `warehouseType` (including whole-warehouse `ALL` sessions).
 */
export async function findFrozenStocktake(warehouseType, session = null) {
  const query = StocktakeSession.findOne({
    warehouseType: { $in: [warehouseType, 'ALL'] },
    status: 'FROZEN_COUNTING',
    isDeleted: { $ne: true },
  }).select('sessionCode warehouseType');
  if (session) query.session(session);
  return query.lean();
}

/**
 * Throws a 409 STOCKTAKE_LOCKED error if `warehouseType` is currently frozen for stocktake counting.
 */
export async function assertWarehouseUnlockedForStocktake(
  warehouseType,
  actionLabel = 'nhập/xuất kho',
  session = null,
) {
  const activeStocktake = await findFrozenStocktake(warehouseType, session);
  if (!activeStocktake) return;
  const label = WAREHOUSE_LABELS[warehouseType] || 'Kho';
  throw Object.assign(
    new Error(`${label} đang khóa kiểm kê (${activeStocktake.sessionCode}); tạm dừng ${actionLabel}.`),
    { code: 'STOCKTAKE_LOCKED', status: 409, expected: true },
  );
}
