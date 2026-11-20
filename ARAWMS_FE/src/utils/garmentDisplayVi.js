/**
 * ============================================================================
 * @title        : Garment Display Vietnamese Helpers
 * @description  : Bộ hàm chuyển đổi nhãn hiển thị sang tiếng Việt rõ ràng,
 *                 không viết tắt cho toàn bộ phân hệ Kỹ thuật may.
 *                 Chỉ dùng cho lớp hiển thị (UI) — không làm thay đổi mã dữ liệu backend.
 * ============================================================================
 */

export const DEFECT_CATEGORY_META = {
  SEWING_DEFECT: { label: 'Lỗi đường may / bung chỉ', color: '#DC2626' },
  FABRIC_DEFECT: { label: 'Lỗi vải / xước / rách vải', color: '#EA580C' },
  SIZE_SPEC_ERROR: { label: 'Sai thông số kích cỡ / phom dáng', color: '#D97706' },
  ACCESSORY_LABEL_ERROR: { label: 'Lỗi cúc / khóa / nhãn mác', color: '#7C3AED' },
  STAIN_DAMAGE: { label: 'Bẩn / ố màu / hư hỏng', color: '#2563EB' },
  OTHER: { label: 'Lỗi khác', color: '#6B7280' },
};

export const DEFECT_ACTION_LABELS = {
  REPAIR_AT_WORKSHOP: 'Sửa chữa tại xưởng may',
  LIQUIDATION: 'Hạ cấp / Thanh lý hàng loại B',
  DESTRUCTION: 'Tiêu hủy',
  NONE: 'Không có lỗi',
};

export const RETURN_CONDITION_LABELS = {
  MISSING_TAG: 'Mất tem mác / Rách bao bì',
  DIRTY_OR_DAMAGED: 'Bẩn, ố màu hoặc rách vải',
  DEFECTIVE_SEWING: 'Lỗi đường may, bung chỉ',
  WRONG_ITEM: 'Sai sản phẩm / Sai màu / Sai mẫu',
  USED: 'Đã qua sử dụng / Có mùi lạ',
};

export const COLOR_VI_MAP = {
  black: 'Đen',
  white: 'Trắng',
  red: 'Đỏ',
  blue: 'Xanh dương',
  navy: 'Xanh than',
  'dark blue': 'Xanh đậm',
  'light blue': 'Xanh nhạt',
  'sky blue': 'Xanh da trời',
  green: 'Xanh lá',
  'dark green': 'Xanh lá đậm',
  'mint green': 'Xanh bạc hà',
  mint: 'Xanh bạc hà',
  yellow: 'Vàng',
  orange: 'Cam',
  pink: 'Hồng',
  purple: 'Tím',
  violet: 'Tím',
  brown: 'Nâu',
  beige: 'Be',
  cream: 'Kem',
  ivory: 'Trắng ngà',
  grey: 'Xám',
  gray: 'Xám',
  silver: 'Bạc',
  gold: 'Vàng ánh kim',
  khaki: 'Kaki',
  olive: 'Xanh rêu',
  charcoal: 'Xám than',
  burgundy: 'Đỏ rượu vang',
  maroon: 'Đỏ đô',
  indigo: 'Xanh chàm',
  teal: 'Xanh cổ vịt',
  coral: 'Cam san hô',
};

export const PRODUCT_TERM_VI_MAP = [
  [/\bpolo shirt\b/gi, 'Áo polo'],
  [/\bt-?shirt\b/gi, 'Áo thun'],
  [/\bpolo\b/gi, 'Áo polo'],
  [/\bshirt\b/gi, 'Áo sơ mi'],
  [/\bhoodie\b/gi, 'Áo khoác nỉ có mũ'],
  [/\bsweatshirt\b/gi, 'Áo nỉ dài tay'],
  [/\bsweater\b/gi, 'Áo len'],
  [/\bcardigan\b/gi, 'Áo khoác len'],
  [/\bpullover\b/gi, 'Áo chui đầu'],
  [/\bjacket\b/gi, 'Áo khoác'],
  [/\bcoat\b/gi, 'Áo choàng'],
  [/\bblazer\b/gi, 'Áo vest'],
  [/\bvest\b/gi, 'Áo gile'],
  [/\btank top\b/gi, 'Áo ba lỗ'],
  [/\bcrop top\b/gi, 'Áo dáng ngắn'],
  [/\bjeans\b/gi, 'Quần bò'],
  [/\bdenim\b/gi, 'Vải bò'],
  [/\btrousers\b/gi, 'Quần tây'],
  [/\bpants\b/gi, 'Quần dài'],
  [/\bjoggers?\b/gi, 'Quần thể thao bo gấu'],
  [/\bshorts\b/gi, 'Quần ngắn'],
  [/\bskirt\b/gi, 'Chân váy'],
  [/\bdress\b/gi, 'Váy đầm'],
  [/\boversized?\b/gi, 'phom rộng'],
  [/\bslim fit\b/gi, 'phom ôm'],
  [/\bregular fit\b/gi, 'phom vừa'],
  [/\bbasic\b/gi, 'cơ bản'],
  [/\bclassic\b/gi, 'cổ điển'],
  [/\bpremium\b/gi, 'cao cấp'],
];

