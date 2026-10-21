import React, { useState, useEffect } from 'react';
import { User, Phone, Mail, MapPin, Tag, Clock, Edit2, Save, X, Plus } from 'lucide-react';
import { sellerService } from '../../services/sellerService';
import { SkeletonCrmPanel, SkeletonBlock } from '../common/Skeleton';

const CustomerProfilePanel = ({ customer, conversationId, onCustomerUpdated }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    fullAddress: '',
    tagInput: '',
  });
  const [tags, setTags] = useState([]);
  const [interactionHistory, setInteractionHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (customer) {
      setFormData({
        fullName: customer.fullName || '',
        phone: customer.phone || '',
        email: customer.email || '',
        fullAddress: customer.addresses?.[0]?.fullAddress || '',
        tagInput: '',
      });
      setTags(customer.tags || []);
      fetchInteractionHistory(customer._id);
    }
  }, [customer]);

  const fetchInteractionHistory = async (customerId) => {
    if (!customerId) return;
    try {
      setLoadingHistory(true);
      const res = await sellerService.getCustomerInteractionHistory(customerId);
      if (res.success) {
        setInteractionHistory(res.data || []);
      }
    } catch (err) {
      console.warn('Lỗi tải lịch sử tương tác:', err.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleAddTag = (e) => {
    e.preventDefault();
    if (formData.tagInput.trim() && !tags.includes(formData.tagInput.trim())) {
      setTags([...tags, formData.tagInput.trim()]);
      setFormData({ ...formData, tagInput: '' });
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!customer?._id) return;

    try {
      setSaving(true);
      setMessage('');

      const updatePayload = {
        fullName: formData.fullName,
        phone: formData.phone,
        email: formData.email,
        tags,
        addresses: formData.fullAddress
          ? [
              {
                recipientName: formData.fullName,
                phone: formData.phone,
                fullAddress: formData.fullAddress,
                isDefault: true,
              },
            ]
          : [],
      };

      const res = await sellerService.updateCustomer(customer._id, updatePayload);
      if (res.success) {
        setMessage('Cập nhật hồ sơ khách hàng thành công!');
        setIsEditing(false);
        if (onCustomerUpdated) onCustomerUpdated(res.data);
      }
    } catch (err) {
      setMessage(`Lỗi: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!customer) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center h-100 p-4 text-muted text-center" style={{ fontSize: '0.85rem' }}>
        <User size={36} className="mb-2" style={{ color: 'var(--ara-gold)', opacity: 0.5 }} />
        <div>Chưa có thông tin khách hàng được chọn</div>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column h-100">
      {/* Customer Header Card */}
      <div
        className="p-3 mb-3 rounded"
        style={{
          background: 'linear-gradient(135deg, #FAF7F2 0%, #F4EFEB 100%)',
          border: '1px solid var(--ara-border, #E3D9CD)',
        }}
      >
        <div className="d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <div className="ara-avatar" style={{ width: '40px', height: '40px', fontSize: '0.9rem' }}>
              {customer.fullName ? customer.fullName.charAt(0).toUpperCase() : 'K'}
            </div>
            <div>
              <div className="fw-bold text-dark" style={{ fontSize: '0.92rem' }}>
                {customer.fullName}
              </div>
              <div className="d-flex align-items-center gap-1">
                <span className="badge-ara-gold">{customer.customerCode || 'CHƯA_CÓ_MÃ'}</span>
                {customer.facebookPsid && (
                  <span className="badge-ara-info">Facebook Linked</span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className="btn btn-sm btn-outline-secondary p-1"
            title={isEditing ? 'Hủy sửa' : 'Chỉnh sửa hồ sơ'}
          >
            {isEditing ? <X size={15} /> : <Edit2 size={15} />}
          </button>
        </div>

        {/* Quick Customer Metrics */}
        <div className="row g-2 mt-2 text-center" style={{ fontSize: '0.78rem' }}>
          <div className="col-6">
            <div className="p-2 bg-white rounded border">
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>Tổng đơn hàng</div>
              <div className="fw-bold text-dark">{customer.totalOrders || 0} đơn</div>
            </div>
          </div>
          <div className="col-6">
            <div className="p-2 bg-white rounded border">
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>Tổng chi tiêu</div>
              <div className="fw-bold" style={{ color: 'var(--ara-gold-hover, #846B50)' }}>
                {(customer.totalSpent || 0).toLocaleString('vi-VN')} đ
              </div>
            </div>
          </div>
        </div>
      </div>

      {message && (
        <div className={`alert ${message.startsWith('Lỗi') ? 'alert-danger' : 'alert-success'} py-2 px-3 small text-center mb-3`}>
          {message}
        </div>
      )}

      {/* Profile Form / View */}
      <div className="flex-grow-1 overflow-auto">
        {isEditing ? (
          <form onSubmit={handleSave} className="d-flex flex-column gap-2" style={{ fontSize: '0.82rem' }}>
            <div>
              <label className="form-label text-muted small fw-semibold mb-1">Họ và tên</label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="form-control form-control-sm"
                required
              />
            </div>

            <div>
              <label className="form-label text-muted small fw-semibold mb-1">Số điện thoại</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="form-control form-control-sm"
              />
            </div>

            <div>
              <label className="form-label text-muted small fw-semibold mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="form-control form-control-sm"
              />
            </div>

            <div>
              <label className="form-label text-muted small fw-semibold mb-1">Địa chỉ nhận hàng</label>
              <textarea
                rows={2}
                value={formData.fullAddress}
                onChange={(e) => setFormData({ ...formData, fullAddress: e.target.value })}
                className="form-control form-control-sm"
              />
            </div>

            <div>
              <label className="form-label text-muted small fw-semibold mb-1">Thẻ phân loại (Tags)</label>
              <div className="input-group input-group-sm mb-2">
                <input
                  type="text"
                  placeholder="Thêm tag..."
                  value={formData.tagInput}
                  onChange={(e) => setFormData({ ...formData, tagInput: e.target.value })}
                  className="form-control"
                />
                <button type="button" onClick={handleAddTag} className="btn btn-outline-secondary">
                  <Plus size={14} />
                </button>
              </div>
              <div className="d-flex flex-wrap gap-1">
                {tags.map((t) => (
                  <span key={t} className="badge-ara-gold d-inline-flex align-items-center gap-1">
                    {t}
                    <button type="button" onClick={() => handleRemoveTag(t)} className="btn-close btn-close-white p-0" style={{ width: '8px', height: '8px' }} />
                  </span>
                ))}
              </div>
            </div>

            <div className="d-flex justify-content-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="btn btn-sm btn-outline-secondary"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-ara-primary"
                style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
              >
                <Save size={13} /> {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        ) : (
          <div className="d-flex flex-column gap-3" style={{ fontSize: '0.82rem' }}>
            <div className="d-flex align-items-start gap-2">
              <Phone size={15} color="var(--ara-gold)" className="flex-shrink-0 mt-1" />
              <div>
                <span className="text-muted d-block small" style={{ fontSize: '0.72rem' }}>Số điện thoại</span>
                <span className="fw-semibold text-dark">{customer.phone || 'Chưa cập nhật'}</span>
              </div>
            </div>

            <div className="d-flex align-items-start gap-2">
              <Mail size={15} color="var(--ara-gold)" className="flex-shrink-0 mt-1" />
              <div>
                <span className="text-muted d-block small" style={{ fontSize: '0.72rem' }}>Email</span>
                <span className="fw-semibold text-dark">{customer.email || 'Chưa cập nhật'}</span>
              </div>
            </div>

            <div className="d-flex align-items-start gap-2">
              <MapPin size={15} color="var(--ara-gold)" className="flex-shrink-0 mt-1" />
              <div>
                <span className="text-muted d-block small" style={{ fontSize: '0.72rem' }}>Địa chỉ giao hàng</span>
                <span className="fw-semibold text-dark">
                  {customer.addresses?.[0]?.fullAddress || 'Chưa cập nhật'}
                </span>
              </div>
            </div>

            <div className="d-flex align-items-start gap-2">
              <Tag size={15} color="var(--ara-gold)" className="flex-shrink-0 mt-1" />
              <div className="flex-grow-1">
                <span className="text-muted d-block small" style={{ fontSize: '0.72rem' }}>Thẻ phân loại</span>
                <div className="d-flex flex-wrap gap-1 mt-1">
                  {customer.tags && customer.tags.length > 0 ? (
                    customer.tags.map((t) => (
                      <span key={t} className="badge-ara-gold">
                        {t}
                      </span>
                    ))
                  ) : (
                    <span className="text-muted fst-italic small">Chưa gắn thẻ</span>
                  )}
                </div>
              </div>
            </div>

            {/* UC-75: Lịch sử tương tác */}
            <div className="pt-3 border-top mt-2">
              <div className="d-flex align-items-center gap-1 fw-bold text-dark mb-2" style={{ fontSize: '0.82rem' }}>
                <Clock size={14} color="var(--ara-gold)" />
                <span>Lịch sử tương tác (UC-75)</span>
              </div>

              {loadingHistory ? (
                <div className="d-flex flex-column gap-2">
                  <SkeletonBlock height="52px" borderRadius="8px" />
                  <SkeletonBlock height="52px" borderRadius="8px" />
                </div>
              ) : interactionHistory.length === 0 ? (
                <div className="text-muted fst-italic small">Chưa có phiên chat trước đây</div>
              ) : (
                <div className="d-flex flex-column gap-2" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                  {interactionHistory.map((h) => (
                    <div key={h.conversationId} className="p-2 bg-light rounded border" style={{ fontSize: '0.75rem' }}>
                      <div className="d-flex justify-content-between text-muted" style={{ fontSize: '0.68rem' }}>
                        <span>Trực bởi: <strong>{h.assignedSeller?.fullName || 'Hệ thống'}</strong></span>
                        <span>{new Date(h.lastMessageAt || h.createdAt).toLocaleDateString('vi-VN')}</span>
                      </div>
                      <div className="text-dark mt-1 fst-italic text-truncate">
                        "{h.lastMessagePreview || 'Không có tin nhắn'}"
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerProfilePanel;
