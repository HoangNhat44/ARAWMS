import mongoose from 'mongoose';

const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String },
    ref: {
      type: {
        type: String,
      },
      id: { type: Schema.Types.ObjectId },
    },
    isRead: { type: Boolean, required: true, default: false },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { collection: 'notifications' }
);

// Indexes
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
// TTL 90 ngày
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
