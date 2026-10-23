// Compatibility export for existing pages; new auth code lives in its feature module.
import api from './api';
import { authService as authentication } from '../modules/system-administration/authentication/services/authService';
export const authService = { ...authentication, checkHealth: () => api.get('/health') };
