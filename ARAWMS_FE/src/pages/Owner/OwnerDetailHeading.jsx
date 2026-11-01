/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: Tiêu đề trang chi tiết và quay lại đúng danh sách/bộ lọc trước đó.
 */
import { useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { WmsLinkButton } from '../../components/ui/WmsControls';
export default function OwnerDetailHeading({ title, description, backTo, disabled = false }) {
  const location = useLocation(); const previous = location.state?.from;
  const destination = typeof previous === 'string' && previous.startsWith('/owner/') ? previous : backTo;
  return <header className="owner-detail-heading"><WmsLinkButton to={destination} disabled={disabled} aria-label="Quay lại danh sách" icon={<ArrowLeft size={18} />} />
    <div><h1>{title}</h1>{description && <p>{description}</p>}</div></header>;
}
