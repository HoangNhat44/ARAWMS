/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-06 đến UC-20 - Gọi API Owner qua cơ chế phiên hiện có.
 */
import api from './api';
export const ownerService = {
  // UC-06..20: GET danh sách/báo cáo, hỗ trợ bộ lọc và hủy yêu cầu khi đổi trang.
  list: (resource, params = {}, signal) => api.get(`/owner/${resource}`, { params, signal }),
  // UC-09/18/19/20: Đọc một đối tượng theo ID, không ghi thay đổi.
  detail: (resource, id, signal) => api.get(`/owner/${resource}/${id}`, { signal }),
  // UC-06: Gửi form đã kiểm tra; BE kiểm tra độc lập trước khi tạo tài khoản.
  createEmployee: (body) => api.post('/owner/employees', body),
  // UC-07/08: Chỉ gọi thao tác khóa/mở khóa, kèm lý do và phiên bản dữ liệu.
  employeeAction: (id, action, body) => api.patch(`/owner/employees/${id}/${action}`, body),
  // UC-09: Lưu phần quyền cấp/thu hồi riêng thay vì thay toàn bộ vai trò.
  assignPermissions: (id, body) => api.patch(`/owner/employee-permissions/${id}`, body),
  // UC-18: Xác nhận đã xem báo cáo Manager và gửi ghi chú của Owner.
  reviewReport: (id, comment) => api.patch(`/owner/manager-reports/${id}/review`, { comment }),
  // OWNER-EXT-01: Đổi vai trò, khác với cấp/thu hồi quyền riêng ở UC-09.
  assignRole: (id, body) => api.patch(`/owner/employee-roles/${id}`, body),
  // OWNER-EXT-02..05: Lưu nhóm cấu hình hoặc ngưỡng của từng mặt hàng, luôn kèm phiên bản.
  saveSettings: (section, body) => api.patch(`/owner/system-settings/${section}`, body),
  saveThreshold: (type, id, body) => api.patch(`/owner/system-settings/inventory-items/${type}/${id}`, body),
  // OWNER-EXT-06: Gửi lý do, kế hoạch tồn lâu và dấu báo cáo mà Owner vừa xem.
  approveStocktake: (id, body) => api.post(`/owner/stock-adjustments/${id}/approve`, body),
};
