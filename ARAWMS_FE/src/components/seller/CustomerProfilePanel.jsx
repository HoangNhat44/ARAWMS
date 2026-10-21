import React, { useState, useEffect } from 'react';
import { User, Phone, Mail, MapPin, Tag, Clock, Edit2, Save, X, Plus } from 'lucide-react';
import { sellerService } from '../../services/sellerService';

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
      <div className="flex flex-col items-center justify-center h-full p-6 text-gray-400 text-sm text-center">
        <User size={36} className="mb-2 text-gray-300" />
        Chưa có thông tin khách hàng được chọn
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto">
      {/* Header Info */}
      <div className="p-4 bg-gradient-to-r from-indigo-50/70 to-blue-50/70 border-b border-indigo-100/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              {customer.fullName ? customer.fullName.charAt(0).toUpperCase() : 'K'}
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">{customer.fullName}</h3>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 font-mono">
                <span className="bg-white px-2 py-0.5 rounded border border-indigo-200 text-indigo-700 font-semibold">
                  {customer.customerCode || 'CHƯA_CÓ_MÃ'}
                </span>
                {customer.facebookPsid && (
                  <span className="text-[11px] text-blue-600 font-sans">Facebook Linked</span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-white rounded-lg border border-gray-200 transition"
          >
            {isEditing ? <X size={16} /> : <Edit2 size={16} />}
          </button>
        </div>

        {/* Quick metrics */}
        <div className="grid grid-cols-2 gap-2 mt-3 text-center">
          <div className="bg-white p-2 rounded-lg border border-indigo-100 shadow-2xs">
            <div className="text-[11px] text-gray-400 font-medium">Tổng đơn hàng</div>
            <div className="text-sm font-bold text-gray-800">{customer.totalOrders || 0} đơn</div>
          </div>
          <div className="bg-white p-2 rounded-lg border border-indigo-100 shadow-2xs">
            <div className="text-[11px] text-gray-400 font-medium">Tổng chi tiêu</div>
            <div className="text-sm font-bold text-indigo-600">
              {(customer.totalSpent || 0).toLocaleString('vi-VN')} đ
            </div>
          </div>
        </div>
      </div>

      {message && (
        <div className={`p-2.5 text-xs text-center ${message.startsWith('Lỗi') ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
          {message}
        </div>
      )}

      {/* Profile Form / View */}
      <div className="p-4 space-y-4">
        {isEditing ? (
          <form onSubmit={handleSave} className="space-y-3 text-xs">
            <div>
              <label className="block text-gray-600 font-semibold mb-1">Họ và tên</label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-gray-600 font-semibold mb-1">Số điện thoại</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-600 font-semibold mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-600 font-semibold mb-1">Địa chỉ giao hàng mặc định</label>
              <textarea
                rows={2}
                value={formData.fullAddress}
                onChange={(e) => setFormData({ ...formData, fullAddress: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-600 font-semibold mb-1">Thẻ phân loại (Tags)</label>
              <div className="flex gap-1.5 mb-2">
                <input
                  type="text"
                  placeholder="Thêm tag..."
                  value={formData.tagInput}
                  onChange={(e) => setFormData({ ...formData, tagInput: e.target.value })}
                  className="flex-1 px-2.5 py-1.5 border rounded-lg focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium"
                >
                  <Plus size={14} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-xs"
                  >
                    {t}
                    <button type="button" onClick={() => handleRemoveTag(t)}>
                      <X size={11} className="hover:text-red-500" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1 px-4 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50"
              >
                <Save size={13} /> {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3 text-xs text-gray-700">
            <div className="flex items-start gap-2.5">
              <Phone size={15} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-gray-400 block text-[11px]">Số điện thoại</span>
                <span className="font-medium text-gray-900">{customer.phone || 'Chưa cập nhật'}</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Mail size={15} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-gray-400 block text-[11px]">Email</span>
                <span className="font-medium text-gray-900">{customer.email || 'Chưa cập nhật'}</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <MapPin size={15} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-gray-400 block text-[11px]">Địa chỉ giao hàng</span>
                <span className="font-medium text-gray-900">
                  {customer.addresses?.[0]?.fullAddress || 'Chưa cập nhật'}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Tag size={15} className="text-gray-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <span className="text-gray-400 block text-[11px] mb-1">Thẻ phân loại</span>
                <div className="flex flex-wrap gap-1">
                  {customer.tags && customer.tags.length > 0 ? (
                    customer.tags.map((t) => (
                      <span
                        key={t}
                        className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-[11px]"
                      >
                        {t}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-400 italic">Chưa gắn thẻ</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* UC-75: Lịch sử tương tác */}
        <div className="pt-4 border-t border-gray-100">
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800 mb-2.5">
            <Clock size={14} className="text-indigo-600" />
            Lịch sử tương tác (UC-75)
          </div>

          {loadingHistory ? (
            <div className="text-xs text-gray-400 text-center py-2">Đang tải lịch sử...</div>
          ) : interactionHistory.length === 0 ? (
            <div className="text-xs text-gray-400 italic">Chưa có phiên chat trước đây</div>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {interactionHistory.map((h) => (
                <div key={h.conversationId} className="p-2 bg-gray-50 rounded-lg text-xs border border-gray-100">
                  <div className="flex justify-between text-[11px] text-gray-400">
                    <span>Trực bởi: <strong>{h.assignedSeller?.fullName || 'Hệ thống'}</strong></span>
                    <span>{new Date(h.lastMessageAt || h.createdAt).toLocaleDateString('vi-VN')}</span>
                  </div>
                  <div className="text-gray-700 mt-1 line-clamp-1 italic">
                    "{h.lastMessagePreview || 'Không có tin nhắn'}"
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerProfilePanel;
