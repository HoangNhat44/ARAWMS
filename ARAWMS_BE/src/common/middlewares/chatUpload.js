/**
 * ============================================================================
 * @title        : Chat Attachment Upload Middleware
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Middleware Multer tiếp nhận ảnh / tệp Seller gửi cho khách hàng trong
 *                 khung chat (UC-74). Lưu tệp vào thư mục uploads/chat và giới hạn
 *                 dung lượng theo chuẩn Messenger Send API (tối đa 25MB / tệp).
 * @module       : Conversational Commerce / Chat Interface
 * @layer        : Middleware
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';

/** Thư mục gốc lưu tệp đính kèm chat (phục vụ static tại /uploads/chat) */
export const CHAT_UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'chat');
fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });

const MAX_FILE_SIZE = 25 * 1024 * 1024; // NOTE: Giới hạn 25MB của Messenger Send API
const MAX_FILES = 5;

/** Danh sách MIME cho phép: ảnh, video, audio và tài liệu văn phòng phổ biến */
const ALLOWED_MIME = [
  /^image\/(jpeg|png|gif|webp)$/,
  /^video\/(mp4|quicktime|webm)$/,
  /^audio\/(mpeg|mp4|ogg|wav|webm)$/,
  /^application\/pdf$/,
  /^application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet))$/,
  /^application\/vnd\.ms-excel$/,
  /^application\/zip$/,
  /^text\/plain$/,
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CHAT_UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Đặt tên ngẫu nhiên để tránh trùng lặp và chặn path traversal từ tên gốc
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 10);
    cb(null, `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME.some((re) => re.test(file.mimetype))) return cb(null, true);
  cb(new Error(`Định dạng tệp không được hỗ trợ: ${file.mimetype}`));
};

const uploader = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
});

/**
 * Middleware nhận tối đa 5 tệp ở trường `files` và trả lỗi 400 thân thiện khi vi phạm.
 *
 * @middleware
 * @param {Object} req - Express Request (multipart/form-data).
 * @param {Object} res - Express Response.
 * @param {Function} next - Chuyển tiếp middleware kế tiếp.
 */
export const uploadChatFiles = (req, res, next) => {
  uploader.array('files', MAX_FILES)(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Tệp vượt quá dung lượng tối đa 25MB'
      : err.code === 'LIMIT_FILE_COUNT'
        ? `Chỉ được gửi tối đa ${MAX_FILES} tệp mỗi lần`
        : err.message;
    return res.status(400).json({ success: false, message });
  });
};

/**
 * Suy ra loại attachment theo chuẩn Messenger từ MIME type.
 *
 * @param {string} mimetype - MIME type của tệp.
 * @returns {'image'|'video'|'audio'|'file'} Loại attachment.
 */
export const resolveAttachmentType = (mimetype = '') => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'file';
};

export default { uploadChatFiles, resolveAttachmentType, CHAT_UPLOAD_DIR };
