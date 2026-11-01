// This standalone design preview uses sample records. The React app owns stock changes and barcode issuance.
const $ = (id) => document.getElementById(id);
const sampleSkus = window.FINISHED_SAMPLE || [];
const formatNumber = (value) => new Intl.NumberFormat('vi-VN').format(value);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const sampleBins = [
  ['B-01-T1-O01', 'B-01-T1-O02'],
  ['B-01-T2-O01'],
  ['B-02-T1-O03'],
  ['B-03-T1-O01'],
  ['B-02-T2-O01'],
];
const sampleUnits = sampleSkus.flatMap((sku, skuIndex) => Array.from({ length: sku.total }, (_, index) => {
  const pending = index >= sku.total - sku.waiting;
  const reserved = !pending && index < sku.hold;
  const bins = sampleBins[skuIndex % sampleBins.length];
  return {
    code: `MAU-${sku.sku}-${String(index + 1).padStart(4, '0')}`,
    sku: sku.sku,
    location: pending ? '' : bins[index % bins.length],
    planned: pending ? bins[index % bins.length] : '',
    state: pending ? 'PENDING' : reserved ? 'RESERVED' : 'AVAILABLE',
    receipt: pending ? 'MAU-PN-0123' : 'MAU-PN-0089',
  };
}));
const sampleReceipts = [
  { id: 'MAU-PN-0089', date: '2026-10-28', source: 'Xưởng may A' },
  { id: 'MAU-PN-0123', date: '2026-11-01', source: 'Xưởng may B' },
];
let selectedSku = '';
let unitPage = 1;
const pageSize = 20;

