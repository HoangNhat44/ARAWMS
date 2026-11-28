/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: OWNER-EXT-02..05 - Trả cấu hình công khai và kết quả lưu cho Owner.
 */
import * as service from './systemSettings.service.js';
// Đọc không trả khóa đã lưu; FE chỉ biết tích hợp đã có khóa hay chưa.
/** Trả cấu hình chung trong định dạng API của khu vực Owner. */
export const read = async (req, res) => res.json({ success: true, data: await service.readSettings() });
// Nhóm cấu hình đã được service kiểm tra trường, kiểu dữ liệu và phiên bản.
/** Chuyển yêu cầu cập nhật một nhóm cấu hình cho service và phản hồi kết quả đã lưu. */
export const update = async (req, res) => res.json({ success: true, message: 'Đã lưu cấu hình.', data: await service.updateSettings(req) });
// Ngưỡng của từng SKU/nguyên liệu tách khỏi ngưỡng chung của hệ thống.
/** Trả dữ liệu và thông tin phân trang của danh sách ngưỡng. */
export const listThresholds = async (req, res) => res.json({ success: true, data: await service.listInventoryThresholds(req) });
/** Trả cấu hình ngưỡng sau khi service cập nhật mặt hàng. */
export const updateThreshold = async (req, res) => res.json({ success: true, message: 'Đã lưu ngưỡng và cập nhật cảnh báo tồn kho.', data: await service.updateInventoryThreshold(req) });
