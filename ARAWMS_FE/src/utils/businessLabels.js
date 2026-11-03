/* Nguyễn Ngọc Huy-HE171157 | 2-11-2026
 * UC-09/10/11: Dịch tên nhóm quyền và hành động ở lớp hiển thị, giữ nguyên mã gửi lên API.
 */
const names = {
  // Nguyễn Ngọc Huy-HE171157, 2-11-2026: UC-10/11 - Đối chiếu đầy đủ các mã đang có trong nhật ký thực tế.
  SYSTEM: 'Hệ thống', INITIALIZATION: 'Khởi tạo hệ thống', SEED_INITIAL_DATA: 'Thêm dữ liệu ban đầu',
  'Role Assignment': 'Phân vai trò', 'Manager Reports': 'Báo cáo quản lý', 'Stock Adjustment': 'Điều chỉnh kiểm kê',
  REVIEW_MANAGER_REPORT: 'Xác nhận đã xem báo cáo', APPROVE_MAJOR_INVENTORY_VARIANCE: 'Duyệt chênh lệch kiểm kê lớn',
  CONFIGURE_API: 'Cài đặt kết nối dịch vụ', CONFIGURE_FABRIC: 'Cài đặt thu hồi vải dư', CONFIGURE_INVENTORY: 'Cài đặt tồn kho', CONFIGURE_RETURNS: 'Cài đặt đổi trả', CONFIGURE_INVENTORY_THRESHOLD: 'Đổi mức tồn tối thiểu',
  manager_reports: 'Báo cáo quản lý', stocktake_sessions: 'Phiên kiểm kê', raw_materials: 'Nguyên liệu', skus: 'Mã thành phẩm',
  Authentication: 'Đăng nhập và bảo mật', 'Account Governance': 'Quản lý tài khoản',
  'Conversational Commerce': 'Chăm sóc khách hàng', 'CRM Profile': 'Hồ sơ khách hàng', 'Chat Interface': 'Trao đổi với khách hàng',
  WAREHOUSE_LAYOUT: 'Sơ đồ kho', LOCATION_LABEL: 'Nhãn vị trí kho', LOCATION: 'Vị trí kho', FINISHED_GOODS: 'Thành phẩm',
  WAREHOUSE_PUTAWAY: 'Xếp hàng vào kho', WAREHOUSE_PUTAWAY_PLAN: 'Kế hoạch xếp hàng', RAW_MATERIAL: 'Nguyên liệu', SUPPLIER_INBOUND: 'Nhập từ nhà cung cấp',
  LOGIN: 'Đăng nhập', LOGOUT: 'Đăng xuất', GOOGLE_LOGIN: 'Đăng nhập bằng Google', RESET_PASSWORD: 'Đặt lại mật khẩu',
  UPDATE_OWN_PROFILE: 'Cập nhật thông tin cá nhân', CHANGE_OWN_PHONE: 'Đổi số điện thoại', LINK_GOOGLE: 'Liên kết Google', UNLINK_GOOGLE: 'Hủy liên kết Google', SYNC_LINKED_LOGIN_EMAIL: 'Cập nhật thư điện tử đăng nhập',
  CREATE_TEST_ACCOUNT: 'Tạo tài khoản thử nghiệm', RESET_TEST_ACCOUNT_PASSWORD: 'Đặt lại mật khẩu tài khoản thử nghiệm', RESET_DEMO_PASSWORD: 'Đặt lại mật khẩu trình diễn',
  CREATE_DIRECT_ORDER: 'Tạo đơn bán trực tiếp', CREATE_POS_DIRECT_ORDER: 'Tạo đơn tại cửa hàng', CONFIRM_ORDER_RESERVE: 'Xác nhận giữ hàng',
  UPDATE_ORDER_ITEMS: 'Sửa sản phẩm trong đơn', UPDATE_ORDER_STATUS: 'Cập nhật trạng thái đơn', CANCEL_ORDER: 'Hủy đơn hàng', EDIT_CUSTOMER_INFO: 'Sửa thông tin khách hàng',
  TAG_CONVERSATION: 'Gắn nhãn cuộc trò chuyện', UNTAG_CONVERSATION: 'Bỏ nhãn cuộc trò chuyện',
  PRINT_REQUEST: 'Yêu cầu in nhãn', REMOVE_RACK: 'Xóa kệ hàng', ADD_RACK: 'Thêm kệ hàng', OPEN_DRAFT: 'Mở bản nháp', SAVE_DRAFT: 'Lưu bản nháp', PUBLISH: 'Áp dụng sơ đồ kho',
  CREATE_BIN: 'Thêm ô chứa hàng', UPDATE_BIN: 'Sửa ô chứa hàng', REMOVE_BIN: 'Xóa ô chứa hàng', PLACE_UNIT: 'Xếp sản phẩm vào vị trí', CONFIRM_RECEIPT: 'Xác nhận nhận hàng', CONFIRM_WITH_RECEIPT: 'Xác nhận xếp hàng theo phiếu nhập',
  SalesOrder: 'Đơn hàng', Customer: 'Khách hàng', ChatConversation: 'Cuộc trò chuyện', warehouse_locations: 'Vị trí kho', warehouse_layouts: 'Sơ đồ kho', product_units: 'Sản phẩm trong kho', material_tickets: 'Phiếu nguyên liệu', putaway_allocations: 'Phân bổ xếp hàng', system_settings: 'Cài đặt hệ thống',
  'User Management': 'Quản lý người dùng', 'Employee Management': 'Quản lý nhân viên', 'Employee Permissions': 'Phân quyền nhân viên',
  'System Administration': 'Quản trị hệ thống', 'System Settings': 'Cài đặt hệ thống', 'System Activity': 'Nhật ký hoạt động',
  'Order Fulfillment': 'Xử lý đơn hàng', 'Carrier Handover': 'Bàn giao vận chuyển', 'Order Management': 'Quản lý đơn hàng',
  'Raw Material Inventory': 'Tồn kho nguyên liệu', 'Finished Goods Warehousing': 'Kho thành phẩm', 'Inventory Auditing': 'Kiểm kê kho',
  'Production Operations': 'Hoạt động sản xuất', 'BOM Plan Report': 'Báo cáo kế hoạch sản xuất', 'Financial Intelligence': 'Quản lý thu chi',
  'Managerial Financial Analytics': 'Báo cáo điều hành', 'Accounts Payable': 'Công nợ nhà cung cấp',
  VIEW: 'Xem', CREATE: 'Tạo', UPDATE: 'Cập nhật', DELETE: 'Xóa', APPROVE: 'Duyệt', REJECT: 'Từ chối', EXPORT: 'Xuất dữ liệu',
  LOCK_EMPLOYEE: 'Khóa nhân viên', UNLOCK_EMPLOYEE: 'Mở khóa nhân viên', CREATE_EMPLOYEE: 'Tạo nhân viên',
  DEACTIVATE_EMPLOYEE: 'Ngừng hoạt động nhân viên', REACTIVATE_EMPLOYEE: 'Cho nhân viên hoạt động lại',
  ASSIGN_EMPLOYEE_ROLE: 'Đổi vai trò nhân viên', ASSIGN_EMPLOYEE_PERMISSIONS: 'Phân quyền nhân viên',
  ADJUST_PRODUCTION_PLAN: 'Điều chỉnh kế hoạch sản xuất', PAY_SUPPLIER_DEBT: 'Trả nợ nhà cung cấp',
  users: 'Nhân viên', production_orders: 'Lệnh sản xuất', supplier_contracts: 'Hợp đồng nhà cung cấp',
};
export const businessLabel = (value) => names[value] || 'Nghiệp vụ khác';
export const permissionLabel = (code) => String(code).split('|').map(businessLabel).join(' / ');
