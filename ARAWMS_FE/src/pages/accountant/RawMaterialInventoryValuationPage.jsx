/*
 * File: RawMaterialInventoryValuationPage.jsx
 * Role: ACCOUNTANT (Kế toán kho & Tài chính)
 * UC: UC 11 - View Total Raw Material Inventory Value (Xem tổng giá trị định giá nguyên vật liệu thô tồn kho)
 * Description: Báo cáo định giá tài sản kho vải cuộn & nguyên phụ liệu toàn diện:
 *              - Tổng giá trị tài sản nguyên vật liệu theo đơn giá mua vốn thực tế (unitCost)
 *              - Tồn kho khả dụng, nguyên liệu đã giữ chỗ lệnh may, hàng chờ cất kệ sau KCS
 *              - Cơ cấu tỷ trọng tài sản theo nhóm Vải cuộn (FABRIC) vs Phụ liệu may (AUXILIARY)
 *              - Phân tích chi tiết từng danh mục: Cúc, Chỉ, Khóa kéo, Nhãn mác, Kim may...
 *              - Xuất bảng kê định giá Excel chuẩn phục vụ kiểm toán tài sản & P&L.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers,
  Scissors,
  BookmarkCheck,
  AlertTriangle,
  Search,
  Filter,
  Download,
  RefreshCw,
  Eye,
  FileSpreadsheet,
  Package,
  X,
  Clock,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Building2,
  Tag,
  Boxes,
} from 'lucide-react';
import accountantProcurementApi from '../../services/accountantProcurementApi.js';
import './rawMaterialValuation.css';

// Formatter tiền tệ VNĐ
const formatVND = (val) => {
  if (val === undefined || val === null || isNaN(val)) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(val);
};

// Formatter số lượng
const formatNumber = (val) => {
  if (val === undefined || val === null || isNaN(val)) return '0';
  return new Intl.NumberFormat('vi-VN').format(val);
};

// Map danh mục sang nhãn tiếng Việt dễ đọc
const CATEGORY_LABELS = {
  FABRIC_ROLL: 'Cuộn vải chính / lót',
  BUTTON: 'Cúc / Nút áo',
  THREAD: 'Chỉ may / Chỉ vắt sổ',
  ZIPPER: 'Khóa kéo / Phéc-mơ-tuyên',
  CARE_LABEL: 'Nhãn mác / Tem giặt',
  PACKAGING_BAG: 'Túi đóng gói bọc hàng',
  NEEDLE: 'Kim may công nghiệp',
  CHALK: 'Phấn may / Sáp kẻ',
  MARKER: 'Bút dạ đánh dấu vải',
  ACCESSORY: 'Phụ kiện đính kèm',
  OTHER: 'Vật tư phụ khác',
};

// Map đơn vị tính
const UNIT_LABELS = {
  METER: 'Mét (m)',
  MET: 'Mét (m)',
  YARD: 'Yard (yd)',
  KG: 'Kilogram (kg)',
  KILOGRAM: 'Kilogram (kg)',
  ROLL: 'Cuộn',
  CUON: 'Cuộn',
  PIECE: 'Cái / Chiếc',
  CAI: 'Cái / Chiếc',
  BOX: 'Hộp',
  HOP: 'Hộp',
  PACK: 'Gói / Bịch',
  GOI: 'Gói / Bịch',
  SET: 'Bộ',
  BO: 'Bộ',
};

export default function RawMaterialInventoryValuationPage() {
  // State Summary & Metadata
  const [summaryData, setSummaryData] = useState(null);
  const [metadata, setMetadata] = useState({ categories: [], suppliers: [] });
  const [loadingSummary, setLoadingSummary] = useState(true);

  // State Table List
  const [materials, setMaterials] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loadingList, setLoadingList] = useState(true);

  // State Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('ALL'); // ALL | FABRIC | AUXILIARY
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedSupplier, setSelectedSupplier] = useState('ALL');
  const [stockStatus, setStockStatus] = useState('ALL'); // ALL | IN_STOCK | LOW_STOCK | OUT_OF_STOCK
  const [sortBy, setSortBy] = useState('TOTAL_VALUE_DESC');

  // State Modal Detail
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);
  const [exportingExcel, setExportingExcel] = useState(false);

  // 1. Tải Summary & Metadata
  const fetchSummaryAndMetadata = useCallback(async () => {
    try {
      setLoadingSummary(true);
      const [sumRes, metaRes] = await Promise.all([
        accountantProcurementApi.getRawMaterialValuationSummary(),
        accountantProcurementApi.getRawMaterialValuationMetadata(),
      ]);
      setSummaryData(sumRes);
      setMetadata(metaRes || { categories: [], suppliers: [] });
    } catch (err) {
      console.error('Lỗi tải báo cáo tổng hợp định giá nguyên phụ liệu:', err);
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  // 2. Tải danh sách nguyên phụ liệu theo bộ lọc & phân trang
  const fetchMaterialList = useCallback(
    async (targetPage = 1) => {
      try {
        setLoadingList(true);
        const params = {
          page: targetPage,
          limit: pagination.limit,
          search: searchTerm.trim() || undefined,
          materialType: selectedType !== 'ALL' ? selectedType : undefined,
          category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
          supplierId: selectedSupplier !== 'ALL' ? selectedSupplier : undefined,
          stockStatus: stockStatus !== 'ALL' ? stockStatus : undefined,
          sortBy,
        };
        const res = await accountantProcurementApi.getRawMaterialValuationList(params);
        setMaterials(res.items || []);
        if (res.pagination) {
          setPagination((prev) => ({
            ...prev,
            ...res.pagination,
            page: targetPage,
          }));
        }
      } catch (err) {
        console.error('Lỗi tải danh sách định giá nguyên phụ liệu:', err);
      } finally {
        setLoadingList(false);
      }
    },
    [pagination.limit, searchTerm, selectedType, selectedCategory, selectedSupplier, stockStatus, sortBy]
  );

  useEffect(() => {
    fetchSummaryAndMetadata();
  }, [fetchSummaryAndMetadata]);

  useEffect(() => {
    fetchMaterialList(1);
  }, [selectedType, selectedCategory, selectedSupplier, stockStatus, sortBy]);

  // Handle Search Submit
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchMaterialList(1);
  };

  // Copy helper
  const handleCopy = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // 3. Xuất file Excel báo cáo định giá nguyên phụ liệu
  const handleExportExcel = async () => {
    try {
      setExportingExcel(true);
      const allRes = await accountantProcurementApi.getRawMaterialValuationList({
        page: 1,
        limit: 1000,
        search: searchTerm.trim() || undefined,
        materialType: selectedType !== 'ALL' ? selectedType : undefined,
        category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
        supplierId: selectedSupplier !== 'ALL' ? selectedSupplier : undefined,
        stockStatus: stockStatus !== 'ALL' ? stockStatus : undefined,
        sortBy,
      });

      const items = allRes.items || [];
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'AraStore WMS - Phân hệ Kế toán';
      workbook.created = new Date();

      // Sheet 1: Bảng định giá chi tiết
      const worksheet = workbook.addWorksheet('Định Giá Nguyên Phụ Liệu', {
        views: [{ showGridLines: true }],
      });

      // Title header
      worksheet.mergeCells('A1:L1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = 'BÁO CÁO ĐỊNH GIÁ TÀI SẢN KHO NGUYÊN PHỤ LIỆU (WMS)';
      titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF0F172A' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(1).height = 28;

      worksheet.mergeCells('A2:L2');
      const dateCell = worksheet.getCell('A2');
      dateCell.value = `Thời điểm chốt số liệu: ${new Date().toLocaleString('vi-VN')} | Đơn vị tiền tệ: VNĐ (₫)`;
      dateCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
      dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(2).height = 18;

      // Table Header row
      const headers = [
        'STT',
        'Mã Nguyên Phụ Liệu',
        'Tên Nguyên Phụ Liệu',
        'Phân Loại',
        'Danh Mục',
        'Đơn Vị Tính',
        'Màu Sắc / Quy Cách',
        'Tồn Kho Thực Tế',
        'Đã Giữ Chỗ Xuất May',
        'Tồn Khả Dụng',
        'Đơn Giá Mua Vốn (unitCost)',
        'Tổng Giá Trị Tồn Kho (₫)',
        'Nhà Cung Cấp Mặc Định',
        'Trạng Thái Tồn',
      ];

      const headerRow = worksheet.addRow(headers);
      headerRow.height = 24;
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E7FF' },
        };
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1E1B4B' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      // Rows
      items.forEach((item, index) => {
        const specs = [];
        if (item.color) specs.push(`Màu: ${item.color}`);
        if (item.gsm) specs.push(`${item.gsm}gsm`);
        if (item.widthCm) specs.push(`Khổ: ${item.widthCm}cm`);

        const row = worksheet.addRow([
          index + 1,
          item.materialCode,
          item.materialName,
          item.materialType === 'FABRIC' ? 'Vải cuộn' : 'Phụ liệu may',
          CATEGORY_LABELS[item.category] || item.category,
          UNIT_LABELS[item.unit] || item.unit,
          specs.join(' | ') || '—',
          item.onHandQty,
          item.reservedQty || 0,
          item.availableQty,
          item.unitCost,
          item.totalAssetValue,
          item.supplier?.supplierName || '—',
          item.stockStatus === 'OUT_OF_STOCK'
            ? 'Hết hàng'
            : item.stockStatus === 'LOW_STOCK'
            ? 'Chạm đáy an toàn'
            : 'Đủ tồn kho',
        ]);

        row.height = 20;
        row.getCell(1).alignment = { horizontal: 'center' };
        row.getCell(2).alignment = { horizontal: 'left' };
        row.getCell(4).alignment = { horizontal: 'center' };
        row.getCell(6).alignment = { horizontal: 'center' };
        row.getCell(8).alignment = { horizontal: 'right' };
        row.getCell(9).alignment = { horizontal: 'right' };
        row.getCell(10).alignment = { horizontal: 'right' };

        // Currency format
        row.getCell(11).numFmt = '#,##0';
        row.getCell(11).alignment = { horizontal: 'right' };
        row.getCell(12).numFmt = '#,##0';
        row.getCell(12).alignment = { horizontal: 'right' };

        row.getCell(14).alignment = { horizontal: 'center' };

        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };
        });
      });

      // Total row
      const sumTotalAsset = items.reduce((acc, it) => acc + (it.totalAssetValue || 0), 0);
      const sumOnHandQty = items.reduce((acc, it) => acc + (it.onHandQty || 0), 0);

      const totalRow = worksheet.addRow([
        'TỔNG CỘNG',
        '',
        '',
        '',
        '',
        '',
        '',
        sumOnHandQty,
        '',
        '',
        '',
        sumTotalAsset,
        '',
        '',
      ]);
      totalRow.height = 24;
      worksheet.mergeCells(`A${totalRow.number}:G${totalRow.number}`);
      totalRow.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 10, bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' },
        };
      });
      totalRow.getCell(8).numFmt = '#,##0';
      totalRow.getCell(12).numFmt = '#,##0';

      // Auto fit columns width
      worksheet.columns.forEach((column) => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
          const columnLength = cell.value ? cell.value.toString().length : 10;
          if (columnLength > maxLength) {
            maxLength = columnLength;
          }
        });
        column.width = Math.min(35, Math.max(maxLength + 3, 12));
      });

      // Sheet 2: Cơ cấu theo loại & danh mục
      if (summaryData?.typeBreakdown?.length) {
        const catSheet = workbook.addWorksheet('Cơ Cấu Vải & Phụ Liệu');
        catSheet.addRow(['Nhóm Nguyên Phụ Liệu', 'Số Lượng Mã', 'Tổng Tồn Kho', 'Giá Trị Vốn (₫)', 'Tỷ Trọng (%)']);
        catSheet.getRow(1).font = { bold: true };
        summaryData.typeBreakdown.forEach((t) => {
          catSheet.addRow([
            t.materialType === 'FABRIC' ? 'Vải cuộn chính/lót (FABRIC)' : 'Phụ liệu may (AUXILIARY)',
            t.count,
            t.totalQty,
            t.totalValue,
            `${t.valueSharePercent}%`,
          ]);
        });
        catSheet.columns.forEach((col) => {
          col.width = 28;
        });
      }

      // Download buffer
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.download = `Bao_Cao_Dinh_Gia_Ton_Kho_Nguyen_Lieu_${dateStr}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Lỗi khi xuất file Excel:', err);
      alert('Có lỗi xảy ra khi tạo file Excel: ' + err.message);
    } finally {
      setExportingExcel(false);
    }
  };

  const summary = summaryData?.summary || {};

  return (
    <div className="ara-rmv-container">
      {/* 1. Header & Actions */}
      <div className="ara-rmv-header">
        <div className="ara-rmv-title-box">
          <h2 className="ara-rmv-title">
            <Layers size={22} color="#4f46e5" />
            Định Giá Tồn Kho Nguyên Phụ Liệu (Raw Materials)
          </h2>
          <p className="ara-rmv-subtitle">
            UC 11 · Kiểm soát tổng giá trị tài sản kho vải cuộn & phụ liệu may mặc, hàng đã giữ chỗ lệnh may, hàng chờ cất kệ và cơ cấu tỷ trọng tài sản.
          </p>
        </div>

        <div className="ara-rmv-actions">
          <button
            type="button"
            className="ara-rmv-btn"
            onClick={() => {
              fetchSummaryAndMetadata();
              fetchMaterialList(pagination.page);
            }}
            disabled={loadingSummary || loadingList}
            title="Làm mới dữ liệu định giá"
          >
            <RefreshCw size={15} className={loadingSummary || loadingList ? 'spin' : ''} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            className="ara-rmv-btn ara-rmv-btn-success"
            onClick={handleExportExcel}
            disabled={exportingExcel || materials.length === 0}
            title="Xuất bảng định giá ra file Excel (.xlsx)"
          >
            <FileSpreadsheet size={15} />
            <span>{exportingExcel ? 'Đang tạo Excel...' : 'Xuất Excel'}</span>
          </button>
        </div>
      </div>

      {/* 2. Top Metric Cards */}
      <div className="ara-rmv-metrics-grid">
        {/* Card 1: Tổng giá trị tài sản kho NVL */}
        <div className="ara-rmv-metric-card">
          <div className="ara-rmv-metric-header">
            <span className="ara-rmv-metric-label">Tổng giá trị tồn kho NVL</span>
            <div className="ara-rmv-metric-icon indigo">
              <Layers size={18} />
            </div>
          </div>
          <div className="ara-rmv-metric-value">{formatVND(summary.totalAssetValue)}</div>
          <div className="ara-rmv-metric-subtext">
            <span>{formatNumber(summary.totalOnHandQty)} đơn vị tồn kho</span>
          </div>
        </div>

        {/* Card 2: Giá trị khả dụng xuất may */}
        <div className="ara-rmv-metric-card">
          <div className="ara-rmv-metric-header">
            <span className="ara-rmv-metric-label">Khả dụng sẵn sàng may</span>
            <div className="ara-rmv-metric-icon green">
              <Scissors size={18} />
            </div>
          </div>
          <div className="ara-rmv-metric-value">{formatVND(summary.totalAvailableValue)}</div>
          <div className="ara-rmv-metric-subtext">
            <span>{formatNumber(summary.totalAvailableQty)} đơn vị sẵn sàng cắt may</span>
          </div>
        </div>

        {/* Card 3: Đã giữ chỗ cho lệnh may */}
        <div className="ara-rmv-metric-card">
          <div className="ara-rmv-metric-header">
            <span className="ara-rmv-metric-label">Đã giữ chỗ lệnh may</span>
            <div className="ara-rmv-metric-icon amber">
              <BookmarkCheck size={18} />
            </div>
          </div>
          <div className="ara-rmv-metric-value">{formatVND(summary.totalReservedValue)}</div>
          <div className="ara-rmv-metric-subtext">
            <span>{formatNumber(summary.totalReservedQty)} đơn vị đang chờ xuất kho</span>
          </div>
        </div>

        {/* Card 4: Tồn kho vải cuộn (FABRIC) */}
        <div className="ara-rmv-metric-card">
          <div className="ara-rmv-metric-header">
            <span className="ara-rmv-metric-label">Tồn kho Vải cuộn</span>
            <div className="ara-rmv-metric-icon blue">
              <Boxes size={18} />
            </div>
          </div>
          <div className="ara-rmv-metric-value">
            {formatVND(summaryData?.typeBreakdown?.find((t) => t.materialType === 'FABRIC')?.totalValue || 0)}
          </div>
          <div className="ara-rmv-metric-subtext">
            <span>
              {summary.fabricCount} mã vải (
              {summaryData?.typeBreakdown?.find((t) => t.materialType === 'FABRIC')?.valueSharePercent || '0'}
              % vốn)
            </span>
          </div>
        </div>

        {/* Card 5: Tồn kho Phụ liệu (AUXILIARY) */}
        <div className="ara-rmv-metric-card">
          <div className="ara-rmv-metric-header">
            <span className="ara-rmv-metric-label">Tồn kho Phụ liệu may</span>
            <div className="ara-rmv-metric-icon purple">
              <Tag size={18} />
            </div>
          </div>
          <div className="ara-rmv-metric-value">
            {formatVND(summaryData?.typeBreakdown?.find((t) => t.materialType === 'AUXILIARY')?.totalValue || 0)}
          </div>
          <div className="ara-rmv-metric-subtext">
            <span>
              {summary.auxiliaryCount} mã phụ liệu (
              {summaryData?.typeBreakdown?.find((t) => t.materialType === 'AUXILIARY')?.valueSharePercent || '0'}
              % vốn)
            </span>
          </div>
        </div>
      </div>

      {/* 3. Structure Grid: Loại & Danh mục */}
      <div className="ara-rmv-structure-grid">
        {/* Phân nhóm Vải vs Phụ liệu */}
        <div className="ara-rmv-struct-card">
          <div className="ara-rmv-struct-header">
            <span className="ara-rmv-struct-title">
              <Boxes size={16} color="#4f46e5" />
              Nhóm nguyên phụ liệu:
            </span>
          </div>
          <div className="ara-rmv-pills-row">
            <button
              type="button"
              className={`ara-rmv-pill ${selectedType === 'ALL' ? 'active' : ''}`}
              onClick={() => setSelectedType('ALL')}
            >
              <span>Tất cả</span>
              <span className="share">({summary.totalMaterialCount || 0})</span>
            </button>
            <button
              type="button"
              className={`ara-rmv-pill ${selectedType === 'FABRIC' ? 'active' : ''}`}
              onClick={() => setSelectedType('FABRIC')}
            >
              <span>Vải cuộn</span>
              <span className="share">
                ({summaryData?.typeBreakdown?.find((t) => t.materialType === 'FABRIC')?.valueSharePercent || '0'}%)
              </span>
            </button>
            <button
              type="button"
              className={`ara-rmv-pill ${selectedType === 'AUXILIARY' ? 'active' : ''}`}
              onClick={() => setSelectedType('AUXILIARY')}
            >
              <span>Phụ liệu</span>
              <span className="share">
                ({summaryData?.typeBreakdown?.find((t) => t.materialType === 'AUXILIARY')?.valueSharePercent || '0'}%)
              </span>
            </button>
          </div>
        </div>

        {/* Phân bổ theo danh mục chi tiết */}
        <div className="ara-rmv-struct-card">
          <div className="ara-rmv-struct-header">
            <span className="ara-rmv-struct-title">
              <Tag size={16} color="#4f46e5" />
              Tỷ trọng theo danh mục:
            </span>
            <span style={{ fontSize: 12, color: '#64748b' }}>Bấm để lọc nhanh</span>
          </div>
          <div className="ara-rmv-pills-row">
            <button
              type="button"
              className={`ara-rmv-pill ${selectedCategory === 'ALL' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('ALL')}
            >
              <span>Tất cả</span>
            </button>
            {(summaryData?.categoryBreakdown || []).map((cat) => (
              <button
                type="button"
                key={cat.category}
                className={`ara-rmv-pill ${selectedCategory === cat.category ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.category)}
              >
                <span>{CATEGORY_LABELS[cat.category] || cat.category}</span>
                <span className="share">
                  {formatVND(cat.totalValue)} ({cat.valueSharePercent}%)
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Filters Bar */}
      <div className="ara-rmv-filters-bar">
        <form className="ara-rmv-filters-row" onSubmit={handleSearchSubmit}>
          {/* Search Box */}
          <div className="ara-rmv-search-box">
            <Search size={15} className="ara-rmv-search-icon" />
            <input
              type="search"
              className="ara-rmv-search-input"
              placeholder="Tìm kiếm mã NVL, tên vải/phụ liệu, màu sắc..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Type Select */}
          <select
            className="ara-rmv-select"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
          >
            <option value="ALL">Tất cả loại NVL</option>
            <option value="FABRIC">Vải cuộn (FABRIC)</option>
            <option value="AUXILIARY">Phụ liệu (AUXILIARY)</option>
          </select>

          {/* Category Select */}
          <select
            className="ara-rmv-select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="ALL">Tất cả danh mục</option>
            {metadata.categories.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c] || c}
              </option>
            ))}
          </select>

          {/* Supplier Select */}
          <select
            className="ara-rmv-select"
            value={selectedSupplier}
            onChange={(e) => setSelectedSupplier(e.target.value)}
          >
            <option value="ALL">Tất cả nhà cung cấp</option>
            {metadata.suppliers.map((s) => (
              <option key={s._id} value={s._id}>
                {s.supplierName}
              </option>
            ))}
          </select>

          {/* Sort By */}
          <select
            className="ara-rmv-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="TOTAL_VALUE_DESC">Giá trị tồn: Cao → Thấp</option>
            <option value="TOTAL_VALUE_ASC">Giá trị tồn: Thấp → Cao</option>
            <option value="ON_HAND_DESC">Tồn kho: Nhiều → Ít</option>
            <option value="ON_HAND_ASC">Tồn kho: Ít → Nhiều</option>
            <option value="COST_DESC">Đơn giá vốn: Cao → Thấp</option>
            <option value="COST_ASC">Đơn giá vốn: Thấp → Cao</option>
            <option value="NAME_ASC">Tên nguyên liệu: A → Z</option>
          </select>

          <button type="submit" className="ara-rmv-btn ara-rmv-btn-primary">
            <Search size={14} />
            <span>Tìm kiếm</span>
          </button>
        </form>

        {/* Status Tabs */}
        <div className="ara-rmv-status-tabs">
          <span style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginRight: 4 }}>
            Tình trạng tồn kho:
          </span>
          <button
            type="button"
            className={`ara-rmv-tab-btn ${stockStatus === 'ALL' ? 'active' : ''}`}
            onClick={() => setStockStatus('ALL')}
          >
            Tất cả ({summary.totalMaterialCount || 0})
          </button>
          <button
            type="button"
            className={`ara-rmv-tab-btn ${stockStatus === 'IN_STOCK' ? 'active' : ''}`}
            onClick={() => setStockStatus('IN_STOCK')}
          >
            Còn hàng ({(summary.totalMaterialCount || 0) - (summary.outOfStockCount || 0)})
          </button>
          <button
            type="button"
            className={`ara-rmv-tab-btn ${stockStatus === 'LOW_STOCK' ? 'active' : ''}`}
            onClick={() => setStockStatus('LOW_STOCK')}
          >
            Chạm đáy an toàn ({summary.lowStockCount || 0})
          </button>
          <button
            type="button"
            className={`ara-rmv-tab-btn ${stockStatus === 'OUT_OF_STOCK' ? 'active' : ''}`}
            onClick={() => setStockStatus('OUT_OF_STOCK')}
          >
            Hết hàng ({summary.outOfStockCount || 0})
          </button>
        </div>
      </div>

      {/* 5. Main Data Table */}
      <div className="ara-rmv-table-card">
        <div className="ara-rmv-table-responsive">
          <table className="ara-rmv-table">
            <thead>
              <tr>
                <th style={{ width: 45, textAlign: 'center' }}>STT</th>
                <th>Mã Nguyên Phụ Liệu</th>
                <th>Tên Nguyên Liệu & Quy Cách</th>
                <th style={{ textAlign: 'center' }}>Loại</th>
                <th>Danh Mục</th>
                <th style={{ textAlign: 'center' }}>Đơn Vị</th>
                <th className="ara-rmv-table-num">Tồn thực tế</th>
                <th className="ara-rmv-table-num">Giữ chỗ may</th>
                <th className="ara-rmv-table-num">Khả dụng</th>
                <th className="ara-rmv-table-num">Đơn giá vốn</th>
                <th className="ara-rmv-table-num">Tổng giá trị tồn (₫)</th>
                <th>Nhà Cung Cấp</th>
                <th style={{ textAlign: 'center' }}>Trạng thái</th>
                <th style={{ textAlign: 'center', width: 60 }}>Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {loadingList ? (
                <tr>
                  <td colSpan="14" style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                    <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px', display: 'block' }} />
                    <span>Đang tải danh sách định giá nguyên vật liệu...</span>
                  </td>
                </tr>
              ) : materials.length === 0 ? (
                <tr>
                  <td colSpan="14" style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>
                    <Package size={36} style={{ margin: '0 auto 10px', color: '#cbd5e1', display: 'block' }} />
                    <p style={{ fontWeight: 600, color: '#475569', margin: 0 }}>Không tìm thấy nguyên phụ liệu nào phù hợp</p>
                    <small>Vui lòng thử điều chỉnh lại từ khóa tìm kiếm hoặc bộ lọc danh mục.</small>
                  </td>
                </tr>
              ) : (
                materials.map((item, idx) => {
                  const isLow = item.onHandQty > 0 && item.onHandQty <= item.safetyStockThreshold;
                  const isOut = item.onHandQty === 0;

                  return (
                    <tr key={item._id}>
                      <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                        {(pagination.page - 1) * pagination.limit + idx + 1}
                      </td>

                      {/* Mã NVL */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="ara-rmv-code">{item.materialCode}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(item.materialCode)}
                            title="Sao chép mã"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94a3b8' }}
                          >
                            {copiedCode === item.materialCode ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                          </button>
                        </div>
                      </td>

                      {/* Tên NVL & Quy cách */}
                      <td>
                        <div className="ara-rmv-mat-name" title={item.materialName}>
                          {item.materialName}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 11.5, color: '#64748b' }}>
                          {item.color && <span>Màu: <strong>{item.color}</strong></span>}
                          {item.gsm && <span>| {item.gsm} gsm</span>}
                          {item.widthCm && <span>| Khổ {item.widthCm}cm</span>}
                        </div>
                      </td>

                      {/* Loại NVL */}
                      <td style={{ textAlign: 'center' }}>
                        <span className={`ara-rmv-badge ${item.materialType === 'FABRIC' ? 'ara-rmv-badge-fabric' : 'ara-rmv-badge-aux'}`}>
                          {item.materialType === 'FABRIC' ? 'Vải' : 'Phụ liệu'}
                        </span>
                      </td>

                      {/* Danh mục */}
                      <td>
                        <span style={{ fontSize: 12, color: '#334155' }}>
                          {CATEGORY_LABELS[item.category] || item.category}
                        </span>
                      </td>

                      {/* Đơn vị tính */}
                      <td style={{ textAlign: 'center' }}>
                        <span className="ara-rmv-badge ara-rmv-badge-unit">
                          {UNIT_LABELS[item.unit] || item.unit}
                        </span>
                      </td>

                      {/* Tồn thực tế */}
                      <td className="ara-rmv-table-num" style={{ fontWeight: 600 }}>
                        {formatNumber(item.onHandQty)}
                      </td>

                      {/* Giữ chỗ xuất may */}
                      <td className="ara-rmv-table-num" style={{ color: item.reservedQty > 0 ? '#d97706' : '#94a3b8' }}>
                        {formatNumber(item.reservedQty)}
                      </td>

                      {/* Khả dụng */}
                      <td className="ara-rmv-table-num" style={{ color: item.availableQty > 0 ? '#16a34a' : '#94a3b8', fontWeight: 700 }}>
                        {formatNumber(item.availableQty)}
                      </td>

                      {/* Đơn giá mua vốn */}
                      <td className="ara-rmv-table-num" style={{ color: '#475569' }}>
                        {formatVND(item.unitCost)}
                      </td>

                      {/* Tổng giá trị vốn */}
                      <td className="ara-rmv-table-num ara-rmv-val-bold" style={{ color: '#4f46e5' }}>
                        {formatVND(item.totalAssetValue)}
                      </td>

                      {/* Nhà cung cấp */}
                      <td style={{ fontSize: 12, color: '#475569', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.supplier?.supplierName || '—'}>
                        {item.supplier?.supplierName || '—'}
                      </td>

                      {/* Trạng thái tồn */}
                      <td style={{ textAlign: 'center' }}>
                        {isOut ? (
                          <span className="ara-rmv-badge" style={{ background: '#fee2e2', color: '#b91c1c' }}>Hết hàng</span>
                        ) : isLow ? (
                          <span className="ara-rmv-badge" style={{ background: '#fef3c7', color: '#b45309' }}>Chạm đáy</span>
                        ) : (
                          <span className="ara-rmv-badge" style={{ background: '#dcfce7', color: '#15803d' }}>Bình thường</span>
                        )}
                      </td>

                      {/* Nút xem chi tiết */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="ara-rmv-btn"
                          style={{ padding: '4px 8px' }}
                          title="Xem chi tiết nguyên liệu này"
                          onClick={() => setSelectedMaterial(item)}
                        >
                          <Eye size={14} color="#4f46e5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 6. Pagination Bar */}
        <div className="ara-rmv-pagination">
          <div className="ara-rmv-page-info">
            Hiển thị{' '}
            <strong>
              {materials.length === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1}
            </strong>{' '}
            -{' '}
            <strong>
              {Math.min(pagination.page * pagination.limit, pagination.total)}
            </strong>{' '}
            trong tổng số <strong>{formatNumber(pagination.total)}</strong> mã nguyên phụ liệu
          </div>

          <div className="ara-rmv-page-controls">
            <button
              type="button"
              className="ara-rmv-page-btn"
              disabled={pagination.page <= 1 || loadingList}
              onClick={() => fetchMaterialList(pagination.page - 1)}
            >
              <ChevronLeft size={16} />
              <span>Trước</span>
            </button>

            <span className="ara-rmv-page-current">
              Trang {pagination.page} / {pagination.totalPages || 1}
            </span>

            <button
              type="button"
              className="ara-rmv-page-btn"
              disabled={pagination.page >= pagination.totalPages || loadingList}
              onClick={() => fetchMaterialList(pagination.page + 1)}
            >
              <span>Sau</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 7. Modal Chi tiết định giá nguyên vật liệu */}
      {selectedMaterial && (
        <div className="ara-rmv-modal-overlay" onClick={() => setSelectedMaterial(null)}>
          <div className="ara-rmv-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="ara-rmv-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Layers size={20} color="#4f46e5" />
                <span className="ara-rmv-modal-title">Chi Tiết Định Giá Nguyên Phụ Liệu</span>
              </div>
              <button
                type="button"
                className="ara-rmv-btn"
                style={{ padding: 4, border: 'none' }}
                onClick={() => setSelectedMaterial(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="ara-rmv-modal-body">
              {/* Header Box */}
              <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                  {selectedMaterial.materialName}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#4f46e5', fontFamily: 'monospace', fontWeight: 700 }}>
                    Mã: {selectedMaterial.materialCode}
                  </span>
                  <span className={`ara-rmv-badge ${selectedMaterial.materialType === 'FABRIC' ? 'ara-rmv-badge-fabric' : 'ara-rmv-badge-aux'}`}>
                    {selectedMaterial.materialType === 'FABRIC' ? 'Vải cuộn' : 'Phụ liệu'}
                  </span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    Danh mục: <strong>{CATEGORY_LABELS[selectedMaterial.category] || selectedMaterial.category}</strong>
                  </span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    Đơn vị: <strong>{UNIT_LABELS[selectedMaterial.unit] || selectedMaterial.unit}</strong>
                  </span>
                </div>
              </div>

              {/* Grid 4 Box Định giá tài sản */}
              <div className="ara-rmv-modal-grid">
                <div className="ara-rmv-modal-box">
                  <span className="ara-rmv-modal-box-label">Tổng giá trị tài sản tồn kho</span>
                  <span className="ara-rmv-modal-box-value" style={{ color: '#4f46e5' }}>
                    {formatVND(selectedMaterial.totalAssetValue)}
                  </span>
                  <small style={{ color: '#64748b', fontSize: 11 }}>
                    (Tồn kho + Chờ cất kệ) × Đơn giá vốn
                  </small>
                </div>

                <div className="ara-rmv-modal-box">
                  <span className="ara-rmv-modal-box-label">Giá vốn đơn vị (unitCost)</span>
                  <span className="ara-rmv-modal-box-value" style={{ color: '#0f172a' }}>
                    {formatVND(selectedMaterial.unitCost)} / {UNIT_LABELS[selectedMaterial.unit] || selectedMaterial.unit}
                  </span>
                  <small style={{ color: '#64748b', fontSize: 11 }}>
                    Đơn giá mua vào từ hợp đồng / NCC
                  </small>
                </div>

                <div className="ara-rmv-modal-box">
                  <span className="ara-rmv-modal-box-label">Giá trị sẵn sàng cắt may</span>
                  <span className="ara-rmv-modal-box-value" style={{ color: '#16a34a' }}>
                    {formatVND((selectedMaterial.availableQty || 0) * selectedMaterial.unitCost)}
                  </span>
                  <small style={{ color: '#16a34a', fontSize: 11, fontWeight: 600 }}>
                    {formatNumber(selectedMaterial.availableQty)} {UNIT_LABELS[selectedMaterial.unit] || selectedMaterial.unit} khả dụng
                  </small>
                </div>

                <div className="ara-rmv-modal-box">
                  <span className="ara-rmv-modal-box-label">Giá trị đang giữ chỗ lệnh may</span>
                  <span className="ara-rmv-modal-box-value" style={{ color: '#d97706' }}>
                    {formatVND(selectedMaterial.reservedValue || 0)}
                  </span>
                  <small style={{ color: '#d97706', fontSize: 11, fontWeight: 600 }}>
                    {formatNumber(selectedMaterial.reservedQty || 0)} {UNIT_LABELS[selectedMaterial.unit] || selectedMaterial.unit} chờ xuất
                  </small>
                </div>
              </div>

              {/* Chi tiết số lượng */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>
                  Chi Tiết Số Lượng Tồn Kho:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, textAlign: 'center' }}>
                  <div style={{ background: '#f8fafc', padding: 8, borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Tồn thực tế trên kệ</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                      {formatNumber(selectedMaterial.onHandQty)}
                    </div>
                  </div>
                  <div style={{ background: '#fef3c7', padding: 8, borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: '#b45309' }}>Đã giữ chỗ may</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#b45309' }}>
                      {formatNumber(selectedMaterial.reservedQty)}
                    </div>
                  </div>
                  <div style={{ background: '#dcfce7', padding: 8, borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: '#15803d' }}>Khả dụng cấp phát</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#15803d' }}>
                      {formatNumber(selectedMaterial.availableQty)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Thông số kỹ thuật & Nhà cung cấp */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#475569', background: '#f1f5f9', padding: '10px 14px', borderRadius: 6 }}>
                <div>Nhà cung cấp đối tác: <strong>{selectedMaterial.supplier?.supplierName || 'Chưa liên kết'}</strong></div>
                {selectedMaterial.color && <div>Màu sắc: <strong>{selectedMaterial.color}</strong></div>}
                {selectedMaterial.gsm && <div>Định lượng vải: <strong>{selectedMaterial.gsm} gsm</strong></div>}
                {selectedMaterial.widthCm && <div>Khổ vải: <strong>{selectedMaterial.widthCm} cm</strong></div>}
                <div>Ngưỡng cảnh báo an toàn: <strong>{selectedMaterial.safetyStockThreshold} {UNIT_LABELS[selectedMaterial.unit] || selectedMaterial.unit}</strong></div>
                <div>Hạn lưu kho chuẩn FIFO: <strong>{selectedMaterial.fifoAgingThresholdDays || 90} ngày</strong></div>
              </div>
            </div>

            <div className="ara-rmv-modal-footer">
              <button
                type="button"
                className="ara-rmv-btn ara-rmv-btn-primary"
                onClick={() => setSelectedMaterial(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

