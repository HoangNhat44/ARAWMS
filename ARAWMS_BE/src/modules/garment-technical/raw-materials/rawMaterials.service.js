/**
 * ============================================================================
 * @title        : Raw Materials Management Service
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-09
 * @lastModified : 2026-11-09
 * @description  : Cung cấp logic nghiệp vụ cho Quản lý Danh mục Kho Nguyên Phụ Liệu (Thêm, Sửa, Xóa, Vô hiệu hóa, Lọc tồn kho),
 *                 phục vụ Phân hệ Kỹ thuật may (Garment Technician / KCS) và Quản lý kho.
 * @module       : Garment Technical / Raw Materials
 * @layer        : Service
 * ============================================================================
 */

import mongoose from 'mongoose';
import RawMaterial from '../../../models/RawMaterial.model.js';
import Supplier from '../../../models/Supplier.model.js';
import MaterialStockLot from '../../../models/MaterialStockLot.model.js';
import FabricRoll from '../../../models/FabricRoll.model.js';
import MaterialTicket from '../../../models/MaterialTicket.model.js';
import MaterialInboundPlan from '../../../models/MaterialInboundPlan.model.js';
import MaterialOutbound from '../../../models/MaterialOutbound.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import {
  MATERIAL_UNIT_OPTIONS,
  normalizeMaterialUnit,
  isValidMaterialUnitForType,
} from '../../../common/constants/materialUnits.js';

/**
 * Danh mục phân loại nguyên phụ liệu chi tiết và nhãn hiển thị tiếng Việt
 */
export const RAW_MATERIAL_CATEGORIES = [
  { value: 'FABRIC_ROLL', label: 'Cây vải / Cuộn vải', type: 'FABRIC' },
  { value: 'BUTTON', label: 'Nút / Cúc', type: 'AUXILIARY' },
  { value: 'THREAD', label: 'Chỉ may công nghiệp', type: 'AUXILIARY' },
  { value: 'ZIPPER', label: 'Dây kéo / Khóa kéo', type: 'AUXILIARY' },
  { value: 'CARE_LABEL', label: 'Nhãn sườn / Mác áo', type: 'AUXILIARY' },
  { value: 'PACKAGING_BAG', label: 'Túi đóng gói PE/PP', type: 'AUXILIARY' },
  { value: 'NEEDLE', label: 'Kim may công nghiệp', type: 'AUXILIARY' },
  { value: 'CHALK', label: 'Phấn may', type: 'AUXILIARY' },
  { value: 'MARKER', label: 'Bút dấu vải', type: 'AUXILIARY' },
  { value: 'ACCESSORY', label: 'Phụ kiện may mặc khác', type: 'AUXILIARY' },
  { value: 'OTHER', label: 'Khác', type: 'AUXILIARY' },
];

/**
 * Lấy danh sách nguyên phụ liệu kèm bộ lọc, tìm kiếm, sắp xếp và phân trang.
 *
 * @param {Object} query - Tham số truy vấn (search, materialType, category, status, lowStock, page, limit)
 * @returns {Promise<Object>} Danh sách nguyên phụ liệu, phân trang và thống kê
 */
