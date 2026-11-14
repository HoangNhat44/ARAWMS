/*
 * Nguyễn Ngọc Huy - HE171157
 * Ngày: 14-11-2026
 * Giao diện theo dõi đơn hàng, hàng hoàn và khách hàng mới của chủ cửa hàng.
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import { WmsField, WmsSelect } from '../../components/ui/WmsControls';
import { Columns, SeriesPlot } from './OwnerCharts';
import { datetime, Metric, quantity, ResourceState, Table } from './OwnerUI';

export const channelLabels = {
  FACEBOOK: 'Facebook', SHOPEE: 'Shopee', TIKTOK: 'TikTok', UNKNOWN: 'Chưa rõ nguồn bán',
};
const reasonLabels = {
  CUSTOMER_REFUSED: 'Khách không nhận hàng', INVALID_ORDER: 'Đơn hàng không hợp lệ',
  PRODUCT_DEFECT: 'Sản phẩm bị lỗi', OTHER: 'Lý do khác', UNKNOWN: 'Chưa rõ lý do',
};
const orderLabels = {
  PENDING: 'Chờ xác nhận', CONFIRMED_RESERVED: 'Đã giữ hàng', PICKING: 'Đang lấy hàng',
  PACKED: 'Đã đóng gói', HANDED_OVER_CARRIER: 'Đang giao hàng', DELIVERED: 'Đã giao thành công',
  COMPLETED: 'Hoàn thành', CANCELLED: 'Đã hủy', RETURN_REQUESTED: 'Đang xử lý hoàn hàng',
  EXCHANGE_REQUESTED: 'Đang xử lý đổi hàng', RETURNED: 'Đã ghi nhận hàng hoàn',
};
const stepLabels = {
  WAIT_INSPECTION: 'Chờ kiểm hàng', WAIT_RESTOCK: 'Chờ nhập lại kho',
  FAILED_INSPECTION: 'Hàng kiểm không đạt', RESTOCKED: 'Đã nhập lại kho',
};
const percentage = value => value === null ? 'Chưa có đơn giao vận chuyển' : `${quantity(value)}%`;
const rateSeries = [{ key: 'turnbackRate', label: 'Tỷ lệ quay đầu' }, { key: 'refusalRate', label: 'Tỷ lệ bom hàng đã xác định' }];

// Chỉ tải bộ số liệu mẫu khi Owner chọn trình diễn. Bộ lọc Tổng quan tiếp tục
// áp dụng cho báo cáo thật; biểu đồ mẫu có khoảng tháng cố định.
function DemoTrend({ threshold }) {
  const resource = useOwnerResource('operations-report/return-trend-demo');
  return <ResourceState resource={resource}>{resource.data &&
    <>
      <ReturnTrendChart points={resource.data} threshold={threshold} demo />
      {resource.data.length > 0 && <section>
        <h3>Hàng hoàn xử lý trễ</h3>
        <SeriesPlot rows={resource.data} title="Hàng hoàn xử lý trễ" categoryLabel="Tháng" unitLabel="đơn hàng"
          series={[{ key: 'lateInspection', label: 'Chờ kiểm hàng quá hạn' }, { key: 'lateRestock', label: 'Chờ nhập kho quá hạn' }]} />
      </section>}
    </>
  }</ResourceState>;
}

function ReturnTrendChart({ points, threshold, demo = false }) {
  const periodsWithShipments = points.filter(point => point.shipped > 0);
  if (!periodsWithShipments.length) return <p>{demo ? 'Chưa nạp dữ liệu trình diễn.' : 'Chưa có đơn bàn giao vận chuyển trong khoảng ngày đã chọn.'}</p>;

  // Nếu chỉ có một mốc hoặc có khoảng trống rời nhau, cột đọc dễ hơn một
  // đường gồm toàn điểm rời. Giữ các mốc trống giữa những kỳ có dữ liệu.
  const hasAdjacentPeriods = points.some((point, index) => point.shipped > 0 && points[index + 1]?.shipped > 0);
  const first = points.indexOf(periodsWithShipments[0]);
  const last = points.indexOf(periodsWithShipments.at(-1));
  const rows = points.slice(first, last + 1);
  const chartKind = hasAdjacentPeriods ? 'line' : 'column';
  return <>
    <SeriesPlot rows={rows} kind={chartKind} title="Tỷ lệ theo thời gian bàn giao vận chuyển"
      categoryLabel="Kỳ bàn giao vận chuyển" unitLabel="phần trăm" valueSuffix="%" reference={threshold} series={rateSeries} />
    <details open={demo || undefined}><summary>Xem tỷ lệ và số đơn theo thời gian</summary>
      <Table headings={['Kỳ bàn giao', 'Đã bàn giao', 'Đơn quay đầu', 'Tỷ lệ quay đầu', 'Tỷ lệ bom hàng', ...(demo ? ['Chờ kiểm quá hạn', 'Chờ nhập quá hạn', 'Tình huống'] : [])]}>
        {points.map(row => <tr key={row.label}><td>{row.label}</td><td>{quantity(row.shipped)}</td>
          <td>{quantity(row.turnedBack)}</td><td>{percentage(row.turnbackRate)}</td><td>{percentage(row.refusalRate)}</td>
          {demo && <><td>{quantity(row.lateInspection)}</td><td>{quantity(row.lateRestock)}</td><td>{row.scenario}</td></>}</tr>)}
      </Table>
    </details>
  </>;
}

function ReturnTrend({ points, threshold }) {
  const [source, setSource] = useState('actual');
  return <section className="owner-content-panel">
    <h2>Xu hướng đơn quay đầu và bom hàng</h2>
    <div className="owner-filters">
      <WmsField>Nguồn dữ liệu biểu đồ<WmsSelect value={source} onChange={event => setSource(event.target.value)}>
        <option value="actual">Dữ liệu thực tế</option>
        <option value="demo">Dữ liệu trình diễn</option>
      </WmsSelect></WmsField>
    </div>
    {source === 'demo' ? <>
      <p className="owner-notice">Dữ liệu trình diễn từ tháng 1 đến ngày 14/11/2026.</p>
      <DemoTrend threshold={threshold} />
    </> : <ReturnTrendChart points={points} threshold={threshold} />}
  </section>;
}

// Bảng phân tích chỉ dùng lý do được ghi nhận trên phiếu. Chủ cửa hàng có thể
// lọc trường hợp Facebook không hợp lệ để rà soát mã đơn mà không lộ thông tin cá nhân.
function ReturnReasons({ rows }) {
  const [channel, setChannel] = useState('');
  const [reason, setReason] = useState('');
  const visible = rows.filter(row => (!channel || channel === row.channel) && (!reason || reason === row.reason));
  return <section className="owner-content-panel">
    <h2>Nguyên nhân đơn quay đầu</h2>
    <div className="owner-filters">
      <WmsField>Nguồn bán<WmsSelect value={channel} onChange={e => setChannel(e.target.value)}>
        <option value="">Tất cả nguồn bán đang xem</option>
        {Object.entries(channelLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </WmsSelect></WmsField>
      <WmsField>Nguyên nhân<WmsSelect value={reason} onChange={e => setReason(e.target.value)}>
        <option value="">Tất cả nguyên nhân</option>
        {Object.entries(reasonLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </WmsSelect></WmsField>
    </div>
    <Columns title="Số đơn theo nguyên nhân quay đầu" defaultKind="horizontal" unitLabel="đơn hàng"
      rows={Object.entries(reasonLabels).map(([key, label]) => ({
        label, value: visible.filter(row => row.reason === key).length,
      })).filter(row => row.value > 0).sort((a, b) => b.value - a.value)} />
    <details><summary>Xem danh sách đơn quay đầu</summary>
    <Table headings={['Mã đơn hàng', 'Nguồn bán', 'Ngày bàn giao vận chuyển', 'Nguyên nhân']} empty={!visible.length}>
      {visible.map(row => <tr key={row.code}><td>{row.code}</td><td>{channelLabels[row.channel]}</td><td>{datetime(row.shippedAt)}</td><td>{reasonLabels[row.reason]}</td></tr>)}
    </Table>
    </details>
  </section>;
}

function ReturnWorklist({ rows, initialOverdueOnly }) {
  const [overdueOnly, setOverdueOnly] = useState(initialOverdueOnly);
  const visible = overdueOnly ? rows.filter(row => row.overdue) : rows;
  // Hai chuỗi loại trừ nhau và cộng lại bằng số đơn trong từng công đoạn.
  const steps = Object.entries(stepLabels).map(([key, label]) => ({
    label,
    other: visible.filter(row => row.step === key && !row.overdue).length,
    overdue: visible.filter(row => row.step === key && row.overdue).length,
  }));
  return <section id="owner-return-processing" tabIndex={-1} className="owner-content-panel owner-notification-target">
    <h2>Xử lý hàng hoàn</h2>
    <p>{quantity(rows.filter(row => row.overdue).length)} đơn đang quá hạn xử lý.</p>
    <label><input type="checkbox" checked={overdueOnly} onChange={event => setOverdueOnly(event.target.checked)} /> Chỉ xem đơn quá hạn</label>
    {visible.length > 0 && <SeriesPlot title="Số đơn theo công đoạn xử lý hàng hoàn" rows={steps}
      categoryLabel="Công đoạn hiện tại" unitLabel="đơn hàng"
      series={[{ key: 'other', label: 'Các đơn còn lại' }, { key: 'overdue', label: 'Quá hạn xử lý' }]} />}
    <details open={overdueOnly || undefined}><summary>Xem danh sách hàng hoàn</summary>
    <Table headings={['Mã đơn hàng', 'Nguồn bán', 'Ghi nhận nhận lại', 'Công đoạn', 'Hạn xử lý', 'Phiếu nhập kho']} empty={!visible.length}>
      {visible.map(row => <tr key={row.id}><td>{row.code}</td><td>{channelLabels[row.channel]}</td><td>{datetime(row.receivedAt)}{row.carriedOver && ' · Tồn từ kỳ trước'}</td>
        <td>{stepLabels[row.step]}{row.overdue && <strong className="owner-error"> · Quá hạn</strong>}</td>
        <td>{datetime(row.deadline)}</td><td>{row.ticket || '—'}</td></tr>)}
    </Table>
    </details>
  </section>;
}

export default function BusinessActivity({ resource, salesChannel }) {
  const location = useLocation();
  const data = resource.data;
  const section = location.hash.slice(1);
  // Khi đến từ chuông, đợi dữ liệu dựng xong rồi đưa cuộn và tiêu điểm đến đúng phần.
  useEffect(() => {
    if (!data || !['owner-delivery-performance', 'owner-return-processing'].includes(section)) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(section);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [data, section, location.key]);
  const activity = data?.activity;
  const previousChannels = new Map(data?.previous?.channels.map(row => [row.channel, row]) || []);
  const channels = (activity?.channels || []).filter(row => !salesChannel || row.channel === salesChannel);
  const channelRows = channels.map(row => ({
    ...row, label: channelLabels[row.channel], previousCustomers: previousChannels.get(row.channel)?.newCustomers,
  }));
  const threshold = data && { value: data.policy.alertRate, label: `Ngưỡng cảnh báo ${data.policy.alertRate}%` };
  return <ResourceState resource={resource}>{activity && <>
    <section id="owner-delivery-performance" tabIndex={-1} className="owner-content-panel owner-notification-target">
      <h2>Giao hàng và khách mới</h2>
      <div className="owner-metrics">
        <Metric label="Đơn bàn giao vận chuyển" value={quantity(activity.shipped)} />
        <Metric label={`Tỷ lệ quay đầu (${quantity(activity.turnedBack)} đơn)`} value={percentage(activity.turnbackRate)} />
        <Metric label={`Tỷ lệ bom hàng đã xác định (${quantity(activity.refused)} đơn)`} value={percentage(activity.refusalRate)} />
        <Metric label="Khách hàng mới" value={quantity(activity.newCustomers)} />
      </div>
      {data.previous && <p>Kỳ đối chiếu có {quantity(data.previous.newCustomers)} khách mới và tỷ lệ quay đầu {percentage(data.previous.turnbackRate)}.</p>}
      <div className="owner-report-chart-grid">
        <section className="owner-content-panel">
          <h3>Tỷ lệ quay đầu và bom hàng theo kênh</h3>
          {activity.shipped > 0 ? <SeriesPlot rows={channelRows} series={rateSeries} title="Tỷ lệ quay đầu và bom hàng theo kênh"
            categoryLabel="Nguồn bán" unitLabel="phần trăm" valueSuffix="%" reference={threshold} /> : <p>Chưa có đơn bàn giao vận chuyển trong kỳ.</p>}
        </section>
        <section className="owner-content-panel">
          <h3>Khách hàng mới theo kênh</h3>
          <SeriesPlot rows={channelRows} title="Khách hàng mới theo kênh" categoryLabel="Nguồn bán" unitLabel="khách hàng"
            series={[{ key: 'newCustomers', label: 'Kỳ đang xem' }, ...(data.previous ? [{ key: 'previousCustomers', label: 'Kỳ đối chiếu' }] : [])]} />
        </section>
      </div>
      <details><summary>Xem bảng vận chuyển và khách hàng theo kênh</summary>
      <Table headings={['Nguồn bán', 'Đã bàn giao', 'Đơn quay đầu', 'Tỷ lệ quay đầu', 'Đơn bom', 'Tỷ lệ bom', 'Khách mới',
        ...(data.previous ? ['Khách mới kỳ đối chiếu', 'Chênh lệch khách mới'] : [])]} paginated={false}>
        {channels.map(row => <tr key={row.channel}>
          <td>{channelLabels[row.channel]}</td><td>{quantity(row.shipped)}</td><td>{quantity(row.turnedBack)}</td><td>{percentage(row.turnbackRate)}</td>
          <td>{quantity(row.refused)}</td><td>{percentage(row.refusalRate)}</td><td>{quantity(row.newCustomers)}</td>
          {data.previous && <><td>{quantity(previousChannels.get(row.channel).newCustomers)}</td>
            <td>{quantity(row.newCustomers - previousChannels.get(row.channel).newCustomers)}</td></>}
        </tr>)}
      </Table>
      </details>
    </section>
    <ReturnTrend points={activity.points} threshold={threshold} />
    <ReturnReasons rows={activity.returnDetails} />
    <ReturnWorklist key={location.key} rows={data.worklist} initialOverdueOnly={section === 'owner-return-processing'} />
    <section id="owner-order-status" className="owner-content-panel">
      <Columns title="Trạng thái hiện tại của đơn hàng tạo trong kỳ" defaultKind="horizontal" unitLabel="đơn hàng"
        rows={data.orderStatuses.map(row => ({ label: orderLabels[row.status] || 'Chưa rõ trạng thái', value: row.count }))} />
      <details><summary>Xem bảng đếm trạng thái đơn hàng</summary>
        <Table headings={['Trạng thái hiện tại', 'Số đơn hàng']} paginated={false}>
          {data.orderStatuses.map(row => <tr key={row.status}><td>{orderLabels[row.status]}</td><td>{quantity(row.count)}</td></tr>)}
        </Table>
      </details>
    </section>
  </>}</ResourceState>;
}
