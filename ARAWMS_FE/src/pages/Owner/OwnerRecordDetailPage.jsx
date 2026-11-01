/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 30-10-2026 | UC-18/19/20: Trang chi tiết đủ rộng cho báo cáo, BOM và ảnh mẫu. */
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { RecordDetail, recordConfig } from './OwnerRecordsPage';
import OwnerDetailHeading from './OwnerDetailHeading';
import { Notice } from './OwnerUI';
export default function OwnerRecordDetailPage({ mode }) {
  const { id } = useParams(); const config = recordConfig[mode]; const paths = { reports: 'manager-reports', production: 'production', samples: 'samples' };
  const [success, setSuccess] = useState(''); const [busy, setBusy] = useState(false); const [version, setVersion] = useState(0);
  return <><OwnerDetailHeading title={config.title} description="Chi tiết thông tin đã ghi nhận trong hệ thống." backTo={`/owner/${paths[mode]}`} disabled={busy} />
    <Notice success={success} /><RecordDetail key={`${id}-${version}`} resourceName={config.resource} id={id} mode={mode} setBusy={setBusy}
      onDone={(message) => { setSuccess(message); setVersion((value) => value + 1); }} /></>;
}
