import chatInterfaceService from './chatInterface.service.js';
import { successResponse, errorResponse } from '../../../common/utils/apiResponse.js';

/**
 * CHAT INTERFACE CONTROLLER
 * Xử lý UC-72, UC-73, UC-74
 */

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
  addConversationTag,
  removeConversationTag,
};