export const listRawMaterials = async (query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const filter = {};

  // 1. Lọc theo trạng thái hoạt động (ACTIVE / INACTIVE / ALL)
  if (query.status === 'ACTIVE') {
    filter.isActive = true;
  } else if (query.status === 'INACTIVE') {
    filter.isActive = false;
  }

  // 2. Lọc theo loại nguyên phụ liệu (FABRIC / AUXILIARY)
  if (query.materialType && ['FABRIC', 'AUXILIARY'].includes(query.materialType)) {
    filter.materialType = query.materialType;
  }

  // 3. Lọc theo danh mục chi tiết (category)
  if (query.category && query.category !== 'ALL') {
    filter.category = query.category;
  }

  // 4. Lọc theo nhà cung cấp
  if (query.supplierId && mongoose.Types.ObjectId.isValid(query.supplierId)) {
    filter.supplierId = query.supplierId;
  }

  // 5. Tìm kiếm theo mã, tên, màu sắc
  if (query.search && query.search.trim()) {
    const s = query.search.trim();
    filter.$or = [
      { materialCode: { $regex: s, $options: 'i' } },
      { materialName: { $regex: s, $options: 'i' } },
      { color: { $regex: s, $options: 'i' } },
    ];
  }

  // 6. Lọc cảnh báo dưới tồn an toàn (lowStock)
  if (query.lowStock === 'true' || query.lowStock === true) {
    filter.$expr = {
      $lte: [
        { $subtract: [{ $subtract: ['$onHandQty', '$reservedQty'] }, '$pendingPutawayQty'] },
        '$safetyStockThreshold',
      ],
    };
  }

  // Sắp xếp
  let sortCriteria = { createdAt: -1 };
  if (query.sortBy === 'code_asc') sortCriteria = { materialCode: 1 };
  if (query.sortBy === 'name_asc') sortCriteria = { materialName: 1 };
  if (query.sortBy === 'onHand_desc') sortCriteria = { onHandQty: -1 };
  if (query.sortBy === 'onHand_asc') sortCriteria = { onHandQty: 1 };

  // Thực thi truy vấn và đếm
  const [items, total] = await Promise.all([
    RawMaterial.find(filter)
      .populate('supplierId', 'supplierCode supplierName phone contactName address')
      .sort(sortCriteria)
      .skip(skip)
      .limit(limit)
      .lean(),
    RawMaterial.countDocuments(filter),
  ]);

  // Bổ sung thuộc tính availableQty cho từng item
  const formattedItems = items.map((item) => ({
    ...item,
    availableQty: Math.max(0, (item.onHandQty || 0) - (item.reservedQty || 0) - (item.pendingPutawayQty || 0)),
    isLowStock:
      Math.max(0, (item.onHandQty || 0) - (item.reservedQty || 0) - (item.pendingPutawayQty || 0)) <=
      (item.safetyStockThreshold || 0),
  }));

  // Đếm thống kê tổng quan (Dashboard counters)
  const [totalCount, fabricCount, auxiliaryCount, activeCount, lowStockCount] = await Promise.all([
    RawMaterial.countDocuments({}),
    RawMaterial.countDocuments({ materialType: 'FABRIC' }),
    RawMaterial.countDocuments({ materialType: 'AUXILIARY' }),
    RawMaterial.countDocuments({ isActive: true }),
    RawMaterial.countDocuments({
      $expr: {
        $lte: [
          { $subtract: [{ $subtract: ['$onHandQty', '$reservedQty'] }, '$pendingPutawayQty'] },
          '$safetyStockThreshold',
        ],
      },
    }),
  ]);

  return {
    items: formattedItems,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
    stats: {
      totalMaterials: totalCount,
      fabricMaterials: fabricCount,
      auxiliaryMaterials: auxiliaryCount,
      activeMaterials: activeCount,
      lowStockMaterials: lowStockCount,
    },
  };
};

/**
 * Lấy chi tiết một nguyên phụ liệu theo ID.
 *
 * @param {string} id - ID của RawMaterial
 * @returns {Promise<Object>} Chi tiết nguyên phụ liệu
 */
export const getRawMaterialById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error('Mã định danh nguyên phụ liệu không hợp lệ');
    error.status = 400;
    throw error;
  }

  const material = await RawMaterial.findById(id)
    .populate('supplierId', 'supplierCode supplierName phone contactName email address')
    .lean();

  if (!material) {
    const error = new Error('Không tìm thấy nguyên phụ liệu trong hệ thống');
    error.status = 404;
    throw error;
  }

  // Đếm số cuộn vải hoặc lô tồn kho đang liên kết
  const [lotCount, rollCount] = await Promise.all([
    MaterialStockLot.countDocuments({ rawMaterialId: id }),
    FabricRoll.countDocuments({ rawMaterialId: id }),
  ]);

  return {
    ...material,
    availableQty: Math.max(0, (material.onHandQty || 0) - (material.reservedQty || 0) - (material.pendingPutawayQty || 0)),
    isLowStock:
      Math.max(0, (material.onHandQty || 0) - (material.reservedQty || 0) - (material.pendingPutawayQty || 0)) <=
      (material.safetyStockThreshold || 0),
    activeLotsCount: lotCount,
    activeRollsCount: rollCount,
  };
};

/**
 * Tạo mới một nguyên phụ liệu vào hệ thống.
 *
 * @param {Object} data - Dữ liệu nguyên phụ liệu
 * @param {Object} user - Thông tin người thực hiện
 * @returns {Promise<Object>} Nguyên phụ liệu vừa tạo
 */
