import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

/**
 * Universal Multi-Role Notification Model for ARAWMS
 * Phục vụ toàn bộ 7 Roles: OWNER, WAREHOUSE_MANAGER, WAREHOUSE_STAFF,
 * GARMENT_TECHNICIAN, SELLER, ACCOUNTANT, và COMMON_USER/ALL.
 */
const notificationSchema = new Schema(
  {
    // Tiêu đề & Nội dung
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    // Phân loại sự kiện nghiệp vụ
    type: {
      type: String,
      required: true,
      enum: [
        // 1. Nhóm Mua sắm & Hợp đồng (Supplier Procurement)
        'CONTRACT_DEVIATION',           // Sai lệch kế hoạch tiếp nhận / KCS báo cáo
        'CONTRACT_APPROVAL_REQUIRED',   // Hợp đồng mới / phiên bản mới cần Owner duyệt
        'PAYMENT_DUE',                  // Công nợ nhà cung cấp đến hạn thanh toán

        // 2. Nhóm Quản lý Kho & Nguyên phụ liệu (WMS / Fabric)
        'INBOUND_REQUEST',              // Yêu cầu nhập kho nguyên vật liệu / thành phẩm
        'OUTBOUND_REQUEST',             // Yêu cầu xuất kho vải / phụ liệu
        'STOCK_ALERT',                  // Cảnh báo chạm đáy tồn kho an toàn
        'FABRIC_LEFTOVER_EXCEEDED',     // Vải thừa/vải vụn vượt ngưỡng định mức
        'INVENTORY_VARIANCE',           // Sai lệch kiểm kê kho vượt ngưỡng cần duyệt

        // 3. Nhóm KCS & Xưởng may gia công (QC & Garment Technical)
        'QC_INSPECTION',                // Kết quả kiểm định chất lượng ngoại quan
        'REWORK_REQUIRED',              // Hàng lỗi cần xưởng may gia công sửa chữa
        'MATERIAL_DELIVERED_TO_FACTORY',// Vải đã giao tới xưởng cần KCS xác nhận

        // 4. Nhóm Bán lẻ & Đơn hàng (Sales & Order Fulfillment)
        'NEW_ORDER',                    // Đơn hàng bán lẻ mới đa kênh
        'RMA_RETURN_REQUEST',           // Khách yêu cầu đổi/trả hàng (RMA)
        'ORDER_DELIVERY_FAILED',        // Đơn giao thất bại / chuyển hoàn (Boom hàng)

        // 5. Nhóm Tài chính & Đối soát vận chuyển (Financial & Carrier)
        'COD_DISCREPANCY',              // Cờ đỏ sai lệch tiền thu hộ COD từ GHN
        'CUSTOMER_REFUND_DUE',          // Chi tiền hoàn trả cho khách hàng
        'CARRIER_DISPUTE_UPDATE',       // Tiến độ xử lý khiếu nại hãng vận chuyển

        // 6. Nhóm Hệ thống chung
        'SYSTEM_ANNOUNCEMENT',          // Thông báo vận hành toàn hệ thống
        'OTHER',
      ],
      default: 'SYSTEM_ANNOUNCEMENT',
      index: true,
    },

    // Mức độ ưu tiên
    priority: {
      type: String,
      enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
      default: 'NORMAL',
      index: true,
    },

    // Vai trò người nhận
    recipientRole: {
      type: String,
      required: true,
      enum: [
        'OWNER',
        'WAREHOUSE_MANAGER',
        'WAREHOUSE_STAFF',
        'GARMENT_TECHNICIAN',
        'SELLER',
        'ACCOUNTANT',
        'ALL',
      ],
      default: 'ACCOUNTANT',
      index: true,
    },

    // User người nhận đích danh (nếu là thông báo cá nhân, null nếu gửi chung theo Role)
    recipientUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    // Người kích hoạt / tạo thông báo
    senderUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    senderRole: {
      type: String,
      default: 'SYSTEM',
    },

    // Đường dẫn điều hướng trực tiếp khi click thông báo
    targetUrl: {
      type: String,
      default: '',
      trim: true,
    },

    // Dữ liệu mở rộng linh hoạt theo từng ngữ cảnh
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },

    // Trạng thái đã đọc (theo cờ đơn giản)
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },

    // Danh sách các user đã đọc (phục vụ broadcast theo role khi nhiều người dùng chung 1 vai trò)
    readByUsers: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        readAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Gắn Base Schema Plugin (hỗ trợ soft delete, audit fields...)
notificationSchema.plugin(baseSchemaPlugin);

// Compound indexes tối ưu hóa truy vấn danh sách & unread count
notificationSchema.index({ recipientRole: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipientUserId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
