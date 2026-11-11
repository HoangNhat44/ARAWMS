/**
 * ============================================================================
 * @title        : Raw Materials & Categories Management Service
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-09
 * @lastModified : 2026-11-11
 * @description  : Cung cấp logic nghiệp vụ cho Quản lý Danh mục Kho Nguyên Phụ Liệu:
 *                 - CRUD Nguyên phụ liệu: Xóa triệt để, cascade dọn dẹp cấu hình kho & lệnh xuất.
 *                 - CRUD Danh mục phân loại: Trước khi xóa danh mục, bắt buộc phải xóa hết toàn bộ NPL trong danh mục.
 *                 - Phân quyền nghiệp vụ: Định mức tồn kho, giá vốn và nhà cung cấp do Owner quản lý; Kỹ thuật viên không can thiệp.
 * @module       : Garment Technical / Raw Materials
 * @layer        : Service
 * ============================================================================
 */

import mongoose from 'mongoose';
import RawMaterial from '../../../models/RawMaterial.model.js';
import MaterialCategory from '../../../models/MaterialCategory.model.js';
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
 * Danh sách danh mục mặc định chuẩn hóa theo ngành may mặc
 */
export const DEFAULT_CATEGORIES = [
  { categoryCode: 'FABRIC_ROLL', categoryName: 'Cây vải / Cuộn vải', materialType: 'FABRIC', description: 'Vải cuộn chính và lót các loại' },
  { categoryCode: 'BUTTON', categoryName: 'Nút / Cúc', materialType: 'AUXILIARY', description: 'Cúc áo, cúc bấm, cúc kim loại' },
  { categoryCode: 'THREAD', categoryName: 'Chỉ may công nghiệp', materialType: 'AUXILIARY', description: 'Chỉ may polyester, chỉ vắt sổ, chỉ thêu' },
  { categoryCode: 'ZIPPER', categoryName: 'Dây kéo / Khóa kéo', materialType: 'AUXILIARY', description: 'Khóa đồng, khóa nhựa, khóa giọt lệ' },
  { categoryCode: 'CARE_LABEL', categoryName: 'Nhãn sườn / Mác áo', materialType: 'AUXILIARY', description: 'Mác dệt, mác in, nhãn hướng dẫn giặt' },
  { categoryCode: 'PACKAGING_BAG', categoryName: 'Túi đóng gói PE/PP', materialType: 'AUXILIARY', description: 'Túi nilon đóng gói sản phẩm' },
  { categoryCode: 'NEEDLE', categoryName: 'Kim may công nghiệp', materialType: 'AUXILIARY', description: 'Kim máy 1 kim, kim vắt sổ, kim đính bọ' },
  { categoryCode: 'CHALK', categoryName: 'Phấn may', materialType: 'AUXILIARY', description: 'Phấn vẽ vải, phấn bay nhiệt' },
  { categoryCode: 'MARKER', categoryName: 'Bút dấu vải', materialType: 'AUXILIARY', description: 'Bút bay màu, bút dạ đánh dấu vải' },
  { categoryCode: 'ACCESSORY', categoryName: 'Phụ kiện may mặc khác', materialType: 'AUXILIARY', description: 'Dây chun, ruy băng, đệm vai, móc áo...' },
  { categoryCode: 'OTHER', categoryName: 'Khác', materialType: 'AUXILIARY', description: 'Các vật tư phụ trợ khác' },
];

/**
 * Tự động đồng bộ các danh mục mặc định nếu database chưa có
 */
const ensureDefaultCategories = async () => {
  const count = await MaterialCategory.countDocuments({});
  if (count === 0) {
    await MaterialCategory.insertMany(DEFAULT_CATEGORIES);
  }
};

// ============================================================================
// 1. QUẢN LÝ DANH MỤC NGUYÊN PHỤ LIỆU (MATERIAL CATEGORIES)
// ============================================================================

/**
 * Lấy danh sách danh mục phân loại NPL kèm số lượng mặt hàng đang có trong từng danh mục.
 *
 * @returns {Promise<Array>} Danh sách danh mục kèm itemCount
 */
