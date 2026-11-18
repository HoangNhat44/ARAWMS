import * as inboundPlanningService from './inboundPlanning.service.js';

export const getInboundPlans = async (req, res, next) => {
  try {
    const data = await inboundPlanningService.listInboundPlans(req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getInboundPlanById = async (req, res, next) => {
  try {
    const data = await inboundPlanningService.getInboundPlanById(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getContractInboundSummary = async (req, res, next) => {
  try {
    const data = await inboundPlanningService.getContractInboundSummary(req.params.contractId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const createInboundPlan = async (req, res, next) => {
  try {
    const data = await inboundPlanningService.scheduleInboundPlan(req.body, req.user?._id);
    const batchCount = data.batches?.length || data.totalBatches || 1;
    const message = batchCount > 1
      ? `Lập kế hoạch tiếp nhận nguyên liệu thành công (${batchCount} đợt giao hàng gộp chung trong kế hoạch ${data.planCode})`
      : 'Lập kế hoạch lịch trình tiếp nhận nguyên liệu thành công';
    res.status(201).json({
      success: true,
      message,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const updateInboundPlanStatus = async (req, res, next) => {
  try {
    const data = await inboundPlanningService.updateInboundPlanStatus(req.params.id, req.body);
    res.status(200).json({
      success: true,
      message: 'Cập nhật lịch trình tiếp nhận nguyên vật liệu thành công',
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const amendInboundPlan = async (req, res, next) => {
  try {
    const data = await inboundPlanningService.amendInboundPlanVersion(
      req.params.id,
      req.body,
      req.user?._id
    );
    res.status(201).json({
      success: true,
      message: `Đã tạo thành công Phiên bản mới ${data.planCode} (v${data.versionNumber}) cho kế hoạch tiếp nhận nguyên liệu`,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getPlanVersions = async (req, res, next) => {
  try {
    const data = await inboundPlanningService.getInboundPlanVersions(req.params.id);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const verifyInboundPlanDelivery = async (req, res, next) => {
  try {
    const data = await inboundPlanningService.recordTechnicianVerification(
      req.params.id,
      req.body,
      req.user?._id
    );
    const msg =
      data.deliveryComplianceStatus === 'MATCHED'
        ? 'Ghi nhận giao nhận thành công: Đúng kế hoạch.'
        : 'Đã ghi nhận giao nhận SAI KẾ HOẠCH và gửi cảnh báo sang mục "Xử lý sai lệch hợp đồng".';
    res.status(200).json({
      success: true,
      message: msg,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const reportDeviationToOwner = async (req, res, next) => {
  try {
    const data = await inboundPlanningService.reportDeviationToOwner(
      req.params.id,
      req.user?._id,
      req.body?.notes
    );
    res.status(200).json({
      success: true,
      message: `Đã trình báo biên bản sai lệch của kế hoạch ${data.planCode} lên Chủ sở hữu (Owner) thành công.`,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getInboundPlans,
  getInboundPlanById,
  getContractInboundSummary,
  createInboundPlan,
  updateInboundPlanStatus,
  amendInboundPlan,
  getPlanVersions,
  verifyInboundPlanDelivery,
  reportDeviationToOwner,
};
