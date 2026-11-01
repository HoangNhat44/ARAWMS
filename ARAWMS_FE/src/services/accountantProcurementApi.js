import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const accountantProcurementApi = {
  // UC 01 - 03: Manage Material Suppliers (View, Add, Update)
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

  // Materials Catalog for Contract Drafting
  getMaterialsCatalog: async () => {
    const res = await apiClient.get('/supplier-contracts/materials-catalog');
    return res.data.data || [];
  },

  // UC 04: Draft Supplier Contract Framework
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

  updateContractStatus: async (contractId, payload) => {
    const res = await apiClient.patch(`/supplier-contracts/contracts/${contractId}/status`, payload);
    return res.data;
  },

  // UC 05: Schedule Material Inbound Plan
  getInboundPlans: async (params = {}) => {
    const res = await apiClient.get('/supplier-contracts/inbound-plans', { params });
    return res.data.data || [];
  },

  createInboundPlan: async (payload) => {
    const res = await apiClient.post('/supplier-contracts/inbound-plans', payload);
    return res.data;
  },

  updateInboundPlanStatus: async (planId, payload) => {
    const res = await apiClient.patch(`/supplier-contracts/inbound-plans/${planId}`, payload);
    return res.data;
  },
};

export default accountantProcurementApi;

