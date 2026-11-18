import React from 'react';
import { X, Printer, FileText, CheckCircle, ShieldCheck } from 'lucide-react';
import { money, quantity, datetime } from '../../pages/Owner/OwnerUI';

export default function ContractLegalDocumentModal({ contract, isOpen, onClose }) {
  if (!isOpen || !contract) return null;

  const previewDate = contract.signingDate
    ? new Date(contract.signingDate)
    : new Date(contract.createdAt || Date.now());
  const previewDay = String(previewDate.getDate()).padStart(2, '0');
  const previewMonth = String(previewDate.getMonth() + 1).padStart(2, '0');
  const previewYear = previewDate.getFullYear();

  const depositPercent = Number(contract.commercialTerms?.depositPercent ?? 30);
  const depositAmount =
    contract.commercialTerms?.depositAmount ||
    Math.round((contract.totalContractAmount || 0) * (depositPercent / 100));

  const supplier = contract.supplierId || {};
  const buyer = contract.buyerInfo || {};
  const materials = contract.contractedMaterials || [];
  const paymentSchedule = contract.commercialTerms?.paymentSchedule || [];

  // Lấy các đợt tiếp nhận từ kế hoạch
  const latestPlan = contract.latestInboundPlan || contract.inboundPlans?.[0];
  const inboundBatches = latestPlan?.batches || [];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="wms-modal-backdrop"
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        overflowY: 'auto',
      }}
      onClick={onClose}
    >
      <div
        className="wms-modal-dialog"
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '1000px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
          fontFamily: "'Inter', sans-serif",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header (Không in) */}
        <div
          className="no-print"
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#F8FAFC',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} color="#0284c7" />
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0F172A' }}>
                Văn bản Hợp đồng Kinh tế: {contract.contractCode}
              </h2>
              {contract.versionNumber > 1 && (
                <span
                  style={{
                    backgroundColor: '#E0F2FE',
                    color: '#0369A1',
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '12px',
                  }}
                >
                  Phiên bản v{contract.versionNumber}
                </span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
              Khung Hợp đồng Nguyên tắc Cung ứng Nguyên phụ liệu May mặc chuẩn hóa 12 Điều khoản Pháp lý
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={handlePrint}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                fontSize: '12.5px',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              <Printer size={14} />
              In hợp đồng
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: '6px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#F1F5F9',
                fontSize: '12.5px',
                fontWeight: 600,
                color: '#64748B',
                cursor: 'pointer',
              }}
            >
              <X size={15} />
              Đóng
            </button>
          </div>
        </div>

        {/* Modal Document Body */}
        <div
          style={{
            padding: '36px 48px',
            overflowY: 'auto',
            backgroundColor: '#FFFFFF',
            color: '#1E293B',
            lineHeight: 1.7,
            fontSize: '13.5px',
          }}
        >
          {/* QUỐC HIỆU & TIÊU NGỮ */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontWeight: 800, fontSize: '14.5px', letterSpacing: '0.5px' }}>
              CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
            </div>
            <div style={{ fontWeight: 700, fontSize: '13.5px', marginTop: '2px' }}>
              Độc lập – Tự do – Hạnh phúc
            </div>
            <div style={{ width: '160px', height: '1.5px', backgroundColor: '#0F172A', margin: '8px auto 20px' }}></div>

            <div style={{ fontWeight: 900, fontSize: '20px', color: '#0F172A', textTransform: 'uppercase' }}>
              HỢP ĐỒNG NGUYÊN TẮC CUNG ỨNG NGUYÊN PHỤ LIỆU
            </div>
            <div style={{ fontSize: '13px', fontStyle: 'italic', color: '#475569', marginTop: '4px' }}>
              (V/v: {contract.contractTitle || 'Mua bán vải và nguyên phụ liệu dệt may công nghiệp'})
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0284c7', marginTop: '6px' }}>
              Số: {contract.contractCode} {contract.versionNumber > 1 ? `(Phiên bản v${contract.versionNumber})` : ''}
            </div>
          </div>

          {/* CĂN CỨ PHÁP LÝ */}
          <div style={{ fontStyle: 'italic', fontSize: '12.5px', color: '#475569', marginBottom: '20px', paddingLeft: '8px' }}>
            - Căn cứ Bộ Luật Dân sự số 91/2015/QH13 được Quốc hội nước CHXHCN Việt Nam thông qua ngày 24/11/2015;<br />
            - Căn cứ Luật Thương mại số 36/2005/QH11 do Quốc hội nước CHXHCN Việt Nam thông qua ngày 14/06/2005;<br />
            {contract.parentSupersededContractId && (
              <>
                - Căn cứ Hợp đồng kinh tế số <strong>{contract.parentSupersededContractId?.contractCode || 'Phiên bản trước'}</strong> và thỏa thuận điều chỉnh phụ lục giữa hai bên;<br />
              </>
            )}
            - Căn cứ nhu cầu sản xuất may mặc của Bên A và năng lực cung ứng nguyên phụ liệu của Bên B,
          </div>

          <p style={{ margin: '0 0 16px' }}>
            Hôm nay, ngày <strong>{previewDay}</strong> tháng <strong>{previewMonth}</strong> năm <strong>{previewYear}</strong>, tại trụ sở Bên Mua, chúng tôi gồm các bên:
          </p>

          {/* THÔNG TIN HAI BÊN */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px', padding: '16px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            <div>
              <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: '6px', fontSize: '14px' }}>
                BÊN MUA (BÊN A):
              </div>
              <div><strong>Đơn vị:</strong> {buyer.companyName || 'CÔNG TY TNHH THỜI TRANG & KHO VẬN ARA (ARASTORE)'}</div>
              <div><strong>Mã số thuế:</strong> {buyer.taxCode || '0109888999'}</div>
              <div><strong>Đại diện:</strong> {buyer.representativeName || 'Trần Hoàng Chủ Tịch'}</div>
              <div><strong>Chức vụ:</strong> {buyer.representativeRole || 'Chủ sở hữu / Giám đốc'}</div>
              <div><strong>Địa chỉ kho nhận:</strong> {buyer.receivingWarehouseAddress || 'Kho Tổng Nguyên Phụ Liệu AraStore – KCN Tân Bình, TP.HCM'}</div>
            </div>

            <div>
              <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: '6px', fontSize: '14px' }}>
                BÊN BÁN (BÊN B):
              </div>
              <div><strong>Đơn vị:</strong> {supplier.supplierName || '—'}</div>
              <div><strong>Mã số thuế:</strong> {supplier.taxCode || supplier.supplierCode || '—'}</div>
              <div><strong>Đại diện:</strong> {supplier.representativeName || supplier.contactName || '—'}</div>
              <div><strong>Chức vụ:</strong> {supplier.representativeRole || 'Giám đốc kinh doanh'}</div>
              <div><strong>Điện thoại:</strong> {supplier.phone || '—'}</div>
              <div><strong>Địa chỉ:</strong> {supplier.address || '—'}</div>
              {supplier.bankInfo?.accountNo && (
                <div><strong>Tài khoản:</strong> {supplier.bankInfo.accountNo} - {supplier.bankInfo.bankName}</div>
              )}
            </div>
          </div>

          <p style={{ marginBottom: '16px', fontWeight: 600 }}>
            Hai bên cùng thống nhất ký kết Hợp đồng mua bán nguyên phụ liệu với các điều khoản chi tiết như sau:
          </p>

          {/* ĐIỀU 1 */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: '8px', fontSize: '14px' }}>
              ĐIỀU 1: ĐỐI TƯỢNG HỢP ĐỒNG VÀ QUY CÁCH NGUYÊN PHỤ LIỆU
            </div>
            <p style={{ margin: '0 0 10px' }}>
              Bên B cam kết sản xuất và cung ứng cho Bên A danh mục vải và nguyên phụ liệu may mặc đảm bảo đầy đủ thông số kỹ thuật, quy cách xuất xưởng sau:
            </p>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', marginBottom: '10px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1' }}>
                  <th style={{ padding: '8px', border: '1px solid #CBD5E1', textAlign: 'center' }}>STT</th>
                  <th style={{ padding: '8px', border: '1px solid #CBD5E1' }}>Tên nguyên phụ liệu & Quy cách</th>
                  <th style={{ padding: '8px', border: '1px solid #CBD5E1', textAlign: 'center' }}>ĐVT</th>
                  <th style={{ padding: '8px', border: '1px solid #CBD5E1', textAlign: 'right' }}>Số lượng</th>
                  <th style={{ padding: '8px', border: '1px solid #CBD5E1', textAlign: 'right' }}>Đơn giá (VNĐ)</th>
                  <th style={{ padding: '8px', border: '1px solid #CBD5E1', textAlign: 'right' }}>Thành tiền (VNĐ)</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m, idx) => {
                  const lineTotal = (Number(m.contractedQty) || 0) * (Number(m.unitPrice) || 0);
                  return (
                    <tr key={idx} style={{ border: '1px solid #CBD5E1' }}>
                      <td style={{ padding: '8px', border: '1px solid #CBD5E1', textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ padding: '8px', border: '1px solid #CBD5E1' }}>
                        <div style={{ fontWeight: 700 }}>{m.materialNameSnapshot || m.rawMaterialId?.materialName || 'Vải may mặc'}</div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>
                          Mã: {m.materialCodeSnapshot || m.rawMaterialId?.materialCode || 'NVL'} • Khổ: {m.widthCm || 160}cm • GSM: {m.gsm || 200} • Màu: {m.colorSpec || 'Theo mẫu'} • Độ co: &le;{m.shrinkageTolerancePct || 2.5}%
                        </div>
                      </td>
                      <td style={{ padding: '8px', border: '1px solid #CBD5E1', textAlign: 'center' }}>{m.unitSnapshot || 'METER'}</td>
                      <td style={{ padding: '8px', border: '1px solid #CBD5E1', textAlign: 'right', fontWeight: 700 }}>{quantity(m.contractedQty)}</td>
                      <td style={{ padding: '8px', border: '1px solid #CBD5E1', textAlign: 'right' }}>{money(m.unitPrice)}</td>
                      <td style={{ padding: '8px', border: '1px solid #CBD5E1', textAlign: 'right', fontWeight: 700 }}>{money(lineTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ĐIỀU 2 */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: '8px', fontSize: '14px' }}>
              ĐIỀU 2: GIÁ TRỊ HỢP ĐỒNG VÀ PHƯƠNG THỨC THANH TOÁN
            </div>
            <p style={{ margin: '0 0 6px' }}>
              • <strong>Tổng giá trị hợp đồng (đã gồm VAT):</strong> <span style={{ color: '#16A34A', fontWeight: 800, fontSize: '15px' }}>{money(contract.totalContractAmount)}</span>
            </p>
            <p style={{ margin: '0 0 6px' }}>
              • <strong>Tạm ứng đặt cọc:</strong> Bên A thanh toán đặt cọc <strong>{depositPercent}%</strong> tương đương <strong>{money(depositAmount)}</strong> ngay sau khi ký hợp đồng.
            </p>
            <p style={{ margin: '0 0 8px' }}>
              • <strong>Phương thức thanh toán:</strong> {contract.commercialTerms?.paymentMethod === 'BANK_TRANSFER' ? 'Chuyển khoản ngân hàng' : 'Tiền mặt'} (Thời hạn công nợ tối đa: {contract.commercialTerms?.paymentCreditDays ?? 30} ngày).
            </p>

            {paymentSchedule.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, marginBottom: '4px' }}>Lộ trình thanh toán phần tiền hàng còn lại:</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '6px 8px', border: '1px solid #E2E8F0' }}>Đợt</th>
                      <th style={{ padding: '6px 8px', border: '1px solid #E2E8F0' }}>Tiêu đề đợt</th>
                      <th style={{ padding: '6px 8px', border: '1px solid #E2E8F0', textAlign: 'center' }}>Tỷ lệ (%)</th>
                      <th style={{ padding: '6px 8px', border: '1px solid #E2E8F0', textAlign: 'right' }}>Số tiền (VNĐ)</th>
                      <th style={{ padding: '6px 8px', border: '1px solid #E2E8F0', textAlign: 'center' }}>Hạn thanh toán</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentSchedule.map((inst, idx) => (
                      <tr key={idx} style={{ border: '1px solid #E2E8F0' }}>
                        <td style={{ padding: '6px 8px', border: '1px solid #E2E8F0', textAlign: 'center' }}>{inst.installmentNumber || idx + 1}</td>
                        <td style={{ padding: '6px 8px', border: '1px solid #E2E8F0' }}>{inst.installmentTitle || `Thanh toán đợt ${idx + 1}`}</td>
                        <td style={{ padding: '6px 8px', border: '1px solid #E2E8F0', textAlign: 'center', fontWeight: 700 }}>{inst.paymentPercent}%</td>
                        <td style={{ padding: '6px 8px', border: '1px solid #E2E8F0', textAlign: 'right', fontWeight: 700 }}>{money(inst.paymentAmount)}</td>
                        <td style={{ padding: '6px 8px', border: '1px solid #E2E8F0', textAlign: 'center' }}>{datetime(inst.dueDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ĐIỀU 3 */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: '8px', fontSize: '14px' }}>
              ĐIỀU 3: ĐIỀU KIỆN GIAO NHẬN VÀ LỊCH TRÌNH TIẾP NHẬN
            </div>
            <p style={{ margin: '0 0 6px' }}>
              • <strong>Địa điểm giao hàng:</strong> {buyer.receivingWarehouseAddress || 'Kho Tổng Bên A'}.
            </p>
            <p style={{ margin: '0 0 8px' }}>
              • <strong>Thời hạn thực hiện hợp đồng:</strong> Từ ngày <strong>{datetime(contract.effectiveFrom)}</strong> đến hết ngày <strong>{datetime(contract.effectiveTo)}</strong>.
            </p>

            {inboundBatches.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, marginBottom: '4px' }}>Lộ trình phân bổ các đợt tiếp nhận nguyên liệu:</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '6px 8px', border: '1px solid #E2E8F0' }}>Đợt</th>
                      <th style={{ padding: '6px 8px', border: '1px solid #E2E8F0' }}>Mục đích đợt</th>
                      <th style={{ padding: '6px 8px', border: '1px solid #E2E8F0', textAlign: 'center' }}>Tỷ lệ đợt</th>
                      <th style={{ padding: '6px 8px', border: '1px solid #E2E8F0', textAlign: 'center' }}>Ngày hẹn giao</th>
                      <th style={{ padding: '6px 8px', border: '1px solid #E2E8F0' }}>Chi tiết số lượng mặt hàng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inboundBatches.map((b, bIdx) => (
                      <tr key={bIdx} style={{ border: '1px solid #E2E8F0' }}>
                        <td style={{ padding: '6px 8px', border: '1px solid #E2E8F0', textAlign: 'center' }}>Đợt {b.batchNumber || bIdx + 1}</td>
                        <td style={{ padding: '6px 8px', border: '1px solid #E2E8F0' }}>{b.batchTitle || 'Tiếp nhận nguyên vật liệu'}</td>
                        <td style={{ padding: '6px 8px', border: '1px solid #E2E8F0', textAlign: 'center', fontWeight: 700 }}>{b.batchPercentage || (100 / inboundBatches.length).toFixed(1)}%</td>
                        <td style={{ padding: '6px 8px', border: '1px solid #E2E8F0', textAlign: 'center', fontWeight: 600 }}>{datetime(b.scheduledDeliveryDate)}</td>
                        <td style={{ padding: '6px 8px', border: '1px solid #E2E8F0' }}>
                          {(b.expectedItems || []).map((it, itIdx) => (
                            <span key={itIdx} style={{ marginRight: '8px' }}>
                              {it.materialNameSnapshot || 'NVL'}: <strong>{quantity(it.plannedQty)} {it.unitSnapshot || 'M'}</strong>
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ĐIỀU 4 */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: '8px', fontSize: '14px' }}>
              ĐIỀU 4: TIÊU CHUẨN NGHIỆM THU VÀ KIỂM ĐỊNH KCS
            </div>
            <p style={{ margin: 0 }}>
              Áp dụng tiêu chuẩn <strong>{contract.qualityStandards?.inspectionStandard || 'Hệ thống 4 điểm (ASTM D5430 4-Point System) đối với vải cuộn; AQL 2.5 đối với phụ liệu may'}</strong>. Điểm lỗi tối đa cho phép: &le;{contract.qualityStandards?.maxDefectPointsPer100SqYards ?? 20} điểm / 100 yard vuông.
            </p>
          </div>

          {/* ĐIỀU 5 & 6 */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: '8px', fontSize: '14px' }}>
              ĐIỀU 5 & 6: CHẾ TÀI PHẠT VI PHẠM TIẾN ĐỘ & TRÁCH NHIỆM BỒI THƯỜNG
            </div>
            <p style={{ margin: '0 0 6px' }}>
              • Phạt chậm giao hàng: <strong>{contract.latePenaltyPercentPerDay ?? 0.5}% / ngày chậm trễ</strong> (Trần phạt tối đa: {contract.maxPenaltyPercent ?? 8}% tổng giá trị hợp đồng).
            </p>
            <p style={{ margin: 0 }}>
              • Điều khoản phạt: {contract.breachPenaltyClause || 'Bên B cam kết bồi thường 100% thiệt hại nếu giao thiếu, chậm hoặc lỗi chất lượng nguyên phụ liệu so với thỏa thuận.'}
            </p>
          </div>

          {/* ĐIỀU 7 & 8 */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: '8px', fontSize: '14px' }}>
              ĐIỀU 7 & 8: GIẢI QUYẾT TRANH CHẤP VÀ HIỆU LỰC HỢP ĐỒNG
            </div>
            <p style={{ margin: '0 0 6px' }}>
              • Mọi tranh chấp phát sinh được ưu tiên giải quyết qua thương lượng trên cơ sở Biên bản kiểm định KCS thực tế tại kho Bên A. Nếu không đạt được thỏa thuận, vụ việc sẽ được đưa ra Tòa án nhân dân có thẩm quyền để giải quyết.
            </p>
            <p style={{ margin: 0 }}>
              • Hợp đồng được lập thành 02 (hai) bản có giá trị pháp lý như nhau, mỗi bên giữ 01 bản để thực hiện.
            </p>
          </div>

          {/* CHỮ KÝ VÀ CON DẤU */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', textAlign: 'center', marginTop: '36px', paddingTop: '20px', borderTop: '1px dashed #CBD5E1' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '14px', textTransform: 'uppercase' }}>ĐẠI DIỆN BÊN MUA (BÊN A)</div>
              <div style={{ fontSize: '12px', fontStyle: 'italic', color: '#64748B' }}>(Ký, ghi rõ họ tên và đóng dấu)</div>
              <div style={{ height: '75px' }}></div>
              <div style={{ fontWeight: 700, color: '#0F172A' }}>{buyer.representativeName || 'Trần Hoàng Chủ Tịch'}</div>
              <div style={{ fontSize: '12px', color: '#64748B' }}>{buyer.representativeRole || 'Chủ sở hữu / Giám đốc'}</div>
            </div>

            <div>
              <div style={{ fontWeight: 800, fontSize: '14px', textTransform: 'uppercase' }}>ĐẠI DIỆN BÊN BÁN (BÊN B)</div>
              <div style={{ fontSize: '12px', fontStyle: 'italic', color: '#64748B' }}>(Ký, ghi rõ họ tên và đóng dấu)</div>
              <div style={{ height: '75px' }}></div>
              <div style={{ fontWeight: 700, color: '#0F172A' }}>{supplier.representativeName || supplier.contactName || 'Đại diện Bên B'}</div>
              <div style={{ fontSize: '12px', color: '#64748B' }}>{supplier.representativeRole || 'Giám đốc'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