export const listCategories = async () => {
  await ensureDefaultCategories();

  const categories = await MaterialCategory.find({})
    .sort({ materialType: 1, displayOrder: 1, createdAt: 1 })
    .lean();

  // Đếm số lượng NPL trong từng danh mục
  const counts = await RawMaterial.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);

  const countMap = {};
  counts.forEach((c) => {
    countMap[c._id] = c.count;
  });

  return categories.map((cat) => ({
    ...cat,
    itemCount: countMap[cat.categoryCode] || 0,
  }));
};

/**
 * Tạo mới một danh mục phân loại nguyên phụ liệu.
 *
 * @param {Object} data - Thông tin danh mục
 * @returns {Promise<Object>} Danh mục vừa tạo
 */
export const createCategory = async (data = {}) => {
  if (!data.categoryName || !data.categoryName.trim()) {
    const error = new Error('Vui lòng nhập tên danh mục');
    error.status = 400;
    throw error;
  }

  if (!data.materialType || !['FABRIC', 'AUXILIARY'].includes(data.materialType)) {
    const error = new Error('Loại danh mục phải là FABRIC (Vải) hoặc AUXILIARY (Phụ liệu)');
    error.status = 400;
    throw error;
  }

  // Tự sinh mã hoặc dùng mã người dùng nhập
  let code = String(data.categoryCode || '').trim().toUpperCase();
  if (!code) {
    const prefix = data.materialType === 'FABRIC' ? 'CAT-FAB' : 'CAT-AUX';
    code = await CounterSequence.getNextSequence('MATERIAL_CATEGORY_CODE', prefix, 4);
  }

  // Kiểm tra trùng mã danh mục
  const existing = await MaterialCategory.findOne({ categoryCode: code });
  if (existing) {
    const error = new Error(`Mã danh mục "${code}" đã tồn tại trong hệ thống`);
    error.status = 409;
    throw error;
  }

  const newCat = new MaterialCategory({
    categoryCode: code,
    categoryName: data.categoryName.trim(),
    materialType: data.materialType,
    description: data.description ? data.description.trim() : '',
    displayOrder: Number(data.displayOrder) || 0,
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
  });

  await newCat.save();
  return {
    ...newCat.toObject(),
    itemCount: 0,
  };
};

/**
 * Cập nhật thông tin danh mục.
 *
 * @param {string} id - ID danh mục
 * @param {Object} data - Dữ liệu cập nhật
 * @returns {Promise<Object>} Danh mục sau cập nhật
 */
export const updateCategory = async (id, data = {}) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error('Mã định danh danh mục không hợp lệ');
    error.status = 400;
    throw error;
  }

  const category = await MaterialCategory.findById(id);
  if (!category) {
    const error = new Error('Không tìm thấy danh mục để cập nhật');
    error.status = 404;
    throw error;
  }

  if (data.categoryName && data.categoryName.trim()) {
    category.categoryName = data.categoryName.trim();
  }

  if (data.description !== undefined) {
    category.description = data.description ? data.description.trim() : '';
  }

  if (data.displayOrder !== undefined) {
    category.displayOrder = Number(data.displayOrder) || 0;
  }

  if (data.isActive !== undefined) {
    category.isActive = Boolean(data.isActive);
  }

  await category.save();

  const count = await RawMaterial.countDocuments({ category: category.categoryCode });
  return {
    ...category.toObject(),
    itemCount: count,
  };
};

/**
 * XÓA DANH MỤC NGUYÊN PHỤ LIỆU:
 * QUY TẮC BẮT BUỘC: Trước khi xóa danh mục, phải xóa hết toàn bộ nguyên phụ liệu thuộc danh mục đó trước.
 * Nếu danh mục còn ít nhất 1 NPL, hệ thống sẽ CHẶN XÓA và báo lỗi.
 *
 * @param {string} id - ID danh mục
 * @returns {Promise<Object>} Kết quả xử lý
 */