export const UNIT_VI_MAP = {
  METER: 'Mét',
  METERS: 'Mét',
  M: 'Mét',
  KG: 'Kg',
  KILOGRAM: 'Kg',
  PIECE: 'Cái',
  PIECES: 'Cái',
  PCS: 'Cái',
  UNIT: 'Cái',
  SPOOL: 'Cuộn chỉ',
  ROLL: 'Cuộn',
  BOX: 'Hộp',
  SET: 'Bộ',
  PACK: 'Gói',
  PAIR: 'Đôi',
  YARD: 'Thước Anh',
  CM: 'Cm',
};

export const ROLE_VI_MAP = {
  GARMENT_TECHNICIAN: 'Kỹ thuật viên may',
  WAREHOUSE_MANAGER: 'Quản lý kho',
  WAREHOUSE_STAFF: 'Nhân viên kho',
  ADMIN: 'Quản trị viên',
  OWNER: 'Chủ doanh nghiệp',
  SELLER: 'Nhân viên bán hàng',
  STAFF: 'Nhân viên',
};

export const MATERIAL_TYPE_VI_MAP = {
  FABRIC: 'Vải',
  AUXILIARY: 'Phụ liệu',
};

export const STATUS_VI_MAP = {
  DRAFT: 'Nháp',
  PENDING: 'Chờ xử lý',
  WAITING_QC: 'Chờ kiểm định chất lượng',
  READY_TO_CONFIRM: 'Chờ Quản lý kho xác nhận',
  WAITING_RECEIPT: 'Chờ nhập kho',
  WAITING_SCAN: 'Chờ Quản lý kho duyệt',
  WAITING_ASSIGNMENT: 'Chờ phân công kho',
  APPROVED: 'Đã duyệt',
  ASSIGNED: 'Chờ lấy hàng',
  IN_PROGRESS: 'Đang thực hiện',
  PARTIALLY_RECEIVED: 'Đang nhập một phần',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
  REJECTED: 'Đã từ chối',
  PENDING_DISCREPANCY: 'Chờ xử lý sai lệch',
  REQUESTED: 'Đã gửi Quản lý kho',
  RECEIVED: 'Đã nhập kho',
  PASSED: 'Đạt chuẩn',
  PARTIAL: 'Đạt một phần',
  FAILED: 'Không đạt',
  RETURNED: 'Đã hoàn về kho',
  RETURN_COMPLETED: 'Hoàn thành công',
  PARTIALLY_RETURNED: 'Hoàn hàng một phần',
  RETURN_FAILED: 'Hoàn hàng không thành công',
  DEFECTIVE: 'Hàng lỗi',
  IN_STOCK: 'Trong kho',
  SOLD: 'Đã bán',
  QUARANTINE: 'Cách ly chờ xử lý',
  NONE: 'Không có lỗi',
  OPEN: 'Đang mở',
  CLOSED: 'Đã đóng',
  ACTIVE: 'Đang hoạt động',
  INACTIVE: 'Ngừng hoạt động',
};

export const translateColorVi = (color) => {
  if (!color) return '';
  const key = String(color).trim().toLowerCase();
  return COLOR_VI_MAP[key] || color;
};

export const translateProductNameVi = (name, fallback = 'Sản phẩm') => {
  if (!name) return fallback;
  let result = String(name);
  for (const [pattern, replacement] of PRODUCT_TERM_VI_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result;
};

export const formatUnitVi = (unit, fallback = '') => {
  if (!unit) return fallback;
  const key = String(unit).trim().toUpperCase();
  return UNIT_VI_MAP[key] || unit;
};

export const formatRoleVi = (roleCode) => {
  if (!roleCode) return 'Kỹ thuật viên may';
  const key = String(roleCode).trim().toUpperCase();
  return ROLE_VI_MAP[key] || roleCode;
};

export const formatMaterialTypeVi = (materialType) => {
  if (!materialType) return 'Nguyên phụ liệu';
  const key = String(materialType).trim().toUpperCase();
  return MATERIAL_TYPE_VI_MAP[key] || materialType;
};

export const formatDefectActionVi = (action) => {
  if (!action) return DEFECT_ACTION_LABELS.NONE;
  return DEFECT_ACTION_LABELS[action] || action;
};

export const formatReturnConditionVi = (code) => {
  if (!code) return 'Không xác định';
  return RETURN_CONDITION_LABELS[code] || code;
};

export const formatStatusVi = (status) => {
  if (!status) return '—';
  const key = String(status).trim().toUpperCase();
  return STATUS_VI_MAP[key] || status;
};
