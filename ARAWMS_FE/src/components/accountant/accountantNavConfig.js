import {
  LayoutDashboard,
  Building2,
  FileSignature,
  CalendarClock,
  AlertTriangle,
  Wallet,
  Receipt,
  Calculator,
  Boxes,
  Layers,
  TrendingUp,
  ArrowLeftRight,
  FilePlus2,
  FileSpreadsheet,
  Flag,
  RotateCcw,
  Percent,
  ShieldAlert,
} from 'lucide-react';

/**
 * CẤU HÌNH ĐIỀU HƯỚNG TẬP TRUNG CHO ROLE KẾ TOÁN (ACCOUNTANT SIDEBAR MENU)
 * ------------------------------------------------------------------------
 * Hướng dẫn mở rộng:
 * Mỗi khi thêm một chức năng / trang mới cho Kế toán, bạn chỉ cần:
 * 1. Thêm 1 object vào mảng `items` của nhóm tương ứng bên dưới.
 * 2. Khai báo `<Route path="..." element={<TenTrangMoi />} />` trong `src/routes/AccountantRoutes.jsx`.
 * Sidebar và Header sẽ tự động cập nhật menu, icon, trạng thái active và breadcrumb.
 */
export const ACCOUNTANT_NAV_GROUPS = [
  {
    groupKey: 'overview',
    groupTitle: 'Tổng quan',
    items: [
      // [UC-009, UC-111] View Dashboard & Report Cash Flow - Tổng quan Dashboard Kế toán & báo cáo dòng tiền
      {
        key: 'dashboard',
        label: 'Bảng điều khiển Kế toán',
        path: '/accountant',
        exact: true,
        icon: LayoutDashboard,
        ucCode: 'Overview',
        description: 'Tổng quan chỉ số tài chính, công nợ, dòng tiền và so sánh kỳ cũ',
      },
    ],
  },
  {
    groupKey: 'supplier_contracts',
    groupTitle: 'Mua sắm & Hợp đồng NCC',
    items: [
      // [UC-036, UC-037] Add / Update Suppliers - Quản lý nhà cung ứng nguyên phụ liệu
      {
        key: 'suppliers',
        label: 'Nhà cung ứng nguyên liệu',
        path: '/accountant/suppliers',
        icon: Building2,
        ucCode: 'UC 01–03',
        description: 'Manage Material Suppliers (Xem, Thêm mới, Cập nhật nhà cung ứng)',
      },
      // [UC-027, UC-038, UC-039] Create Material, Create / Update Contract - Soạn & cập nhật khung hợp đồng NCC
      {
        key: 'contracts',
        label: 'Khung hợp đồng mua sắm',
        path: '/accountant/contracts',
        icon: FileSignature,
        ucCode: 'UC 04',
        description: 'Draft Supplier Contract Framework (Soạn thảo khung hợp đồng NCC)',
      },
      // [UC-040, UC-044] Schedule / View Material Inbound Plan - Lập và xem kế hoạch lịch trình tiếp nhận nguyên phụ liệu
      {
        key: 'inbound-plans',
        label: 'Kế hoạch lịch trình nhập',
        path: '/accountant/inbound-plans',
        icon: CalendarClock,
        ucCode: 'UC 05',
        description: 'Schedule Material Inbound Plan (Lập kế hoạch tiếp nhận nguyên vật liệu)',
      },
      // [UC-041] Report Contract Deviation - Điều tra, xử lý & trình báo sai lệch hợp đồng
      {
        key: 'contract-deviations',
        label: 'Xử lý sai lệch hợp đồng',
        path: '/accountant/contract-deviations',
        icon: AlertTriangle,
        ucCode: 'UC 06',
        description: 'Execute Contract Deviation Resolution (Xử lý sai lệch giao nhận so với HĐ)',
      },
    ],
  },
  {
    groupKey: 'debt_and_cashflow',
    groupTitle: 'Công nợ & Dòng tiền',
    items: [
      // [UC-114] View Debt - Theo dõi công nợ Nhà cung cấp & công nợ COD/cước GHN
      {
        key: 'supplier-debts',
        label: 'Quản lý công nợ',
        path: '/accountant/supplier-debts',
        icon: Wallet,
        ucCode: 'UC 07',
        description: 'Manage Debts (Theo dõi công nợ phải trả NCC và công nợ phải thu GHN)',
      },
      // [UC-112, UC-113] View Cash Flow History & Create Cash Flow Voucher - Lịch sử dòng tiền & lập phiếu thu/chi
      {
        key: 'cash-flow-vouchers',
        label: 'Lập phiếu thu / chi',
        path: '/accountant/cash-flow-vouchers',
        icon: FilePlus2,
        ucCode: 'UC 15',
        description: 'Create Cash Flow Voucher (Lập chứng từ thu/chi tiền mặt & ngân hàng)',
      },
    ],
  },
  {
    groupKey: 'cod_and_disputes',
    groupTitle: 'Đối soát COD & Giao vận',
    items: [
      // [UC-115, UC-118, UC-119] Đối soát COD tự động GHN & Lập/Xem khiếu nại tranh chấp vận chuyển
      {
        key: 'cod-statements',
        label: 'Đối soát bảng kê COD',
        path: '/accountant/cod-reconciliation',
        icon: FileSpreadsheet,
        ucCode: 'UC 16–17',
        description: 'Upload & Reconcile Carrier COD Statement (Tải bảng kê & chạy đối soát tự động)',
      },


    ],
  },
  {
    groupKey: 'valuation_and_pnl',
    groupTitle: 'Giá vốn, Định giá & P&L',
    items: [

      // [UC-109] View Total Inventory Valuation - Xem tổng giá trị định giá tồn kho thành phẩm
      {
        key: 'inventory-valuation',
        label: 'Giá trị tồn kho sản phẩm',
        path: '/accountant/inventory-valuation',
        icon: Boxes,
        ucCode: 'UC 10',
        description: 'View Total Inventory Valuation (Xem tổng giá trị định giá tài sản tồn kho)',
      },
      // [UC-110] View Total Raw Material Inventory Value - Xem tổng giá trị định giá tồn kho nguyên vật liệu
      {
        key: 'raw-material-valuation',
        label: 'Giá trị tồn kho nguyên liệu',
        path: '/accountant/raw-material-valuation',
        icon: Layers,
        ucCode: 'UC 11',
        description: 'View Total Raw Material Inventory Value (Định giá kho vải cuộn & phụ liệu)',
      },

    ],
  },


];

/**
 * Trả về danh sách phẳng tất cả các mục điều hướng để Header tra cứu tiêu đề & mô tả theo URL hiện tại
 */
export const FLATTENED_ACCOUNTANT_NAV = (ACCOUNTANT_NAV_GROUPS || []).flatMap((group) =>
  (group?.items || []).map((item) => ({
    ...item,
    groupTitle: group?.groupTitle || '',
  }))
);

