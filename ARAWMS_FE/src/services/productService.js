import api from './api';

export const productService = {
  list: () => api.get('/products'),
  moveStock: (id, values) => api.post(`/products/${id}/stock`, values),
  bulkMoveStock: (values) => api.post('/products/bulk/documents', values),
  recentDocuments: () => api.get('/products/bulk/documents'),
  locations: () => api.get('/products/locations'),
  createLocation: (values) => api.post('/products/locations', values),
  configure: (values) => api.post('/products/configuration/new', values),
  getConfiguration: (id) => api.get(`/products/configuration/${id}`),
  updateConfiguration: (id, values) => api.patch(`/products/configuration/${id}`, values),
  addVariants: (id, variants) => api.post(`/products/configuration/${id}/variants`, { variants }),
  updateSkuPrice: (id, skuId, retailPrice) => api.patch(`/products/configuration/${id}/variants/${skuId}`, { retailPrice }),
  create: (values) => api.post('/products', values),
  upload: (id, kind, file) => api.put(`/products/${id}/${kind}`, file, {
    headers: { 'Content-Type': file.type },
    timeout: 180000,
  }),
  uploadAdditionalImage: (id, file) => api.post(`/products/${id}/additional-image`, file, {
    headers: { 'Content-Type': file.type }, timeout: 180000,
  }),
};
