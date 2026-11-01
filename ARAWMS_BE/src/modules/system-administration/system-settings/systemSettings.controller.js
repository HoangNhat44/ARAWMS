/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: OWNER-EXT-02..05 - Trả cấu hình công khai và kết quả lưu cho Owner.
 */
import * as service from './systemSettings.service.js';
// Đọc không trả khóa đã lưu; FE chỉ biết tích hợp đã có khóa hay chưa.
export const read = async (req, res) => res.json({ success: true, data: await service.readSettings() });
// Nhóm cấu hình đã được service kiểm tra trường, kiểu dữ liệu và phiên bản.
export const update = async (req, res) => res.json({ success: true, message: 'Đã lưu cấu hình.', data: await service.updateSettings(req) });
// Ngưỡng của từng SKU/nguyên liệu tách khỏi ngưỡng chung của hệ thống.
export const listThresholds = async (req, res) => res.json({ success: true, data: await service.listInventoryThresholds(req) });
export const updateThreshold = async (req, res) => res.json({ success: true, message: 'Đã lưu ngưỡng và cập nhật cảnh báo tồn kho.', data: await service.updateInventoryThreshold(req) });
