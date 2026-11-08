import * as contractWorkspaceService from './contractWorkspace.service.js';

export const getSuppliers = async (req, res, next) => {
  try {
    const data = await contractWorkspaceService.listSuppliers(req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const createSupplier = async (req, res, next) => {
  try {
    const data = await contractWorkspaceService.createSupplier(req.body);
    res.status(201).json({
      success: true,
      message: 'Thêm mới nhà cung ứng nguyên phụ liệu thành công',
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const updateSupplier = async (req, res, next) => {
  try {
    const data = await contractWorkspaceService.updateSupplier(req.params.id, req.body);
    res.status(200).json({
      success: true,
      message: 'Cập nhật thông tin nhà cung ứng thành công',
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getMaterialsCatalog = async (req, res, next) => {
  try {
    const data = await contractWorkspaceService.listRawMaterialsCatalog(req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const createRawMaterial = async (req, res, next) => {
  try {
    const data = await contractWorkspaceService.createRawMaterialQuick(req.body);
    res.status(201).json({ success: true, message: 'Đã thêm nguyên phụ liệu mới thành công.', data });
  } catch (error) {
    next(error);
  }
};

export const getContracts = async (req, res, next) => {
  try {
    const data = await contractWorkspaceService.listContracts(req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getContractDetail = async (req, res, next) => {
  try {
    const data = await contractWorkspaceService.getContractById(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const draftContract = async (req, res, next) => {
  try {
    const data = await contractWorkspaceService.draftContractFramework(req.body, req.user?._id);
    res.status(201).json({
      success: true,
      message: 'Đã lưu khung hợp đồng nguyên phụ liệu thành công',
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getContractVersions = async (req, res, next) => {
  try {
    const data = await contractWorkspaceService.getContractVersions(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const amendContract = async (req, res, next) => {
  try {
    const data = await contractWorkspaceService.amendContractVersion(
      req.params.id,
      req.body,
      req.user?._id
    );
    res.status(201).json({
      success: true,
      message: `Đã khởi tạo phiên bản mới v${data.versionNumber} (${data.contractCode}) thành công`,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const updateContract = async (req, res, next) => {
  try {
    const data = await contractWorkspaceService.updateContractFramework(
      req.params.id,
      req.body,
      req.user?._id
    );
    res.status(200).json({
      success: true,
      message:
        data.versionNumber && data.parentSupersededContractId
          ? `Đã tạo phiên bản điều chỉnh mới v${data.versionNumber} (${data.contractCode})`
          : 'Đã cập nhật khung hợp đồng thành công',
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const updateContractStatus = async (req, res, next) => {
  try {
    const data = await contractWorkspaceService.updateContractStatus(
      req.params.id,
      req.body,
      req.user?._id
    );
    res.status(200).json({
      success: true,
      message: 'Đã cập nhật trạng thái hợp đồng thành công',
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const terminateContract = async (req, res, next) => {
  try {
    const data = await contractWorkspaceService.terminateContract(
      req.params.id,
      req.body,
      req.user?._id
    );
    res.status(200).json({
      success: true,
      message: `Đã chấm dứt hợp đồng [${data.contractCode}] thành công.`,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getSuppliers,
  createSupplier,
  updateSupplier,
  getMaterialsCatalog,
  createRawMaterial,
  getContracts,
  getContractDetail,
  getContractVersions,
  draftContract,
  amendContract,
  updateContract,
  updateContractStatus,
  terminateContract,
};

