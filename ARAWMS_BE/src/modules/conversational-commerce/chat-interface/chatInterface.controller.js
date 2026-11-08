/**
 * ============================================================================
 * @title        : Chat Interface Controller
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Tiếp nhận các yêu cầu tương tác chat đa kênh của Seller:
 *                 xem hội thoại (UC-72), gắn tag phân loại (UC-73) và gửi tin nhắn (UC-74).
 * @module       : Conversational Commerce / Chat Interface
 * @layer        : Controller
 * ============================================================================
 */

import fs from 'fs';
import chatInterfaceService from './chatInterface.service.js';
import tagManagementService, { seedDefaultTags } from './tagManagement.service.js';
import { successResponse, errorResponse } from '../../../common/utils/apiResponse.js';

// Seed thẻ mặc định khi module này lần đầu được khởi tạo
seedDefaultTags().catch((e) => console.error('Tag seed error:', e.message));

/**
 * UC-72: Lấy danh sách hội thoại
 * GET /api/conversations/chat-interface
 */
export const getConversations = async (req, res) => {
  try {
    const result = await chatInterfaceService.getConversations(req.query, req.user);
    return successResponse(res, result, 'Lấy danh sách hội thoại thành công');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

/**
 * UC-72: Lấy chi tiết một cuộc hội thoại
 * GET /api/conversations/chat-interface/:id
 */
export const getConversationById = async (req, res) => {
  try {
    const conversation = await chatInterfaceService.getConversationById(req.params.id, req.user);
    return successResponse(res, conversation, 'Lấy chi tiết hội thoại thành công');
  } catch (error) {
    return errorResponse(res, error.message, 404);
  }
};

/**
 * UC-72: Lấy lịch sử tin nhắn
 * GET /api/conversations/chat-interface/:id/messages
 */
export const getConversationMessages = async (req, res) => {
  try {
    const result = await chatInterfaceService.getConversationMessages(req.params.id, req.query);
    return successResponse(res, result, 'Lấy lịch sử tin nhắn thành công');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

/**
 * UC-74: Gửi tin nhắn phản hồi cho khách hàng
 * POST /api/conversations/chat-interface/:id/messages
 */
export const sendCustomerMessage = async (req, res) => {
  try {
    const message = await chatInterfaceService.sendCustomerMessage(req.params.id, req.body, req.user, req);
    return successResponse(res, message, 'Gửi tin nhắn thành công', 201);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

/**
 * Gửi ảnh / tệp đính kèm cho khách hàng (multipart/form-data, trường `files`).
 *
 * @async
 * @function sendCustomerAttachments
 * @route {POST} /api/conversations/:id/attachments
 * @param {Object} req - Express Request chứa req.files (Multer) và req.body.messageText (tuỳ chọn).
 * @param {Object} res - Express Response object.
 * @returns {Promise<Response>} 201 - ChatMessage chứa danh sách attachments.
 * @businessRule GBR-23 Ghi vết kiểm toán thao tác gửi tệp.
 */
export const sendCustomerAttachments = async (req, res) => {
  try {
    const message = await chatInterfaceService.sendCustomerAttachments(
      req.params.id, req.files || [], req.body?.messageText, req.user, req
    );
    return successResponse(res, message, 'Gửi tệp đính kèm thành công', 201);
  } catch (error) {
    // Dọn tệp đã tải lên nếu nghiệp vụ thất bại để tránh rác trên ổ đĩa
    (req.files || []).forEach((f) => fs.promises.unlink(f.path).catch(() => {}));
    return errorResponse(res, error.message, 400);
  }
};

/**
 * UC-73: Gắn thẻ hội thoại
 * POST /api/conversations/chat-interface/:id/tags
 */
export const addConversationTag = async (req, res) => {
  try {
    const { tags, tag } = req.body;
    const targetTags = tags || tag;
    if (!targetTags) {
      return errorResponse(res, 'Vui lòng cung cấp tag hoặc danh sách tags', 400);
    }
    const updated = await chatInterfaceService.addConversationTag(req.params.id, targetTags, req.user, req);
    return successResponse(res, updated, 'Gắn thẻ hội thoại thành công');
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

/**
 * UC-73: Gỡ thẻ hội thoại
 * DELETE /api/conversations/chat-interface/:id/tags/:tag
 */
export const removeConversationTag = async (req, res) => {
  try {
    const updated = await chatInterfaceService.removeConversationTag(req.params.id, req.params.tag, req.user, req);
    return successResponse(res, updated, 'Gỡ thẻ hội thoại thành công');
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

export default {
  getConversations,
  getConversationById,
  getConversationMessages,
  sendCustomerMessage,
  sendCustomerAttachments,
  addConversationTag,
  removeConversationTag,
};

/**
 * Lấy danh sách toàn bộ thẻ tag (mặc định và tuỳ chỉnh của Seller).
 *
 * @async
 * @function getTagList
 * @route {GET} /api/conversations/tags/list
 * @param {Object} req - Express Request object.
 * @param {Object} res - Express Response object.
 * @returns {Promise<Response>} 200 - Trả về mảng danh sách thẻ tag.
 */
export const getTagList = async (req, res) => {
  try {
    const tags = await tagManagementService.getAllTags();
    return successResponse(res, tags, 'Lấy danh sách thẻ thành công');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Tạo mới một thẻ tag tuỳ chỉnh cho Seller.
 *
 * @async
 * @function createCustomTag
 * @route {POST} /api/conversations/tags/create
 * @param {Object} req - Express Request chứa { name, color, textColor } trong req.body.
 * @param {Object} res - Express Response object.
 * @returns {Promise<Response>} 201 - Trả về thông tin thẻ tag vừa tạo.
 * @businessRule GBR-23 Ghi nhận tác giả và nhật ký quản lý thẻ phân loại hội thoại.
 */
export const createCustomTag = async (req, res) => {
  try {
    const tag = await tagManagementService.createTag(req.body, req.user);
    return successResponse(res, tag, 'Tạo thẻ mới thành công', 201);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

/**
 * Xóa một thẻ tag tuỳ chỉnh khỏi hệ thống.
 *
 * @async
 * @function deleteCustomTag
 * @route {DELETE} /api/conversations/tags/:tagId
 * @param {Object} req - Express Request chứa tagId trong req.params.
 * @param {Object} res - Express Response object.
 * @returns {Promise<Response>} 200 - Trạng thái xoá thành công.
 * @businessRule GBR-23 Ghi vết kiểm toán thao tác thu hồi/xóa cấu hình thẻ.
 */
export const deleteCustomTag = async (req, res) => {
  try {
    const result = await tagManagementService.deleteTag(req.params.tagId);
    return successResponse(res, result, 'Xóa thẻ thành công');
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

/**
 * Đánh dấu toàn bộ tin nhắn trong cuộc trò chuyện là đã đọc
 * PATCH /api/conversations/:id/read
 */
export const markConversationAsRead = async (req, res) => {
  try {
    const result = await chatInterfaceService.markConversationAsRead(req.params.id);
    return successResponse(res, result, 'Đã đánh dấu đã đọc');
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

