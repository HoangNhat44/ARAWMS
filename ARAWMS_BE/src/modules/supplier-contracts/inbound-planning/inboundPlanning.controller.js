import * as inboundPlanningService from './inboundPlanning.service.js';

export const getInboundPlans = async (req, res, next) => {
  try {
    const data = await inboundPlanningService.listInboundPlans(req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const createInboundPlan = async (req, res, next) => {
  try {
    const data = await inboundPlanningService.scheduleInboundPlan(req.body, req.user?._id);
    res.status(201).json({
      success: true,
      message: 'Lập kế hoạch lịch trình tiếp nhận nguyên vật liệu thành công',
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

export default {
  getInboundPlans,
  createInboundPlan,
  updateInboundPlanStatus,
};

