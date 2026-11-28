import axios from 'axios';
import { API_BASE_URL } from '../utils/constants';
import { getToken } from '../utils/authStorage';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Tự động đính kèm token xác thực nếu người dùng đã đăng nhập
apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const accountantProcurementApi = {
  // [UC-036, UC-037] Quản lý nhà cung ứng nguyên phụ liệu (Xem danh sách, Thêm mới, Cập nhật)
  getSuppliers: async (params = {}) => {
    const res = await apiClient.get('/supplier-contracts/suppliers', { params });
    return res.data.data || [];
  },

  // [UC-036] Add Suppliers - Đăng ký mới nhà cung ứng nguyên phụ liệu
  createSupplier: async (payload) => {
    const res = await apiClient.post('/supplier-contracts/suppliers', payload);
    return res.data;
  },

  // [UC-037] Update Suppliers - Cập nhật thông tin nhà cung ứng
  updateSupplier: async (supplierId, payload) => {
    const res = await apiClient.put(`/supplier-contracts/suppliers/${supplierId}`, payload);
    return res.data;
  },

  // [UC-027] Danh mục nguyên phụ liệu dùng khi soạn hợp đồng & Tạo nhanh nguyên phụ liệu mới
  getMaterialsCatalog: async (params = {}) => {
    const res = await apiClient.get('/supplier-contracts/materials-catalog', { params });
    return res.data.data || [];
  },

  // [UC-027] Create Material - Thêm mới nguyên phụ liệu (Kế toán kho)
  createRawMaterial: async (payload) => {
    const res = await apiClient.post('/supplier-contracts/materials-catalog', payload);
    return res.data;
  },

  // [UC-038, UC-039] Quản lý khung hợp đồng cung ứng (Xem danh sách, Soạn mới, Cập nhật/Tạo phiên bản)
  getContracts: async (params = {}) => {
    const res = await apiClient.get('/supplier-contracts/contracts', { params });
    return res.data.data || [];
  },

  getContractDetail: async (contractId) => {
    const res = await apiClient.get(`/supplier-contracts/contracts/${contractId}`);
    return res.data.data;
  },

  // [UC-038] Create Contract - Lưu mới khung hợp đồng và tự động khởi tạo kế hoạch nhập v1
  draftContract: async (payload) => {
    const res = await apiClient.post('/supplier-contracts/contracts', payload);
    return res.data;
  },

  // [UC-039] Update Contract - Cập nhật bản thảo khung hợp đồng (DRAFT_FRAMEWORK)
  updateContract: async (contractId, payload) => {
    const res = await apiClient.put(`/supplier-contracts/contracts/${contractId}`, payload);
    return res.data;
  },

  // [UC-039] Update Contract - Tạo phiên bản phụ lục mới (v2, v3...) cho hợp đồng đang ACTIVE
  amendContract: async (contractId, payload) => {
    const res = await apiClient.post(`/supplier-contracts/contracts/${contractId}/amend`, payload);
    return res.data;
  },

  getContractVersions: async (contractId) => {
    const res = await apiClient.get(`/supplier-contracts/contracts/${contractId}/versions`);
    return res.data.data || [];
  },

  // [UC-039] Update Contract - Chuyển trạng thái hợp đồng (Kích hoạt / Hủy)
  updateContractStatus: async (contractId, payload) => {
    const res = await apiClient.patch(`/supplier-contracts/contracts/${contractId}/status`, payload);
    return res.data;
  },

  // [UC-039] Update Contract - Chấm dứt hiệu lực hợp đồng trước hạn
  terminateContract: async (contractId, payload) => {
    const res = await apiClient.post(`/supplier-contracts/contracts/${contractId}/terminate`, payload);
    return res.data;
  },

  // [UC-040, UC-044] Lập và xem kế hoạch lịch trình tiếp nhận nguyên vật liệu
  getInboundPlans: async (params = {}) => {
    const res = await apiClient.get('/supplier-contracts/inbound-plans', { params });
    return res.data.data || [];
  },

  // [UC-044] View Material Inbound Plan - Xem chi tiết kế hoạch tiếp nhận theo phiên bản & từng đợt giao
  getInboundPlanDetail: async (planId) => {
    const res = await apiClient.get(`/supplier-contracts/inbound-plans/${planId}`);
    return res.data.data;
  },

  getContractInboundSummary: async (contractId) => {
    const res = await apiClient.get(`/supplier-contracts/inbound-plans/contract-summary/${contractId}`);
    return res.data.data;
  },

  // [UC-040] Schedule Material Inbound Plan - Tạo kế hoạch tiếp nhận nguyên liệu
  createInboundPlan: async (payload) => {
    const res = await apiClient.post('/supplier-contracts/inbound-plans', payload);
    return res.data;
  },

  // [UC-040] Schedule Material Inbound Plan - Tạo phiên bản mới (v2, v3...) điều chỉnh lịch giao nhiều đợt
  amendInboundPlan: async (planId, payload) => {
    const res = await apiClient.post(`/supplier-contracts/inbound-plans/${planId}/amend`, payload);
    return res.data;
  },

  // [UC-044] View Material Inbound Plan - Xem lịch sử phiên bản kế hoạch tiếp nhận
  getInboundPlanVersions: async (planId) => {
    const res = await apiClient.get(`/supplier-contracts/inbound-plans/${planId}/versions`);
    return res.data.data || [];
  },

  // [UC-040] Schedule Material Inbound Plan - Cập nhật trạng thái kế hoạch tiếp nhận
  updateInboundPlanStatus: async (planId, payload) => {
    const res = await apiClient.patch(`/supplier-contracts/inbound-plans/${planId}`, payload);
    return res.data;
  },

  // [UC-046] Đối chiếu/ghi nhận kiểm định KCS giao nhận kế hoạch
  verifyInboundPlanDelivery: async (planId, payload) => {
    const res = await apiClient.post(`/supplier-contracts/inbound-plans/${planId}/verify`, payload);
    return res.data;
  },

  // [UC-041] Report Contract Deviation - Trình báo biên bản sai lệch KCS lên Chủ sở hữu (Owner)
  reportDeviationToOwner: async (planId, payload = {}) => {
    const res = await apiClient.post(`/supplier-contracts/inbound-plans/${planId}/report-to-owner`, payload);
    return res.data;
  },

  // [UC-041] Report Contract Deviation - Xem danh sách & xử lý sai lệch hợp đồng
  getContractDeviations: async (params = {}) => {
    const res = await apiClient.get('/supplier-contracts/deviations', { params });
    return res.data.data || [];
  },

  // [UC-041] Report Contract Deviation - Xác nhận phương án xử lý sai lệch hợp đồng
  resolveContractDeviation: async (planId, payload) => {
    const res = await apiClient.post(`/supplier-contracts/deviations/${planId}/resolve`, payload);
    return res.data;
  },

  // [UC-112, UC-113] Quản lý Lịch sử Dòng tiền & Lập Phiếu Thu/Chi (Cash Flow Voucher)
  getExpenseCategories: async () => {
    const res = await apiClient.get('/payment-vouchers/categories');
    return res.data.data || [];
  },

  // [UC-112] View Cash Flow History - Lấy danh sách & lọc lịch sử giao dịch phiếu thu/chi
  getPaymentVouchers: async (params = {}) => {
    const res = await apiClient.get('/payment-vouchers', { params });
    return res.data.data || [];
  },

  // [UC-112] View Cash Flow History - Xem chi tiết chứng từ thu/chi
  getPaymentVoucherDetail: async (voucherId) => {
    const res = await apiClient.get(`/payment-vouchers/${voucherId}`);
    return res.data.data;
  },

  // [UC-113] Create Cash Flow Voucher - Lập mới phiếu thu (CASH_IN) / phiếu chi (CASH_OUT)
  createPaymentVoucher: async (payload) => {
    const res = await apiClient.post('/payment-vouchers', payload);
    return res.data;
  },

  // [UC-113] Create Cash Flow Voucher - Chỉnh sửa phiếu thu/chi đang ở trạng thái nháp (DRAFT)
  updatePaymentVoucher: async (voucherId, payload) => {
    const res = await apiClient.put(`/payment-vouchers/${voucherId}`, payload);
    return res.data;
  },

  // [UC-113] Create Cash Flow Voucher - Xác nhận duyệt phiếu chi (DRAFT -> CONFIRMED)
  confirmPaymentVoucher: async (voucherId) => {
    const res = await apiClient.patch(`/payment-vouchers/${voucherId}/confirm`);
    return res.data;
  },

  // [UC-113] Create Cash Flow Voucher - Xác nhận chi tiền thực tế (CONFIRMED -> PAID, trừ công nợ NCC)
  executePaymentVoucher: async (voucherId, payload = {}) => {
    const res = await apiClient.post(`/payment-vouchers/${voucherId}/execute-payment`, payload);
    return res.data;
  },

  // [UC-113] Create Cash Flow Voucher - Hủy phiếu chi chưa thanh toán
  cancelPaymentVoucher: async (voucherId, payload = {}) => {
    const res = await apiClient.patch(`/payment-vouchers/${voucherId}/cancel`, payload);
    return res.data;
  },

  // [UC-115, UC-118, UC-119] Đối soát COD tự động qua API GHN & Quản lý tranh chấp hãng vận chuyển
  getCodOrders: async (params = {}) => {
    const res = await apiClient.get('/financial/cod-reconciliation/orders', { params });
    return res.data.data;
  },

  // [UC-115] Execute Carrier COD Reconciliation - Thực thi đối soát COD tự động với GHN
  syncGhnCod: async (payload = {}) => {
    const res = await apiClient.post('/financial/cod-reconciliation/sync-ghn', payload);
    return res.data;
  },

  // [UC-119] View Shipping Carrier Dispute - Lấy danh sách cờ đỏ & khiếu nại sai lệch COD
  getCodRedFlags: async () => {
    const res = await apiClient.get('/financial/cod-reconciliation/red-flags');
    return res.data.data || [];
  },

  // [UC-118] Create Shipping Carrier Dispute - Lập khiếu nại/tranh chấp đơn lệch COD với hãng vận chuyển
  resolveCodDispute: async (itemId, payload) => {
    const res = await apiClient.post(`/financial/cod-reconciliation/disputes/${itemId}`, payload);
    return res.data;
  },

  // [UC-118, UC-119] Mô phỏng phản hồi kết quả điều tra khiếu nại từ GHN (Sandbox)
  simulateGhnDisputeFeedback: async (itemId, payload = {}) => {
    const res = await apiClient.post(`/financial/cod-reconciliation/disputes/${itemId}/simulate-feedback`, payload);
    return res.data;
  },

  // [UC-115] Khởi tạo dữ liệu đơn hàng mẫu phục vụ kiểm thử đối soát COD
  seedSampleCodOrders: async () => {
    const res = await apiClient.post('/financial/cod-reconciliation/seed-sample');
    return res.data;
  },

  // [UC-114] View Debt - Theo dõi công nợ Nhà cung cấp & Đối tác vận chuyển GHN
  getSupplierDebtOverview: async () => {
    const res = await apiClient.get('/financial/debts/suppliers');
    return res.data.data;
  },

  // [UC-114] View Debt - Xem sổ chi tiết công nợ của từng nhà cung cấp
  getSupplierDebtLedger: async (supplierId) => {
    const res = await apiClient.get(`/financial/debts/suppliers/${supplierId}/ledger`);
    return res.data.data;
  },

  // [UC-114] View Debt - Xem tổng quan công nợ COD phải thu & cước vận chuyển GHN
  getCarrierDebtOverview: async () => {
    const res = await apiClient.get('/financial/debts/carrier');
    return res.data.data;
  },

  // [UC-114] Cập nhật cấu hình mức cước phí thỏa thuận GHN phục vụ bù trừ công nợ
  updateCarrierConfig: async (payload) => {
    const res = await apiClient.patch('/financial/debts/carrier/config', payload);
    return res.data;
  },

  // [UC-113, UC-114] Lập phiếu thu tất toán tiền COD đã nhận từ GHN
  settleCarrierCodPayment: async (payload) => {
    const res = await apiClient.post('/financial/debts/carrier/settle-cod', payload);
    return res.data;
  },

  // [UC-113, UC-114] Lập phiếu chi tất toán tiền cước vận chuyển cho GHN
  settleCarrierShippingFeePayment: async (payload) => {
    const res = await apiClient.post('/financial/debts/carrier/settle-shipping-fee', payload);
    return res.data;
  },

  // [UC-109] View Total Inventory Valuation - Xem tổng giá trị định giá tồn kho thành phẩm
  getProductValuationSummary: async () => {
    const res = await apiClient.get('/financial/inventory-valuation/summary');
    return res.data.data;
  },

  // [UC-109] View Total Inventory Valuation - Danh sách chi tiết định giá tồn kho theo từng SKU
  getProductValuationList: async (params = {}) => {
    const res = await apiClient.get('/financial/inventory-valuation/products', { params });
    return {
      items: res.data.data || [],
      pagination: res.data.pagination || {},
    };
  },

  // [UC-109] View Total Inventory Valuation - Lấy danh mục sản phẩm để lọc báo cáo định giá
  getProductValuationCategories: async () => {
    const res = await apiClient.get('/financial/inventory-valuation/categories');
    return res.data.data || [];
  },

  // [UC-110] View Total Raw Material Inventory Value - Xem tổng giá trị định giá tồn kho nguyên vật liệu
  getRawMaterialValuationSummary: async () => {
    const res = await apiClient.get('/financial/raw-material-valuation/summary');
    return res.data.data;
  },

  // [UC-110] View Total Raw Material Inventory Value - Danh sách chi tiết định giá từng nguyên phụ liệu
  getRawMaterialValuationList: async (params = {}) => {
    const res = await apiClient.get('/financial/raw-material-valuation/materials', { params });
    return {
      items: res.data.data || [],
      pagination: res.data.pagination || {},
    };
  },

  // [UC-110] View Total Raw Material Inventory Value - Lấy metadata bộ lọc định giá nguyên vật liệu
  getRawMaterialValuationMetadata: async () => {
    const res = await apiClient.get('/financial/raw-material-valuation/metadata');
    return res.data.data || {};
  },

  // [UC-009, UC-111] View Dashboard & Report Cash Flow - Lấy tổng quan Dashboard Kế toán & biểu đồ dòng tiền theo kỳ
  getDashboardSummary: async (params = {}) => {
    const res = await apiClient.get('/financial/dashboard/summary', { params });
    return res.data.data;
  },
};

export default accountantProcurementApi;

