/*
 * File: productValuation.controller.js
 * Role: ACCOUNTANT / FINANCIAL_INTELLIGENCE
 * UC: UC 10 - View Total Inventory Valuation (Xem tổng giá trị định giá tài sản tồn kho sản phẩm)
 */
import * as valuationService from './productValuation.service.js';

export const getValuationSummary = async (req, res, next) => {
  try {
    const data = await valuationService.getValuationSummary();
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
};

export const getValuationList = async (req, res, next) => {
  try {
    const data = await valuationService.getValuationList(req.query);
    return res.status(200).json({
      success: true,
      data: data.items,
      pagination: data.pagination,
    });
  } catch (err) {
    next(err);
  }
};

export const getCategories = async (req, res, next) => {
  try {
    const categories = await valuationService.getProductCategories();
    return res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (err) {
    next(err);
  }
};

