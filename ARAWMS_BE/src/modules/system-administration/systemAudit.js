import SystemLog from '../../models/SystemLog.model.js';

export const recordAccountActivity = (req, user, subFeature, action, snapshots = {}) => SystemLog.create({
  actorId: user._id,
  actorRole: user.roleCode,
  majorFeature: 'System Administration',
  subFeature,
  action,
  targetCollection: 'users',
  targetId: user._id,
  targetCode: user.employeeCode,
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
  ...snapshots,
});