export const createRawMaterial = async (data = {}, user) => {
  // 1. Kiểm tra trường bắt buộc
  if (!data.materialName || !data.materialName.trim()) {
    const error = new Error('Vui lòng nhập tên nguyên phụ liệu');
    error.status = 400;
    throw error;
  }

  if (!data.materialType || !['FABRIC', 'AUXILIARY'].includes(data.materialType)) {
    const error = new Error('Loại nguyên phụ liệu phải là FABRIC (Vải) hoặc AUXILIARY (Phụ liệu)');
    error.status = 400;
    throw error;
  }

  if (!data.category) {
    const error = new Error('Vui lòng chọn danh mục nguyên phụ liệu');
    error.status = 400;
    throw error;
  }

  // 2. Chuẩn hóa đơn vị tính
  const normalizedUnit = normalizeMaterialUnit(data.unit || (data.materialType === 'FABRIC' ? 'METER' : 'PIECE'));
  if (!isValidMaterialUnitForType(normalizedUnit, data.materialType)) {
    const error = new Error(
      data.materialType === 'FABRIC'
        ? 'Nguyên phụ liệu loại Vải (FABRIC) bắt buộc phải có đơn vị tồn là Mét (METER).'
        : 'Đơn vị tính không hợp lệ đối với loại phụ liệu.'
    );
    error.status = 400;
    throw error;
  }

  // 3. Xử lý mã nguyên phụ liệu (materialCode)
  let code = String(data.materialCode || '').trim().toUpperCase();
  if (!code) {
    // Tự sinh mã nếu để trống
    const prefix = data.materialType === 'FABRIC' ? 'RM-FAB' : 'RM-AUX';
    code = await CounterSequence.getNextSequence('RAW_MATERIAL_CODE', prefix, 5);
  } else {
    // Kiểm tra trùng mã
    const existing = await RawMaterial.findOne({ materialCode: code });
    if (existing) {
      const error = new Error(`Mã nguyên phụ liệu "${code}" đã tồn tại trong hệ thống. Vui lòng chọn mã khác.`);
      error.status = 409;
      throw error;
    }
  }

  // 4. Chuẩn hóa các trường số
  const unitCost = Math.max(0, Number(data.unitCost) || 0);
  const safetyStockThreshold = Math.max(0, Number(data.safetyStockThreshold) || 50);
  const fifoAgingThresholdDays = Math.max(1, Number(data.fifoAgingThresholdDays) || 90);
  const gsm = data.gsm ? Math.max(0, Number(data.gsm)) : undefined;
  const widthCm = data.widthCm ? Math.max(0, Number(data.widthCm)) : undefined;
  const requiresWeightKg = Boolean(data.requiresWeightKg);

  // 5. Kiểm tra nhà cung cấp (nếu có)
  let supplierId = null;
  if (data.supplierId && mongoose.Types.ObjectId.isValid(data.supplierId)) {
    const supExists = await Supplier.findById(data.supplierId);
    if (supExists) supplierId = data.supplierId;
  }

  // 6. Tạo Document
  const newMaterial = new RawMaterial({
    materialCode: code,
    materialName: data.materialName.trim(),
    materialType: data.materialType,
    category: data.category,
    unit: normalizedUnit,
    color: data.color ? data.color.trim() : '',
    gsm,
    widthCm,
    requiresWeightKg,
    unitCost,
    safetyStockThreshold,
    fifoAgingThresholdDays,
    supplierId,
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    onHandQty: 0,
    reservedQty: 0,
    pendingPutawayQty: 0,
  });

  await newMaterial.save();
  return getRawMaterialById(newMaterial._id);
};

/**
 * Cập nhật thông tin nguyên phụ liệu.
 *
 * @param {string} id - ID nguyên phụ liệu
 * @param {Object} data - Dữ liệu cập nhật
 * @param {Object} user - Người thực hiện
 * @returns {Promise<Object>} Nguyên phụ liệu sau khi cập nhật
 */
