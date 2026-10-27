import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

// NOTE: Khai báo tường minh { type: { type: String } } để Mongoose không hiểu nhầm
// trường "type" là từ khóa khai báo kiểu dữ liệu của cả sub-document.
const chatAttachmentSchema = new Schema(
  {
    type: { type: String, default: 'file' }, // image | video | audio | file | fallback | sticker ...
    url: { type: String },
    name: { type: String },
    mimeType: { type: String },
    size: { type: Number },
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
