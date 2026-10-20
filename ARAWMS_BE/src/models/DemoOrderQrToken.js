import mongoose from 'mongoose';

const { Schema } = mongoose;

const demoOrderQrTokenSchema = new Schema(
  {
    demoOrderId: { type: String, required: true, unique: true },
    token: { type: String, required: true, unique: true, select: false },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'demo_order_qr_tokens' }
);

export default mongoose.model('DemoOrderQrToken', demoOrderQrTokenSchema);