function unitsFor(sku) { return sampleUnits.filter((unit) => unit.sku === sku); }
function counts(sku) {
  const units = sku ? unitsFor(sku) : sampleUnits;
  return {
    total: units.length,
    hold: units.filter((unit) => unit.state === 'RESERVED').length,
    available: units.filter((unit) => unit.state === 'AVAILABLE').length,
    waiting: units.filter((unit) => unit.state === 'PENDING').length,
  };
}
function binName(code) {
  const parts = /^(.*)-T(\d+)-O(\d+)$/.exec(code || '');
  return parts ? `${parts[1]} → Tầng ${parts[2]} → Ô ${parts[3]}` : 'Chờ xếp vào ô';
}
function renderMetrics() {
  const stock = counts();
  $('stat-total').textContent = formatNumber(stock.total);
  $('stat-available').textContent = formatNumber(stock.available);
  $('stat-waiting').textContent = formatNumber(stock.waiting);
  $('record-count').textContent = sampleReceipts.length;
}
function renderStock() {
  const query = $('search-sku').value.trim().toLocaleLowerCase('vi');
  const location = $('stock-location').value;
  const availability = $('stock-availability').value;
  const list = sampleSkus.filter((sku) => {
    const units = unitsFor(sku);
    const stock = counts(sku.sku);
    const matchesText = !query || [sku.name, sku.sku, sku.color, sku.size].join(' ').toLocaleLowerCase('vi').includes(query)
      || units.some((unit) => unit.code.toLocaleLowerCase('vi').includes(query));
    const matchesLocation = !location || (location === 'pending' ? stock.waiting > 0 : units.some((unit) => unit.location.startsWith(location)));
    const matchesAvailability = !availability || (availability === 'available' ? stock.available > 0 : stock.available === 0);
    return matchesText && matchesLocation && matchesAvailability;
  });
  const labels = ['Sản phẩm', 'Tồn thực tế', 'Tạm giữ', 'Khả dụng', 'Chờ xếp', 'Vị trí', 'Thao tác'];
  $('stock-rows').innerHTML = list.map((sku) => {
    const stock = counts(sku.sku);
    const bins = [...new Set(unitsFor(sku.sku).map((unit) => unit.location).filter(Boolean))];
    const cells = [
      `<div class="flex items-center gap-3"><img src="${escapeHtml(sku.image)}" alt="" class="w-12 h-12 rounded-lg object-cover shrink-0 bg-surface-container"><div class="min-w-0"><span class="product-name">${escapeHtml(sku.name)}</span><span class="product-meta">${escapeHtml(sku.sku)}<br>${escapeHtml(sku.color)} · ${escapeHtml(sku.size)}</span></div></div>`,
      ...['total', 'hold', 'available', 'waiting'].map((key) => `<b>${formatNumber(stock[key])}</b><small>chiếc</small>`),
      `${bins.length ? `<span class="position-tag">${escapeHtml(binName(bins[0]))}</span>${bins.length > 1 ? `<small class="product-meta">+${bins.length - 1} ô khác</small>` : ''}` : '<span class="position-tag">Chưa đặt vào ô</span>'}${stock.waiting ? `<small class="product-meta">${stock.waiting} chiếc chờ xếp</small>` : ''}`,
      `<button type="button" class="btn" data-sku="${escapeHtml(sku.sku)}">Xem barcode</button>`,
    ];
    return `<tr class="${selectedSku === sku.sku ? 'selected-row' : ''}">${cells.map((cell, index) => `<td data-label="${labels[index]}" class="${index >= 1 && index <= 4 ? 'numeric' : ''}">${cell}</td>`).join('')}</tr>`;
  }).join('') || '<tr><td colspan="7">Không có SKU phù hợp với bộ lọc.</td></tr>';
  $('stock-summary').textContent = `Hiển thị ${list.length}/${sampleSkus.length} SKU mẫu · Số liệu không phản ánh tồn kho trong hệ thống.`;
}
function resetStockFilters() {
  ['search-sku', 'stock-location', 'stock-availability'].forEach((id) => { $(id).value = ''; });
  renderStock();
}
function selectSku(skuCode) {
  const sku = sampleSkus.find((item) => item.sku === skuCode);
  if (!sku) return;
  selectedSku = skuCode;
  unitPage = 1;
  $('filter-barcode').value = '';
  $('unit-location').value = '';
  $('drawer-title').textContent = sku.name;
  $('drawer-sku').textContent = sku.sku;
  $('drawer-variant').textContent = `Màu: ${sku.color} · Size: ${sku.size}`;
  $('drawer-img').src = sku.image;
  $('drawer-img').alt = sku.name;
  const stock = counts(skuCode);
  [['drawer-total', 'total'], ['drawer-hold', 'hold'], ['drawer-avail', 'available'], ['drawer-wait', 'waiting']]
    .forEach(([id, key]) => { $(id).textContent = formatNumber(stock[key]); });
  $('sku-drawer').classList.remove('hidden');
  renderUnits();
  renderStock();
  if (matchMedia('(max-width: 767px)').matches) {
    document.body.style.overflow = 'hidden';
    $('sku-drawer').focus();
  }
}
function closeDrawer() {
  selectedSku = '';
  $('sku-drawer').classList.add('hidden');
  document.body.style.overflow = '';
  renderStock();
}
function renderUnits() {
  if (!selectedSku) return;
  const query = $('filter-barcode').value.trim().toLocaleLowerCase('vi');
  const location = $('unit-location').value;
  const units = unitsFor(selectedSku).filter((unit) => (!query || unit.code.toLocaleLowerCase('vi').includes(query))
    && (!location || (location === 'PENDING' ? unit.state === 'PENDING' : unit.location === location)));
  const pages = Math.max(1, Math.ceil(units.length / pageSize));
  unitPage = Math.min(unitPage, pages);
  const stateLabel = { AVAILABLE: 'Khả dụng', RESERVED: 'Đã giữ cho đơn', PENDING: 'Chờ xếp' };
  const stateClass = { AVAILABLE: 'state-available', RESERVED: 'state-reserved', PENDING: 'state-pending' };
  $('unit-list').innerHTML = units.slice((unitPage - 1) * pageSize, unitPage * pageSize).map((unit) =>
    `<div class="unit-card"><b>${escapeHtml(unit.code)}</b><span class="unit-state ${stateClass[unit.state]}">${stateLabel[unit.state]}</span><p>${unit.location ? escapeHtml(binName(unit.location)) : `Ô đích dự kiến: ${escapeHtml(binName(unit.planned))}`}</p><p>Phiếu nhập mẫu: ${escapeHtml(unit.receipt)}</p></div>`).join('') || '<p>Không tìm thấy barcode mẫu.</p>';
  $('unit-summary').innerHTML = `Hiển thị ${units.length ? (unitPage - 1) * pageSize + 1 : 0}–${Math.min(unitPage * pageSize, units.length)}/${units.length} barcode mẫu <div class="flex gap-2 mt-2"><button type="button" class="btn" data-page="-1" ${unitPage === 1 ? 'disabled' : ''}>Trước</button><button type="button" class="btn" data-page="1" ${unitPage === pages ? 'disabled' : ''}>Sau</button></div>`;
}
function filterUnits() { unitPage = 1; renderUnits(); }
function renderRecords() {
  const query = $('record-search').value.trim().toLocaleLowerCase('vi');
  const from = $('record-from').value;
  const to = $('record-to').value;
  const type = $('record-type').value;
  const status = $('record-status').value;
  const invalidDates = Boolean(from && to && from > to);
  $('record-error').textContent = invalidDates ? 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.' : '';
  const list = invalidDates ? [] : sampleReceipts.filter((receipt) =>
    (!query || `${receipt.id} ${receipt.source}`.toLocaleLowerCase('vi').includes(query))
    && (!from || receipt.date >= from) && (!to || receipt.date <= to)
    && (!type || type === 'IN') && (!status || status === 'CONFIRMED'));
  $('record-rows').innerHTML = list.map((receipt) => `<tr><td><b>${receipt.id}</b></td><td>${receipt.date.split('-').reverse().join('/')}</td><td>Nhập kho</td><td>${escapeHtml(receipt.source)}</td><td>${formatNumber(sampleUnits.filter((unit) => unit.receipt === receipt.id).length)} chiếc</td><td>Đã xác nhận · mẫu</td><td>—</td><td><button type="button" class="btn" data-receipt="${receipt.id}">Xem minh họa</button></td></tr>`).join('') || '<tr><td colspan="8">Không có phiếu mẫu phù hợp.</td></tr>';
  $('record-summary').textContent = `Hiển thị ${list.length}/${sampleReceipts.length} phiếu mẫu. Xem phiếu thật trong ứng dụng AraWMS.`;
}
function resetRecordFilters() {
  ['record-search', 'record-from', 'record-to', 'record-type', 'record-status'].forEach((id) => { $(id).value = ''; });
  renderRecords();
}
function setTab(tab) {
  const stock = tab === 'stock';
  ['stock-metrics', 'stock-note', 'inventory-workspace'].forEach((id) => { $(id).classList.toggle('hidden', !stock); });
  $('record-panel').classList.toggle('hidden', stock);
  [['tab-stock', stock], ['tab-records', !stock]].forEach(([id, active]) => {
    $(id).classList.toggle('tab-active', active);
    $(id).setAttribute('aria-selected', String(active));
  });
  if (!stock) closeDrawer();
  else renderStock();
}
function showReceipt(id) {
  const count = sampleUnits.filter((unit) => unit.receipt === id).length;
  $('record-error').textContent = `${id}: ${formatNumber(count)} barcode minh họa. Phiếu thật, ảnh barcode và tiến độ xếp kệ nằm trong ứng dụng AraWMS.`;
}
document.addEventListener('click', (event) => {
  const sku = event.target.closest('[data-sku]');
  const page = event.target.closest('[data-page]');
  const receipt = event.target.closest('[data-receipt]');
  if (sku) selectSku(sku.dataset.sku);
  if (page && !page.disabled) { unitPage += Number(page.dataset.page); renderUnits(); }
  if (receipt) showReceipt(receipt.dataset.receipt);
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && selectedSku) closeDrawer(); });
renderMetrics();
renderStock();
renderRecords();
setTab('stock');
$('sku-drawer').classList.add('hidden');
