/**
 * Chuẩn hóa format response cho toàn bộ API ARAWMS
 */

/** Tên hiển thị tiếng Việt của các model hay gặp trong thông báo lỗi Mongoose */
const MODEL_LABELS = {
  SalesOrder: 'đơn hàng',
  Sku: 'sản phẩm (SKU)',
  Customer: 'khách hàng',
  User: 'nhân viên',
  ReturnRequest: 'phiếu đổi/trả (RMA)',
  Product: 'sản phẩm',
  ChatConversation: 'hội thoại',
};

/**
 * Chuyển các thông báo lỗi kỹ thuật (Mongoose / MongoDB) thành thông báo tiếng Việt
 * có kèm HƯỚNG DẪN để người dùng biết cách thao tác đúng.
 *
 * @param {string} message - Thông báo lỗi gốc.
 * @returns {{ message: string, hint: (string|null) }}
 */
export const humanizeErrorMessage = (message = '') => {
  const raw = String(message || '');

  // 1. Lỗi ObjectId: Cast to ObjectId failed for value "X" (type string) at path "_id" for model "SalesOrder"
  const castMatch = raw.match(/Cast to ObjectId failed for value "?([^"]*?)"? \(type \w+\)(?: at path "([^"]+)")?(?: for model "([^"]+)")?/);
  if (castMatch || /not a valid ObjectId|input must be a 24 character hex string/i.test(raw)) {
    const value = castMatch?.[1] ?? '';
    const modelLabel = MODEL_LABELS[castMatch?.[3]] || 'đối tượng';
    const shown = value && value !== 'undefined' ? `"${value}"` : '(trống)';
    const hint =
      'Hãy chọn lại ' + modelLabel + ' từ danh sách trên màn hình thay vì nhập tay mã hiển thị như ARA-000030. ' +
      'Nếu vẫn lỗi, tải lại trang F5 rồi thực hiện lại thao tác.';
    return {
      message: `Mã tham chiếu ${shown} của ${modelLabel} không hợp lệ, hệ thống cần ID nội bộ thay vì mã hiển thị. Hướng dẫn: ${hint}`,
      hint,
    };
  }

  // 2. Trùng khóa duy nhất
  const dupMatch = raw.match(/E11000 duplicate key.*?dup key: \{ (\w+): "?([^"}]+)"? \}/);
  if (dupMatch || /E11000 duplicate key/.test(raw)) {
    const hint = 'Kiểm tra lại dữ liệu đã tồn tại trong hệ thống hoặc dùng giá trị khác.';
    return {
      message: `Dữ liệu bị trùng${dupMatch ? `: ${dupMatch[1]}: ${dupMatch[2].trim()}` : ''}. Hướng dẫn: ${hint}`,
      hint,
    };
  }

  // 3. Lỗi validate của Mongoose (Enum, Required, Cast...)
  if (/validation failed/i.test(raw) || /is not a valid enum value/i.test(raw) || /Path `?\w+`? is required/i.test(raw)) {
    if (/is not a valid enum value for path ['`"]?(\w+)['`"]?/i.test(raw)) {
      const match = raw.match(/is not a valid enum value for path ['`"]?(\w+)['`"]?/i);
      const field = match ? match[1] : '';
      let fieldDesc = 'Trạng thái hoặc giá trị lựa chọn';
      if (field === 'status' || field === 'importStatus') fieldDesc = 'Trạng thái của đơn hàng';
      else if (field === 'paymentMethod') fieldDesc = 'Phương thức thanh toán';
      else if (field === 'channel' || field === 'orderChannel') fieldDesc = 'Kênh bán hàng';

      const hint = 'Vui lòng chọn trạng thái hoặc giá trị hợp lệ được hệ thống quy trình hỗ trợ.';
      return {
        message: `${fieldDesc} không hợp lệ với quy trình hiện tại. Hướng dẫn: ${hint}`,
        hint,
      };
    }
    if (/is required/i.test(raw)) {
      const hint = 'Vui lòng điền đầy đủ các thông tin bắt buộc trước khi thực hiện thao tác.';
      return {
        message: `Dữ liệu chưa đầy đủ: Thiếu thông tin bắt buộc. Hướng dẫn: ${hint}`,
        hint,
      };
    }
    const hint = 'Vui lòng kiểm tra lại thông tin nhập vào đúng định dạng trước khi gửi lại.';
    return { message: `Dữ liệu chưa hợp lệ. Hướng dẫn: ${hint}`, hint };
  }

  // Làm sạch các mã kỹ thuật nếu có trong thông báo thường
  const sanitized = raw
    .replace(/\[BR:\s*GBR-\d+\]/gi, '')
    .replace(/^Error:\s*/i, '')
    .replace(/[`]/g, '')
    .trim();

  return { message: sanitized || 'Có lỗi xảy ra trong quá trình xử lý', hint: null };
};

export const successResponse = (res, data = null, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

export const errorResponse = (res, message = 'Internal Server Error', statusCode = 500, details = null) => {
  const friendly = humanizeErrorMessage(message);
  return res.status(statusCode).json({
    success: false,
    message: friendly.message,
    hint: friendly.hint,
    details,
  });
};

export default {
  successResponse,
  errorResponse,
  humanizeErrorMessage,
};
