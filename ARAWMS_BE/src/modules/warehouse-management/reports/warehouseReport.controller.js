/*
 * File: warehouseReport.controller.js
 * Author: Duy Anh
 * Date: 2026-11-19
 * Description: HTTP handlers for warehouse statistics reports (warehouseReport.service.js).
 */
import { handle } from '../shared/warehouseHttp.js';
import {
  listWarehouseReports, getWarehouseReport, createWarehouseReport, refreshWarehouseReport,
  saveWarehouseReportDraft, submitWarehouseReport, deleteWarehouseReportDraft,
} from './warehouseReport.service.js';

export const listReports = handle('Lịch sử báo cáo kho', () => listWarehouseReports());
export const getReport = handle('Báo cáo kho', (req) => getWarehouseReport(req.params.id));
export const createReport = handle('Đã lập báo cáo nháp', (req) => createWarehouseReport(req.body, req.user), { status: 201 });
export const refreshReport = handle('Đã tổng hợp lại số liệu', (req) => refreshWarehouseReport(req.params.id, req.body));
export const saveDraft = handle('Đã lưu nháp', (req) => saveWarehouseReportDraft(req.params.id, req.body));
export const submitReport = handle('Đã gửi báo cáo cho Owner', (req) => submitWarehouseReport(req.params.id, req.body, req.user));
export const deleteDraft = handle('Đã xóa bản nháp', (req) => deleteWarehouseReportDraft(req.params.id));
