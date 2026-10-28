/*
 * File: productService.js
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Calls catalog, Excel import, SKU, stock, and product media APIs.
 */
import api from './api';

export const productService = {
  list: () => api.get('/products'),
  moveStock: (id, values) => api.post(`/products/${id}/stock`, values),
  bulkMoveStock: (values) => api.post('/products/bulk/documents', values),
  recentDocuments: () => api.get('/products/bulk/documents'),
  pendingReceipts: () => api.get('/products/bulk/documents/pending-allocation'),
  receiptDetail: (id) => api.get(`/products/bulk/documents/${id}`),
  binOptions: (skuIds) => api.get('/products/bulk/bin-options', { params: { skuIds: skuIds.join(',') } }),
  allocateReceipt: (id, values) => api.post(`/products/bulk/documents/${id}/allocations`, values),
  documentBarcodes: (id) => api.get(`/products/bulk/documents/${id}/barcodes`),
  syncDocumentBarcodes: (id) => api.post(`/products/bulk/documents/${id}/barcodes/sync`),
  locations: () => api.get('/products/locations'),
  createLocation: (values) => api.post('/products/locations', values),
  // Group product setup calls used by the configuration form.
  configure: (values) => api.post('/products/configuration/new', values),
  previewImport: (file) => api.post('/products/configuration/import/preview', file, {
    headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, timeout: 180000,
  }),
  importExcel: (file) => api.post('/products/configuration/import', file, {
    headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, timeout: 180000,
  }),
  getConfiguration: (id) => api.get(`/products/configuration/${id}`),
  updateConfiguration: (id, values) => api.patch(`/products/configuration/${id}`, values),
  addVariants: (id, variants) => api.post(`/products/configuration/${id}/variants`, { variants }),
  updateSkuPrice: (id, skuId, retailPrice) => api.patch(`/products/configuration/${id}/variants/${skuId}`, { retailPrice }),
  create: (values) => api.post('/products', values),
  // Preserve the file media type for backend validation and Cloudinary upload.
  upload: (id, kind, file) => api.put(`/products/${id}/${kind}`, file, {
    headers: { 'Content-Type': file.type },
    timeout: 180000,
  }),
  uploadAdditionalImage: (id, file) => api.post(`/products/${id}/additional-image`, file, {
    headers: { 'Content-Type': file.type }, timeout: 180000,
  }),
};
