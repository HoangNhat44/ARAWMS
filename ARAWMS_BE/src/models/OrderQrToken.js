/*
 * File: OrderQrToken.js
 * Author: Duy Anh
 * Date: 2026-10-19
 * Description: Stores revocable QR tokens for real sales orders.
 */
import mongoose from 'mongoose';

const { Schema } = mongoose;

const orderQrTokenSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder', required: true, unique: true },
    token: { type: String, required: true, unique: true, select: false },
    revokedAt: { type: Date, default: null },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'order_qr_tokens' }
);

export default mongoose.model('OrderQrToken', orderQrTokenSchema);
