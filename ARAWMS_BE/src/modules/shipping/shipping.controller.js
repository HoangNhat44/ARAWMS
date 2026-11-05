import { sendError, sendSuccess } from '../../common/utils/responseHandler.js';
import { acceptGhnWebhook, confirmCarrierHandover, createCarrierShipment, createHandoverDraft, getGhnProvinces, getGhnWards, getPrintToken, listHandovers, listShipments, listShippingOrders, removeParcelFromHandover, scanParcelIntoHandover, ShippingError } from './shipping.service.js';

const handle = (res, error, next) => error instanceof ShippingError
  ? sendError(res, messageFor(error.code), { code: error.code }, error.status) : next(error);
const messageFor = (code) => ({
  GHN_NOT_CONFIGURED: 'Chưa cấu hình kết nối GHN trên máy chủ.',
  SHIPMENT_RESULT_UNKNOWN: 'Chưa xác định được GHN đã tạo vận đơn hay chưa. Hãy kiểm tra lại bằng cùng yêu cầu.',
  ORDER_NOT_READY_FOR_SHIPPING: 'Đơn chưa hoàn tất đóng hàng.',
  FINAL_PACKING_NOT_CONFIRMED: 'Chưa có kết quả đóng hàng final hợp lệ.',
  GHN_CREATE_FAILED: 'GHN chưa tạo được vận đơn. Kiểm tra thông tin rồi thử lại.',
  RECIPIENT_DETAILS_REQUIRED: 'Đơn còn thiếu thông tin người nhận.',
  WAREHOUSE_CANNOT_RESOLVE: 'Không xác định được kho xuất hàng từ phân bổ đóng hàng.',
  ORDER_HAS_MULTIPLE_WAREHOUSES: 'Đơn lấy hàng từ nhiều kho; cần tách biên bản theo từng kho.',
  WAREHOUSE_REQUIRED: 'Cần chọn kho bàn giao.',
  HANDOVER_NOT_DRAFT: 'Biên bản không còn ở trạng thái nháp.',
  HANDOVER_EMPTY: 'Biên bản chưa có kiện nào được quét.',
  HANDOVER_CONFIRMATION_REQUIRED: 'Cần xác nhận đã bàn giao thực tế.',
  HANDOVER_PARCEL_INVALID: 'Có kiện không còn hợp lệ. Kiểm tra lại danh sách trước khi xác nhận.',
  PARCEL_CODE_REQUIRED: 'Quét mã vận đơn GHN trên kiện.',
  PRODUCT_BARCODE_NOT_PARCEL: 'Đây là barcode sản phẩm. Hãy quét mã vận đơn GHN trên kiện.',
  PARCEL_NOT_FOUND: 'Không tìm thấy vận đơn GHN này.',
  PARCEL_ALREADY_IN_HANDOVER: 'Kiện đã nằm trong biên bản bàn giao khác.',
  PARCEL_WRONG_WAREHOUSE: 'Kiện thuộc kho khác với biên bản.',
  PARCEL_NOT_WAITING_FOR_PICKUP: 'Vận đơn không còn ở trạng thái chờ GHN lấy.',
  HANDOVER_PEOPLE_REQUIRED: 'Cần nhập tên người giao và người nhận phía GHN.',
  NO_PARCELS_FOR_WAREHOUSE: 'Kho này chưa có kiện GHN nào đủ điều kiện chờ bàn giao.',
}[code] || code);

export async function getShippingOrders(req, res, next) {
  try { return sendSuccess(res, 'Danh sách đơn đủ điều kiện gửi', { orders: await listShippingOrders() }); }
  catch (error) { return handle(res, error, next); }
}
export async function getShippingShipments(req, res, next) {
  try { return sendSuccess(res, 'Danh sách vận đơn', { shipments: await listShipments() }); }
  catch (error) { return handle(res, error, next); }
}
export async function postCreateShipment(req, res, next) {
  try { return sendSuccess(res, 'Đã tạo vận đơn GHN', { shipment: await createCarrierShipment(req.params.orderId, req.body, req.user?._id) }); }
  catch (error) { return handle(res, error, next); }
}
export async function postPrintToken(req, res, next) {
  try { return sendSuccess(res, 'Mã in tem GHN', await getPrintToken(req.params.id)); }
  catch (error) { return handle(res, error, next); }
}
export async function getGhnProvinceOptions(req, res, next) {
  try { return sendSuccess(res, 'Danh mục tỉnh GHN', { provinces: await getGhnProvinces() }); }
  catch (error) { return handle(res, error, next); }
}
export async function getGhnWardOptions(req, res, next) {
  try { return sendSuccess(res, 'Danh mục phường GHN', { wards: await getGhnWards(req.query.provinceId) }); }
  catch (error) { return handle(res, error, next); }
}
export async function postGhnWebhook(req, res, next) {
  try {
    const result = await acceptGhnWebhook(req.body, req.get('x-ghn-webhook-secret'));
    return sendSuccess(res, 'Đã tiếp nhận cập nhật GHN', result);
  } catch (error) { return handle(res, error, next); }
}

export async function getCarrierHandovers(req, res, next) {
  try { return sendSuccess(res, 'Biên bản bàn giao', { handovers: await listHandovers() }); }
  catch (error) { return handle(res, error, next); }
}
export async function postCreateHandover(req, res, next) {
  try { return sendSuccess(res, 'Đã tạo biên bản nháp', { handover: await createHandoverDraft(req.body) }, 201); }
  catch (error) { return handle(res, error, next); }
}
export async function postScanHandoverParcel(req, res, next) {
  try { return sendSuccess(res, 'Đã ghi nhận kiện vào biên bản', await scanParcelIntoHandover(req.params.id, req.body.code, req.body.scannedByName)); }
  catch (error) { return handle(res, error, next); }
}
export async function deleteHandoverParcel(req, res, next) {
  try { return sendSuccess(res, 'Đã bỏ kiện khỏi biên bản nháp', { handover: await removeParcelFromHandover(req.params.id, req.params.waybillCode) }); }
  catch (error) { return handle(res, error, next); }
}
export async function postConfirmHandover(req, res, next) {
  try { return sendSuccess(res, 'Đã xác nhận bàn giao thực tế', { handover: await confirmCarrierHandover(req.params.id, req.body.confirmed) }); }
  catch (error) { return handle(res, error, next); }
}
