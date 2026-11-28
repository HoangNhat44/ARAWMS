/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 30-10-2026 | UC-075: Chi tiết và phê duyệt báo cáo kiểm kê. */
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import OwnerDetailHeading from './OwnerDetailHeading';
import { StocktakeDetail } from './StockAdjustmentPage';
import { Notice } from './OwnerUI';
/** Đọc mã phiên từ URL. Sau khi duyệt, tải lại chi tiết của chính phiên đó để hiển thị trạng thái mới. */
export default function StockAdjustmentDetailPage() {
  const { id } = useParams(); const [success, setSuccess] = useState(''); const [version, setVersion] = useState(0); const [busy, setBusy] = useState(false);
  return <><OwnerDetailHeading title="Báo cáo chênh lệch kiểm kê" description="Đối chiếu số hệ thống và thực đếm trước khi xác nhận quyết định." backTo="/owner/stock-adjustments" disabled={busy} />
    <Notice success={success} /><StocktakeDetail key={`${id}-${version}`} id={id} setBusy={setBusy} onDone={(message) => { setSuccess(message); setVersion((value) => value + 1); }} /></>;
}
