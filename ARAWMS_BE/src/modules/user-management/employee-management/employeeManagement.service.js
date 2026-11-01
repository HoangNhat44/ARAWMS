/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-06, UC-07, UC-08; GBR-01, GBR-02 - Quản lý tài khoản nhân viên.
 */
import bcrypt from 'bcryptjs';
import User from '../../../models/User.model.js';
import Role from '../../../models/Role.model.js';
import { httpError } from '../../../common/utils/httpError.js';
import { objectFields, pagination, textField, escapedSearch, objectId } from '../../../common/utils/ownerValidation.js';
import { ownerTransaction, ownerAudit } from '../../../common/utils/ownerOperation.js';
import { validateEmployee, validateEmployeeAction, employeeRoles } from './employeeManagement.validation.js';

// UC-06 đến UC-09: Chỉ trả thông tin quản trị cần dùng; không trả mật khẩu và phiên đăng nhập.
export const employeeProfile = (user) => ({ id: String(user._id), employeeCode: user.employeeCode,
  fullName: user.fullName, email: user.email, phone: user.phone || '', roleCode: user.roleCode,
  status: user.status, managementVersion: user.managementVersion || 0,
  permissionOverrides: (user.permissionOverrides || []).map(({ code, granted }) => ({ code, granted })),
  lastLoginAt: user.lastLoginAt, createdAt: user.createdAt });

export const listEmployees = async (query) => {
  // Quản lý tài khoản: Chỉ nhận bộ lọc đã cho phép; mặc định loại Owner và tài khoản đã xóa.
  objectFields(query, ['page', 'limit', 'search', 'status', 'roleCode']);
  const { page, limit } = pagination(query);
  const filter = { isDeleted: { $ne: true }, roleCode: { $in: employeeRoles } };
  // Tìm theo mã, tên hoặc email; xem ký tự nhập vào là văn bản để tránh đổi nghĩa biểu thức tìm kiếm.
  if (query.search !== undefined && query.search !== '') {
    const search = escapedSearch(textField(query.search, 'Từ khóa', 100));
    filter.$or = ['employeeCode', 'fullName', 'email'].map((field) => ({ [field]: { $regex: search, $options: 'i' } }));
  }
  if (query.status) {
    if (!['ACTIVE', 'LOCKED', 'INACTIVE'].includes(query.status)) throw httpError(400, 'Trạng thái không hợp lệ.');
    filter.status = query.status;
  }
  if (query.roleCode) {
    if (!employeeRoles.includes(query.roleCode)) throw httpError(400, 'Vai trò không hợp lệ.');
    filter.roleCode = query.roleCode;
  }
  // Lấy trang hiện tại và tổng số bản ghi để FE vẽ nút Trước/Sau.
  const [users, total] = await Promise.all([User.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit), User.countDocuments(filter)]);
  return { items: users.map(employeeProfile), total, page, limit };
};

export const createEmployee = async (req) => {
  const input = validateEmployee(req.body);
  // UC-06: Băm mật khẩu trước khi lưu; không giữ mật khẩu gốc trong tài khoản.
  const passwordHash = await bcrypt.hash(input.password, 12);
  return ownerTransaction(async (session) => {
    // UC-06: Vai trò phải tồn tại và còn hoạt động tại thời điểm tạo nhân viên.
    const role = await Role.findOne({ roleCode: input.roleCode, isActive: true, isDeleted: { $ne: true } }).session(session);
    if (!role) throw httpError(400, 'Vai trò chưa được thiết lập hoặc đã vô hiệu hóa.');
    // UC-06: Unique index còn chặn trùng khi có hai yêu cầu tạo đồng thời.
    if (await User.exists({ $or: [{ email: input.email }, { employeeCode: input.employeeCode }] }).session(session)) throw httpError(409, 'Email hoặc mã nhân viên đã tồn tại.');
    // Bỏ mật khẩu gốc khỏi dữ liệu ghi DB; chỉ tạo tài khoản nhân viên đang hoạt động.
    const { password, ...fields } = input;
    const [user] = await User.create([{ ...fields, passwordHash, roleId: role._id, status: 'ACTIVE' }], { session });
    const profile = employeeProfile(user);
    // UC-10/11: Ghi người tạo và tài khoản mới trong cùng giao dịch; thiếu nhật ký thì không tạo tài khoản.
    await ownerAudit(req, session, 'User Management', 'Employee Management', 'CREATE_EMPLOYEE',
      { collection: 'users', id: user._id, code: user.employeeCode }, null, profile);
    return profile;
  });
};

// UC-07/08: Dùng chung quy trình khóa/mở khóa nhưng kiểm tra đúng trạng thái ban đầu của từng thao tác.
export const changeEmployeeStatus = async (req, status) => {
  objectId(req.params.id);
  const input = validateEmployeeAction(req.body);
  return ownerTransaction(async (session) => {
    const user = await User.findOne({ _id: req.params.id, isDeleted: { $ne: true }, roleCode: { $in: employeeRoles } }).session(session);
    if (!user) throw httpError(404, 'Không tìm thấy tài khoản nhân viên.');
    // Từ chối bản dữ liệu cũ để hai lần quản trị không ghi đè kết quả của nhau.
    if ((user.managementVersion || 0) !== input.expectedVersion) throw httpError(409, 'Tài khoản đã thay đổi. Vui lòng tải lại.');
    if (user.status !== (status === 'LOCKED' ? 'ACTIVE' : 'LOCKED')) throw httpError(409, 'Trạng thái hiện tại không cho phép thao tác này.');
    if (status === 'ACTIVE' && !await Role.exists({ _id: user.roleId, roleCode: user.roleCode, isActive: true, isDeleted: { $ne: true } }).session(session)) throw httpError(409, 'Vai trò đã vô hiệu hóa; cần gán vai trò hợp lệ trước khi mở khóa.');
    // Lưu thông tin trước thay đổi để Owner có thể xem và truy vết sau này.
    const before = employeeProfile(user);
    user.status = status;
    // GBR-01: Khóa hoặc mở khóa không khôi phục token cũ.
    user.sessions = [];
    user.isOnlineForChat = false;
    user.managementVersion = input.expectedVersion + 1;
    // GBR-02: Mở khóa quản trị không xóa yêu cầu đặt lại mật khẩu do sai 5 lần.
    await user.save({ session });
    const after = employeeProfile(user);
    await ownerAudit(req, session, 'User Management', 'Employee Management', status === 'LOCKED' ? 'LOCK_EMPLOYEE' : 'UNLOCK_EMPLOYEE',
      { collection: 'users', id: user._id, code: user.employeeCode }, before, { ...after, reason: input.reason });
    return after;
  });
};
