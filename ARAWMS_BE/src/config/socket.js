/**
 * ============================================================================
 * @title        : Socket.io Server Configuration & Event Emitters
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-28
 * @description  : Quản lý kết nối WebSocket hai chiều cho luồng Chat Realtime,
 *                 phân phối phòng làm việc (Rooms) cho Seller Workspace và từng hội thoại.
 * @module       : Conversational Commerce / WebSocket Realtime
 * @layer        : Backend Service / Gateway
 * ============================================================================
 */

import { Server } from 'socket.io';

let io = null;

/**
 * Khởi tạo Socket.io instance gắn với HTTP Server của Express
 *
 * @param {import('http').Server} httpServer - Server HTTP Node.js
 * @returns {Server} Socket.io instance
 */
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || '*',
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    // 1. Tham gia phòng chung Seller Workspace để nhận thông báo danh sách hội thoại
    socket.on('join_seller_workspace', () => {
      socket.join('seller_workspace');
    });

    // 1b. Tham gia phòng chung Warehouse Workspace để nhận thông báo Đổi/Trả RMA và duyệt đơn
    socket.on('join_warehouse_workspace', () => {
      socket.join('warehouse_workspace');
    });

    // 2. Tham gia phòng riêng của cuộc hội thoại để stream tin nhắn
    socket.on('join_conversation', (conversationId) => {
      if (conversationId) {
        socket.join(`conversation:${conversationId}`);
      }
    });

    // 3. Rời phòng hội thoại khi chuyển tab khác
    socket.on('leave_conversation', (conversationId) => {
      if (conversationId) {
        socket.leave(`conversation:${conversationId}`);
      }
    });

    socket.on('disconnect', (reason) => {
      // socket disconnected
    });
  });

  console.log('⚡ [Socket.io] WebSocket Gateway đã sẵn sàng');
  return io;
};

/**
 * Lấy instance của Socket.io
 */
export const getIO = () => {
  if (!io) {
    console.warn('⚠️ [Socket.io] Chưa khởi tạo Socket.io instance');
  }
  return io;
};

/**
 * Phát sự kiện tin nhắn mới (Tin nhắn từ khách Facebook hoặc phản hồi từ Seller)
 *
 * @param {string} conversationId - ID cuộc trò chuyện
 * @param {Object} message - Dữ liệu tin nhắn ChatMessage vừa tạo
 */
export const emitNewMessage = (conversationId, message) => {
  if (!io) return;
  // Bắn tới tất cả clients đang mở đúng cuộc hội thoại này
  io.to(`conversation:${conversationId}`).emit('new_message', message);
};

/**
 * Phát sự kiện cập nhật hội thoại (Tin nhắn cuối, thời gian, số chưa đọc, tags)
 *
 * @param {Object} conversation - Dữ liệu cuộc trò chuyện ChatConversation
 */
export const emitConversationUpdated = (conversation) => {
  if (!io) return;
  // Bắn tới phòng tổng của Seller Workspace để cập nhật danh sách
  io.to('seller_workspace').emit('conversation_updated', conversation);
};

/**
 * Phát sự kiện đánh dấu đã đọc (Xóa badge đỏ của hội thoại trên mọi màn hình)
 *
 * @param {string} conversationId - ID cuộc trò chuyện vừa đọc
 */
export const emitConversationRead = (conversationId) => {
  if (!io) return;
  io.to('seller_workspace').emit('conversation_read', { conversationId });
  io.to(`conversation:${conversationId}`).emit('conversation_read', { conversationId });
};

/**
 * Phát sự kiện thông báo Đổi / Trả hàng (RMA) mới tới Warehouse và Seller
 */
export const emitRmaAlert = (rmaData) => {
  if (!io) return;
  io.emit('new_rma_alert', rmaData);
};

/**
 * Phát sự kiện thông báo có đơn hàng mới từ sàn TMĐT (Shopee/TikTok) hoặc Excel
 */
export const emitMarketplaceOrdersImported = (data) => {
  if (!io) return;
  io.emit('marketplace_orders_imported', data);
};

export default {
  initSocket,
  getIO,
  emitNewMessage,
  emitConversationUpdated,
  emitConversationRead,
  emitRmaAlert,
  emitMarketplaceOrdersImported,
};
