/*
 * File: ChatMessage.model.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Defines messages in customer conversations. Stores sender, text, attachments, and optional product references.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const chatAttachmentSchema = new Schema(
  {
    type: String,
    url: String,
  },
  { _id: false }
);

const chatMessageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'ChatConversation', required: true, index: true },
    fbMessageId: { type: String, unique: true, sparse: true },
    senderType: { type: String, enum: ['CUSTOMER', 'SELLER', 'SYSTEM'], required: true },
    senderSellerId: { type: Schema.Types.ObjectId, ref: 'User' },
    messageText: { type: String },
    attachments: [chatAttachmentSchema],
    referencedSkuId: { type: Schema.Types.ObjectId, ref: 'Sku' },
    sentAt: { type: Date, default: Date.now, index: true },
  },
  { collection: 'chat_messages' }
);

chatMessageSchema.index({ conversationId: 1, sentAt: -1 });

chatMessageSchema.plugin(baseSchemaPlugin);

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
export default ChatMessage;
