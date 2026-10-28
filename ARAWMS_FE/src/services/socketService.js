/**
 * ============================================================================
 * @title        : Socket.io Client Service
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-28
 * @description  : Singleton quản lý kết nối WebSocket cho giao diện Seller,
 *                 tự động kết nối lại khi mất mạng và cung cấp kênh giao tiếp thời gian thực.
 * @module       : Conversational Commerce / WebSocket Realtime Client
 * @layer        : Front-end Service
 * ============================================================================
 */

import { io } from 'socket.io-client';
import { API_BASE_URL } from '../utils/constants';

let socket = null;

/**
 * Lấy hoặc khởi tạo instance Socket.io kết nối tới máy chủ Backend
 * @returns {import('socket.io-client').Socket}
 */
export const getSocket = () => {
  if (!socket) {
    let serverUrl = window.location.origin;
    if (API_BASE_URL && API_BASE_URL.startsWith('http')) {
      serverUrl = API_BASE_URL.replace(/\/api\/?$/, '');
    }

    socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1500,
    });

    socket.on('connect', () => {
      console.log('⚡ [Socket.io Client] Đã kết nối WebSocket tới Server:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 [Socket.io Client] Ngắt kết nối:', reason);
    });

    socket.on('connect_error', (err) => {
      console.warn('⚠️ [Socket.io Client] Lỗi kết nối WebSocket:', err.message);
    });
  }

  return socket;
};

/**
 * Ngắt kết nối socket khi người dùng đăng xuất
 */
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export default {
  getSocket,
  disconnectSocket,
};
