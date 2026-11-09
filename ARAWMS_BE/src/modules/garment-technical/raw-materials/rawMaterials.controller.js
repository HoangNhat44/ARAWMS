/**
 * ============================================================================
 * @title        : Raw Materials & Categories Controller
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-09
 * @lastModified : 2026-11-09
 * @description  : Tiếp nhận và xử lý HTTP requests cho Quản lý Danh mục & Nguyên Phụ Liệu.
 * @module       : Garment Technical / Raw Materials
 * @layer        : Controller
 * ============================================================================
 */

import * as rawMaterialsService from './rawMaterials.service.js';

// ============================================================================
// CATEGORY CONTROLLERS
// ============================================================================

/**
 * Lấy danh sách danh mục phân loại NPL kèm số lượng NPL trong từng danh mục.
 * @route GET /api/garment-technical/raw-materials/categories
 */
export const listCategories = async (req, res, next) => {
  try {
    const result = await rawMaterialsService.listCategories();
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * Tạo mới danh mục phân loại NPL.
 * @route POST /api/garment-technical/raw-materials/categories
 */
export const createCategory = async (req, res, next) => {
  try {
    const result = await rawMaterialsService.createCategory(req.body);
    return res.status(201).json({
      success: true,
      message: `Đã tạo mới danh mục "${result.categoryName}" (${result.categoryCode}) thành công!`,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * Cập nhật danh mục phân loại NPL.
 * @route PUT /api/garment-technical/raw-materials/categories/:id
 */
export const updateCategory = async (req, res, next) => {
  try {
    const result = await rawMaterialsService.updateCategory(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: `Đã cập nhật danh mục "${result.categoryName}" thành công!`,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * Xóa danh mục phân loại NPL (Bắt buộc phải xóa hết NPL trong danh mục trước).
 * @route DELETE /api/garment-technical/raw-materials/categories/:id
 */
export const deleteCategory = async (req, res, next) => {
  try {
    const result = await rawMaterialsService.deleteCategory(req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
};

// ============================================================================
// RAW MATERIAL CONTROLLERS
// ============================================================================

/**
 * Lấy danh sách nguyên phụ liệu kèm bộ lọc và phân trang.
 * @route GET /api/garment-technical/raw-materials
 */
export const listMaterials = async (req, res, next) => {
  try {
    const result = await rawMaterialsService.listRawMaterials(req.query);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * Lấy chi tiết nguyên phụ liệu theo ID.
 * @route GET /api/garment-technical/raw-materials/:id
 */
export const getMaterial = async (req, res, next) => {
  try {
    const result = await rawMaterialsService.getRawMaterialById(req.params.id);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * Tạo mới một nguyên phụ liệu vào hệ thống.
 * @route POST /api/garment-technical/raw-materials
 */
export const createMaterial = async (req, res, next) => {
  try {
    const result = await rawMaterialsService.createRawMaterial(req.body, req.user);
    return res.status(201).json({
      success: true,
      message: `Đã tạo mới nguyên phụ liệu "${result.materialName}" (${result.materialCode}) thành công!`,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * Cập nhật thông tin nguyên phụ liệu.
 * @route PUT /api/garment-technical/raw-materials/:id
 */
export const updateMaterial = async (req, res, next) => {
  try {
    const result = await rawMaterialsService.updateRawMaterial(req.params.id, req.body, req.user);
    return res.status(200).json({
      success: true,
      message: `Đã cập nhật thông tin nguyên phụ liệu "${result.materialName}" (${result.materialCode}) thành công!`,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * Xóa nguyên phụ liệu và cascade dọn dẹp cấu hình kho & lệnh xuất.
 * @route DELETE /api/garment-technical/raw-materials/:id
 */
export const deleteMaterial = async (req, res, next) => {
  try {
    const result = await rawMaterialsService.deleteRawMaterial(req.params.id, req.user);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
};

/**
 * Đổi trạng thái hoạt động (Active / Inactive).
 * @route PATCH /api/garment-technical/raw-materials/:id/toggle-status
 */
export const toggleStatus = async (req, res, next) => {
  try {
    const result = await rawMaterialsService.toggleRawMaterialStatus(req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
};

/**
 * Lấy siêu dữ liệu phục vụ bộ lọc & form.
 * @route GET /api/garment-technical/raw-materials/meta
 */
export const getMeta = async (req, res, next) => {
  try {
    const result = await rawMaterialsService.getRawMaterialMeta();
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
};
