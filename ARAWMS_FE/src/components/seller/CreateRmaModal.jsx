import React, { useState } from 'react';
import { Modal } from 'react-bootstrap';
import { RotateCcw, CheckCircle2, AlertCircle } from 'lucide-react';
import { sellerService } from '../../services/sellerService';

const CreateRmaModal = ({ isOpen, onClose, order, onRmaCreated }) => {
  const [returnType, setReturnType] = useState('RETURN_FOR_REFUND');
  const [returnWaybillCode, setReturnWaybillCode] = useState('');
  const [reasonDescription, setReasonDescription] = useState('');
  const [selectedItems, setSelectedItems] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successRma, setSuccessRma] = useState(null);

  if (!isOpen || !order) return null;

  const handleQtyChange = (skuId, val) => {
    setSelectedItems({
      ...selectedItems,
      [skuId]: Math.max(0, Number(val)),
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const returnItems = [];
    for (const item of order.items || []) {
      const qty = selectedItems[item.skuId] || 0;
      if (qty > 0) {
        returnItems.push({
          skuId: item.skuId,
          skuBarcode: item.skuBarcode,
          returnedQty: qty,
          condition: 'GOOD_INTACT',
          disposition: 'RESTOCK_SALEABLE',
        });
      }
    }

    if (returnItems.length === 0) {
      setError('Vui lòng chọn số lượng ít nhất một sản phẩm cần hoàn/đổi');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const res = await sellerService.createReturnRequest({
        originalOrderId: order._id,
        returnType,
        returnWaybillCode,
        reasonDescription,
        returnItems,
      });

      if (res.success) {
        setSuccessRma(res.data);
        if (onRmaCreated) onRmaCreated(res.data);
      }
    } catch (err) {
      setError(err.message || 'Lỗi khi tạo yêu cầu RMA');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      show={isOpen}
      onHide={onClose}
      centered
      size="lg"
      contentClassName="ara-modal"
    >
      <Modal.Header closeButton className="ara-modal-header-rma">
        <Modal.Title className="d-flex align-items-center gap-2" style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem' }}>
          <RotateCcw size={22} color="#FCDFA6" />
          <span>Tạo Yêu Cầu Đổi / Trả Hàng (UC-82 RMA)</span>
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className="p-4" style={{ backgroundColor: '#FAF7F2' }}>
        {error && <div className="alert alert-danger py-2 px-3 small mb-3">{error}</div>}

        {successRma ? (
          <div className="text-center py-4">
            <CheckCircle2 size={54} color="var(--ara-success, #2E7D59)" className="mb-3" />
            <h4 className="fw-bold text-dark" style={{ fontFamily: 'var(--font-serif)' }}>
              Đã Tạo Phiếu RMA Thành Công!
            </h4>
            <p className="text-secondary small">
              Mã RMA: <strong className="font-monospace text-dark fs-6">{successRma.rmaCode}</strong>
            </p>
            <div className="p-3 bg-light border rounded text-start mb-4 small">
              <div className="fw-bold text-dark d-flex align-items-center gap-1 mb-1">
                <AlertCircle size={15} color="var(--ara-gold)" />
                Lưu ý quy trình hoàn trả:
              </div>
              <div className="text-muted">
                Phiếu RMA đang ở trạng thái <strong>REQUESTED</strong>. Nhân viên kho sẽ quét mã vận đơn hoàn và kiểm đếm trước khi tái nhập kho hoàn tất.
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn-ara-primary px-4 py-2"
            >
              <span>Đóng cửa sổ</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="d-flex flex-column gap-3" style={{ fontSize: '0.82rem' }}>
            {/* Original Order Info */}
            <div className="p-3 bg-white rounded border" style={{ borderColor: 'var(--ara-border)' }}>
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="text-muted small">Đơn hàng gốc:</span>
                <span className="font-monospace fw-bold text-dark">{order.orderCode}</span>
              </div>
              <div className="d-flex justify-content-between align-items-center">
                <span className="text-muted small">Người nhận:</span>
                <span className="fw-semibold text-dark">{order.shippingRecipient?.name} ({order.shippingRecipient?.phone})</span>
              </div>
            </div>

            {/* Return Type Selection */}
            <div className="p-3 bg-white rounded border" style={{ borderColor: 'var(--ara-border)' }}>
              <label className="fw-bold text-dark d-block mb-2">Loại yêu cầu</label>
              <div className="d-flex gap-2">
                <button
                  type="button"
                  onClick={() => setReturnType('RETURN_FOR_REFUND')}
                  className={`btn btn-sm flex-fill py-2 ${
                    returnType === 'RETURN_FOR_REFUND' ? 'btn-dark' : 'btn-outline-secondary'
                  }`}
                  style={{ borderRadius: 'var(--radius-sm, 6px)' }}
                >
                  Trả Hàng Hoàn Tiền
                </button>
                <button
                  type="button"
                  onClick={() => setReturnType('EXCHANGE_PRODUCT')}
                  className={`btn btn-sm flex-fill py-2 ${
                    returnType === 'EXCHANGE_PRODUCT' ? 'btn-dark' : 'btn-outline-secondary'
                  }`}
                  style={{ borderRadius: 'var(--radius-sm, 6px)' }}
                >
                  Đổi Sản Phẩm Khác
                </button>
              </div>
            </div>

            {/* Select Return Items */}
            <div className="p-3 bg-white rounded border" style={{ borderColor: 'var(--ara-border)' }}>
              <div className="fw-bold text-dark mb-2">Chọn sản phẩm cần đổi/trả</div>
              <div className="d-flex flex-column gap-2" style={{ maxHeight: '160px', overflowY: 'auto' }}>
                {order.items?.map((it, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-light rounded border d-flex align-items-center justify-content-between gap-2"
                  >
                    <div>
                      <div className="fw-bold text-dark">{it.skuCode}</div>
                      <div className="text-muted small">
                        Đã mua: <strong>{it.orderedQty}</strong> cái | Đơn giá: {(it.unitSalePrice || 0).toLocaleString('vi-VN')} đ
                      </div>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <span className="text-muted small">Số lượng hoàn:</span>
                      <input
                        type="number"
                        min="0"
                        max={it.orderedQty}
                        value={selectedItems[it.skuId] || 0}
                        onChange={(e) => handleQtyChange(it.skuId, e.target.value)}
                        className="form-control form-control-sm text-center"
                        style={{ width: '64px' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Reason & Waybill */}
            <div className="p-3 bg-white rounded border" style={{ borderColor: 'var(--ara-border)' }}>
              <div className="mb-2">
                <label className="fw-bold text-dark small mb-1">Mã vận đơn chiều gửi về (Return Waybill Code)</label>
                <input
                  type="text"
                  placeholder="VD: GHN-RETURN-102938..."
                  value={returnWaybillCode}
                  onChange={(e) => setReturnWaybillCode(e.target.value)}
                  className="form-control form-control-sm"
                />
              </div>

              <div>
                <label className="fw-bold text-dark small mb-1">Lý do đổi trả của khách hàng</label>
                <textarea
                  rows={2}
                  placeholder="VD: Khách mặc không vừa size L, muốn đổi sang size XL hoặc áo bị sút chỉ..."
                  value={reasonDescription}
                  onChange={(e) => setReasonDescription(e.target.value)}
                  className="form-control form-control-sm"
                  required
                />
              </div>
            </div>

            <div className="d-flex justify-content-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-sm btn-outline-secondary px-3"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn-ara-primary px-4 py-2"
              >
                <span>{loading ? 'Đang tạo...' : 'Tạo Phiếu RMA'}</span>
              </button>
            </div>
          </form>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default CreateRmaModal;
