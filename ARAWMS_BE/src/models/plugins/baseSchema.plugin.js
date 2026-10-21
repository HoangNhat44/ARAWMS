/**
 * Base Schema Plugin for Mongoose
 * - timestamps: true (createdAt, updatedAt)
 * - Soft-delete support (isDeleted, deletedAt)
 * - Clean JSON/Object serialization (transforms _id to id, removes __v and passwordHash)
 */
export const baseSchemaPlugin = (schema) => {
  schema.add({
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  });

  schema.set('timestamps', true);

  const cleanTransform = (doc, ret) => {
    if (ret._id) {
      ret.id = ret._id.toString();
      delete ret._id;
    }
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  };

  schema.set('toJSON', {
    virtuals: true,
    transform: cleanTransform,
  });

  schema.set('toObject', {
    virtuals: true,
    transform: cleanTransform,
  });
};

export default baseSchemaPlugin;
