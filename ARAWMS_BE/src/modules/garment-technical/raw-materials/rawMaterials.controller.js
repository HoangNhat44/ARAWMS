/**
 * ============================================================================
 * @title        : Raw Materials Controller
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-09
 * @lastModified : 2026-11-09
 * @description  : Tiếp nhận và xử lý HTTP requests cho Quản lý Danh mục Kho Nguyên Phụ Liệu (CRUD).
 * @module       : Garment Technical / Raw Materials
 * @layer        : Controller
 * ============================================================================
 */

import * as rawMaterialsService from './rawMaterials.service.js';

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
 * Lấy thông tin chi tiết một nguyên phụ liệu theo ID.
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
 * Xóa hoặc vô hiệu hóa nguyên phụ liệu.
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
 * Đổi trạng thái hoạt động (Active / Inactive) của nguyên phụ liệu.
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
 * Lấy siêu dữ liệu phục vụ bộ lọc & tạo NPL (Nhà cung cấp, ĐVT, Danh mục).
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

