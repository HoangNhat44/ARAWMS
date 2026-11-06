/**
 * ============================================================================
 * @title        : SalesChannel Model (Mongoose Schema)
 * @author       : AraStore Backend Team
 * @createdDate  : 2026-11-06
 * @description  : Quản lý danh mục các kênh bán hàng và tài khoản / gian hàng liên kết
 *                 thực tế (Facebook Fanpages, TikTok Shop, Shopee Mall, POS, Excel)
 *                 lưu trữ trực tiếp trong cơ sở dữ liệu MongoDB Atlas.
 * ============================================================================
 */

import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const salesChannelSchema = new Schema(
  {
    channel: {
      type: String,
      enum: ['FACEBOOK', 'TIKTOK', 'SHOPEE', 'EXCEL_IMPORT', 'POS', 'OTHER'],
      required: true,
      index: true,
    },
    channelName: {
      type: String,
      required: true,
    },
    sourceType: {
      type: String,
      enum: ['FANPAGE', 'TIKTOK_SHOP', 'SHOPEE_STORE', 'EXCEL_CUSTOM', 'POS', 'OTHER'],
      required: true,
      index: true,
    },
    sourceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sourceName: {
      type: String,
      required: true,
    },
    badgeLabel: {
      type: String,
      default: 'Kênh bán',
    },
    chipClass: {
      type: String,
      default: 'fb-chip',
    },
    connectionStatus: {
      type: String,
      enum: ['CONNECTED', 'DISCONNECTED', 'SYNCING', 'ERROR'],
      default: 'CONNECTED',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastSyncAt: {
      type: Date,
      default: Date.now,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    collection: 'sales_channels',
    timestamps: true,
  }
);

salesChannelSchema.plugin(baseSchemaPlugin);

salesChannelSchema.index({ channel: 1, isActive: 1 });
salesChannelSchema.index({ sourceType: 1, connectionStatus: 1 });

const SalesChannel = mongoose.model('SalesChannel', salesChannelSchema);

export default SalesChannel;

