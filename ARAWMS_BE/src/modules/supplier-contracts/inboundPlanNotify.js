/*
 * File: inboundPlanNotify.js
 * Description: Kế toán kho lập / sửa / xử lý sai lệch kế hoạch nhập NPL → báo Nhân viên kỹ thuật (KCS nghiệm thu)
 * và Quản lý kho (chuẩn bị nhận hàng), đồng thời phát `inbound-plan:changed` để các trang tự tải lại.
 */
import { publishRealtime } from '../../common/services/realtime.js';
import { notifyWorkflow, ROLE_PAGES } from '../../common/services/workflowNotify.js';

const day = (value) => (value ? new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '');

export function announceInboundPlan(plan, step, actor, note = '') {
  if (!plan) return;
  try {
    const code = plan.planCode || 'kế hoạch nhập';
    const supplier = plan.supplierId?.supplierName || '';
    const when = day(plan.scheduledDeliveryDate);
    publishRealtime('inbound-plan:changed', { planId: String(plan._id), planCode: code, status: plan.status, step });
    const content = {
      CREATED: [`Kế hoạch nhập NPL mới: ${code}`,
        `Kế toán đã lập kế hoạch ${code}${supplier ? ` (NCC ${supplier})` : ''}${when ? `, dự kiến giao ${when}` : ''}.`],
      UPDATED: [`Kế hoạch nhập thay đổi: ${code}`,
        `Kế toán đã cập nhật kế hoạch ${code}${when ? ` (ngày giao ${when})` : ''}. Trạng thái: ${plan.status}.`],
      AMENDED: [`Phiên bản kế hoạch mới: ${code}`,
        `Kế toán đã tạo phiên bản mới ${code}${when ? `, giao ${when}` : ''}; phiên bản cũ không còn hiệu lực.`],
      DEVIATION_RESOLVED: [`Đã xử lý sai lệch: ${code}`,
        `Kế toán đã xử lý sai lệch của kế hoạch ${code}.${note ? ` Phương án: ${note}` : ''}`],
    }[step];
    if (!content) return;
    notifyWorkflow({
      actor, type: step === 'DEVIATION_RESOLVED' ? 'CONTRACT_DEVIATION' : 'INBOUND_REQUEST',
      roles: {
        GARMENT_TECHNICIAN: ROLE_PAGES.GARMENT_TECHNICIAN.inboundVerification,
        WAREHOUSE_MANAGER: ROLE_PAGES.WAREHOUSE_MANAGER.supplierInbound,
      },
      title: content[0], message: content[1],
      metadata: { planId: String(plan._id), planCode: code, status: plan.status },
    });
  } catch (error) {
    console.error('[inboundPlanNotify] Không gửi được thông báo kế hoạch nhập:', error.message);
  }
}

export default announceInboundPlan;
