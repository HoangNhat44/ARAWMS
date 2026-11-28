/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: Lưu bộ lọc và trang vào URL để quay lại danh sách không mất vị trí đang xem.
 */
import { useSearchParams } from 'react-router-dom';
/** Đọc bộ lọc từ URL theo kiểu của giá trị mặc định. Trả về bộ lọc hiện tại và hàm cập nhật để chia sẻ hoặc tải lại đúng trạng thái danh sách. */
export function useOwnerQuery(defaults) {
  const [params, setParams] = useSearchParams();
  const query = Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
    const value = params.get(key);
    if (typeof fallback === 'number') return [key, value && /^[1-9]\d*$/.test(value) ? Number(value) : fallback];
    return [key, value ?? fallback];
  }));
  /** Chấp nhận dữ liệu mới hoặc hàm cập nhật theo bộ lọc hiện tại. Bỏ các giá trị rỗng trước khi ghi query string. */
  const setQuery = (next) => {
    const values = typeof next === 'function' ? next(query) : next;
    setParams(Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '' && value !== undefined && value !== null).map(([key, value]) => [key, String(value)])));
  };
  return [query, setQuery];
}
