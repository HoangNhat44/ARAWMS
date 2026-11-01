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
      {
        key: 'dashboard',
        label: 'Bảng điều khiển Kế toán',
        path: '/accountant',
        exact: true,
        icon: LayoutDashboard,
        ucCode: 'Overview',
        description: 'Tổng quan chỉ số tài chính, công nợ, dòng tiền và cảnh báo đối soát',
      },
    ],
  },
  {
    groupKey: 'supplier_contracts',
    groupTitle: 'Mua sắm & Hợp đồng NCC',
    items: [
      {
        key: 'suppliers',
        label: 'Nhà cung ứng nguyên liệu',
        path: '/accountant/suppliers',
        icon: Building2,
        ucCode: 'UC 01–03',
        description: 'Manage Material Suppliers (Xem, Thêm mới, Cập nhật nhà cung ứng)',
      },
      {
        key: 'contracts',
        label: 'Khung hợp đồng mua sắm',
        path: '/accountant/contracts',
        icon: FileSignature,
        ucCode: 'UC 04',
        description: 'Draft Supplier Contract Framework (Soạn thảo khung hợp đồng NCC)',
      },
      {
        key: 'inbound-plans',
        label: 'Kế hoạch lịch trình nhập',
        path: '/accountant/inbound-plans',
        icon: CalendarClock,
        ucCode: 'UC 05',
        description: 'Schedule Material Inbound Plan (Lập kế hoạch tiếp nhận nguyên vật liệu)',
      },
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
      {
        key: 'supplier-debts',
        label: 'Quản lý công nợ NCC',
        path: '/accountant/supplier-debts',
        icon: Wallet,
        ucCode: 'UC 07',
        description: 'Manage Material Supplier Debt (Theo dõi công nợ phải trả nhà cung cấp)',
      },
      {
        key: 'supplier-payments',
        label: 'Lập phiếu chi trả nợ NCC',
        path: '/accountant/supplier-payments',
        icon: Receipt,
        ucCode: 'UC 08',
        description: 'Create Supplier Payment Slip (Tạo phiếu thanh toán/đặt cọc cho NCC)',
      },
      {
        key: 'cash-flow-history',
        label: 'Lịch sử dòng tiền thu/chi',
        path: '/accountant/cash-flow',
        icon: ArrowLeftRight,
        ucCode: 'UC 14',
        description: 'View Cash Flow History (Xem lịch sử biến động dòng tiền toàn hệ thống)',
      },
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
    groupKey: 'valuation_and_pnl',
    groupTitle: 'Giá vốn, Định giá & P&L',
    items: [
      {
        key: 'actual-cogs',
        label: 'Giá vốn hàng bán (COGS)',
        path: '/accountant/cogs',
        icon: Calculator,
        ucCode: 'UC 09',
        description: 'View Actual Cost of Product Sold (Tính & xem giá vốn hàng bán thực tế)',
      },
      {
        key: 'inventory-valuation',
        label: 'Tổng định giá tồn kho',
        path: '/accountant/inventory-valuation',
        icon: Boxes,
        ucCode: 'UC 10',
        description: 'View Total Inventory Valuation (Xem tổng giá trị định giá tài sản tồn kho)',
      },
      {
        key: 'raw-material-valuation',
        label: 'Giá trị tồn kho nguyên liệu',
        path: '/accountant/raw-material-valuation',
        icon: Layers,
        ucCode: 'UC 11',
        description: 'View Total Raw Material Inventory Value (Định giá kho vải cuộn & phụ liệu)',
      },
      {
        key: 'pnl-report',
        label: 'Báo cáo Lãi / Lỗ (P&L)',
        path: '/accountant/pnl-report',
        icon: TrendingUp,
        ucCode: 'UC 12',
        description: 'Export Profit Loss Report (Tổng hợp và xuất báo cáo kết quả kinh doanh P&L)',
      },
    ],
  },
  {
    groupKey: 'cod_and_disputes',
    groupTitle: 'Đối soát COD & Giao vận',
    items: [
      {
        key: 'cod-statements',
        label: 'Tải & Đối soát bảng kê COD',
        path: '/accountant/cod-reconciliation',
        icon: FileSpreadsheet,
        ucCode: 'UC 16–17',
        description: 'Upload & Reconcile Carrier COD Statement (Tải bảng kê & chạy đối soát tự động)',
      },
      {
        key: 'cod-red-flags',
        label: 'Cảnh báo cờ đỏ lệch COD',
        path: '/accountant/cod-red-flags',
        icon: Flag,
        ucCode: 'UC 13',
        badge: 'Red Flag',
        description: 'View COD Discrepancy Red Flags (Giám sát các vận đơn bất thường tiền thu hộ)',
      },
      {
        key: 'carrier-disputes',
        label: 'Khiếu nại đơn vị vận chuyển',
        path: '/accountant/carrier-disputes',
        icon: ShieldAlert,
        ucCode: 'UC 20–21',
        description: 'File & Update Shipping Carrier Dispute (Khiếu nại thất thoát/cước phí & cập nhật đền bù)',
      },
    ],
  },
  {
    groupKey: 'return_financials',
    groupTitle: 'Tài chính Đổi / Trả hàng',
    items: [
      {
        key: 'return-approvals',
        label: 'Duyệt hoàn tiền hàng trả',
        path: '/accountant/return-approvals',
        icon: RotateCcw,
        ucCode: 'UC 18',
        description: 'Approve Return Order Financials (Phê duyệt chi phí tài chính & hoàn tiền đơn trả)',
      },
      {
        key: 'return-surcharges',
        label: 'Ghi nhận phụ phí hoàn hàng',
        path: '/accountant/return-surcharges',
        icon: Percent,
        ucCode: 'UC 19',
        description: 'Record Return Surcharge Variance (Ghi nhận chênh lệch phụ phí phát sinh từ hàng trả)',
      },
    ],
  },
];

/**
 * Trả về danh sách phẳng tất cả các mục điều hướng để Header tra cứu tiêu đề & mô tả theo URL hiện tại
 */
export const FLATTENED_ACCOUNTANT_NAV = ACCOUNTANT_NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => ({
    ...item,
    groupTitle: group.groupTitle,
  }))
);