export const deleteCategory = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error('Mã định danh danh mục không hợp lệ');
    error.status = 400;
    throw error;
  }

  const category = await MaterialCategory.findById(id);
  if (!category) {
    const error = new Error('Không tìm thấy danh mục cần xóa');
    error.status = 404;
    throw error;
  }

  // 1. Kiểm tra số lượng nguyên phụ liệu đang thuộc danh mục này
  const itemCount = await RawMaterial.countDocuments({ category: category.categoryCode });

  if (itemCount > 0) {
    const error = new Error(
      `Không thể xóa danh mục "${category.categoryName}" (${category.categoryCode}) vì vẫn còn ${itemCount} nguyên phụ liệu đang thuộc danh mục này. Theo quy định an toàn hệ thống, bạn phải xóa hết toàn bộ các nguyên phụ liệu trong danh mục này trước khi thực hiện xóa danh mục!`
    );
    error.status = 400;
    error.itemCount = itemCount;
    throw error;
  }

  // 2. Nếu đã hết NPL, cho phép xóa vĩnh viễn danh mục khỏi database
  await MaterialCategory.findByIdAndDelete(id);

  return {
    success: true,
    message: `Đã xóa thành công danh mục "${category.categoryName}" (${category.categoryCode}) khỏi hệ thống.`,
    categoryCode: category.categoryCode,
  };
};

// ============================================================================
// 2. QUẢN LÝ NGUYÊN PHỤ LIỆU (RAW MATERIALS)
// ============================================================================

/**
 * Lấy danh sách nguyên phụ liệu kèm bộ lọc, tìm kiếm, phân trang và thống kê.
 *
 * @param {Object} query - Tham số truy vấn
 * @returns {Promise<Object>} Danh sách nguyên phụ liệu và thống kê
 */