export const updateRawMaterial = async (id, data = {}, user) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error('Mã định danh nguyên phụ liệu không hợp lệ');
    error.status = 400;
    throw error;
  }

  const material = await RawMaterial.findById(id);
  if (!material) {
    const error = new Error('Không tìm thấy nguyên phụ liệu để cập nhật');
    error.status = 404;
    throw error;
  }

  // 1. Kiểm tra nếu có cập nhật mã
  if (data.materialCode && data.materialCode.trim()) {
    const newCode = data.materialCode.trim().toUpperCase();
    if (newCode !== material.materialCode) {
      const duplicate = await RawMaterial.findOne({ materialCode: newCode, _id: { $ne: id } });
      if (duplicate) {
        const error = new Error(`Mã nguyên phụ liệu "${newCode}" đã được sử dụng bởi mặt hàng khác.`);
        error.status = 409;
        throw error;
      }
      material.materialCode = newCode;
    }
  }

  // 2. Cập nhật tên
  if (data.materialName && data.materialName.trim()) {
    material.materialName = data.materialName.trim();
  }

  // 3. Cập nhật loại & danh mục
  if (data.materialType && ['FABRIC', 'AUXILIARY'].includes(data.materialType)) {
    // Nếu có tồn kho > 0, hạn chế đổi loại từ FABRIC sang AUXILIARY hoặc ngược lại
    if (material.onHandQty > 0 && material.materialType !== data.materialType) {
      const error = new Error('Không thể thay đổi Loại nguyên phụ liệu khi mặt hàng này đang có số lượng tồn kho.');
      error.status = 400;
      throw error;
    }
    material.materialType = data.materialType;
  }

  if (data.category) {
    material.category = data.category;
  }

  // 4. Cập nhật đơn vị tính
  if (data.unit) {
    const normalizedUnit = normalizeMaterialUnit(data.unit);
    if (!isValidMaterialUnitForType(normalizedUnit, material.materialType)) {
      const error = new Error('Đơn vị tính không phù hợp với loại nguyên phụ liệu hiện tại.');
      error.status = 400;
      throw error;
    }
    // Nếu đang có tồn kho > 0, cảnh báo không được đổi ĐVT
    if (material.onHandQty > 0 && normalizedUnit !== material.unit) {
      const error = new Error('Không thể thay đổi Đơn vị tính khi mặt hàng đang có số lượng tồn kho thực tế.');
      error.status = 400;
      throw error;
    }
    material.unit = normalizedUnit;
  }

  // 5. Cập nhật các thông số kỹ thuật
  if (data.color !== undefined) material.color = data.color ? data.color.trim() : '';
  if (data.gsm !== undefined) material.gsm = data.gsm ? Math.max(0, Number(data.gsm)) : undefined;
  if (data.widthCm !== undefined) material.widthCm = data.widthCm ? Math.max(0, Number(data.widthCm)) : undefined;
  if (data.requiresWeightKg !== undefined) material.requiresWeightKg = Boolean(data.requiresWeightKg);

  // 6. Cập nhật định mức & giá
  if (data.unitCost !== undefined) material.unitCost = Math.max(0, Number(data.unitCost) || 0);
  if (data.safetyStockThreshold !== undefined)
    material.safetyStockThreshold = Math.max(0, Number(data.safetyStockThreshold) || 0);
  if (data.fifoAgingThresholdDays !== undefined)
    material.fifoAgingThresholdDays = Math.max(1, Number(data.fifoAgingThresholdDays) || 90);

  // 7. Cập nhật nhà cung cấp
  if (data.supplierId !== undefined) {
    if (data.supplierId && mongoose.Types.ObjectId.isValid(data.supplierId)) {
      const supExists = await Supplier.findById(data.supplierId);
      if (supExists) material.supplierId = data.supplierId;
    } else {
      material.supplierId = null;
    }
  }

  // 8. Trạng thái hoạt động
  if (data.isActive !== undefined) {
    material.isActive = Boolean(data.isActive);
  }

  await material.save();
  return getRawMaterialById(material._id);
};

/**
 * Xóa hoặc vô hiệu hóa nguyên phụ liệu.
 * - Nếu đang có hàng tồn kho: Không cho xóa.
 * - Nếu đã có liên kết lịch sử giao dịch (phiếu nhập, xuất, lô kho): Soft delete (isActive = false).
 * - Nếu chưa từng phát sinh dữ liệu giao dịch: Hard delete (xóa hoàn toàn).
 *
 * @param {string} id - ID nguyên phụ liệu
 * @param {Object} user - Người thực hiện
 * @returns {Promise<Object>} Kết quả xử lý
 */
