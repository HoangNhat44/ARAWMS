/*
 * File: CatalogOperation.model.js
 * Author: Duy Anh
 * Date: 2026-10-29
 * Description: Records account-scoped catalog mutations and their committed responses for safe retry.
 */
import mongoose from 'mongoose';

const catalogOperationSchema = new mongoose.Schema({
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  operationId: { type: String, required: true },
  payloadHash: { type: String, required: true },
  result: { type: mongoose.Schema.Types.Mixed, required: true },
}, { collection: 'catalog_operations', timestamps: true });

catalogOperationSchema.index({ ownerUserId: 1, operationId: 1 }, { unique: true });

export default mongoose.model('CatalogOperation', catalogOperationSchema);
