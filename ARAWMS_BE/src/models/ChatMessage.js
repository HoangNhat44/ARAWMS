import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Chat Messages collection – FT-09
 */

const chatMessageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'ChatConversation',
      required: true,
    },
    externalMessageId: { type: String },
    direction: { type: String, required: true, enum: ['INBOUND', 'OUTBOUND'] },
    senderType: { type: String, required: true, enum: ['CUSTOMER', 'SELLER', 'SYSTEM'] },
    senderUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    messageType: {
      type: String,
      required: true,
      enum: ['TEXT', 'IMAGE', 'VIDEO', 'FILE', 'STICKER', 'TEMPLATE', 'OTHER'],
    },
    content: { type: String },
    attachments: { type: [Schema.Types.Mixed], default: undefined },
    deliveryStatus: {
      type: String,
      enum: ['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED'],
    },
    errorMessage: { type: String },
    sentAt: { type: Date, required: true },
  },
  { collection: 'chat_messages' }
);

// Indexes
chatMessageSchema.index({ conversationId: 1, sentAt: -1 });
chatMessageSchema.index(
  { externalMessageId: 1 },
  { unique: true, partialFilterExpression: { externalMessageId: { $type: 'string' } } }
);

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
export default ChatMessage;