export const deleteRawMaterial = async (id, user) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error('Mã định danh nguyên phụ liệu không hợp lệ');
    error.status = 400;
    throw error;
  }

  const material = await RawMaterial.findById(id);
  if (!material) {
    const error = new Error('Không tìm thấy nguyên phụ liệu cần xóa');
    error.status = 404;
    throw error;
  }

  // 1. Kiểm tra tồn kho thực tế
  if ((material.onHandQty || 0) > 0 || (material.pendingPutawayQty || 0) > 0 || (material.reservedQty || 0) > 0) {
    const error = new Error(
      `Không thể xóa nguyên phụ liệu "${material.materialName}" vì vẫn còn tồn kho (Thực tế: ${material.onHandQty || 0} ${material.unit}, Chờ cất: ${material.pendingPutawayQty || 0}, Đang giữ: ${material.reservedQty || 0}). Vui lòng xuất kho hoặc vô hiệu hóa mặt hàng.`
    );
    error.status = 400;
    throw error;
  }

  // 2. Kiểm tra ràng buộc dữ liệu lịch sử
  const [hasLot, hasRoll, hasTicket, hasPlan, hasOutbound] = await Promise.all([
    MaterialStockLot.exists({ rawMaterialId: id }),
    FabricRoll.exists({ rawMaterialId: id }),
    MaterialTicket.exists({ 'receiptLines.rawMaterialId': id }),
    MaterialInboundPlan.exists({ 'expectedItems.rawMaterialId': id }),
    MaterialOutbound.exists({ 'requestedItems.rawMaterialId': id }),
  ]);

  const hasHistory = Boolean(hasLot || hasRoll || hasTicket || hasPlan || hasOutbound);

  if (hasHistory) {
    // Soft delete: Vô hiệu hóa để bảo toàn tính toàn vẹn dữ liệu
    material.isActive = false;
    await material.save();
    return {
      success: true,
      action: 'SOFT_DELETED',
      message: `Nguyên phụ liệu "${material.materialName}" đã từng phát sinh chứng từ kho/lô hàng nên đã được chuyển sang trạng thái "Ngừng sử dụng" để bảo toàn lịch sử dữ liệu.`,
      material,
    };
  }

  // Hard delete: Xóa vĩnh viễn vì chưa từng phát sinh dữ liệu
  await RawMaterial.findByIdAndDelete(id);
  return {
    success: true,
    action: 'HARD_DELETED',
    message: `Đã xóa vĩnh viễn nguyên phụ liệu "${material.materialName}" (${material.materialCode}) khỏi hệ thống.`,
  };
};

/**
 * Chuyển đổi nhanh trạng thái kích hoạt (Active / Inactive) của nguyên phụ liệu.
 *
 * @param {string} id - ID nguyên phụ liệu
 * @returns {Promise<Object>} Mặt hàng sau khi đổi trạng thái
 */
export const toggleRawMaterialStatus = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error('Mã định danh nguyên phụ liệu không hợp lệ');
    error.status = 400;
    throw error;
  }

  const material = await RawMaterial.findById(id);
  if (!material) {
    const error = new Error('Không tìm thấy nguyên phụ liệu');
    error.status = 404;
    throw error;
  }

  material.isActive = !material.isActive;
  await material.save();

  return {
    success: true,
    isActive: material.isActive,
    message: material.isActive
      ? `Đã kích hoạt lại nguyên phụ liệu "${material.materialName}".`
      : `Đã chuyển nguyên phụ liệu "${material.materialName}" sang trạng thái Ngừng sử dụng.`,
  };
};

/**
 * Lấy siêu dữ liệu phục vụ bộ lọc và dropdown tạo/sửa NPL (Nhà cung cấp, Đơn vị tính, Danh mục).
 *
 * @returns {Promise<Object>} Danh sách nhà cung cấp, đơn vị tính, danh mục
 */
export const getRawMaterialMeta = async () => {
  const suppliers = await Supplier.find({ isActive: true })
    .select('supplierCode supplierName phone contactName address')
    .sort({ supplierName: 1 })
    .lean();

  return {
    suppliers,
    units: MATERIAL_UNIT_OPTIONS,
    categories: RAW_MATERIAL_CATEGORIES,
    types: [
      { value: 'FABRIC', label: 'Vải (Chính / Lót)' },
      { value: 'AUXILIARY', label: 'Phụ liệu may mặc' },
    ],
  };
};

