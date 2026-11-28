// Nguyễn Ngọc Huy-HE171157, 2-11-2026: Phản hồi 8 - Thống nhất nhãn hiển thị bằng tiếng Việt phổ thông.
/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Tập hợp yêu cầu đọc và cập nhật tới API Owner qua phiên đăng nhập hiện tại.
 */
import api from './api';
import { OWNER_PAGE_SIZE } from '../utils/constants';
/** Các hàm được tổ chức theo tài nguyên để trang chỉ cần truyền bộ lọc, mã bản ghi hoặc dữ liệu đã nhập. */
export const ownerService = {
  // Danh sách có phân trang luôn lấy 15 dòng; báo cáo và chi tiết giữ nguyên bộ lọc.
  list: (resource, params = {}, signal) => api.get(`/owner/${resource}`, { params: params.page !== undefined ? { ...params, limit: OWNER_PAGE_SIZE } : params, signal }),
  // Tải chi tiết theo mã bản ghi và hỗ trợ hủy yêu cầu khi rời trang.
  detail: (resource, id, signal) => api.get(`/owner/${resource}/${id}`, { signal }),
  // UC-010. Gửi hồ sơ tạo tài khoản. Máy chủ kiểm tra lại trước khi lưu.
  createEmployee: (body) => api.post('/owner/employees', body),
  // UC-012. Gửi thao tác trạng thái kèm lý do và phiên bản của tài khoản.
  employeeAction: (id, action, body) => api.patch(`/owner/employees/${id}/${action}`, body),
  // UC-011. Gửi các quyền cấp hoặc thu hồi riêng của nhân viên.
  assignPermissions: (id, body) => api.patch(`/owner/employee-permissions/${id}`, body),
  // UC-108. Gửi ghi chú khi Owner xác nhận đã xem báo cáo kho.
  reviewReport: (id, comment) => api.patch(`/owner/manager-reports/${id}/review`, { comment }),
  // UC-011. Đổi vai trò mặc định của nhân viên.
  assignRole: (id, body) => api.patch(`/owner/employee-roles/${id}`, body),
  // UC-013 đến UC-016. Lưu một nhóm cấu hình kèm phiên bản.
  saveSettings: (section, body) => api.patch(`/owner/system-settings/${section}`, body),
  // Lưu ngưỡng theo loại kho và mã mặt hàng cụ thể.
  saveThreshold: (type, id, body) => api.patch(`/owner/system-settings/inventory-items/${type}/${id}`, body),
  // UC-075. Gửi lý do, kế hoạch tồn lâu và dấu băm báo cáo Owner vừa xem.
  approveStocktake: (id, body) => api.post(`/owner/stock-adjustments/${id}/approve`, body),
};
