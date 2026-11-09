/*
 * File: ProductInventoryValuationPage.jsx
 * Role: ACCOUNTANT (Kế toán kho & Tài chính)
 * UC: UC 10 - View Total Inventory Valuation (Xem tổng giá trị định giá tài sản tồn kho sản phẩm)
 * Description: Báo cáo định giá tài sản tồn kho thành phẩm toàn diện:
 *              - Tổng giá trị tồn kho theo giá vốn thực tế (COGS)
 *              - Tồn kho khả dụng bán, hàng giữ chỗ đơn, hàng cách ly/lỗi KCS
 *              - Cơ cấu tỷ trọng theo danh mục sản phẩm
 *              - Doanh thu bán lẻ dự phóng & biên lợi nhuận gộp ước tính
 *              - Xuất báo cáo Excel chuyên nghiệp phục vụ kiểm toán & P&L.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Boxes,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  Search,
  Filter,
  Download,
  RefreshCw,
  Eye,
  Layers,
  ArrowUpDown,
  FileSpreadsheet,
  CheckCircle2,
  Package,
  X,
  Info,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react';
import accountantProcurementApi from '../../services/accountantProcurementApi.js';
import './productInventoryValuation.css';

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

export default function ProductInventoryValuationPage() {
  // State Summary & Categories
  const [summaryData, setSummaryData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(true);

  // State Table List
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loadingList, setLoadingList] = useState(true);

  // State Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedSize, setSelectedSize] = useState('ALL');
  const [stockStatus, setStockStatus] = useState('ALL'); // ALL | IN_STOCK | LOW_STOCK | OUT_OF_STOCK | QUARANTINE
  const [sortBy, setSortBy] = useState('TOTAL_VALUE_DESC');

  // State Modal Detail
  const [selectedSku, setSelectedSku] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);
  const [exportingExcel, setExportingExcel] = useState(false);

  // 1. Tải Summary & Categories
  const fetchSummaryAndCategories = useCallback(async () => {
    try {
      setLoadingSummary(true);
      const [sumRes, catRes] = await Promise.all([
        accountantProcurementApi.getProductValuationSummary(),
        accountantProcurementApi.getProductValuationCategories(),
      ]);
      setSummaryData(sumRes);
      setCategories(catRes || []);
    } catch (err) {
      console.error('Lỗi tải báo cáo tổng hợp định giá tồn kho:', err);
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  // 2. Tải danh sách sản phẩm theo bộ lọc & phân trang
  const fetchProductList = useCallback(
    async (targetPage = 1) => {
      try {
        setLoadingList(true);
        const params = {
          page: targetPage,
          limit: pagination.limit,
          search: searchTerm.trim() || undefined,
          category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
          size: selectedSize !== 'ALL' ? selectedSize : undefined,
          stockStatus: stockStatus !== 'ALL' ? stockStatus : undefined,
          sortBy,
        };
        const res = await accountantProcurementApi.getProductValuationList(params);
        setProducts(res.items || []);
        if (res.pagination) {
          setPagination((prev) => ({
            ...prev,
            ...res.pagination,
            page: targetPage,
          }));
        }
      } catch (err) {
        console.error('Lỗi tải danh sách định giá SKU:', err);
      } finally {
        setLoadingList(false);
      }
    },
    [pagination.limit, searchTerm, selectedCategory, selectedSize, stockStatus, sortBy]
  );

  useEffect(() => {
    fetchSummaryAndCategories();
  }, [fetchSummaryAndCategories]);

  useEffect(() => {
    fetchProductList(1);
  }, [selectedCategory, selectedSize, stockStatus, sortBy]);

  // Debounced Search Handle
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchProductList(1);
  };

  // Copy helper
  const handleCopy = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // 3. Xuất file Excel báo cáo định giá tài sản tồn kho
  const handleExportExcel = async () => {
    try {
      setExportingExcel(true);
      // Tải toàn bộ danh sách không phân trang
      const allRes = await accountantProcurementApi.getProductValuationList({
        page: 1,
        limit: 1000,
        search: searchTerm.trim() || undefined,
        category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
        size: selectedSize !== 'ALL' ? selectedSize : undefined,
        stockStatus: stockStatus !== 'ALL' ? stockStatus : undefined,
        sortBy,
      });

      const items = allRes.items || [];
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'AraStore WMS - Phân hệ Kế toán';
      workbook.created = new Date();

      // Sheet 1: Bảng định giá chi tiết
      const worksheet = workbook.addWorksheet('Định Giá Tồn Kho Thành Phẩm', {
        views: [{ showGridLines: true }],
      });

      // Title header
      worksheet.mergeCells('A1:L1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = 'BÁO CÁO ĐỊNH GIÁ TÀI SẢN TỒN KHO THÀNH PHẨM (WMS)';
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
        'Mã SKU',
        'Mã Vạch Barcode',
        'Tên Sản Phẩm',
        'Danh Mục',
        'Màu Sắc',
        'Size',
        'Tồn Kho Vật Lý',
        'Đã Giữ Chỗ Đơn',
        'Cách Ly / Lỗi KCS',
        'Tồn Khả Dụng Bán',
        'Giá Vốn Đơn Vị (COGS)',
        'Tổng Giá Trị Tồn Kho (COGS)',
        'Giá Bán Lẻ Đơn Vị',
        'Doanh Thu Bán Lẻ Dự Phóng',
        'Biên LN Gộp Ước Tính (%)',
        'Tình Trạng Tồn Kho',
      ];

      const headerRow = worksheet.addRow(headers);
      headerRow.height = 24;
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE2E8F0' },
        };
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1E293B' } };
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
        const row = worksheet.addRow([
          index + 1,
          item.skuCode,
          item.skuBarcode || '—',
          item.product?.productName || item.styleName,
          item.product?.category || '—',
          item.color,
          item.size,
          item.onHandQty,
          item.reservedQty,
          item.defectQuarantineQty,
          item.availableQty,
          item.unitCogs,
          item.totalAssetValue,
          item.retailPrice,
          item.retailPotentialValue,
          `${item.marginPercent}%`,
          item.stockStatus === 'OUT_OF_STOCK'
            ? 'Hết hàng'
            : item.stockStatus === 'LOW_STOCK'
            ? 'Chạm đáy an toàn'
            : 'Đủ tồn kho',
        ]);

        row.height = 20;
        row.getCell(1).alignment = { horizontal: 'center' };
        row.getCell(2).alignment = { horizontal: 'left' };
        row.getCell(3).alignment = { horizontal: 'center' };
        row.getCell(6).alignment = { horizontal: 'center' };
        row.getCell(7).alignment = { horizontal: 'center' };
        row.getCell(8).alignment = { horizontal: 'right' };
        row.getCell(9).alignment = { horizontal: 'right' };
        row.getCell(10).alignment = { horizontal: 'right' };
        row.getCell(11).alignment = { horizontal: 'right' };

        // Currency format
        [12, 13, 14, 15].forEach((colIdx) => {
          const c = row.getCell(colIdx);
          c.numFmt = '#,##0';
          c.alignment = { horizontal: 'right' };
        });

        row.getCell(16).alignment = { horizontal: 'right' };
        row.getCell(17).alignment = { horizontal: 'center' };

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
      const sumRetailPotential = items.reduce((acc, it) => acc + (it.retailPotentialValue || 0), 0);
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
        '',
        sumTotalAsset,
        '',
        sumRetailPotential,
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
      totalRow.getCell(13).numFmt = '#,##0';
      totalRow.getCell(15).numFmt = '#,##0';

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

      // Sheet 2: Báo cáo theo danh mục
      if (summaryData?.categoryBreakdown?.length) {
        const catSheet = workbook.addWorksheet('Cơ Cấu Theo Danh Mục');
        catSheet.addRow(['Danh Mục Sản Phẩm', 'Số Lượng SKU', 'Tổng Tồn Kho', 'Giá Trị Vốn (₫)', 'Tỷ Trọng (%)']);
        catSheet.getRow(1).font = { bold: true };
        summaryData.categoryBreakdown.forEach((cat) => {
          catSheet.addRow([
            cat.category,
            cat.skuCount,
            cat.totalQty,
            cat.totalValue,
            `${cat.valueSharePercent}%`,
          ]);
        });
        catSheet.columns.forEach((col) => {
          col.width = 22;
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
      a.download = `Bao_Cao_Dinh_Gia_Ton_Kho_Thanh_Pham_${dateStr}.xlsx`;
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
    <div className="ara-piv-container">
      {/* 1. Header & Actions */}
      <div className="ara-piv-header">
        <div className="ara-piv-title-box">
          <h2 className="ara-piv-title">
            <Boxes size={22} color="#0284c7" />
            Định Giá Tồn Kho Sản Phẩm Thành Phẩm
          </h2>
          <p className="ara-piv-subtitle">
            UC 10 · Kiểm soát giá vốn hàng bán (COGS), giá trị tồn kho khả dụng bán, hàng giữ chỗ, hàng cách ly KCS và doanh thu bán lẻ dự phóng.
          </p>
        </div>

        <div className="ara-piv-actions">
          <button
            type="button"
            className="ara-piv-btn"
            onClick={() => {
              fetchSummaryAndCategories();
              fetchProductList(pagination.page);
            }}
            disabled={loadingSummary || loadingList}
            title="Làm mới dữ liệu tồn kho"
          >
            <RefreshCw size={15} className={loadingSummary || loadingList ? 'spin' : ''} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            className="ara-piv-btn ara-piv-btn-success"
            onClick={handleExportExcel}
            disabled={exportingExcel || products.length === 0}
            title="Xuất bảng định giá ra file Excel (.xlsx)"
          >
            <FileSpreadsheet size={15} />
            <span>{exportingExcel ? 'Đang tạo Excel...' : 'Xuất Excel'}</span>
          </button>
        </div>
      </div>

      {/* 2. Top Metric Cards */}
      <div className="ara-piv-metrics-grid">
        {/* Card 1: Tổng giá trị tài sản kho */}
        <div className="ara-piv-metric-card">
          <div className="ara-piv-metric-header">
            <span className="ara-piv-metric-label">Tổng giá trị tồn kho (COGS)</span>
            <div className="ara-piv-metric-icon blue">
              <Boxes size={18} />
            </div>
          </div>
          <div className="ara-piv-metric-value">{formatVND(summary.totalAssetValue)}</div>
          <div className="ara-piv-metric-subtext">
            <span>Gồm tồn vật lý + hàng cách ly</span>
          </div>
        </div>

        {/* Card 2: Giá trị tồn kho sẵn sàng bán */}
        <div className="ara-piv-metric-card">
          <div className="ara-piv-metric-header">
            <span className="ara-piv-metric-label">Giá trị sẵn sàng bán</span>
            <div className="ara-piv-metric-icon green">
              <ShieldCheck size={18} />
            </div>
          </div>
          <div className="ara-piv-metric-value">{formatVND(summary.totalOnHandValue)}</div>
          <div className="ara-piv-metric-subtext">
            <span>{formatNumber(summary.totalOnHandQty)} sản phẩm trong kho</span>
          </div>
        </div>

        {/* Card 3: Hàng cách ly / Lỗi KCS */}
        <div className="ara-piv-metric-card">
          <div className="ara-piv-metric-header">
            <span className="ara-piv-metric-label">Hàng cách ly / Lỗi KCS</span>
            <div className="ara-piv-metric-icon rose">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="ara-piv-metric-value" style={{ color: summary.totalQuarantineValue > 0 ? '#dc2626' : undefined }}>
            {formatVND(summary.totalQuarantineValue)}
          </div>
          <div className="ara-piv-metric-subtext">
            <span>{formatNumber(summary.totalQuarantineQty)} chiếc đang cách ly</span>
          </div>
        </div>

        {/* Card 4: Giá trị đã giữ chỗ đơn hàng */}
        <div className="ara-piv-metric-card">
          <div className="ara-piv-metric-header">
            <span className="ara-piv-metric-label">Đã giữ chỗ đơn bán</span>
            <div className="ara-piv-metric-icon amber">
              <Package size={18} />
            </div>
          </div>
          <div className="ara-piv-metric-value">{formatVND(summary.totalReservedValue)}</div>
          <div className="ara-piv-metric-subtext">
            <span>{formatNumber(summary.totalReservedQty)} chiếc đang chờ đóng gói</span>
          </div>
        </div>

        {/* Card 5: Doanh thu bán lẻ dự phóng & Biên LN */}
        <div className="ara-piv-metric-card">
          <div className="ara-piv-metric-header">
            <span className="ara-piv-metric-label">Bán lẻ dự phóng & Biên LN</span>
            <div className="ara-piv-metric-icon purple">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="ara-piv-metric-value">{formatVND(summary.totalRetailPotentialValue)}</div>
          <div className="ara-piv-metric-subtext">
            <span style={{ color: '#16a34a', fontWeight: 600 }}>
              LN gộp: {formatVND(summary.estimatedGrossProfit)} ({summary.overallMarginPercent}%)
            </span>
          </div>
        </div>
      </div>

      {/* 3. Category Breakdown Bar */}
      {summaryData?.categoryBreakdown?.length > 0 && (
        <div className="ara-piv-cat-card">
          <div className="ara-piv-cat-header">
            <div className="ara-piv-cat-title">
              <Layers size={16} color="#0284c7" />
              <span>Cơ cấu tỷ trọng giá trị theo danh mục sản phẩm:</span>
            </div>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Bấm vào danh mục để lọc nhanh bảng chi tiết
            </span>
          </div>

          <div className="ara-piv-cat-items">
            <button
              type="button"
              className={`ara-piv-cat-pill ${selectedCategory === 'ALL' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('ALL')}
            >
              <span>Tất cả</span>
              <span className="share">({summaryData.categoryBreakdown.length})</span>
            </button>
            {summaryData.categoryBreakdown.map((cat) => (
              <button
                type="button"
                key={cat.category}
                className={`ara-piv-cat-pill ${selectedCategory === cat.category ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.category)}
              >
                <span>{cat.category}</span>
                <span className="share">
                  {formatVND(cat.totalValue)} ({cat.valueSharePercent}%)
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4. Filters & Search Bar */}
      <div className="ara-piv-filters-bar">
        <form className="ara-piv-filters-row" onSubmit={handleSearchSubmit}>
          {/* Search Box */}
          <div className="ara-piv-search-box">
            <Search size={15} className="ara-piv-search-icon" />
            <input
              type="search"
              className="ara-piv-search-input"
              placeholder="Tìm kiếm mã SKU, barcode, tên sản phẩm, màu sắc..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Category Select */}
          <select
            className="ara-piv-select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="ALL">Tất cả danh mục</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Size Select */}
          <select
            className="ara-piv-select"
            value={selectedSize}
            onChange={(e) => setSelectedSize(e.target.value)}
          >
            <option value="ALL">Tất cả size</option>
            {['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREESIZE'].map((s) => (
              <option key={s} value={s}>
                Size {s}
              </option>
            ))}
          </select>

          {/* Sort By */}
          <select
            className="ara-piv-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="TOTAL_VALUE_DESC">Giá trị vốn: Cao → Thấp</option>
            <option value="TOTAL_VALUE_ASC">Giá trị vốn: Thấp → Cao</option>
            <option value="ON_HAND_DESC">Tồn kho: Nhiều → Ít</option>
            <option value="ON_HAND_ASC">Tồn kho: Ít → Nhiều</option>
            <option value="COGS_DESC">Giá vốn (COGS): Cao → Thấp</option>
            <option value="COGS_ASC">Giá vốn (COGS): Thấp → Cao</option>
            <option value="NAME_ASC">Tên sản phẩm: A → Z</option>
          </select>

          <button type="submit" className="ara-piv-btn ara-piv-btn-primary">
            <Search size={14} />
            <span>Tìm kiếm</span>
          </button>
        </form>

        {/* Status Tabs */}
        <div className="ara-piv-status-tabs">
          <span style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginRight: 4 }}>
            Tình trạng tồn:
          </span>
          <button
            type="button"
            className={`ara-piv-tab-btn ${stockStatus === 'ALL' ? 'active' : ''}`}
            onClick={() => setStockStatus('ALL')}
          >
            Tất cả ({summary.totalSkuCount || 0})
          </button>
          <button
            type="button"
            className={`ara-piv-tab-btn ${stockStatus === 'IN_STOCK' ? 'active' : ''}`}
            onClick={() => setStockStatus('IN_STOCK')}
          >
            Còn hàng ({(summary.totalSkuCount || 0) - (summary.outOfStockCount || 0)})
          </button>
          <button
            type="button"
            className={`ara-piv-tab-btn ${stockStatus === 'LOW_STOCK' ? 'active' : ''}`}
            onClick={() => setStockStatus('LOW_STOCK')}
          >
            Chạm đáy an toàn ({summary.lowStockCount || 0})
          </button>
          <button
            type="button"
            className={`ara-piv-tab-btn ${stockStatus === 'OUT_OF_STOCK' ? 'active' : ''}`}
            onClick={() => setStockStatus('OUT_OF_STOCK')}
          >
            Hết hàng ({summary.outOfStockCount || 0})
          </button>
          <button
            type="button"
            className={`ara-piv-tab-btn ${stockStatus === 'QUARANTINE' ? 'active' : ''}`}
            onClick={() => setStockStatus('QUARANTINE')}
          >
            Có hàng cách ly ({summary.quarantineItemCount || 0})
          </button>
        </div>
      </div>

      {/* 5. Main Data Table */}
      <div className="ara-piv-table-card">
        <div className="ara-piv-table-responsive">
          <table className="ara-piv-table">
            <thead>
              <tr>
                <th style={{ width: 45, textAlign: 'center' }}>STT</th>
                <th>Mã SKU / Barcode</th>
                <th>Tên sản phẩm & Màu</th>
                <th style={{ textAlign: 'center' }}>Size</th>
                <th className="ara-piv-table-num">Tồn vật lý</th>
                <th className="ara-piv-table-num">Giữ chỗ</th>
                <th className="ara-piv-table-num">Cách ly</th>
                <th className="ara-piv-table-num">Khả dụng</th>
                <th className="ara-piv-table-num">Giá vốn (COGS)</th>
                <th className="ara-piv-table-num">Giá bán lẻ</th>
                <th className="ara-piv-table-num">Tổng giá trị tồn (COGS)</th>
                <th className="ara-piv-table-num">Biên LN (%)</th>
                <th style={{ textAlign: 'center' }}>Trạng thái</th>
                <th style={{ textAlign: 'center', width: 60 }}>Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {loadingList ? (
                <tr>
                  <td colSpan="14" style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                    <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px', display: 'block' }} />
                    <span>Đang tải danh sách định giá tồn kho...</span>
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan="14" style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>
                    <Package size={36} style={{ margin: '0 auto 10px', color: '#cbd5e1', display: 'block' }} />
                    <p style={{ fontWeight: 600, color: '#475569', margin: 0 }}>Không tìm thấy phân loại SKU nào phù hợp</p>
                    <small>Vui lòng thử điều chỉnh lại từ khóa tìm kiếm hoặc bộ lọc danh mục.</small>
                  </td>
                </tr>
              ) : (
                products.map((item, idx) => {
                  const isLow = item.onHandQty > 0 && item.onHandQty <= item.safetyStockThreshold;
                  const isOut = item.onHandQty === 0;
                  const hasQuarantine = item.defectQuarantineQty > 0;

                  return (
                    <tr key={item._id}>
                      <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                        {(pagination.page - 1) * pagination.limit + idx + 1}
                      </td>

                      {/* Mã SKU & Barcode */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="ara-piv-sku-code">{item.skuCode}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(item.skuCode)}
                            title="Sao chép mã SKU"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94a3b8' }}
                          >
                            {copiedCode === item.skuCode ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                          </button>
                        </div>
                        {item.skuBarcode && item.skuBarcode !== item.skuCode && (
                          <div className="ara-piv-sku-barcode">BC: {item.skuBarcode}</div>
                        )}
                      </td>

                      {/* Tên sản phẩm, màu & danh mục */}
                      <td>
                        <div className="ara-piv-product-name" title={item.product?.productName || item.styleName}>
                          {item.product?.productName || item.styleName}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          <span style={{ fontSize: 11.5, color: '#64748b' }}>Màu: <strong>{item.color}</strong></span>
                          {item.product?.category && (
                            <span className="ara-piv-badge ara-piv-badge-category">
                              {item.product.category}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Size */}
                      <td style={{ textAlign: 'center' }}>
                        <span className="ara-piv-badge ara-piv-badge-size">{item.size}</span>
                      </td>

                      {/* Tồn vật lý */}
                      <td className="ara-piv-table-num" style={{ fontWeight: 600 }}>
                        {formatNumber(item.onHandQty)}
                      </td>

                      {/* Giữ chỗ */}
                      <td className="ara-piv-table-num" style={{ color: item.reservedQty > 0 ? '#d97706' : '#94a3b8' }}>
                        {formatNumber(item.reservedQty)}
                      </td>

                      {/* Cách ly / Lỗi KCS */}
                      <td
                        className="ara-piv-table-num"
                        style={{
                          color: hasQuarantine ? '#dc2626' : '#94a3b8',
                          fontWeight: hasQuarantine ? 700 : 'normal',
                        }}
                      >
                        {formatNumber(item.defectQuarantineQty)}
                      </td>

                      {/* Khả dụng bán */}
                      <td
                        className="ara-piv-table-num"
                        style={{
                          color: item.availableQty > 0 ? '#16a34a' : '#94a3b8',
                          fontWeight: 700,
                        }}
                      >
                        {formatNumber(item.availableQty)}
                      </td>

                      {/* Đơn giá vốn COGS */}
                      <td className="ara-piv-table-num" style={{ color: '#475569' }}>
                        {formatVND(item.unitCogs)}
                      </td>

                      {/* Giá bán lẻ */}
                      <td className="ara-piv-table-num" style={{ color: '#0f172a' }}>
                        {formatVND(item.retailPrice)}
                      </td>

                      {/* Tổng giá trị vốn */}
                      <td className="ara-piv-table-num ara-piv-val-bold" style={{ color: '#0284c7' }}>
                        {formatVND(item.totalAssetValue)}
                      </td>

                      {/* Biên lợi nhuận gộp */}
                      <td
                        className="ara-piv-table-num"
                        style={{
                          color: item.marginPercent >= 40 ? '#16a34a' : item.marginPercent > 0 ? '#d97706' : '#94a3b8',
                          fontWeight: 600,
                        }}
                      >
                        {item.marginPercent}%
                      </td>

                      {/* Trạng thái tồn */}
                      <td style={{ textAlign: 'center' }}>
                        {isOut ? (
                          <span className="ara-piv-badge ara-piv-status-out">Hết hàng</span>
                        ) : isLow ? (
                          <span className="ara-piv-badge ara-piv-status-low">Chạm đáy ({item.safetyStockThreshold})</span>
                        ) : (
                          <span className="ara-piv-badge ara-piv-status-normal">Bình thường</span>
                        )}
                      </td>

                      {/* Hành động */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="ara-piv-btn"
                          style={{ padding: '4px 8px' }}
                          title="Xem chi tiết định giá phân loại này"
                          onClick={() => setSelectedSku(item)}
                        >
                          <Eye size={14} color="#0284c7" />
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
        <div className="ara-piv-pagination">
          <div className="ara-piv-page-info">
            Hiển thị{' '}
            <strong>
              {products.length === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1}
            </strong>{' '}
            -{' '}
            <strong>
              {Math.min(pagination.page * pagination.limit, pagination.total)}
            </strong>{' '}
            trong tổng số <strong>{formatNumber(pagination.total)}</strong> mã phân loại SKU
          </div>

          <div className="ara-piv-page-controls">
            <button
              type="button"
              className="ara-piv-page-btn"
              disabled={pagination.page <= 1 || loadingList}
              onClick={() => fetchProductList(pagination.page - 1)}
            >
              <ChevronLeft size={16} />
              <span>Trước</span>
            </button>

            <span className="ara-piv-page-current">
              Trang {pagination.page} / {pagination.totalPages || 1}
            </span>

            <button
              type="button"
              className="ara-piv-page-btn"
              disabled={pagination.page >= pagination.totalPages || loadingList}
              onClick={() => fetchProductList(pagination.page + 1)}
            >
              <span>Sau</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 7. Modal: Chi tiết định giá SKU */}
      {selectedSku && (
        <div className="ara-piv-modal-overlay" onClick={() => setSelectedSku(null)}>
          <div className="ara-piv-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="ara-piv-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Boxes size={20} color="#0284c7" />
                <span className="ara-piv-modal-title">Chi Tiết Định Giá Phân Loại SKU</span>
              </div>
              <button
                type="button"
                className="ara-piv-btn"
                style={{ padding: 4, border: 'none' }}
                onClick={() => setSelectedSku(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="ara-piv-modal-body">
              {/* Top SKU identifier */}
              <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                  {selectedSku.product?.productName || selectedSku.styleName}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#0284c7', fontFamily: 'monospace', fontWeight: 700 }}>
                    SKU: {selectedSku.skuCode}
                  </span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    Barcode: <strong>{selectedSku.skuBarcode || '—'}</strong>
                  </span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    Màu: <strong>{selectedSku.color}</strong>
                  </span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    Size: <strong>{selectedSku.size}</strong>
                  </span>
                  {selectedSku.product?.category && (
                    <span className="ara-piv-badge ara-piv-badge-category">
                      {selectedSku.product.category}
                    </span>
                  )}
                </div>
              </div>

              {/* Grid 4 box định giá tài sản */}
              <div className="ara-piv-modal-grid">
                <div className="ara-piv-modal-box">
                  <span className="ara-piv-modal-box-label">Tổng giá trị tài sản vốn (COGS)</span>
                  <span className="ara-piv-modal-box-value" style={{ color: '#0284c7' }}>
                    {formatVND(selectedSku.totalAssetValue)}
                  </span>
                  <small style={{ color: '#64748b', fontSize: 11 }}>
                    (Tồn thực tế + Cách ly) × Đơn giá vốn
                  </small>
                </div>

                <div className="ara-piv-modal-box">
                  <span className="ara-piv-modal-box-label">Doanh thu bán lẻ dự phóng</span>
                  <span className="ara-piv-modal-box-value" style={{ color: '#9333ea' }}>
                    {formatVND(selectedSku.retailPotentialValue)}
                  </span>
                  <small style={{ color: '#64748b', fontSize: 11 }}>
                    Tồn thực tế × Giá bán lẻ
                  </small>
                </div>

                <div className="ara-piv-modal-box">
                  <span className="ara-piv-modal-box-label">Giá vốn đơn vị (COGS)</span>
                  <span className="ara-piv-modal-box-value" style={{ color: '#475569' }}>
                    {formatVND(selectedSku.unitCogs)}
                  </span>
                  <small style={{ color: '#64748b', fontSize: 11 }}>
                    Đơn giá vốn ghi nhận trên hệ thống
                  </small>
                </div>

                <div className="ara-piv-modal-box">
                  <span className="ara-piv-modal-box-label">Giá bán lẻ niêm yết</span>
                  <span className="ara-piv-modal-box-value" style={{ color: '#16a34a' }}>
                    {formatVND(selectedSku.retailPrice)}
                  </span>
                  <small style={{ color: '#16a34a', fontSize: 11, fontWeight: 600 }}>
                    Biên lợi nhuận gộp: {selectedSku.marginPercent}%
                  </small>
                </div>
              </div>

              {/* Tình trạng số lượng tồn */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>
                  Chi Tiết Số Lượng Tồn Kho Vật Lý:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, textAlign: 'center' }}>
                  <div style={{ background: '#f8fafc', padding: 8, borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Tồn thực tế</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                      {formatNumber(selectedSku.onHandQty)}
                    </div>
                  </div>
                  <div style={{ background: '#fef3c7', padding: 8, borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: '#b45309' }}>Đã giữ chỗ đơn</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#b45309' }}>
                      {formatNumber(selectedSku.reservedQty)}
                    </div>
                  </div>
                  <div style={{ background: '#fee2e2', padding: 8, borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: '#b91c1c' }}>Cách ly / Lỗi KCS</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#b91c1c' }}>
                      {formatNumber(selectedSku.defectQuarantineQty)}
                    </div>
                  </div>
                  <div style={{ background: '#dcfce7', padding: 8, borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: '#15803d' }}>Khả dụng bán</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#15803d' }}>
                      {formatNumber(selectedSku.availableQty)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Ngưỡng kiểm soát */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#64748b', background: '#f1f5f9', padding: '8px 12px', borderRadius: 6 }}>
                <span>Ngưỡng an toàn tối thiểu: <strong>{selectedSku.safetyStockThreshold} chiếc</strong></span>
                <span>Hạn vòng quay FIFO: <strong>{selectedSku.fifoAgingThresholdDays || 60} ngày</strong></span>
              </div>
            </div>

            <div className="ara-piv-modal-footer">
              <button
                type="button"
                className="ara-piv-btn ara-piv-btn-primary"
                onClick={() => setSelectedSku(null)}
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

