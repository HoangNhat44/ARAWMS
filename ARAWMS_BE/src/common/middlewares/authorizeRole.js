/**
 * Middleware kiểm tra quyền theo vai trò (RBAC)
 * @param  {...string} allowedRoles - Danh sách roleCode được phép truy cập (VD: 'SELLER', 'OWNER')
 */
export const authorizeRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Chưa được xác thực người dùng',
    });
  }

  if (!allowedRoles.includes(req.user.roleCode)) {
    return res.status(403).json({
      success: false,
      message: `Bạn không có quyền thực hiện hành động này. Yêu cầu quyền: [${allowedRoles.join(', ')}]`,
    });
  }

  next();
};

export default authorizeRole;