export const listRawMaterials = async (query = {}) => {
  await ensureDefaultCategories();

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const filter = {};

  if (query.status === 'ACTIVE') {
    filter.isActive = true;
  } else if (query.status === 'INACTIVE') {
    filter.isActive = false;
  }

  if (query.materialType && ['FABRIC', 'AUXILIARY'].includes(query.materialType)) {
    filter.materialType = query.materialType;
  }

  if (query.category && query.category !== 'ALL') {
    filter.category = query.category;
  }

  if (query.supplierId && mongoose.Types.ObjectId.isValid(query.supplierId)) {
    filter.supplierId = query.supplierId;
  }

  if (query.search && query.search.trim()) {
    const s = query.search.trim();
    filter.$or = [
      { materialCode: { $regex: s, $options: 'i' } },
      { materialName: { $regex: s, $options: 'i' } },
      { color: { $regex: s, $options: 'i' } },
    ];
  }

  if (query.lowStock === 'true' || query.lowStock === true) {
    filter.$expr = {
      $lte: [
        { $subtract: [{ $subtract: ['$onHandQty', '$reservedQty'] }, '$pendingPutawayQty'] },
        '$safetyStockThreshold',
      ],
    };
  }

  let sortCriteria = { createdAt: -1 };
  if (query.sortBy === 'code_asc') sortCriteria = { materialCode: 1 };
  if (query.sortBy === 'name_asc') sortCriteria = { materialName: 1 };
  if (query.sortBy === 'onHand_desc') sortCriteria = { onHandQty: -1 };
  if (query.sortBy === 'onHand_asc') sortCriteria = { onHandQty: 1 };

  const [items, total] = await Promise.all([
    RawMaterial.find(filter)
      .populate('supplierId', 'supplierCode supplierName phone contactName address')
      .sort(sortCriteria)
      .skip(skip)
      .limit(limit)
      .lean(),
    RawMaterial.countDocuments(filter),
  ]);

  const formattedItems = items.map((item) => ({
    ...item,
    availableQty: Math.max(0, (item.onHandQty || 0) - (item.reservedQty || 0) - (item.pendingPutawayQty || 0)),
    isLowStock:
      Math.max(0, (item.onHandQty || 0) - (item.reservedQty || 0) - (item.pendingPutawayQty || 0)) <=
      (item.safetyStockThreshold || 0),
  }));

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
 * @param {string} id - ID nguyên phụ liệu
 * @returns {Promise<Object>} Chi tiết NPL
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
 * Tạo mới một nguyên phụ liệu.
 *
 * @param {Object} data - Dữ liệu NPL
 * @param {Object} user - Người thực hiện
 * @returns {Promise<Object>} NPL vừa tạo
 */
export const createRawMaterial = async (data = {}, user) => {
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

  const normalizedUnit = normalizeMaterialUnit(data.unit || (data.materialType === 'FABRIC' ? 'METER' : 'PIECE'));
  if (!isValidMaterialUnitForType(normalizedUnit, data.materialType)) {
    const error = new Error(
      data.materialType === 'FABRIC'
        ? 'Nguyên phụ liệu loại Vải (FABRIC) bắt buộc phải có đơn vị tính là Mét (METER).'
        : 'Đơn vị tính không hợp lệ đối với loại phụ liệu.'
    );
    error.status = 400;
    throw error;
  }

  let code = String(data.materialCode || '').trim().toUpperCase();
  if (!code) {
    const prefix = data.materialType === 'FABRIC' ? 'RM-FAB' : 'RM-AUX';
    code = await CounterSequence.getNextSequence('RAW_MATERIAL_CODE', prefix, 5);
  } else {
    const existing = await RawMaterial.findOne({ materialCode: code });
    if (existing) {
      const error = new Error(`Mã nguyên phụ liệu "${code}" đã tồn tại trong hệ thống. Vui lòng chọn mã khác.`);
      error.status = 409;
      throw error;
    }
  }

  // Phân quyền nghiệp vụ: Định mức tồn kho, giá vốn và nhà cung cấp do Owner quyết định
  const isTechnician = user?.roleCode === 'GARMENT_TECHNICIAN';

  let supplierId = null;
  if (!isTechnician && data.supplierId && mongoose.Types.ObjectId.isValid(data.supplierId)) {
    const supExists = await Supplier.findById(data.supplierId);
    if (supExists) supplierId = data.supplierId;
  }

  const newMaterial = new RawMaterial({
    materialCode: code,
    materialName: data.materialName.trim(),
    materialType: data.materialType,
    category: data.category.trim().toUpperCase(),
    unit: normalizedUnit,
    color: data.color ? data.color.trim() : '',
    gsm: data.gsm ? Math.max(0, Number(data.gsm)) : undefined,
    widthCm: data.widthCm ? Math.max(0, Number(data.widthCm)) : undefined,
    requiresWeightKg: Boolean(data.requiresWeightKg),
    unitCost: isTechnician ? 0 : Math.max(0, Number(data.unitCost) || 0),
    safetyStockThreshold: isTechnician ? 0 : Math.max(0, Number(data.safetyStockThreshold) || 0),
    fifoAgingThresholdDays: isTechnician ? 90 : Math.max(1, Number(data.fifoAgingThresholdDays) || 90),
    supplierId: isTechnician ? null : supplierId,
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
 * @returns {Promise<Object>} NPL sau cập nhật
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

  if (data.materialName && data.materialName.trim()) {
    material.materialName = data.materialName.trim();
  }

  if (data.materialType && ['FABRIC', 'AUXILIARY'].includes(data.materialType)) {
    material.materialType = data.materialType;
  }

  if (data.category) {
    material.category = data.category.trim().toUpperCase();
  }

  if (data.unit) {
    const normalizedUnit = normalizeMaterialUnit(data.unit);
    if (!isValidMaterialUnitForType(normalizedUnit, material.materialType)) {
      const error = new Error('Đơn vị tính không phù hợp với loại nguyên phụ liệu hiện tại.');
      error.status = 400;
      throw error;
    }
    material.unit = normalizedUnit;
  }

  if (data.color !== undefined) material.color = data.color ? data.color.trim() : '';
  if (data.gsm !== undefined) material.gsm = data.gsm ? Math.max(0, Number(data.gsm)) : undefined;
  if (data.widthCm !== undefined) material.widthCm = data.widthCm ? Math.max(0, Number(data.widthCm)) : undefined;
  if (data.requiresWeightKg !== undefined) material.requiresWeightKg = Boolean(data.requiresWeightKg);

  // Phân quyền nghiệp vụ: Định mức tồn kho, giá vốn và nhà cung cấp do Owner quản lý; Kỹ thuật viên không can thiệp
  const isTechnician = user?.roleCode === 'GARMENT_TECHNICIAN';
  if (!isTechnician) {
    if (data.unitCost !== undefined) material.unitCost = Math.max(0, Number(data.unitCost) || 0);
    if (data.safetyStockThreshold !== undefined)
      material.safetyStockThreshold = Math.max(0, Number(data.safetyStockThreshold) || 0);
    if (data.fifoAgingThresholdDays !== undefined)
      material.fifoAgingThresholdDays = Math.max(1, Number(data.fifoAgingThresholdDays) || 90);

    if (data.supplierId !== undefined) {
      if (data.supplierId && mongoose.Types.ObjectId.isValid(data.supplierId)) {
        const supExists = await Supplier.findById(data.supplierId);
        if (supExists) material.supplierId = data.supplierId;
      } else {
        material.supplierId = null;
      }
    }
  }

  if (data.isActive !== undefined) {
    material.isActive = Boolean(data.isActive);
  }

  await material.save();
  return getRawMaterialById(material._id);
};

/**
 * XÓA NGUYÊN PHỤ LIỆU VÀ CASCADE DỌN DẸP TOÀN BỘ LIÊN KẾT:
 * Khi xóa một NPL:
 * - Xóa hoàn toàn Document khỏi collection raw_materials (mất hẳn ở kho NPL).
 * - Xóa toàn bộ các lô tồn kho (MaterialStockLot) liên kết với NPL này.
 * - Xóa toàn bộ các cuộn vải (FabricRoll) liên kết với NPL này.
 * - Tự động rút sạch NPL này khỏi các dòng lệnh xuất (MaterialOutbound) trạng thái DRAFT.
 * - Tự động rút sạch NPL này khỏi các phiếu kho (MaterialTicket) trạng thái DRAFT.
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

  const materialName = material.materialName;
  const materialCode = material.materialCode;

  // 1. Cascade xóa toàn bộ lô tồn kho của NPL này (giải phóng vị trí kho / ô kệ)
  const lotResult = await MaterialStockLot.deleteMany({ rawMaterialId: id });

  // 2. Cascade xóa toàn bộ cuộn vải của NPL này (giải phóng vị trí kho / ô kệ)
  const rollResult = await FabricRoll.deleteMany({ rawMaterialId: id });

  // 3. Cascade loại bỏ dòng vật tư này khỏi các lệnh xuất NPL (MaterialOutbound) đang DRAFT
  await MaterialOutbound.updateMany(
    { status: 'DRAFT', 'lines.rawMaterialId': id },
    { $pull: { lines: { rawMaterialId: id } } }
  );

  // 4. Cascade loại bỏ dòng vật tư này khỏi các phiếu nhập kho (MaterialTicket) đang DRAFT
  await MaterialTicket.updateMany(
    { status: 'DRAFT', 'receiptLines.rawMaterialId': id },
    { $pull: { receiptLines: { rawMaterialId: id } } }
  );

  // 5. Xóa hoàn toàn Document NPL khỏi collection raw_materials
  await RawMaterial.findByIdAndDelete(id);

  return {
    success: true,
    message: `Đã xóa hoàn toàn nguyên phụ liệu "${materialName}" (${materialCode}). Đã giải phóng cấu hình kho, xóa ${lotResult.deletedCount || 0} lô kho, ${rollResult.deletedCount || 0} cuộn vải và dọn dẹp các lệnh xuất kho liên quan.`,
    materialCode,
  };
};

/**
 * Đổi trạng thái kích hoạt (Active / Inactive)
 *
 * @param {string} id - ID nguyên phụ liệu
 * @returns {Promise<Object>} Kết quả
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
 * Lấy siêu dữ liệu cho bộ lọc & form (Nhà cung cấp, ĐVT, Danh mục động từ DB)
 *
 * @returns {Promise<Object>} Danh sách suppliers, units, categories, types
 */
export const getRawMaterialMeta = async () => {
  await ensureDefaultCategories();

  const [suppliers, categories] = await Promise.all([
    Supplier.find({ isActive: true })
      .select('supplierCode supplierName phone contactName address')
      .sort({ supplierName: 1 })
      .lean(),
    listCategories(),
  ]);

  return {
    suppliers,
    units: MATERIAL_UNIT_OPTIONS,
    categories: categories.map((c) => ({
      value: c.categoryCode,
      label: c.categoryName,
      type: c.materialType,
      itemCount: c.itemCount,
      _id: c._id,
      description: c.description,
    })),
    types: [
      { value: 'FABRIC', label: 'Vải (Chính / Lót)' },
      { value: 'AUXILIARY', label: 'Phụ liệu may mặc' },
    ],
  };
};
