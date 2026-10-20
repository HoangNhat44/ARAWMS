import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const chatConversationSchema = new Schema(
  {
    fbConversationId: { type: String, required: true, unique: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    assignedSellerId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    tags: [String],
    status: { type: String, enum: ['UNASSIGNED', 'ACTIVE', 'RESOLVED'], default: 'ACTIVE', index: true },
    lastMessagePreview: { type: String },
    lastMessageAt: { type: Date, index: true },
    unreadCount: { type: Number, default: 0 },
  },
  { collection: 'chat_conversations' }
);

chatConversationSchema.plugin(baseSchemaPlugin);

const ChatConversation = mongoose.model('ChatConversation', chatConversationSchema);
export default ChatConversation;
