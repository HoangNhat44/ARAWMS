import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const counterSequenceSchema = new Schema(
  {
    sequenceKey: { type: String, required: true, unique: true, index: true },
    seq: { type: Number, default: 0 },
  },
  { collection: 'counter_sequences' }
);

counterSequenceSchema.plugin(baseSchemaPlugin);

/**
 * Static Helper: Atomic Code Generation
 */
counterSequenceSchema.statics.getNextSequence = async function (sequenceKey, prefix, padLength = 5) {
  const counter = await this.findOneAndUpdate(
    { sequenceKey },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const paddedSeq = String(counter.seq).padStart(padLength, '0');
  return prefix ? `${prefix}-${paddedSeq}` : paddedSeq;
};

const CounterSequence = mongoose.model('CounterSequence', counterSequenceSchema);
export default CounterSequence;
