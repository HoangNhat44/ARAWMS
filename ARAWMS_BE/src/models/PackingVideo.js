/*
 * File: PackingVideo.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Tracks packing recordings and synchronization status.
 */
import mongoose from 'mongoose';

const packingVideoSchema = new mongoose.Schema({
  recordingId: { type: String, required: true, unique: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PackingSession', required: true },
  orderId: { type: String, required: true },
  cloudinaryPublicId: { type: String, required: true },
  cloudinaryAssetId: { type: String, required: true },
  cloudinaryUrl: { type: String, required: true },
  mimeType: { type: String, required: true },
  fileSize: { type: Number, required: true },
  durationMs: { type: Number, required: true },
  status: { type: String, enum: ['SYNC_PENDING', 'COMPLETED'], required: true },
  uploadedAt: { type: Date, required: true },
}, { timestamps: true, collection: 'packing_videos' });

packingVideoSchema.index({ sessionId: 1 });

export default mongoose.model('PackingVideo', packingVideoSchema);
