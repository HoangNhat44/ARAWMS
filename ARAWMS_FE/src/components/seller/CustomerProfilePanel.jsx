/**
 * ============================================================================
 * @title        : Customer Profile Panel (CRM, UC-75)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-28
 * @description  : Xem / chỉnh sửa hồ sơ khách hàng, thẻ phân loại và lịch sử tương tác.
 *                 (Refactor 2026-10-28: giao diện chỉ dùng Bootstrap / React-Bootstrap.)
 * @module       : Conversational Commerce / CRM
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { Card, Form, InputGroup, Button, Badge, Alert, Row, Col, ListGroup, CloseButton, Stack } from 'react-bootstrap';
import { sellerService } from '../../services/sellerService';
import { SkeletonBlock } from '../common/Skeleton';
import { Icon, Avatar, EmptyState, formatVnd } from './SellerUi';

/** Một dòng thông tin dạng icon + nhãn + giá trị (chế độ xem). */
const InfoRow = ({ icon, label, children }) => (
  <div className="d-flex align-items-start gap-2">
    <Icon name={icon} className="text-warning-emphasis mt-1" />
    <div className="flex-grow-1">
      <div className="text-secondary small">{label}</div>
      <div className="fw-semibold">{children}</div>
    </div>
  </div>
);

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
      const custId = customer._id || customer.id;
      if (custId) fetchInteractionHistory(custId);
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
        conversationId,
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

      const custId = customer?._id || customer?.id;
      const res = await sellerService.updateCustomer(custId, updatePayload);
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
    return <EmptyState icon="person" title="Chưa có thông tin khách hàng được chọn" />;
  }

  const setField = (key) => (e) => setFormData({ ...formData, [key]: e.target.value });

  return (
    <div className="d-flex flex-column h-100 small">
      {/* Customer Header Card */}
      <Card className="mb-3 bg-body-tertiary">
        <Card.Body>
          <div className="d-flex align-items-center justify-content-between">
            <Stack direction="horizontal" gap={2}>
              <Avatar name={customer.fullName} size={40} />
              <div>
                <div className="fw-bold">{customer.fullName}</div>
                <Stack direction="horizontal" gap={1}>
                  <Badge bg="warning-subtle" text="warning-emphasis">{customer.customerCode || 'CHƯA_CÓ_MÃ'}</Badge>
                  {customer.facebookPsid && <Badge bg="primary-subtle" text="primary-emphasis">Facebook Linked</Badge>}
                </Stack>
              </div>
            </Stack>
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={() => setIsEditing(!isEditing)}
              title={isEditing ? 'Hủy sửa' : 'Chỉnh sửa hồ sơ'}
            >
              <Icon name={isEditing ? 'x-lg' : 'pencil'} />
            </Button>
          </div>

          {/* Quick Customer Metrics */}
          <Row className="g-2 mt-2 text-center">
            <Col xs={6}>
              <Card body className="py-0">
                <div className="text-secondary">Tổng đơn hàng</div>
                <div className="fw-bold">{customer.totalOrders || 0} đơn</div>
              </Card>
            </Col>
            <Col xs={6}>
              <Card body className="py-0">
                <div className="text-secondary">Tổng chi tiêu</div>
                <div className="fw-bold text-warning-emphasis">{formatVnd(customer.totalSpent)}</div>
              </Card>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {message && (
        <Alert variant={message.startsWith('Lỗi') ? 'danger' : 'success'} className="py-2 text-center">
          {message}
        </Alert>
      )}

      {/* Profile Form / View */}
      <div className="flex-grow-1 overflow-auto">
        {isEditing ? (
          <Form onSubmit={handleSave} className="d-flex flex-column gap-2">
            <Form.Group controlId="crm-fullName">
              <Form.Label className="small text-secondary mb-1">Họ và tên</Form.Label>
              <Form.Control size="sm" value={formData.fullName} onChange={setField('fullName')} required />
            </Form.Group>

            <Form.Group controlId="crm-phone">
              <Form.Label className="small text-secondary mb-1">Số điện thoại</Form.Label>
              <Form.Control size="sm" value={formData.phone} onChange={setField('phone')} />
            </Form.Group>

            <Form.Group controlId="crm-email">
              <Form.Label className="small text-secondary mb-1">Email</Form.Label>
              <Form.Control size="sm" type="email" value={formData.email} onChange={setField('email')} />
            </Form.Group>

            <Form.Group controlId="crm-address">
              <Form.Label className="small text-secondary mb-1">Địa chỉ nhận hàng</Form.Label>
              <Form.Control size="sm" as="textarea" rows={2} value={formData.fullAddress} onChange={setField('fullAddress')} />
            </Form.Group>

            <Form.Group controlId="crm-tag">
              <Form.Label className="small text-secondary mb-1">Thẻ phân loại (Tags)</Form.Label>
              <InputGroup size="sm" className="mb-2">
                <Form.Control placeholder="Thêm tag..." value={formData.tagInput} onChange={setField('tagInput')} />
                <Button variant="outline-secondary" onClick={handleAddTag}><Icon name="plus-lg" /></Button>
              </InputGroup>
              <div className="d-flex flex-wrap gap-1">
                {tags.map((t) => (
                  <Badge key={t} bg="warning-subtle" text="warning-emphasis" className="d-inline-flex align-items-center gap-1">
                    {t}
                    <CloseButton style={{ fontSize: '0.5rem' }} onClick={() => handleRemoveTag(t)} aria-label={`Xóa thẻ ${t}`} />
                  </Badge>
                ))}
              </div>
            </Form.Group>

            <div className="d-flex justify-content-end gap-2 pt-2">
              <Button size="sm" variant="outline-secondary" onClick={() => setIsEditing(false)}>Hủy</Button>
              <Button size="sm" variant="dark" type="submit" disabled={saving}>
                <Icon name="save" className="me-1" />{saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </Button>
            </div>
          </Form>
        ) : (
          <Stack gap={3}>
            <InfoRow icon="telephone" label="Số điện thoại">{customer.phone || 'Chưa cập nhật'}</InfoRow>
            <InfoRow icon="envelope" label="Email">{customer.email || 'Chưa cập nhật'}</InfoRow>
            <InfoRow icon="geo-alt" label="Địa chỉ giao hàng">
              {customer.addresses?.[0]?.fullAddress || 'Chưa cập nhật'}
            </InfoRow>
            <InfoRow icon="tag" label="Thẻ phân loại">
              <div className="d-flex flex-wrap gap-1 mt-1">
                {customer.tags && customer.tags.length > 0 ? (
                  customer.tags.map((t) => (
                    <Badge key={t} bg="warning-subtle" text="warning-emphasis">{t}</Badge>
                  ))
                ) : (
                  <span className="text-secondary fst-italic fw-normal">Chưa gắn thẻ</span>
                )}
              </div>
            </InfoRow>

            {/* UC-75: Lịch sử tương tác */}
            <div className="pt-3 border-top">
              <div className="d-flex align-items-center gap-1 fw-bold mb-2">
                <Icon name="clock-history" className="text-warning-emphasis" />
                Lịch sử tương tác (UC-75)
              </div>

              {loadingHistory ? (
                <Stack gap={2}>
                  <SkeletonBlock height="52px" borderRadius="8px" />
                  <SkeletonBlock height="52px" borderRadius="8px" />
                </Stack>
              ) : interactionHistory.length === 0 ? (
                <div className="text-secondary fst-italic">Chưa có phiên chat trước đây</div>
              ) : (
                <ListGroup className="overflow-auto" style={{ maxHeight: 180 }}>
                  {interactionHistory.map((h) => (
                    <ListGroup.Item key={h.conversationId} className="bg-body-tertiary">
                      <div className="d-flex justify-content-between text-secondary small">
                        <span>Trực bởi: <strong>{h.assignedSeller?.fullName || 'Hệ thống'}</strong></span>
                        <span>{new Date(h.lastMessageAt || h.createdAt).toLocaleDateString('vi-VN')}</span>
                      </div>
                      <div className="mt-1 fst-italic text-truncate">
                        "{h.lastMessagePreview || 'Không có tin nhắn'}"
                      </div>
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              )}
            </div>
          </Stack>
        )}
      </div>
    </div>
  );
};

export default CustomerProfilePanel;
