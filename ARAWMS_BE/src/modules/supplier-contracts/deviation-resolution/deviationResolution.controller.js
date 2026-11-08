import * as deviationResolutionService from './deviationResolution.service.js';

export const getDeviations = async (req, res, next) => {
  try {
    const data = await deviationResolutionService.listContractDeviations(req.query);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const resolveDeviation = async (req, res, next) => {
  try {
    const data = await deviationResolutionService.resolveContractDeviation(
      req.params.id,
      req.body,
      req.user?._id
    );
    res.status(200).json({
      success: true,
      message: 'Đã xác nhận xử lý sai lệch hợp đồng thành công. Trạng thái chuyển sang Đã xử lý.',
      data,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getDeviations,
  resolveDeviation,
};

