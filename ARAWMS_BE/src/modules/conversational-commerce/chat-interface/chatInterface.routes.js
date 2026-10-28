/**
 * ============================================================================
 * @title        : Chat Interface Routes
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Định tuyến các endpoints giao tiếp khung chat Messenger của Seller
 *                 (UC-72, UC-73, UC-74), kiểm soát xác thực JWT và quyền SELLER.
 * @module       : Conversational Commerce / Chat Interface
 * @layer        : Route
 * ============================================================================
 */

import express from 'express';
import {
  getConversations,
  getConversationById,
  getConversationMessages,
  sendCustomerMessage,
  sendCustomerAttachments,
  addConversationTag,
  removeConversationTag,
  getTagList,
  createCustomTag,
  deleteCustomTag,
  markConversationAsRead,
} from './chatInterface.controller.js';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import { validateSendMessage } from './chatInterface.validation.js';
import { uploadChatFiles } from '../../../common/middlewares/chatUpload.js';

const router = express.Router();

router.use(authenticate);
router.use(authorizeRole('SELLER', 'OWNER', 'WAREHOUSE_MANAGER'));

// UC-72: Danh sách và chi tiết cuộc hội thoại
router.get('/', getConversations);
router.get('/:id', getConversationById);
router.get('/:id/messages', getConversationMessages);
router.patch('/:id/read', markConversationAsRead);
router.post('/:id/read', markConversationAsRead);

// UC-74: Gửi tin nhắn cho khách hàng
router.post('/:id/messages', validateSendMessage, sendCustomerMessage);

// UC-74: Gửi ảnh / tệp đính kèm (multipart, tối đa 5 tệp x 25MB)
router.post('/:id/attachments', uploadChatFiles, sendCustomerAttachments);

// UC-73: Gắn / gỡ thẻ hội thoại khách hàng
router.post('/:id/tags', addConversationTag);
router.delete('/:id/tags/:tag', removeConversationTag);

// UC-73 & [BR: GBR-23]: Quản lý thẻ tag tuỳ chỉnh của Seller (lưu trữ MongoDB)
router.get('/tags/list', getTagList);
router.post('/tags/create', createCustomTag);
router.delete('/tags/:tagId', deleteCustomTag);

export default router;
