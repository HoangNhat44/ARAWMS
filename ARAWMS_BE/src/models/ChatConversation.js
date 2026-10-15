import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Chat Conversations collection – FT-09
 */

const assignmentSchema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    method: { type: String, required: true, enum: ['AUTO', 'MANUAL', 'TRANSFER'] },
    assignedAt: { type: Date, required: true },
    unassignedAt: { type: Date },
  },
  { _id: false }
);

const chatConversationSchema = new Schema(
  {
    integrationId: { type: Schema.Types.ObjectId, ref: 'Config', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    externalConversationId: { type: String },
    status: {
      type: String,
      required: true,
      enum: ['UNASSIGNED', 'OPEN', 'PENDING', 'RESOLVED', 'CLOSED'],
    },
    assignedSellerId: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedAt: { type: Date },
    lastMessageAt: { type: Date },
    lastMessagePreview: { type: String },
    lastCustomerMessageAt: { type: Date },
    unreadCount: { type: Number, default: 0 },
    tags: { type: [String], default: [] },
    assignments: { type: [assignmentSchema], default: [] },
  },
  { timestamps: true, collection: 'chat_conversations' }
);

// Indexes
chatConversationSchema.index(
  { integrationId: 1, externalConversationId: 1 },
  { unique: true, partialFilterExpression: { externalConversationId: { $type: 'string' } } }
);
chatConversationSchema.index({ assignedSellerId: 1, status: 1, lastMessageAt: -1 });
chatConversationSchema.index({ customerId: 1 });
chatConversationSchema.index({ tags: 1 });

const ChatConversation = mongoose.model('ChatConversation', chatConversationSchema);
export default ChatConversation;
