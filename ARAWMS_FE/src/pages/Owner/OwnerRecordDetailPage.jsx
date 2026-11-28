/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 30-10-2026 | Chi tiết báo cáo kho (UC-107, UC-108), kế hoạch sản xuất và mẫu sản phẩm. */
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { RecordDetail, recordConfig } from './OwnerRecordsPage';
import OwnerDetailHeading from './OwnerDetailHeading';
import { Notice } from './OwnerUI';
/** Đọc mã bản ghi từ URL rồi dùng chế độ để chọn chi tiết báo cáo kho, sản xuất hoặc mẫu. */
export default function OwnerRecordDetailPage({ mode }) {
  const { id } = useParams(); const config = recordConfig[mode]; const paths = { reports: 'manager-reports', production: 'production', samples: 'samples' };
  const [success, setSuccess] = useState(''); const [busy, setBusy] = useState(false); const [version, setVersion] = useState(0);
  return <><OwnerDetailHeading title={config.title} description="Chi tiết thông tin đã ghi nhận trong hệ thống." backTo={`/owner/${paths[mode]}`} disabled={busy} />
    <Notice success={success} /><RecordDetail key={`${id}-${version}`} resourceName={config.resource} id={id} mode={mode} setBusy={setBusy}
      onDone={(message) => { setSuccess(message); setVersion((value) => value + 1); }} /></>;
}
