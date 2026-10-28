/*
 * File: Role.model.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Defines access roles and their active state. Provides role identifiers used by authentication and authorization.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';
import { ROLES } from '../common/constants/enums.js';

const { Schema } = mongoose;

const permissionSchema = new Schema(
  {
    majorFeature: { type: String, required: true },
    subFeature: { type: String, required: true },
    allowedActions: [
      {
        type: String,
        enum: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'SCAN_BARCODE', 'EXPORT'],
      },
    ],
  },
  { _id: false }
);

const roleSchema = new Schema(
  {
    roleCode: { type: String, enum: ROLES, required: true, unique: true, uppercase: true, index: true },
    roleName: { type: String, required: true },
    description: { type: String },
    permissions: [permissionSchema],
    isSystemDefault: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { collection: 'roles' }
);

roleSchema.plugin(baseSchemaPlugin);

const Role = mongoose.model('Role', roleSchema);
export default Role;
