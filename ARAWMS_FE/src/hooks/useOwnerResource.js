/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-06 đến UC-20 - Tải dữ liệu, hủy yêu cầu cũ và ngăn hiển thị kết quả lỗi thời.
 */
import { useState, useEffect, useCallback } from 'react';
import { ownerService } from '../services/ownerService';
export function useOwnerResource(resource, params = {}) {
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [revision, setRevision] = useState(0);
  // Chỉ tải lại khi giá trị bộ lọc thực sự đổi, không phụ thuộc object mới tạo ở mỗi lần render.
  const query = JSON.stringify(params);
  // Sau thao tác thành công, tăng số lần tải để lấy trạng thái mới từ BE.
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    // Xóa dữ liệu cũ và tạo cờ hủy riêng cho mỗi lần tải.
    const abort = new AbortController(); setLoading(true); setError(''); setData(null);
    // Chỉ nhận kết quả của yêu cầu còn hiệu lực; tránh kết quả cũ ghi đè bộ lọc mới.
    ownerService.list(resource, JSON.parse(query), abort.signal).then((response) => {
      if (!abort.signal.aborted) setData(response.data);
    }).catch((err) => { if (!abort.signal.aborted) setError(err.message); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    // Rời trang hoặc đổi bộ lọc thì hủy yêu cầu đang chờ.
    return () => abort.abort();
  }, [resource, query, revision]);
  return { data, loading, error, reload };
}
