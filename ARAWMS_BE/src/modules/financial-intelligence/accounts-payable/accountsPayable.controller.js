import * as accountsPayableService from './accountsPayable.service.js';

export const getExpenseCategories = async (req, res, next) => {
  try {
    const data = await accountsPayableService.getExpenseCategories();
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const listPaymentVouchers = async (req, res, next) => {
  try {
    const data = await accountsPayableService.listPaymentVouchers(req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getPaymentVoucherById = async (req, res, next) => {
  try {
    const data = await accountsPayableService.getPaymentVoucherById(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const createPaymentVoucher = async (req, res, next) => {
  try {
    const data = await accountsPayableService.createPaymentVoucher(req.body, req.user?._id);
    res.status(201).json({
      success: true,
      message: `Lập phiếu chi tiền [${data.voucherCode}] thành công.`,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const updatePaymentVoucher = async (req, res, next) => {
  try {
    const data = await accountsPayableService.updatePaymentVoucher(req.params.id, req.body, req.user?._id);
    res.status(200).json({
      success: true,
      message: `Cập nhật phiếu chi [${data.voucherCode}] thành công.`,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const confirmPaymentVoucher = async (req, res, next) => {
  try {
    const data = await accountsPayableService.confirmPaymentVoucher(req.params.id, req.user?._id);
    res.status(200).json({
      success: true,
      message: `Xác nhận phê duyệt phiếu chi [${data.voucherCode}] thành công.`,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const executePayment = async (req, res, next) => {
  try {
    const data = await accountsPayableService.executePayment(req.params.id, req.body, req.user?._id);
    res.status(200).json({
      success: true,
      message: `Xác nhận chi tiền thành công cho phiếu chi [${data.voucherCode}].`,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const cancelPaymentVoucher = async (req, res, next) => {
  try {
    const data = await accountsPayableService.cancelPaymentVoucher(req.params.id, req.body, req.user?._id);
    res.status(200).json({
      success: true,
      message: `Hủy phiếu chi [${data.voucherCode}] thành công.`,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getExpenseCategories,
  listPaymentVouchers,
  getPaymentVoucherById,
  createPaymentVoucher,
  updatePaymentVoucher,
  confirmPaymentVoucher,
  executePayment,
  cancelPaymentVoucher,
};

