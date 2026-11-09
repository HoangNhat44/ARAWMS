/*
 * File: rawMaterialValuation.controller.js
 * Role: ACCOUNTANT / FINANCIAL_INTELLIGENCE
 * UC: UC 11 - View Total Raw Material Inventory Value
 */
import * as valuationService from './rawMaterialValuation.service.js';

export const getValuationSummary = async (req, res, next) => {
  try {
    const data = await valuationService.getRawMaterialValuationSummary();
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
    const data = await valuationService.getRawMaterialValuationList(req.query);
    return res.status(200).json({
      success: true,
      data: data.items,
      pagination: data.pagination,
    });
  } catch (err) {
    next(err);
  }
};

export const getFilterMetadata = async (req, res, next) => {
  try {
    const data = await valuationService.getFilterMetadata();
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
};

