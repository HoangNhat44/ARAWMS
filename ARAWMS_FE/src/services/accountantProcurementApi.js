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
  // UC: Quản lý nhà cung ứng nguyên vật liệu
  getSuppliers: async (params = {}) => {
    const res = await apiClient.get('/supplier-contracts/suppliers', { params });
    return res.data.data || [];
  },

  createSupplier: async (payload) => {
    const res = await apiClient.post('/supplier-contracts/suppliers', payload);
    return res.data;
  },

  updateSupplier: async (supplierId, payload) => {
    const res = await apiClient.put(`/supplier-contracts/suppliers/${supplierId}`, payload);
    return res.data;
  },

  // Materials Catalog for Contract Drafting (optional filter by supplierId)
  getMaterialsCatalog: async (params = {}) => {
    const res = await apiClient.get('/supplier-contracts/materials-catalog', { params });
    return res.data.data || [];
  },

  createRawMaterial: async (payload) => {
    const res = await apiClient.post('/supplier-contracts/materials-catalog', payload);
    return res.data;
  },

  // UC: Soạn thảo khung hợp đồng với nhà cung cấp
  getContracts: async (params = {}) => {
    const res = await apiClient.get('/supplier-contracts/contracts', { params });
    return res.data.data || [];
  },

  getContractDetail: async (contractId) => {
    const res = await apiClient.get(`/supplier-contracts/contracts/${contractId}`);
    return res.data.data;
  },

  draftContract: async (payload) => {
    const res = await apiClient.post('/supplier-contracts/contracts', payload);
    return res.data;
  },

  updateContract: async (contractId, payload) => {
    const res = await apiClient.put(`/supplier-contracts/contracts/${contractId}`, payload);
    return res.data;
  },

  amendContract: async (contractId, payload) => {
    const res = await apiClient.post(`/supplier-contracts/contracts/${contractId}/amend`, payload);
    return res.data;
  },

  getContractVersions: async (contractId) => {
    const res = await apiClient.get(`/supplier-contracts/contracts/${contractId}/versions`);
    return res.data.data || [];
  },

  updateContractStatus: async (contractId, payload) => {
    const res = await apiClient.patch(`/supplier-contracts/contracts/${contractId}/status`, payload);
    return res.data;
  },

  terminateContract: async (contractId, payload) => {
    const res = await apiClient.post(`/supplier-contracts/contracts/${contractId}/terminate`, payload);
    return res.data;
  },

  // UC: Lập kế hoạch lịch trình tiếp nhận nguyên vật liệu
  getInboundPlans: async (params = {}) => {
    const res = await apiClient.get('/supplier-contracts/inbound-plans', { params });
    return res.data.data || [];
  },

  getInboundPlanDetail: async (planId) => {
    const res = await apiClient.get(`/supplier-contracts/inbound-plans/${planId}`);
    return res.data.data;
  },

  getContractInboundSummary: async (contractId) => {
    const res = await apiClient.get(`/supplier-contracts/inbound-plans/contract-summary/${contractId}`);
    return res.data.data;
  },

  createInboundPlan: async (payload) => {
    const res = await apiClient.post('/supplier-contracts/inbound-plans', payload);
    return res.data;
  },

  amendInboundPlan: async (planId, payload) => {
    const res = await apiClient.post(`/supplier-contracts/inbound-plans/${planId}/amend`, payload);
    return res.data;
  },

  getInboundPlanVersions: async (planId) => {
    const res = await apiClient.get(`/supplier-contracts/inbound-plans/${planId}/versions`);
    return res.data.data || [];
  },

  updateInboundPlanStatus: async (planId, payload) => {
    const res = await apiClient.patch(`/supplier-contracts/inbound-plans/${planId}`, payload);
    return res.data;
  },

  // KCS: Kỹ thuật viên may kiểm tra và ghi nhận giao nhận đúng/sai kế hoạch
  verifyInboundPlanDelivery: async (planId, payload) => {
    const res = await apiClient.post(`/supplier-contracts/inbound-plans/${planId}/verify`, payload);
    return res.data;
  },

  // UC 06: Execute Contract Deviation Resolution (Xử lý sai lệch hợp đồng)
  getContractDeviations: async (params = {}) => {
    const res = await apiClient.get('/supplier-contracts/deviations', { params });
    return res.data.data || [];
  },

  resolveContractDeviation: async (planId, payload) => {
    const res = await apiClient.post(`/supplier-contracts/deviations/${planId}/resolve`, payload);
    return res.data;
  },

  // UC: Quản lý Phiếu chi tiền (Payment Vouchers - UC 08 / UC 15)
  getExpenseCategories: async () => {
    const res = await apiClient.get('/payment-vouchers/categories');
    return res.data.data || [];
  },

  getPaymentVouchers: async (params = {}) => {
    const res = await apiClient.get('/payment-vouchers', { params });
    return res.data.data || [];
  },

  getPaymentVoucherDetail: async (voucherId) => {
    const res = await apiClient.get(`/payment-vouchers/${voucherId}`);
    return res.data.data;
  },

  createPaymentVoucher: async (payload) => {
    const res = await apiClient.post('/payment-vouchers', payload);
    return res.data;
  },

  updatePaymentVoucher: async (voucherId, payload) => {
    const res = await apiClient.put(`/payment-vouchers/${voucherId}`, payload);
    return res.data;
  },

  confirmPaymentVoucher: async (voucherId) => {
    const res = await apiClient.patch(`/payment-vouchers/${voucherId}/confirm`);
    return res.data;
  },

  executePaymentVoucher: async (voucherId, payload = {}) => {
    const res = await apiClient.post(`/payment-vouchers/${voucherId}/execute-payment`, payload);
    return res.data;
  },

  cancelPaymentVoucher: async (voucherId, payload = {}) => {
    const res = await apiClient.patch(`/payment-vouchers/${voucherId}/cancel`, payload);
    return res.data;
  },

  // UC 16–17: Đối soát COD Tự động qua API Giao Hàng Nhanh
  getCodOrders: async (params = {}) => {
    const res = await apiClient.get('/financial/cod-reconciliation/orders', { params });
    return res.data.data;
  },

  syncGhnCod: async (payload = {}) => {
    const res = await apiClient.post('/financial/cod-reconciliation/sync-ghn', payload);
    return res.data;
  },

  getCodRedFlags: async () => {
    const res = await apiClient.get('/financial/cod-reconciliation/red-flags');
    return res.data.data || [];
  },

  resolveCodDispute: async (itemId, payload) => {
    const res = await apiClient.post(`/financial/cod-reconciliation/disputes/${itemId}`, payload);
    return res.data;
  },

  simulateGhnDisputeFeedback: async (itemId, payload = {}) => {
    const res = await apiClient.post(`/financial/cod-reconciliation/disputes/${itemId}/simulate-feedback`, payload);
    return res.data;
  },

  seedSampleCodOrders: async () => {
    const res = await apiClient.post('/financial/cod-reconciliation/seed-sample');
    return res.data;
  },

  // UC 07: Quản lý Công nợ Nhà cung cấp & Đối tác Vận chuyển GHN
  getSupplierDebtOverview: async () => {
    const res = await apiClient.get('/financial/debts/suppliers');
    return res.data.data;
  },

  getSupplierDebtLedger: async (supplierId) => {
    const res = await apiClient.get(`/financial/debts/suppliers/${supplierId}/ledger`);
    return res.data.data;
  },

  getCarrierDebtOverview: async () => {
    const res = await apiClient.get('/financial/debts/carrier');
    return res.data.data;
  },

  updateCarrierConfig: async (payload) => {
    const res = await apiClient.patch('/financial/debts/carrier/config', payload);
    return res.data;
  },

  settleCarrierCodPayment: async (payload) => {
    const res = await apiClient.post('/financial/debts/carrier/settle-cod', payload);
    return res.data;
  },

  settleCarrierShippingFeePayment: async (payload) => {
    const res = await apiClient.post('/financial/debts/carrier/settle-shipping-fee', payload);
    return res.data;
  },

  // UC 10: Xem tổng giá trị định giá tài sản tồn kho thành phẩm (Product Inventory Valuation)
  getProductValuationSummary: async () => {
    const res = await apiClient.get('/financial/inventory-valuation/summary');
    return res.data.data;
  },

  getProductValuationList: async (params = {}) => {
    const res = await apiClient.get('/financial/inventory-valuation/products', { params });
    return {
      items: res.data.data || [],
      pagination: res.data.pagination || {},
    };
  },

  getProductValuationCategories: async () => {
    const res = await apiClient.get('/financial/inventory-valuation/categories');
    return res.data.data || [];
  },

  // UC 11: Xem tổng giá trị định giá tồn kho nguyên vật liệu (Raw Material Inventory Valuation)
  getRawMaterialValuationSummary: async () => {
    const res = await apiClient.get('/financial/raw-material-valuation/summary');
    return res.data.data;
  },

  getRawMaterialValuationList: async (params = {}) => {
    const res = await apiClient.get('/financial/raw-material-valuation/materials', { params });
    return {
      items: res.data.data || [],
      pagination: res.data.pagination || {},
    };
  },

  getRawMaterialValuationMetadata: async () => {
    const res = await apiClient.get('/financial/raw-material-valuation/metadata');
    return res.data.data || {};
  },
};

export default accountantProcurementApi;

