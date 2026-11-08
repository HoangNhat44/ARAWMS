import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FileText,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Eye,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Building2,
  Layers,
  CreditCard,
  Banknote,
  UploadCloud,
  Trash2,
  Image as ImageIcon,
  X,
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowDownRight,
  Truck,
  TrendingUp,
  TrendingDown,
  Receipt,
  RotateCcw,
  Calendar,
  Clock,
  ShieldCheck,
  Check,
} from 'lucide-react';
import accountantProcurementApi from '../../services/accountantProcurementApi.js';
import { validatePaymentVoucherForm } from '../../utils/procurementValidation.js';

// Trạng thái phiếu chi (Ngắn gọn, chuẩn nghiệp vụ, chống tràn chữ)
const VOUCHER_STATUS_CONFIG = {
  DRAFT: {
    label: 'Bản nháp',
    cls: 'wms-status-pending',
    desc: 'Phiếu chi đang lập nháp, chưa xuất quỹ',
  },
  CONFIRMED: {
    label: 'Chờ chi tiền',
    cls: 'wms-status-processing',
    desc: 'Phiếu chi đã lập thành công, sẵn sàng thực hiện chi tiền xuất quỹ',
  },
  PAID: {
    label: 'Đã chi tiền',
    cls: 'wms-status-available',
    desc: 'Tiền đã thực chi, đã hạch toán trừ nợ NCC',
  },
  CANCELLED: {
    label: 'Đã hủy',
    cls: 'wms-status-rejected',
    desc: 'Phiếu chi đã bị hủy bỏ',
  },
};

const CATEGORY_LABELS = {
  SUPPLIER_PAYMENT: 'Chi trả Nhà cung cấp',
  CUSTOMER_REFUND: 'Chi hoàn tiền Khách hàng',
  SHIPPING_COST: 'Chi cước Vận chuyển',
  PRODUCTION_COST: 'Chi gia công Sản xuất',
  OPERATING_EXPENSE: 'Chi vận hành & Vật tư kho',
  OTHER_EXPENSE: 'Chi phí hoạt động khác',
  CARRIER_COD_PAYOUT: 'Thu tiền COD đối soát (GHN)',
  SURCHARGE_REVENUE: 'Thu phụ phí đổi trả',
  CARRIER_DISPUTE_COMPENSATION: 'Thu bồi thường khiếu nại VC',
  // Backward compatibility
  SUPPLIER_DEPOSIT: 'Chi đặt cọc NCC',
  SUPPLIER_INSTALLMENT: 'Chi thanh toán đợt NCC',
  CUSTOMER_RETURN_REFUND: 'Chi hoàn tiền đổi trả',
  OPERATIONAL_EXPENSE: 'Chi phí vận hành',
};

const getVoucherStatusBadge = (voucher) => {
  const isCashIn = voucher.flowType === 'CASH_IN';
  if (voucher.status === 'PAID') {
    return {
      label: isCashIn ? 'Đã thu tiền' : 'Đã chi tiền',
      cls: isCashIn ? 'wms-status-available' : 'wms-status-rejected',
      style: isCashIn
        ? { backgroundColor: '#DCFCE7', color: '#15803D', borderColor: '#BBF7D0' }
        : { backgroundColor: '#FEE2E2', color: '#B91C1C', borderColor: '#FCA5A5' },
    };
  }
  if (voucher.status === 'CONFIRMED') {
    return {
      label: isCashIn ? 'Chờ thu tiền' : 'Chờ chi tiền',
      cls: 'wms-status-processing',
      style: isCashIn
        ? { backgroundColor: '#EFF6FF', color: '#1D4ED8', borderColor: '#BFDBFE' }
        : { backgroundColor: '#FFF7ED', color: '#C2410C', borderColor: '#FED7AA' },
    };
  }
  if (voucher.status === 'DRAFT') {
    return {
      label: 'Bản nháp',
      cls: 'wms-status-pending',
    };
  }
  if (voucher.status === 'CANCELLED') {
    return {
      label: 'Đã hủy',
      cls: 'wms-status-rejected',
      style: { backgroundColor: '#F1F5F9', color: '#64748B', borderColor: '#CBD5E1' },
    };
  }
  return {
    label: voucher.status || (isCashIn ? 'Đã thu' : 'Đã chi'),
    cls: isCashIn ? 'wms-status-available' : 'wms-status-rejected',
    style: isCashIn
      ? { backgroundColor: '#DCFCE7', color: '#15803D', borderColor: '#BBF7D0' }
      : { backgroundColor: '#FEE2E2', color: '#B91C1C', borderColor: '#FCA5A5' },
  };
};

const formatVnd = (amount) =>
  Number(amount || 0).toLocaleString('vi-VN') + ' đ';

const formatDate = (val) => {
  if (!val) return '—';
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('vi-VN');
  } catch {
    return '—';
  }
};

const formatDateTime = (val) => {
  if (!val) return '—';
  try {
    const d = new Date(val);
    return isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
};

/**
 * Nén ảnh tự động trên trình duyệt trước khi chuyển sang Base64
 */
const compressImage = (file, maxWidth = 1600, quality = 0.82) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(e.target.result);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
};

/**
 * Lấy danh sách các đợt thanh toán hợp đồng (Bao gồm Đặt cọc và các Đợt paymentSchedule)
 */
const getContractInstallments = (contract) => {
  if (!contract) return [];
  const list = [];
  const terms = contract.commercialTerms || {};
  const totalAmount = contract.totalContractAmount || terms.subtotalAmount || 0;

  // 1. Tiền đặt cọc (nếu có depositPercent hoặc depositAmount > 0)
  const depositPct = Number(terms.depositPercent || 0);
  const depositAmt = Number(terms.depositAmount || Math.round((totalAmount * depositPct) / 100));
  if (depositAmt > 0 || depositPct > 0) {
    list.push({
      installmentNumber: 0,
      label: `Đặt cọc hợp đồng (${depositPct}% - ${formatVnd(depositAmt)})`,
      shortLabel: `Đặt cọc (${depositPct}%)`,
      amount: depositAmt,
      percent: depositPct,
      dueDate: contract.validityPeriod?.effectiveDate || null,
      note: 'Thanh toán tiền đặt cọc thực hiện hợp đồng theo cam kết ban đầu',
      isDeposit: true,
    });
  }

  // 2. Các đợt thanh toán (paymentSchedule)
  if (Array.isArray(terms.paymentSchedule) && terms.paymentSchedule.length > 0) {
    terms.paymentSchedule.forEach((sch, idx) => {
      const instNum = sch.installmentNumber || idx + 1;
      const pct = Number(sch.paymentPercent || 0);
      const amt = Number(sch.paymentAmount || Math.round((totalAmount * pct) / 100));
      list.push({
        installmentNumber: instNum,
        label: `Đợt ${instNum} (${pct}% - ${formatVnd(amt)})`,
        shortLabel: `Đợt ${instNum} (${pct}%)`,
        amount: amt,
        percent: pct,
        dueDate: sch.dueDate || null,
        note: sch.note || `Thanh toán Đợt ${instNum} (${pct}%) theo hợp đồng`,
        isDeposit: false,
      });
    });
  }

  return list;
};

/**
 * Lấy Map các đợt đã có phiếu chi (CONFIRMED/PAID/DRAFT) cho hợp đồng
 */
const getPaidInstallmentsForContract = (contractId, voucherList) => {
  const map = new Map();
  if (!contractId || !Array.isArray(voucherList)) return map;

  voucherList.forEach((v) => {
    const vContractId = v.contractId?._id || v.contractId?.id || v.contractId;
    if (String(vContractId) === String(contractId) && v.status !== 'CANCELLED') {
      if (Array.isArray(v.installmentNumbers) && v.installmentNumbers.length > 0) {
        v.installmentNumbers.forEach((num) => map.set(Number(num), v));
      }
      if (v.installmentNumber !== null && v.installmentNumber !== undefined) {
        map.set(Number(v.installmentNumber), v);
      } else if (!Array.isArray(v.installmentNumbers) || v.installmentNumbers.length === 0) {
        const reason = (v.paymentReason || '').toLowerCase();
        if (reason.includes('đặt cọc') || reason.includes('tiền cọc')) {
          map.set(0, v);
        } else if (reason.includes('đợt 1') || reason.includes('lần 1')) {
          map.set(1, v);
        } else if (reason.includes('đợt 2') || reason.includes('lần 2')) {
          map.set(2, v);
        } else if (reason.includes('đợt 3') || reason.includes('lần 3')) {
          map.set(3, v);
        }
      }
    }
  });

  return map;
};

// UC: Lập phiếu chi tiền mặt & ngân hàng (Accountant tự duyệt & giải ngân)
const PaymentVoucherPage = () => {
  const [searchParams] = useSearchParams();
  const preselectedSupplierId = searchParams.get('supplierId') || '';
  const preselectedContractId = searchParams.get('contractId') || '';

  // Tab: 'VOUCHER_LIST' | 'CREATE_VOUCHER'
  const [activeTab, setActiveTab] = useState(
    preselectedSupplierId || preselectedContractId ? 'CREATE_VOUCHER' : 'VOUCHER_LIST'
  );

  const [vouchers, setVouchers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [flowTypeFilter, setFlowTypeFilter] = useState('ALL'); // 'ALL' | 'CASH_IN' | 'CASH_OUT'
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [sortBy, setSortBy] = useState('NEWEST'); // 'NEWEST' | 'OLDEST' | 'AMOUNT_DESC' | 'AMOUNT_ASC'

  // Modals
  const [selectedVoucherForDetail, setSelectedVoucherForDetail] = useState(null);
  const [disbursementModalVoucher, setDisbursementModalVoucher] = useState(null);
  const [disbursementForm, setDisbursementForm] = useState({
    transactionReference: '',
    paidAt: new Date().toISOString().slice(0, 16),
  });
  const [cancelModalVoucher, setCancelModalVoucher] = useState(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [lightboxImage, setLightboxImage] = useState(null);

  // Form State
  const [installmentMode, setInstallmentMode] = useState('INSTALLMENT'); // 'INSTALLMENT' | 'CUSTOM'
  const [selectedInstallmentNumbers, setSelectedInstallmentNumbers] = useState([]);

  const [voucherForm, setVoucherForm] = useState({
    flowType: 'CASH_OUT',
    category: preselectedSupplierId ? 'SUPPLIER_PAYMENT' : 'SUPPLIER_PAYMENT',
    paymentReason: '',
    amount: '',
    paymentMethod: 'BANK_TRANSFER',
    recipient: {
      name: '',
      phone: '',
      address: '',
      recipientType: 'SUPPLIER',
    },
    bankInfo: {
      bankName: '',
      accountNo: '',
      accountHolder: '',
      branchName: '',
    },
    supplierId: preselectedSupplierId,
    contractId: preselectedContractId,
    installmentNumber: null,
    installmentNumbers: [],
    installmentLabel: '',
    returnRequestId: '',
    supportingDocuments: [],
    voucherDate: new Date().toISOString().slice(0, 10),
    notes: '',
    status: 'CONFIRMED', // Mặc định sẵn sàng chi/thu tiền ngay sau khi lập, không cần chờ duyệt
  });
  const [formErrors, setFormErrors] = useState({});

  // 1. Tải dữ liệu ban đầu
  const loadData = async () => {
    try {
      setLoading(true);
      const [vouchersData, catData, supData, contractsData] = await Promise.all([
        accountantProcurementApi.getPaymentVouchers(),
        accountantProcurementApi.getExpenseCategories(),
        accountantProcurementApi.getSuppliers(),
        accountantProcurementApi.getContracts(),
      ]);

      setVouchers(vouchersData);
      setCategories(catData);
      setSuppliers(supData);
      setContracts(contractsData);

      // Nếu có preselectedSupplierId, tự động điền form và nạp hợp đồng còn nợ
      if (preselectedSupplierId) {
        const foundSup = supData.find((s) => String(s._id || s.id) === String(preselectedSupplierId));
        if (foundSup) {
          applySupplierToForm(foundSup, preselectedContractId);

          // Tự động tìm và chọn hợp đồng ACTIVE của NCC này (nếu có preselectedContractId hoặc hợp đồng đầu tiên)
          const supActiveContracts = (contractsData || []).filter(
            (c) =>
              String(c.supplierId?._id || c.supplierId?.id || c.supplierId) === String(preselectedSupplierId) &&
              c.status === 'ACTIVE'
          );

          const targetContract = preselectedContractId
            ? supActiveContracts.find((c) => String(c._id || c.id) === String(preselectedContractId))
            : supActiveContracts[0];

          if (targetContract) {
            const instList = getContractInstallments(targetContract);
            const paidMap = getPaidInstallmentsForContract(targetContract._id || targetContract.id, vouchersData);

            if (instList.length > 0) {
              const nextUnpaid = instList.find((inst) => !paidMap.has(inst.installmentNumber));
              if (nextUnpaid) {
                setInstallmentMode('INSTALLMENT');
                const initialSelected = [nextUnpaid.installmentNumber];
                setSelectedInstallmentNumbers(initialSelected);
                updateFormWithSelectedInstallments(targetContract, initialSelected);
              } else {
                setInstallmentMode('CUSTOM');
                setSelectedInstallmentNumbers([]);
                setVoucherForm((prev) => ({
                  ...prev,
                  contractId: targetContract._id || targetContract.id,
                  amount: '',
                  installmentNumber: null,
                  installmentNumbers: [],
                  installmentLabel: '',
                  paymentReason: `Thanh toán theo HĐ ${targetContract.contractCode} - ${targetContract.contractTitle || ''}`,
                }));
              }
            } else {
              setInstallmentMode('CUSTOM');
              setSelectedInstallmentNumbers([]);
              setVoucherForm((prev) => ({
                ...prev,
                contractId: targetContract._id || targetContract.id,
                installmentNumber: null,
                installmentNumbers: [],
                installmentLabel: '',
                paymentReason: `Thanh toán theo HĐ ${targetContract.contractCode} - ${targetContract.contractTitle || ''}`,
              }));
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Không thể tải danh sách phiếu chi tiền.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 2. Điền thông tin nhà cung ứng vào form khi được chọn
  const applySupplierToForm = (supplier, contractId = '') => {
    if (!supplier) return;
    setVoucherForm((prev) => ({
      ...prev,
      supplierId: supplier._id || supplier.id,
      contractId: contractId || prev.contractId,
      recipient: {
        name: supplier.supplierName || '',
        phone: supplier.phone || '',
        address: supplier.address || '',
        recipientType: 'SUPPLIER',
      },
      bankInfo: {
        bankName: supplier.bankInfo?.bankName || '',
        accountNo: supplier.bankInfo?.accountNo || '',
        accountHolder: supplier.bankInfo?.accountHolder || supplier.supplierName || '',
        branchName: supplier.bankInfo?.branchName || '',
      },
      paymentReason:
        prev.paymentReason ||
        `Thanh toán tiền mua nguyên vật liệu cho NCC ${supplier.supplierName}`,
    }));
  };

  const updateFormWithSelectedInstallments = (contract, selectedNums) => {
    if (!contract) return;
    const contractId = contract._id || contract.id;
    const instList = getContractInstallments(contract);
    const selectedInsts = instList.filter((inst) => selectedNums.includes(inst.installmentNumber));

    if (selectedInsts.length === 0) {
      setVoucherForm((prev) => ({
        ...prev,
        contractId,
        amount: '',
        installmentNumber: null,
        installmentNumbers: [],
        installmentLabel: '',
      }));
      return;
    }

    const totalAmount = selectedInsts.reduce((sum, inst) => sum + Number(inst.amount || 0), 0);
    const label = selectedInsts.map((inst) => inst.shortLabel).join(' + ');
    const primaryNumber = selectedInsts[0].installmentNumber;
    const contractCode = contract.contractCode || '';
    const contractTitle = contract.contractTitle || '';

    const notesJoined = selectedInsts
      .map((inst) => inst.note)
      .filter(Boolean)
      .join('; ');

    setVoucherForm((prev) => ({
      ...prev,
      contractId,
      amount: totalAmount,
      installmentNumber: primaryNumber,
      installmentNumbers: selectedNums,
      installmentLabel: label,
      paymentReason: `Thanh toán ${label} theo HĐ ${contractCode} - ${contractTitle}${notesJoined ? ` (${notesJoined})` : ''}`,
    }));
  };

  const handleSelectSupplier = (supplierId) => {
    const found = suppliers.find((s) => (s._id || s.id) === supplierId);
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next.supplierId;
      delete next.contractId;
      delete next.installmentNumber;
      return next;
    });

    setInstallmentMode('INSTALLMENT');
    setSelectedInstallmentNumbers([]);

    if (found) {
      applySupplierToForm(found, '');
      setVoucherForm((prev) => ({
        ...prev,
        contractId: '',
        installmentNumber: null,
        installmentNumbers: [],
        installmentLabel: '',
      }));
    } else {
      setVoucherForm((prev) => ({
        ...prev,
        supplierId: '',
        contractId: '',
        installmentNumber: null,
        installmentNumbers: [],
        installmentLabel: '',
      }));
    }
  };

  const handleContractChange = (contractId) => {
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next.contractId;
      delete next.installmentNumber;
      delete next.amount;
      delete next.paymentReason;
      return next;
    });

    if (!contractId) {
      setVoucherForm((prev) => ({
        ...prev,
        contractId: '',
        installmentNumber: null,
        installmentNumbers: [],
        installmentLabel: '',
      }));
      setInstallmentMode('CUSTOM');
      setSelectedInstallmentNumbers([]);
      return;
    }

    const targetContract = contracts.find((c) => (c._id || c.id) === contractId);
    if (!targetContract) {
      setVoucherForm((prev) => ({ ...prev, contractId }));
      return;
    }

    // Lấy danh sách các đợt theo hợp đồng
    const instList = getContractInstallments(targetContract);
    const paidMap = getPaidInstallmentsForContract(targetContract._id || targetContract.id, vouchers);

    if (instList.length > 0) {
      // Tìm đợt chưa thanh toán đầu tiên (bắt buộc phải bắt đầu từ đợt này)
      const nextUnpaid = instList.find((inst) => !paidMap.has(inst.installmentNumber));
      if (nextUnpaid) {
        setInstallmentMode('INSTALLMENT');
        const initialSelected = [nextUnpaid.installmentNumber];
        setSelectedInstallmentNumbers(initialSelected);
        updateFormWithSelectedInstallments(targetContract, initialSelected);
      } else {
        // Đã thanh toán hết các đợt
        setInstallmentMode('CUSTOM');
        setSelectedInstallmentNumbers([]);
        setVoucherForm((prev) => ({
          ...prev,
          contractId,
          amount: '',
          installmentNumber: null,
          installmentNumbers: [],
          installmentLabel: '',
          paymentReason: `Thanh toán theo HĐ ${targetContract.contractCode} - ${targetContract.contractTitle || ''}`,
        }));
      }
    } else {
      setInstallmentMode('CUSTOM');
      setSelectedInstallmentNumbers([]);
      setVoucherForm((prev) => ({
        ...prev,
        contractId,
        installmentNumber: null,
        installmentNumbers: [],
        installmentLabel: '',
        paymentReason: `Thanh toán theo HĐ ${targetContract.contractCode} - ${targetContract.contractTitle || ''}`,
      }));
    }
  };

  const handleToggleInstallment = (inst, instIdx) => {
    if (!selectedContract) return;
    const instList = currentContractInstallments;
    const paidMap = currentContractPaidInstallmentsMap;

    // 1. Không cho click đợt đã chi trước đó
    if (paidMap.has(inst.installmentNumber)) return;

    const isSelected = selectedInstallmentNumbers.includes(inst.installmentNumber);
    let newSelectedNums = [...selectedInstallmentNumbers];

    if (isSelected) {
      // Bỏ chọn đợt này
      const firstUnpaid = instList.find((i) => !paidMap.has(i.installmentNumber));
      if (firstUnpaid && firstUnpaid.installmentNumber === inst.installmentNumber && selectedInstallmentNumbers.length === 1) {
        // Đợt đầu tiên bắt buộc phải giữ nếu đang ở chế độ thanh toán đợt
        return;
      }

      // Khi bỏ chọn đợt này, tất cả các đợt phía sau nó (phụ thuộc vào nó) cũng bị bỏ chọn
      newSelectedNums = instList
        .filter((item, idx) => idx < instIdx && selectedInstallmentNumbers.includes(item.installmentNumber))
        .map((item) => item.installmentNumber);

      if (newSelectedNums.length === 0 && firstUnpaid) {
        newSelectedNums = [firstUnpaid.installmentNumber];
      }
    } else {
      // Chọn đợt này: Đợt ngay trước đó (instIdx - 1) bắt buộc phải ĐÃ CHI hoặc ĐANG ĐƯỢC CHỌN
      if (instIdx > 0) {
        const prevInst = instList[instIdx - 1];
        const isPrevPaid = paidMap.has(prevInst.installmentNumber);
        const isPrevSelected = selectedInstallmentNumbers.includes(prevInst.installmentNumber);

        if (!isPrevPaid && !isPrevSelected) {
          setFeedback({
            type: 'error',
            text: `Không thể chọn ${inst.shortLabel} vì đợt trước đó (${prevInst.shortLabel}) chưa được chọn hoặc chưa thanh toán. Vui lòng thanh toán tuần tự từng đợt.`,
          });
          return;
        }
      }

      // Thêm vào danh sách và duy trì thứ tự tuần tự của hợp đồng
      newSelectedNums = instList
        .filter(
          (item) =>
            selectedInstallmentNumbers.includes(item.installmentNumber) ||
            item.installmentNumber === inst.installmentNumber
        )
        .map((item) => item.installmentNumber);
    }

    setFormErrors((prev) => {
      const next = { ...prev };
      delete next.installmentNumber;
      delete next.amount;
      delete next.paymentReason;
      return next;
    });

    setSelectedInstallmentNumbers(newSelectedNums);
    updateFormWithSelectedInstallments(selectedContract, newSelectedNums);
  };

  const handleSwitchInstallmentMode = (mode) => {
    setInstallmentMode(mode);
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next.installmentNumber;
      return next;
    });

    if (mode === 'CUSTOM') {
      setSelectedInstallmentNumbers([]);
      setVoucherForm((prev) => ({
        ...prev,
        installmentNumber: null,
        installmentNumbers: [],
        installmentLabel: '',
      }));
    } else {
      const currentContract = contracts.find((c) => (c._id || c.id) === voucherForm.contractId);
      if (currentContract) {
        const instList = getContractInstallments(currentContract);
        const paidMap = getPaidInstallmentsForContract(currentContract._id || currentContract.id, vouchers);
        const nextUnpaid = instList.find((inst) => !paidMap.has(inst.installmentNumber)) || instList[0];
        if (nextUnpaid) {
          const initialSelected = [nextUnpaid.installmentNumber];
          setSelectedInstallmentNumbers(initialSelected);
          updateFormWithSelectedInstallments(currentContract, initialSelected);
        }
      }
    }
  };

  const handleOpenCreateVoucher = (targetFlow = 'CASH_OUT') => {
    setFormErrors({});
    setFeedback(null);
    if (targetFlow === 'CASH_IN') {
      setVoucherForm({
        flowType: 'CASH_IN',
        category: 'CARRIER_COD_PAYOUT',
        paymentReason: 'Thu tiền COD từ đơn vị vận chuyển GHN sau đối soát cước',
        amount: '',
        paymentMethod: 'BANK_TRANSFER',
        recipient: {
          name: 'Công ty Cổ phần Dịch vụ Giao Hàng Nhanh (GHN)',
          phone: '1900 636677',
          address: 'Tầng 3, Tòa nhà Rivera Park, 7/28 Thành Thái, P.14, Q.10, TP.HCM',
          recipientType: 'CARRIER',
        },
        bankInfo: {
          bankName: 'Ngân hàng TMCP Quân Đội (MB Bank)',
          accountNo: '0988888888',
          accountHolder: 'ARA STORE CO., LTD',
          branchName: 'Hội sở',
        },
        supplierId: '',
        contractId: '',
        installmentNumber: null,
        installmentNumbers: [],
        installmentLabel: '',
        returnRequestId: '',
        supportingDocuments: [],
        voucherDate: new Date().toISOString().slice(0, 10),
        notes: '',
        status: 'CONFIRMED',
      });
      setInstallmentMode('CUSTOM');
      setSelectedInstallmentNumbers([]);
    } else {
      setVoucherForm({
        flowType: 'CASH_OUT',
        category: preselectedSupplierId ? 'SUPPLIER_PAYMENT' : 'SUPPLIER_PAYMENT',
        paymentReason: '',
        amount: '',
        paymentMethod: 'BANK_TRANSFER',
        recipient: {
          name: '',
          phone: '',
          address: '',
          recipientType: 'SUPPLIER',
        },
        bankInfo: {
          bankName: '',
          accountNo: '',
          accountHolder: '',
          branchName: '',
        },
        supplierId: preselectedSupplierId || '',
        contractId: preselectedContractId || '',
        installmentNumber: null,
        installmentNumbers: [],
        installmentLabel: '',
        returnRequestId: '',
        supportingDocuments: [],
        voucherDate: new Date().toISOString().slice(0, 10),
        notes: '',
        status: 'CONFIRMED',
      });
      setInstallmentMode('INSTALLMENT');
      setSelectedInstallmentNumbers([]);
    }
    setActiveTab('CREATE_VOUCHER');
  };

  const switchFormFlowType = (targetFlow) => {
    if (voucherForm.flowType === targetFlow) return;
    handleOpenCreateVoucher(targetFlow);
  };

  const handleCategoryChange = (catCode) => {
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next.category;
      return next;
    });

    setVoucherForm((prev) => {
      let nextRecipientType = 'OTHER';
      let nextRecipient = { ...prev.recipient };
      let nextReason = prev.paymentReason;
      let nextBankInfo = { ...prev.bankInfo };

      if (catCode === 'SUPPLIER_PAYMENT') nextRecipientType = 'SUPPLIER';
      if (catCode === 'CUSTOMER_REFUND') nextRecipientType = 'CUSTOMER';
      if (catCode === 'SHIPPING_COST') nextRecipientType = 'CARRIER';

      if (catCode === 'CARRIER_COD_PAYOUT') {
        nextRecipientType = 'CARRIER';
        nextRecipient = {
          name: 'Công ty Cổ phần Dịch vụ Giao Hàng Nhanh (GHN)',
          phone: '1900 636677',
          address: 'Tầng 3, Tòa nhà Rivera Park, 7/28 Thành Thái, P.14, Q.10, TP.HCM',
          recipientType: 'CARRIER',
        };
        nextReason = nextReason || 'Thu tiền COD từ đơn vị vận chuyển GHN sau đối soát cước';
        nextBankInfo = {
          bankName: 'Ngân hàng TMCP Quân Đội (MB Bank)',
          accountNo: '0988888888',
          accountHolder: 'ARA STORE CO., LTD',
          branchName: 'Hội sở',
        };
      } else if (catCode === 'SURCHARGE_REVENUE') {
        nextRecipientType = 'CUSTOMER';
        nextReason = nextReason || 'Thu phụ phí hoàn hàng / đổi mẫu mã theo yêu cầu khách';
        nextBankInfo = {
          bankName: 'Ngân hàng TMCP Quân Đội (MB Bank)',
          accountNo: '0988888888',
          accountHolder: 'ARA STORE CO., LTD',
          branchName: 'Hội sở',
        };
      } else if (catCode === 'CARRIER_DISPUTE_COMPENSATION') {
        nextRecipientType = 'CARRIER';
        nextRecipient = {
          name: 'Công ty Cổ phần Dịch vụ Giao Hàng Nhanh (GHN)',
          phone: '1900 636677',
          address: 'Tầng 3, Tòa nhà Rivera Park, 7/28 Thành Thái, P.14, Q.10, TP.HCM',
          recipientType: 'CARRIER',
        };
        nextReason = nextReason || 'Thu tiền bồi thường thất thoát / hư hỏng đơn hàng từ GHN';
        nextBankInfo = {
          bankName: 'Ngân hàng TMCP Quân Đội (MB Bank)',
          accountNo: '0988888888',
          accountHolder: 'ARA STORE CO., LTD',
          branchName: 'Hội sở',
        };
      }

      return {
        ...prev,
        category: catCode,
        paymentReason: nextReason,
        recipient: {
          ...nextRecipient,
          recipientType: nextRecipientType,
        },
        bankInfo: nextBankInfo,
      };
    });
  };

  // 3. Tải và nén ảnh chứng từ đính kèm
  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const validFiles = [];
    const errorMsgs = [];

    files.forEach((file) => {
      if (!file.type.startsWith('image/')) {
        errorMsgs.push(`Tệp "${file.name}" không phải là ảnh hợp lệ.`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        errorMsgs.push(`Tệp "${file.name}" vượt quá dung lượng tối đa 10MB.`);
        return;
      }
      validFiles.push(file);
    });

    if (errorMsgs.length > 0) {
      setFeedback({ type: 'error', text: errorMsgs.join(' ') });
    }

    try {
      const compressedList = await Promise.all(
        validFiles.map(async (f) => {
          const url = await compressImage(f);
          return {
            name: f.name,
            url,
            fileSize: f.size,
            mimeType: f.type,
          };
        })
      );

      const readyDocs = compressedList.filter((d) => Boolean(d.url));
      if (readyDocs.length > 0) {
        setVoucherForm((prev) => ({
          ...prev,
          supportingDocuments: [...prev.supportingDocuments, ...readyDocs],
        }));
      }
    } catch (err) {
      console.error('Lỗi xử lý tệp:', err);
      setFeedback({ type: 'error', text: 'Có lỗi xảy ra khi nén hoặc tải ảnh lên.' });
    }

    e.target.value = '';
  };

  const handleRemovePhoto = (photoIdx) => {
    setVoucherForm((prev) => ({
      ...prev,
      supportingDocuments: prev.supportingDocuments.filter((_, idx) => idx !== photoIdx),
    }));
  };

  // 4. Lưu phiếu thu / chi (Mặc định CONFIRMED sẵn sàng thu/chi tiền)
  const handleSubmitVoucher = async (targetStatus = 'CONFIRMED', andDisburseImmediately = false) => {
    const isCashIn = voucherForm.flowType === 'CASH_IN';
    const submissionForm = {
      ...voucherForm,
      status: targetStatus,
      installmentNumber:
        !isCashIn && installmentMode === 'INSTALLMENT' && selectedInstallmentNumbers.length > 0
          ? Number(selectedInstallmentNumbers[0])
          : null,
      installmentNumbers:
        !isCashIn && installmentMode === 'INSTALLMENT' ? selectedInstallmentNumbers.map(Number) : [],
      installmentLabel:
        !isCashIn && installmentMode === 'INSTALLMENT' ? voucherForm.installmentLabel : '',
    };
    const { isValid, errors } = validatePaymentVoucherForm(submissionForm);

    if (!isValid) {
      setFormErrors(errors);
      setFeedback({
        type: 'error',
        text: `Vui lòng kiểm tra lại thông tin ${isCashIn ? 'phiếu thu' : 'phiếu chi'} theo cảnh báo đỏ bên dưới.`,
      });
      return;
    }

    try {
      setSubmitting(true);
      setFeedback(null);
      setFormErrors({});

      const res = await accountantProcurementApi.createPaymentVoucher(submissionForm);
      setFeedback({
        type: 'success',
        text: res.message || `Lập ${isCashIn ? 'phiếu thu' : 'phiếu chi'} [${res.data?.voucherCode}] thành công.`,
      });

      // Reset form
      setVoucherForm({
        flowType: 'CASH_OUT',
        category: 'SUPPLIER_PAYMENT',
        paymentReason: '',
        amount: '',
        paymentMethod: 'BANK_TRANSFER',
        recipient: { name: '', phone: '', address: '', recipientType: 'SUPPLIER' },
        bankInfo: { bankName: '', accountNo: '', accountHolder: '', branchName: '' },
        supplierId: '',
        contractId: '',
        installmentNumber: null,
        installmentNumbers: [],
        installmentLabel: '',
        returnRequestId: '',
        supportingDocuments: [],
        voucherDate: new Date().toISOString().slice(0, 10),
        notes: '',
        status: 'CONFIRMED',
      });
      setInstallmentMode('INSTALLMENT');
      setSelectedInstallmentNumbers([]);

      await loadData();
      if (andDisburseImmediately && res.data) {
        handleOpenDisbursementModal(res.data);
      } else {
        setActiveTab('VOUCHER_LIST');
      }
    } catch (err) {
      console.error(err);
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || `Có lỗi xảy ra khi tạo ${isCashIn ? 'phiếu thu' : 'phiếu chi'}.`,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // 5. Thao tác Xác nhận duyệt phiếu (DRAFT -> CONFIRMED)
  const handleConfirmVoucher = async (voucher) => {
    const voucherId = voucher._id || voucher.id;
    try {
      setSubmitting(true);
      const res = await accountantProcurementApi.confirmPaymentVoucher(voucherId);
      setFeedback({
        type: 'success',
        text: res.message || `Đã xác nhận duyệt phiếu chi [${voucher.voucherCode}]. Sẵn sàng giải ngân.`,
      });
      await loadData();
      if (selectedVoucherForDetail?._id === voucherId) {
        setSelectedVoucherForDetail(res.data);
      }
    } catch (err) {
      console.error(err);
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Không thể xác nhận phiếu chi.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // 6. Thao tác Thực chi tiền (CONFIRMED -> PAID)
  const handleOpenDisbursementModal = (voucher) => {
    setDisbursementModalVoucher(voucher);
    setDisbursementForm({
      transactionReference: voucher.paymentMethod === 'BANK_TRANSFER' ? 'UNC-' + Date.now().toString().slice(-6) : 'PC-TIENMAT',
      paidAt: new Date().toISOString().slice(0, 16),
    });
  };

  const handleExecutePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!disbursementModalVoucher) return;
    const voucherId = disbursementModalVoucher._id || disbursementModalVoucher.id;

    try {
      setSubmitting(true);
      const res = await accountantProcurementApi.executePaymentVoucher(voucherId, disbursementForm);
      setFeedback({
        type: 'success',
        text: res.message || `Đã xác nhận chi tiền thành công cho phiếu chi [${disbursementModalVoucher.voucherCode}].`,
      });
      setDisbursementModalVoucher(null);
      await loadData();
      if (selectedVoucherForDetail?._id === voucherId) {
        setSelectedVoucherForDetail(res.data);
      }
    } catch (err) {
      console.error(err);
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Không thể xác nhận chi tiền.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // 7. Thao tác Hủy phiếu chi
  const handleOpenCancelModal = (voucher) => {
    setCancelModalVoucher(voucher);
    setCancellationReason('');
  };

  const handleCancelVoucherSubmit = async (e) => {
    e.preventDefault();
    if (!cancelModalVoucher) return;
    if (!cancellationReason.trim()) {
      alert('Vui lòng nhập lý do hủy phiếu chi.');
      return;
    }
    const voucherId = cancelModalVoucher._id || cancelModalVoucher.id;

    try {
      setSubmitting(true);
      const res = await accountantProcurementApi.cancelPaymentVoucher(voucherId, {
        cancellationReason: cancellationReason.trim(),
      });
      setFeedback({
        type: 'success',
        text: res.message || `Đã hủy phiếu chi [${cancelModalVoucher.voucherCode}] thành công.`,
      });
      setCancelModalVoucher(null);
      await loadData();
      if (selectedVoucherForDetail?._id === voucherId) {
        setSelectedVoucherForDetail(res.data);
      }
    } catch (err) {
      console.error(err);
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Không thể hủy phiếu chi.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Thống kê KPI Dòng tiền (Thu, Chi, Net)
  const kpiStats = useMemo(() => {
    let totalCashIn = 0;
    let totalCashOut = 0;
    let pendingDisbursement = 0;

    vouchers.forEach((v) => {
      if (v.status === 'CANCELLED') return;
      const amt = Number(v.amount) || 0;
      if (v.flowType === 'CASH_IN') {
        totalCashIn += amt;
      } else {
        totalCashOut += amt;
        if (v.status === 'CONFIRMED' || v.status === 'DRAFT') {
          pendingDisbursement += amt;
        }
      }
    });

    const netCashFlow = totalCashIn - totalCashOut;
    const cashInCount = vouchers.filter((v) => v.flowType === 'CASH_IN').length;
    const cashOutCount = vouchers.filter((v) => v.flowType !== 'CASH_IN').length;

    return {
      totalCashIn,
      totalCashOut,
      netCashFlow,
      pendingDisbursement,
      totalCount: vouchers.length,
      cashInCount,
      cashOutCount,
    };
  }, [vouchers]);

  // 8. Lọc và sắp xếp danh sách chứng từ dòng tiền (Phiếu Thu & Phiếu Chi)
  const filteredVouchers = useMemo(() => {
    const list = vouchers.filter((v) => {
      const matchSearch =
        !searchTerm.trim() ||
        v.voucherCode?.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
        v.recipient?.name?.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
        v.carrierId?.carrierName?.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
        v.carrierId?.carrierCode?.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
        v.supplierId?.supplierName?.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
        v.supplierId?.supplierCode?.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
        v.paymentReason?.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
        v.transactionReference?.toLowerCase().includes(searchTerm.trim().toLowerCase());

      const matchFlow =
        flowTypeFilter === 'ALL' ||
        (flowTypeFilter === 'CASH_IN' && v.flowType === 'CASH_IN') ||
        (flowTypeFilter === 'CASH_OUT' && v.flowType !== 'CASH_IN');

      const matchCat = categoryFilter === 'ALL' || v.category === categoryFilter;
      const matchStatus = statusFilter === 'ALL' || v.status === statusFilter;
      const matchMethod = methodFilter === 'ALL' || v.paymentMethod === methodFilter;

      let matchDate = true;
      if (startDateFilter) {
        matchDate = matchDate && new Date(v.voucherDate) >= new Date(startDateFilter);
      }
      if (endDateFilter) {
        const end = new Date(endDateFilter);
        end.setHours(23, 59, 59, 999);
        matchDate = matchDate && new Date(v.voucherDate) <= end;
      }

      return matchSearch && matchFlow && matchCat && matchStatus && matchMethod && matchDate;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'OLDEST') {
        return new Date(a.voucherDate || a.createdAt || 0) - new Date(b.voucherDate || b.createdAt || 0);
      }
      if (sortBy === 'AMOUNT_DESC') {
        return Number(b.amount || 0) - Number(a.amount || 0);
      }
      if (sortBy === 'AMOUNT_ASC') {
        return Number(a.amount || 0) - Number(b.amount || 0);
      }
      // NEWEST (Mặc định): Mới nhất trước (Mới → Cũ)
      return new Date(b.voucherDate || b.createdAt || 0) - new Date(a.voucherDate || a.createdAt || 0);
    });
  }, [vouchers, searchTerm, flowTypeFilter, categoryFilter, statusFilter, methodFilter, startDateFilter, endDateFilter, sortBy]);

  // Các hợp đồng theo nhà cung cấp đang chọn trong form (Chỉ lấy các hợp đồng ACTIVE)
  const availableContractsForSupplier = useMemo(() => {
    if (!voucherForm.supplierId) return [];
    return contracts.filter(
      (c) =>
        (c.supplierId?._id || c.supplierId?.id || c.supplierId) === voucherForm.supplierId &&
        c.status === 'ACTIVE'
    );
  }, [contracts, voucherForm.supplierId]);

  const selectedSupplierObj = useMemo(() => {
    return suppliers.find((s) => (s._id || s.id) === voucherForm.supplierId) || null;
  }, [suppliers, voucherForm.supplierId]);

  const selectedContract = useMemo(() => {
    if (!voucherForm.contractId) return null;
    return contracts.find((c) => (c._id || c.id) === voucherForm.contractId) || null;
  }, [contracts, voucherForm.contractId]);

  const currentContractInstallments = useMemo(() => {
    return getContractInstallments(selectedContract);
  }, [selectedContract]);

  const currentContractPaidInstallmentsMap = useMemo(() => {
    if (!voucherForm.contractId) return new Map();
    return getPaidInstallmentsForContract(voucherForm.contractId, vouchers);
  }, [voucherForm.contractId, vouchers]);

  return (
    <div className="wms-page-container">
      {/* Header Banner */}
      <section className="wms-page-header">
        <div>
          <h1 className="wms-page-title">Quản lý Chứng từ Dòng tiền & Phiếu Thu / Chi (Cash Flow Vouchers)</h1>
          <p className="wms-page-subtitle">
            Theo dõi dòng tiền vào (Thu COD đối soát từ GHN) & dòng tiền ra (Chi trả NCC, cước phí, hoàn tiền khách), hạch toán quỹ tiền mặt và ngân hàng
          </p>
        </div>
        <div className="wms-header-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="wms-btn wms-btn-default"
            onClick={loadData}
            disabled={loading}
            title="Tải lại danh sách"
          >
            <RefreshCw size={15} className={loading ? 'wms-spin' : ''} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            className="wms-btn"
            style={{
              backgroundColor: activeTab === 'CREATE_VOUCHER' && voucherForm.flowType === 'CASH_OUT' ? '#7F1D1D' : '#B91C1C',
              borderColor: '#991B1B',
              color: '#FFFFFF',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
            onClick={() => handleOpenCreateVoucher('CASH_OUT')}
            title="Lập phiếu chi tiền mới (Thanh toán công nợ NCC, hoàn tiền khách, chi phí vận chuyển, vật tư kho...)"
          >
            <Plus size={16} />
            <span>Lập Phiếu Chi Mới</span>
          </button>

          <button
            type="button"
            className="wms-btn"
            style={{
              backgroundColor: activeTab === 'CREATE_VOUCHER' && voucherForm.flowType === 'CASH_IN' ? '#166534' : '#15803D',
              borderColor: '#166534',
              color: '#FFFFFF',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
            onClick={() => handleOpenCreateVoucher('CASH_IN')}
            title="Lập phiếu thu tiền mới (Thu COD đối soát GHN, thu phụ phí hoàn đổi trả, thu bồi thường VC...)"
          >
            <Plus size={16} />
            <span>Lập Phiếu Thu Mới</span>
          </button>

          {activeTab === 'CREATE_VOUCHER' && (
            <button
              type="button"
              className="wms-btn wms-btn-default"
              onClick={() => setActiveTab('VOUCHER_LIST')}
              title="Quay lại danh sách chứng từ"
            >
              <FileText size={16} />
              <span>Xem danh sách ({vouchers.length})</span>
            </button>
          )}
        </div>
      </section>

      {/* Thông báo Feedback */}
      {feedback && (
        <div className={`wms-feedback-banner ${feedback.type}`} role="alert">
          <span>{feedback.text}</span>
          <button
            type="button"
            className="wms-btn wms-btn-default wms-btn-sm"
            onClick={() => setFeedback(null)}
          >
            Đóng
          </button>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="wms-tabs-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'VOUCHER_LIST'}
          className={`wms-tab-btn ${activeTab === 'VOUCHER_LIST' ? 'active' : ''}`}
          onClick={() => setActiveTab('VOUCHER_LIST')}
        >
          <FileText size={16} />
          <span>Danh sách Chứng từ Thu / Chi ({filteredVouchers.length})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'CREATE_VOUCHER' && voucherForm.flowType === 'CASH_OUT'}
          className={`wms-tab-btn ${activeTab === 'CREATE_VOUCHER' && voucherForm.flowType === 'CASH_OUT' ? 'active' : ''}`}
          onClick={() => handleOpenCreateVoucher('CASH_OUT')}
        >
          <ArrowUpRight size={16} color="#DC2626" />
          <span>Biểu mẫu Lập Phiếu Chi Mới</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'CREATE_VOUCHER' && voucherForm.flowType === 'CASH_IN'}
          className={`wms-tab-btn ${activeTab === 'CREATE_VOUCHER' && voucherForm.flowType === 'CASH_IN' ? 'active' : ''}`}
          onClick={() => handleOpenCreateVoucher('CASH_IN')}
        >
          <ArrowDownRight size={16} color="#15803D" />
          <span>Biểu mẫu Lập Phiếu Thu Mới</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: DANH SÁCH CHỨNG TỪ DÒNG TIỀN (THU & CHI)                          */}
      {/* ========================================================================= */}
      {activeTab === 'VOUCHER_LIST' && (
        <>
          {/* BĂNG THỐNG KÊ KPI DÒNG TIỀN (ARA EDITORIAL STANDARD) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '14px',
              marginBottom: '16px',
            }}
          >
            {/* Card 1: Tổng thu */}
            <div
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '8px',
                  background: '#dcfce7',
                  color: '#15803d',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <ArrowDownLeft size={22} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Tổng tiền đã thu (CASH-IN)
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#15803d', marginTop: '2px' }}>
                  +{formatVnd(kpiStats.totalCashIn)}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>
                  {kpiStats.cashInCount} phiếu (Gồm thu COD đối soát GHN)
                </div>
              </div>
            </div>

            {/* Card 2: Tổng chi */}
            <div
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '8px',
                  background: '#fee2e2',
                  color: '#b91c1c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <ArrowUpRight size={22} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Tổng tiền đã chi (CASH-OUT)
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#b91c1c', marginTop: '2px' }}>
                  -{formatVnd(kpiStats.totalCashOut)}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>
                  {kpiStats.cashOutCount} phiếu (Chi trả NCC, cước phí...)
                </div>
              </div>
            </div>

            {/* Card 3: Dòng tiền thuần */}
            <div
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '8px',
                  background: kpiStats.netCashFlow >= 0 ? '#f0fdf4' : '#fff7ed',
                  color: kpiStats.netCashFlow >= 0 ? '#16a34a' : '#c2410c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {kpiStats.netCashFlow >= 0 ? <TrendingUp size={22} /> : <TrendingDown size={22} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Dòng tiền thuần (Net Cash Flow)
                </div>
                <div
                  style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    color: kpiStats.netCashFlow >= 0 ? '#15803d' : '#b91c1c',
                    marginTop: '2px',
                  }}
                >
                  {kpiStats.netCashFlow >= 0 ? '+' : ''}
                  {formatVnd(kpiStats.netCashFlow)}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>
                  Chênh lệch Thu - Chi thực tế
                </div>
              </div>
            </div>
          </div>

          {/* Quick Flow Filter Pills */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`wms-btn wms-btn-sm ${flowTypeFilter === 'ALL' ? 'wms-btn-primary' : 'wms-btn-default'}`}
              onClick={() => setFlowTypeFilter('ALL')}
              style={{ borderRadius: '20px', padding: '4px 12px', fontSize: '12.5px' }}
            >
              Tất cả chứng từ ({vouchers.length})
            </button>
            <button
              type="button"
              className={`wms-btn wms-btn-sm ${flowTypeFilter === 'CASH_OUT' ? 'wms-btn-primary' : 'wms-btn-default'}`}
              onClick={() => setFlowTypeFilter('CASH_OUT')}
              style={{
                borderRadius: '20px',
                padding: '4px 12px',
                fontSize: '12.5px',
                borderColor: flowTypeFilter === 'CASH_OUT' ? undefined : '#fca5a5',
              }}
            >
              <ArrowUpRight size={13} style={{ marginRight: '4px', color: '#dc2626' }} />
              Phiếu Chi ({kpiStats.cashOutCount})
            </button>
            <button
              type="button"
              className={`wms-btn wms-btn-sm ${flowTypeFilter === 'CASH_IN' ? 'wms-btn-primary' : 'wms-btn-default'}`}
              onClick={() => setFlowTypeFilter('CASH_IN')}
              style={{
                borderRadius: '20px',
                padding: '4px 12px',
                fontSize: '12.5px',
                borderColor: flowTypeFilter === 'CASH_IN' ? undefined : '#86efac',
              }}
            >
              <ArrowDownLeft size={13} style={{ marginRight: '4px', color: '#16a34a' }} />
              Phiếu Thu ({kpiStats.cashInCount})
            </button>
          </div>

          {/* Bộ lọc Filter Bar */}
          <section className="wms-filter-bar">
            <div className="wms-filter-group">
              <div className="wms-filter-field search-wide">
                <label htmlFor="pv-search" className="wms-label">
                  Tìm kiếm Mã phiếu / Người nhận / ĐVVC / Lý do
                </label>
                <input
                  id="pv-search"
                  type="search"
                  className="wms-input"
                  placeholder="Nhập PC-2026..., PT-COD..., tên đối tác, ĐVVC..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="wms-filter-field">
                <label htmlFor="pv-flow-filter" className="wms-label">
                  Loại chứng từ
                </label>
                <select
                  id="pv-flow-filter"
                  className="wms-select"
                  value={flowTypeFilter}
                  onChange={(e) => setFlowTypeFilter(e.target.value)}
                >
                  <option value="ALL">Tất cả (Thu & Chi)</option>
                  <option value="CASH_OUT">Phiếu Chi (Tiền ra)</option>
                  <option value="CASH_IN">Phiếu Thu (Tiền vào)</option>
                </select>
              </div>

              <div className="wms-filter-field">
                <label htmlFor="pv-cat-filter" className="wms-label">
                  Hạng mục nghiệp vụ
                </label>
                <select
                  id="pv-cat-filter"
                  className="wms-select"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="ALL">Tất cả hạng mục</option>
                  <option value="CARRIER_COD_PAYOUT">Thu tiền COD từ GHN (ĐVVC)</option>
                  <option value="SUPPLIER_PAYMENT">Chi trả Nhà cung cấp</option>
                  <option value="CUSTOMER_REFUND">Chi hoàn tiền Khách hàng</option>
                  <option value="SHIPPING_COST">Chi cước Vận chuyển</option>
                  <option value="PRODUCTION_COST">Chi gia công May mặc</option>
                  <option value="OPERATING_EXPENSE">Chi vận hành & Vật tư</option>
                  <option value="OTHER_EXPENSE">Chi phí khác</option>
                </select>
              </div>

              <div className="wms-filter-field">
                <label htmlFor="pv-status-filter" className="wms-label">
                  Trạng thái
                </label>
                <select
                  id="pv-status-filter"
                  className="wms-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="DRAFT">Bản nháp</option>
                  <option value="CONFIRMED">Chờ xử lý / Chờ chi</option>
                  <option value="PAID">Đã hoàn tất (Đã thu / chi)</option>
                  <option value="CANCELLED">Đã hủy</option>
                </select>
              </div>

              <div className="wms-filter-field">
                <label htmlFor="pv-method-filter" className="wms-label">
                  Phương thức
                </label>
                <select
                  id="pv-method-filter"
                  className="wms-select"
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value)}
                >
                  <option value="ALL">Tất cả phương thức</option>
                  <option value="BANK_TRANSFER">Chuyển khoản</option>
                  <option value="CASH">Tiền mặt</option>
                  <option value="COD_BALANCE_OFFSET">Bù trừ COD tự động</option>
                </select>
              </div>

              <div className="wms-filter-field">
                <label htmlFor="pv-sort-filter" className="wms-label">
                  Thứ tự sắp xếp
                </label>
                <select
                  id="pv-sort-filter"
                  className="wms-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="NEWEST">Mới nhất trước (Mới → Cũ)</option>
                  <option value="OLDEST">Cũ nhất trước (Cũ → Mới)</option>
                  <option value="AMOUNT_DESC">Số tiền giảm dần (Cao → Thấp)</option>
                  <option value="AMOUNT_ASC">Số tiền tăng dần (Thấp → Cao)</option>
                </select>
              </div>
            </div>
          </section>

          {/* Bảng danh sách Phiếu Thu/Chi - Chống tràn ngang tuyệt đối */}
          <section className="wms-table-card">
            <div className="wms-table-scroll no-horizontal-scroll">
              <table className="wms-table wms-table-responsive-fit">
                <colgroup>
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '20%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Mã Chứng Từ & Ngày</th>
                    <th>Hạng mục & Hình thức</th>
                    <th>Đối tác giao dịch</th>
                    <th className="wms-td-number">Số tiền phát sinh</th>
                    <th>Trạng thái</th>
                    <th style={{ textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6}>Đang tải danh sách chứng từ thu / chi tiền...</td>
                    </tr>
                  ) : filteredVouchers.length === 0 ? (
                    <tr>
                      <td colSpan={6}>Chưa có chứng từ nào khớp với bộ lọc tìm kiếm.</td>
                    </tr>
                  ) : (
                    filteredVouchers.map((v, idx) => {
                      const cfg = getVoucherStatusBadge(v);
                      const catName = CATEGORY_LABELS[v.category] || (v.category === 'CARRIER_COD_PAYOUT' ? 'Thu COD từ GHN' : v.category);
                      const hasDocs = v.supportingDocuments?.length > 0;
                      const isCashIn = v.flowType === 'CASH_IN';

                      return (
                        <tr
                          key={v._id || v.id || v.voucherCode || idx}
                          className="wms-interactive-row wms-row-expandable"
                          onClick={() => setSelectedVoucherForDetail(v)}
                          title="Nhấn vào hàng để xem hồ sơ chi tiết và chứng từ đính kèm"
                        >
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span className="wms-code-pill">{v.voucherCode}</span>
                              {isCashIn ? (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    background: '#dcfce7',
                                    color: '#15803d',
                                    border: '1px solid #bbf7d0',
                                  }}
                                >
                                  <ArrowDownLeft size={10} /> Thu
                                </span>
                              ) : (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    background: '#fee2e2',
                                    color: '#b91c1c',
                                    border: '1px solid #fecaca',
                                  }}
                                >
                                  <ArrowUpRight size={10} /> Chi
                                </span>
                              )}
                              {hasDocs && (
                                <span className="wms-photo-badge" title={`Có ${v.supportingDocuments.length} chứng từ đính kèm`}>
                                  <ImageIcon size={10} /> {v.supportingDocuments.length}
                                </span>
                              )}
                            </div>
                            <div className="wms-helper-text" style={{ fontSize: '11px', marginTop: '2px' }}>
                              {formatDate(v.voucherDate)}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{catName}</div>
                            <div className="wms-helper-text" style={{ fontSize: '11px' }}>
                              {v.paymentMethod === 'BANK_TRANSFER'
                                ? 'Chuyển khoản NH'
                                : v.paymentMethod === 'COD_BALANCE_OFFSET'
                                ? 'Bù trừ COD tự động'
                                : 'Tiền mặt tại quỹ'}
                            </div>
                            {(v.contractId || v.installmentLabel) && (
                              <div style={{ marginTop: '2px' }}>
                                <span
                                  style={{
                                    fontSize: '10.5px',
                                    background: '#eff6ff',
                                    color: '#1d4ed8',
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    fontWeight: 600,
                                    border: '1px solid #bfdbfe',
                                  }}
                                >
                                  {v.contractId?.contractCode || v.contractId}
                                  {v.installmentLabel ? ` • ${v.installmentLabel}` : ''}
                                </span>
                              </div>
                            )}
                            {v.carrierId && (
                              <div style={{ marginTop: '2px' }}>
                                <span
                                  style={{
                                    fontSize: '10.5px',
                                    background: '#f0fdf4',
                                    color: '#15803d',
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    fontWeight: 600,
                                    border: '1px solid #bbf7d0',
                                  }}
                                >
                                  {v.carrierId?.carrierName || 'Giao Hàng Nhanh (GHN)'}
                                </span>
                              </div>
                            )}
                          </td>
                          <td>
                            <div>
                              <strong>
                                {v.carrierId?.carrierName ||
                                  v.supplierId?.supplierName ||
                                  v.recipient?.name ||
                                  (v.category === 'CARRIER_COD_PAYOUT' ? 'Giao Hàng Nhanh (GHN)' : '—')}
                              </strong>
                            </div>
                            <div className="wms-helper-text" style={{ fontSize: '11px' }}>
                              {v.carrierId
                                ? `ĐVVC: ${v.carrierId?.carrierCode || 'GHN'} • Hotline: ${v.carrierId?.hotline || v.recipient?.phone || '1900 636677'}`
                                : v.recipient?.phone || v.supplierId?.phone
                                ? `SĐT: ${v.recipient?.phone || v.supplierId?.phone}`
                                : v.supplierId?.supplierCode
                                ? `Mã: ${v.supplierId.supplierCode}`
                                : v.category === 'CARRIER_COD_PAYOUT'
                                ? 'Đối tác vận chuyển đối soát'
                                : 'Vãng lai'}
                            </div>
                          </td>
                          <td
                            className="wms-td-number"
                            style={{
                              fontWeight: 700,
                              fontSize: '13.5px',
                              color: isCashIn ? '#15803d' : '#b91c1c',
                            }}
                          >
                            {isCashIn ? `+${formatVnd(v.amount)}` : `-${formatVnd(v.amount)}`}
                          </td>
                          <td>
                            <span className={`wms-status-badge ${cfg.cls}`} style={cfg.style}>
                              {cfg.label}
                            </span>
                          </td>
                          <td>
                            <div className="wms-action-cell" onClick={(e) => e.stopPropagation()} style={{ gap: '6px', justifyContent: 'flex-end' }}>
                              {v.status !== 'PAID' && v.status !== 'CANCELLED' ? (
                                <>
                                  {!isCashIn && (
                                    <button
                                      type="button"
                                      className="wms-btn wms-btn-primary wms-btn-sm"
                                      onClick={() => handleOpenDisbursementModal(v)}
                                      title="Xác nhận chi tiền thực tế (Giải ngân quỹ tiền mặt/ngân hàng)"
                                      style={{ fontWeight: 600, whiteSpace: 'nowrap', padding: '5px 9px' }}
                                    >
                                      <Banknote size={14} />
                                      <span>Xác nhận chi</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="wms-btn wms-btn-default wms-btn-sm"
                                    onClick={() => setSelectedVoucherForDetail(v)}
                                    title="Xem chi tiết chứng từ"
                                    style={{ whiteSpace: 'nowrap', padding: '5px 8px' }}
                                  >
                                    <Eye size={13} />
                                    <span>Chi tiết</span>
                                  </button>
                                </>
                              ) : v.status === 'PAID' ? (
                                <>
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      fontSize: '11.5px',
                                      fontWeight: 600,
                                      color: isCashIn ? '#15803d' : '#b91c1c',
                                      padding: '3px 7px',
                                      background: isCashIn ? '#f0fdf4' : '#fef2f2',
                                      borderRadius: '4px',
                                      border: isCashIn ? '1px solid #bbf7d0' : '1px solid #fecaca',
                                    }}
                                  >
                                    <Check size={12} /> {isCashIn ? 'Đã thu' : 'Đã chi'}
                                  </span>
                                  <button
                                    type="button"
                                    className="wms-btn wms-btn-default wms-btn-sm"
                                    onClick={() => setSelectedVoucherForDetail(v)}
                                    title="Xem chi tiết chứng từ"
                                    style={{ whiteSpace: 'nowrap', padding: '5px 8px' }}
                                  >
                                    <Eye size={13} />
                                    <span>Chi tiết</span>
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      fontSize: '11.5px',
                                      fontWeight: 600,
                                      color: '#b91c1c',
                                      padding: '3px 7px',
                                      background: '#fef2f2',
                                      borderRadius: '4px',
                                      border: '1px solid #fecaca',
                                    }}
                                  >
                                    <X size={12} /> Đã hủy
                                  </span>
                                  <button
                                    type="button"
                                    className="wms-btn wms-btn-default wms-btn-sm"
                                    onClick={() => setSelectedVoucherForDetail(v)}
                                    title="Xem chi tiết chứng từ"
                                    style={{ whiteSpace: 'nowrap', padding: '5px 8px' }}
                                  >
                                    <Eye size={13} />
                                    <span>Chi tiết</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: BIỂU MẪU LẬP PHIẾU THU / CHI MỚI (CREATE CASH FLOW VOUCHER)        */}
      {/* ========================================================================= */}
      {activeTab === 'CREATE_VOUCHER' && (
        <form
          className="wms-form-card"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmitVoucher('CONFIRMED', false);
          }}
        >
          {/* Segmented Switch: Chọn nhanh Phiếu Chi vs Phiếu Thu */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              padding: '16px 20px',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginRight: '4px' }}>
                Loại chứng từ:
              </span>
              <button
                type="button"
                className="wms-btn"
                style={{
                  backgroundColor: voucherForm.flowType === 'CASH_OUT' ? '#B91C1C' : '#FFFFFF',
                  borderColor: voucherForm.flowType === 'CASH_OUT' ? '#991B1B' : '#CBD5E1',
                  color: voucherForm.flowType === 'CASH_OUT' ? '#FFFFFF' : '#475569',
                  fontWeight: voucherForm.flowType === 'CASH_OUT' ? 700 : 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                onClick={() => switchFormFlowType('CASH_OUT')}
              >
                <ArrowUpRight size={15} color={voucherForm.flowType === 'CASH_OUT' ? '#FFFFFF' : '#DC2626'} />
                <span>Phiếu Chi Tiền (CASH_OUT)</span>
              </button>
              <button
                type="button"
                className="wms-btn"
                style={{
                  backgroundColor: voucherForm.flowType === 'CASH_IN' ? '#15803D' : '#FFFFFF',
                  borderColor: voucherForm.flowType === 'CASH_IN' ? '#166534' : '#CBD5E1',
                  color: voucherForm.flowType === 'CASH_IN' ? '#FFFFFF' : '#475569',
                  fontWeight: voucherForm.flowType === 'CASH_IN' ? 700 : 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                onClick={() => switchFormFlowType('CASH_IN')}
              >
                <ArrowDownRight size={15} color={voucherForm.flowType === 'CASH_IN' ? '#FFFFFF' : '#16A34A'} />
                <span>Phiếu Thu Tiền (CASH_IN)</span>
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '12.5px',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontWeight: 600,
                  backgroundColor: voucherForm.flowType === 'CASH_IN' ? '#DCFCE7' : '#FEE2E2',
                  color: voucherForm.flowType === 'CASH_IN' ? '#15803D' : '#B91C1C',
                  border: `1px solid ${voucherForm.flowType === 'CASH_IN' ? '#86EFAC' : '#FCA5A5'}`,
                }}
              >
                {voucherForm.flowType === 'CASH_IN' ? '+ Tiền thu vào Quỹ / Ngân hàng (PT-)' : '- Tiền chi xuất Quỹ / Ngân hàng (PC-)'}
              </span>
            </div>
          </div>

          {/* SECTION A: HẠNG MỤC THU/CHI VÀ NỘI DUNG THANH TOÁN */}
          <div className="wms-form-section">
            <div className="wms-section-title">
              <Receipt size={18} color="var(--wms-accent)" />
              <span>
                Phần A: {voucherForm.flowType === 'CASH_IN' ? 'Hạng mục Thu tiền & Diễn giải Nộp tiền' : 'Hạng mục Chi phí & Căn cứ Chứng từ'}
              </span>
            </div>

            <div className="wms-form-grid-3">
              <div className="wms-form-group">
                <label htmlFor="pv-cat-select" className="wms-label required">
                  {voucherForm.flowType === 'CASH_IN' ? 'Hạng mục thu tiền (Revenue Category)' : 'Hạng mục chi phí (Expense Category)'}
                </label>
                <select
                  id="pv-cat-select"
                  className={`wms-select ${formErrors.category ? 'wms-input-error' : ''}`}
                  value={voucherForm.category}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                >
                  {voucherForm.flowType === 'CASH_IN' ? (
                    <>
                      <option value="CARRIER_COD_PAYOUT">Thu tiền COD từ đơn vị vận chuyển (GHN)</option>
                      <option value="SURCHARGE_REVENUE">Thu phụ phí hoàn hàng / đổi trả (Khách hàng)</option>
                      <option value="CARRIER_DISPUTE_COMPENSATION">Thu bồi thường khiếu nại vận chuyển (GHN)</option>
                      <option value="OTHER_EXPENSE">Thu nhập hoạt động khác / Khác</option>
                    </>
                  ) : (
                    <>
                      <option value="SUPPLIER_PAYMENT">Chi trả Nhà cung cấp (Vải, phụ liệu, cọc HĐ)</option>
                      <option value="CUSTOMER_REFUND">Chi hoàn tiền Khách hàng (Đơn trả hàng)</option>
                      <option value="SHIPPING_COST">Chi phí Cước vận chuyển (Hãng giao vận)</option>
                      <option value="PRODUCTION_COST">Chi phí Gia công may mặc (Xưởng may)</option>
                      <option value="OPERATING_EXPENSE">Chi phí Vận hành & Vật tư kho (Điện, nước, bao bì)</option>
                      <option value="OTHER_EXPENSE">Chi phí Hoạt động khác</option>
                    </>
                  )}
                </select>
                {formErrors.category && <span className="wms-error-text">{formErrors.category}</span>}
              </div>

              <div className="wms-form-group">
                <label htmlFor="pv-date" className="wms-label required">
                  Ngày lập chứng từ
                </label>
                <input
                  id="pv-date"
                  type="date"
                  className="wms-input"
                  value={voucherForm.voucherDate}
                  onChange={(e) => setVoucherForm((prev) => ({ ...prev, voucherDate: e.target.value }))}
                />
              </div>

              <div className="wms-form-group">
                <label htmlFor="pv-method" className="wms-label required">
                  Phương thức thanh toán
                </label>
                <select
                  id="pv-method"
                  className={`wms-select ${formErrors.paymentMethod ? 'wms-input-error' : ''}`}
                  value={voucherForm.paymentMethod}
                  onChange={(e) => setVoucherForm((prev) => ({ ...prev, paymentMethod: e.target.value }))}
                >
                  <option value="BANK_TRANSFER">Chuyển khoản Ngân hàng (Ủy nhiệm chi / Chuyển khoản)</option>
                  <option value="CASH">Tiền mặt tại quỹ kho</option>
                  <option value="COD_BALANCE_OFFSET">Cấn trừ số dư COD đối soát</option>
                </select>
                {formErrors.paymentMethod && <span className="wms-error-text">{formErrors.paymentMethod}</span>}
              </div>
            </div>

            <div className="wms-form-group" style={{ marginTop: '12px' }}>
              <label htmlFor="pv-reason" className="wms-label required">
                {voucherForm.flowType === 'CASH_IN'
                  ? 'Lý do thu / Diễn giải nội dung nộp tiền'
                  : 'Lý do chi / Diễn giải nội dung thanh toán'}
              </label>
              <textarea
                id="pv-reason"
                rows={2}
                className={`wms-textarea ${formErrors.paymentReason ? 'wms-input-error' : ''}`}
                placeholder={
                  voucherForm.flowType === 'CASH_IN'
                    ? 'Ví dụ: Thu tiền COD từ đơn vị vận chuyển GHN sau đối soát cước...'
                    : 'Ví dụ: Thanh toán tạm ứng 30% tiền hàng mua vải Cotton dệt kim theo Hợp đồng HDK-2026-001...'
                }
                value={voucherForm.paymentReason}
                onChange={(e) => {
                  setFormErrors((prev) => {
                    const n = { ...prev };
                    delete n.paymentReason;
                    return n;
                  });
                  setVoucherForm((prev) => ({ ...prev, paymentReason: e.target.value }));
                }}
              />
              {formErrors.paymentReason && <span className="wms-error-text">{formErrors.paymentReason}</span>}
            </div>
          </div>

          {/* SECTION B: LIÊN KẾT NGHIỆP VỤ ĐỐI TÁC (CHỈ DÀNH CHO PHIẾU CHI) */}
          {voucherForm.flowType === 'CASH_OUT' && voucherForm.category === 'SUPPLIER_PAYMENT' && (
            <div className="wms-form-section">
              <div className="wms-section-title">
                <Building2 size={18} color="var(--wms-accent)" />
                <span>Phần B: Liên kết Nhà Cung Ứng & Hợp Đồng Mua Sắm</span>
              </div>

              <div className="wms-form-grid-2">
                <div className="wms-form-group">
                  <label htmlFor="pv-supplier" className="wms-label required">
                    Chọn Nhà cung ứng thụ hưởng
                  </label>
                  <select
                    id="pv-supplier"
                    className={`wms-select ${formErrors.supplierId ? 'wms-input-error' : ''}`}
                    value={voucherForm.supplierId}
                    onChange={(e) => handleSelectSupplier(e.target.value)}
                  >
                    <option value="">-- Chọn Nhà cung ứng --</option>
                    {suppliers.map((s) => (
                      <option key={s._id || s.id} value={s._id || s.id}>
                        {s.supplierCode} — {s.supplierName} (Nợ hiện tại: {formatVnd(s.totalPayableDebt)})
                      </option>
                    ))}
                  </select>
                  {formErrors.supplierId && <span className="wms-error-text">{formErrors.supplierId}</span>}
                  {selectedSupplierObj && (
                    <div className="wms-helper-text" style={{ marginTop: '4px', color: 'var(--wms-accent-hover)', fontWeight: 600 }}>
                      Dư nợ phải trả hiện tại cho NCC này: {formatVnd(selectedSupplierObj.totalPayableDebt)}
                    </div>
                  )}
                </div>

                <div className="wms-form-group">
                  <label htmlFor="pv-contract" className="wms-label">
                    Hợp đồng mua sắm căn cứ (Nếu có)
                  </label>
                  <select
                    id="pv-contract"
                    className="wms-select"
                    value={voucherForm.contractId}
                    onChange={(e) => handleContractChange(e.target.value)}
                    disabled={!voucherForm.supplierId}
                  >
                    <option value="">-- Chi không gắn theo số HĐ cụ thể --</option>
                    {availableContractsForSupplier.map((c) => (
                      <option key={c._id || c.id} value={c._id || c.id}>
                        {c.contractCode} — {c.contractTitle || 'Hợp đồng mua sắm'} (Giá trị: {formatVnd(c.totalContractAmount || c.commercialTerms?.subtotalAmount || 0)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* SECTION B (CASH IN GHN HELPER): THÔNG TIN ĐỐI TÁC VẬN CHUYỂN */}
          {voucherForm.flowType === 'CASH_IN' && voucherForm.category === 'CARRIER_COD_PAYOUT' && (
            <div
              style={{
                margin: '0 20px 16px',
                padding: '12px 16px',
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Truck size={18} color="#15803D" />
                <span style={{ fontSize: '13px', color: '#166534', fontWeight: 600 }}>
                  Thu tiền COD từ Giao Hàng Nhanh (GHN) — Tiền chuyển khoản về tài khoản nhận của Shop
                </span>
              </div>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-xs"
                onClick={() => {
                  setVoucherForm((prev) => ({
                    ...prev,
                    recipient: {
                      name: 'Công ty Cổ phần Dịch vụ Giao Hàng Nhanh (GHN)',
                      phone: '1900 636677',
                      address: 'Tầng 3, Tòa nhà Rivera Park, 7/28 Thành Thái, P.14, Q.10, TP.HCM',
                      recipientType: 'CARRIER',
                    },
                    bankInfo: {
                      bankName: 'Ngân hàng TMCP Quân Đội (MB Bank)',
                      accountNo: '0988888888',
                      accountHolder: 'ARA STORE CO., LTD',
                      branchName: 'Hội sở',
                    },
                  }));
                }}
                style={{ backgroundColor: '#FFFFFF', borderColor: '#86EFAC', color: '#15803D', fontWeight: 600 }}
              >
                ⚡ Tự động nạp thông tin GHN & Tài khoản Shop
              </button>
            </div>
          )}

          {/* SECTION C: ĐỐI TƯỢNG NỘP/NHẬN & THÔNG TIN NGÂN HÀNG */}
          <div className="wms-form-section">
            <div className="wms-section-title">
              <CreditCard size={18} color="var(--wms-accent)" />
              <span>
                {voucherForm.flowType === 'CASH_IN'
                  ? 'Phần B: Thông tin Đối tượng Nộp tiền & Tài khoản Ngân hàng ARA STORE'
                  : 'Phần C: Thông tin Đối tượng Thụ hưởng & Ngân hàng'}
              </span>
            </div>

            <div className="wms-form-grid-3">
              <div className="wms-form-group">
                <label htmlFor="pv-rec-name" className="wms-label required">
                  {voucherForm.flowType === 'CASH_IN' ? 'Tên người / Đơn vị nộp tiền' : 'Tên người / Đơn vị nhận tiền'}
                </label>
                <input
                  id="pv-rec-name"
                  type="text"
                  className={`wms-input ${formErrors.recipientName ? 'wms-input-error' : ''}`}
                  placeholder={
                    voucherForm.flowType === 'CASH_IN'
                      ? 'Ví dụ: Công ty CP Dịch vụ Giao Hàng Nhanh (GHN)...'
                      : 'Nhập tên người thụ hưởng...'
                  }
                  value={voucherForm.recipient.name}
                  onChange={(e) => {
                    setFormErrors((prev) => {
                      const n = { ...prev };
                      delete n.recipientName;
                      return n;
                    });
                    setVoucherForm((prev) => ({
                      ...prev,
                      recipient: { ...prev.recipient, name: e.target.value },
                    }));
                  }}
                />
                {formErrors.recipientName && <span className="wms-error-text">{formErrors.recipientName}</span>}
              </div>

              <div className="wms-form-group">
                <label htmlFor="pv-rec-phone" className="wms-label">
                  Số điện thoại liên hệ
                </label>
                <input
                  id="pv-rec-phone"
                  type="tel"
                  className="wms-input"
                  placeholder="0912345678"
                  value={voucherForm.recipient.phone}
                  onChange={(e) =>
                    setVoucherForm((prev) => ({
                      ...prev,
                      recipient: { ...prev.recipient, phone: e.target.value },
                    }))
                  }
                />
              </div>

              <div className="wms-form-group">
                <label htmlFor="pv-rec-addr" className="wms-label">
                  Địa chỉ
                </label>
                <input
                  id="pv-rec-addr"
                  type="text"
                  className="wms-input"
                  placeholder="Địa chỉ trụ sở / nơi giao dịch..."
                  value={voucherForm.recipient.address}
                  onChange={(e) =>
                    setVoucherForm((prev) => ({
                      ...prev,
                      recipient: { ...prev.recipient, address: e.target.value },
                    }))
                  }
                />
              </div>
            </div>

            {/* Chi tiết tài khoản Ngân hàng (nếu chọn Chuyển khoản) */}
            {voucherForm.paymentMethod === 'BANK_TRANSFER' && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '12px',
                  backgroundColor: 'var(--wms-bg-subtle)',
                  borderRadius: 'var(--wms-radius-sm)',
                  border: '1px dashed var(--wms-border)',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '12.5px', marginBottom: '8px', color: 'var(--wms-accent-hover)' }}>
                  {voucherForm.flowType === 'CASH_IN'
                    ? 'Thông tin Tài khoản Ngân hàng ARA STORE nhận tiền:'
                    : 'Thông tin Tài khoản Ngân hàng Thụ hưởng (Ủy nhiệm chi):'}
                </div>

                <div className="wms-form-grid-3">
                  <div className="wms-form-group">
                    <label htmlFor="pv-bank-name" className="wms-label required">
                      Tên ngân hàng
                    </label>
                    <input
                      id="pv-bank-name"
                      type="text"
                      className={`wms-input ${formErrors.bankName ? 'wms-input-error' : ''}`}
                      placeholder="Vietcombank, MB Bank, Techcombank..."
                      value={voucherForm.bankInfo.bankName}
                      onChange={(e) => {
                        setFormErrors((prev) => {
                          const n = { ...prev };
                          delete n.bankName;
                          return n;
                        });
                        setVoucherForm((prev) => ({
                          ...prev,
                          bankInfo: { ...prev.bankInfo, bankName: e.target.value },
                        }));
                      }}
                    />
                    {formErrors.bankName && <span className="wms-error-text">{formErrors.bankName}</span>}
                  </div>

                  <div className="wms-form-group">
                    <label htmlFor="pv-bank-no" className="wms-label required">
                      Số tài khoản (STK)
                    </label>
                    <input
                      id="pv-bank-no"
                      type="text"
                      className={`wms-input ${formErrors.accountNo ? 'wms-input-error' : ''}`}
                      placeholder="Nhập số tài khoản..."
                      value={voucherForm.bankInfo.accountNo}
                      onChange={(e) => {
                        setFormErrors((prev) => {
                          const n = { ...prev };
                          delete n.accountNo;
                          return n;
                        });
                        setVoucherForm((prev) => ({
                          ...prev,
                          bankInfo: { ...prev.bankInfo, accountNo: e.target.value },
                        }));
                      }}
                    />
                    {formErrors.accountNo && <span className="wms-error-text">{formErrors.accountNo}</span>}
                  </div>

                  <div className="wms-form-group">
                    <label htmlFor="pv-bank-holder" className="wms-label required">
                      Tên chủ tài khoản
                    </label>
                    <input
                      id="pv-bank-holder"
                      type="text"
                      className={`wms-input ${formErrors.accountHolder ? 'wms-input-error' : ''}`}
                      placeholder="ARA STORE CO., LTD..."
                      value={voucherForm.bankInfo.accountHolder}
                      onChange={(e) => {
                        setFormErrors((prev) => {
                          const n = { ...prev };
                          delete n.accountHolder;
                          return n;
                        });
                        setVoucherForm((prev) => ({
                          ...prev,
                          bankInfo: { ...prev.bankInfo, accountHolder: e.target.value },
                        }));
                      }}
                    />
                    {formErrors.accountHolder && <span className="wms-error-text">{formErrors.accountHolder}</span>}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION D: SỐ TIỀN & CHỨNG TỪ GỐC */}
          <div className="wms-form-section">
            <div className="wms-section-title">
              <Banknote size={18} color="var(--wms-accent)" />
              <span>
                {voucherForm.flowType === 'CASH_IN'
                  ? 'Phần C: Số tiền Thu vào & Chứng từ đính kèm'
                  : 'Phần D: Số tiền Chi trả & Chứng từ gốc Hóa đơn'}
              </span>
            </div>

            {/* BỘ LỰA CHỌN PHƯƠNG THỨC THANH TOÁN THEO ĐỢT / NHẬP SỐ TIỀN CỤ THỂ */}
            {voucherForm.flowType === 'CASH_OUT' && voucherForm.category === 'SUPPLIER_PAYMENT' && Boolean(voucherForm.contractId) && selectedContract && (
              <div
                style={{
                  marginBottom: '18px',
                  padding: '16px',
                  background: '#f8fafc',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    marginBottom: '14px',
                    borderBottom: '1px solid #e2e8f0',
                    paddingBottom: '12px',
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: '13.5px', color: '#1e293b' }}>
                    Hình thức xác định số tiền thanh toán (HĐ {selectedContract.contractCode}):
                  </span>
                  <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: installmentMode === 'INSTALLMENT' ? 700 : 500,
                        color: installmentMode === 'INSTALLMENT' ? 'var(--wms-accent-hover, #15803d)' : '#475569',
                      }}
                    >
                      <input
                        type="radio"
                        name="paymentOptionMode"
                        checked={installmentMode === 'INSTALLMENT'}
                        onChange={() => handleSwitchInstallmentMode('INSTALLMENT')}
                        disabled={currentContractInstallments.length === 0}
                      />
                      <span>Thanh toán theo đợt hợp đồng (Tự động tính)</span>
                    </label>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: installmentMode === 'CUSTOM' ? 700 : 500,
                        color: installmentMode === 'CUSTOM' ? '#0f172a' : '#475569',
                      }}
                    >
                      <input
                        type="radio"
                        name="paymentOptionMode"
                        checked={installmentMode === 'CUSTOM'}
                        onChange={() => handleSwitchInstallmentMode('CUSTOM')}
                      />
                      <span>Nhập số tiền cụ thể linh hoạt</span>
                    </label>
                  </div>
                </div>

                {installmentMode === 'INSTALLMENT' && (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px',
                        flexWrap: 'wrap',
                        gap: '8px',
                      }}
                    >
                      <label className="wms-label required" style={{ margin: 0 }}>
                        Chọn các đợt thanh toán theo điều khoản hợp đồng:
                      </label>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>
                        (Thanh toán tuần tự từng đợt; có thể chọn gộp nhiều đợt liên tiếp nếu đợt trước đó đã chọn/đã chi)
                      </span>
                    </div>

                    {currentContractInstallments.length === 0 ? (
                      <div style={{ padding: '12px', background: '#fffbeb', color: '#b45309', borderRadius: '6px', fontSize: '13px' }}>
                        Hợp đồng này không có điều khoản chia đợt thanh toán cụ thể. Vui lòng chọn &quot;Nhập số tiền cụ thể linh hoạt&quot;.
                      </div>
                    ) : (
                      <>
                        {selectedInstallmentNumbers.length > 0 && (
                          <div
                            style={{
                              padding: '8px 12px',
                              background: '#dcfce7',
                              border: '1px solid #bbf7d0',
                              borderRadius: '6px',
                              marginBottom: '12px',
                              fontSize: '13px',
                              color: '#166534',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              gap: '8px',
                            }}
                          >
                            <span>
                              Đang chọn thanh toán: <strong>{voucherForm.installmentLabel}</strong> ({selectedInstallmentNumbers.length} đợt liên tiếp)
                            </span>
                            <span style={{ fontWeight: 700, fontSize: '14px' }}>
                              Tổng tiền đợt: {formatVnd(voucherForm.amount)}
                            </span>
                          </div>
                        )}

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: '12px',
                          }}
                        >
                          {currentContractInstallments.map((inst, instIdx) => {
                            const isPaid = currentContractPaidInstallmentsMap.has(inst.installmentNumber);
                            const paidVoucher = currentContractPaidInstallmentsMap.get(inst.installmentNumber);
                            const isSelected = selectedInstallmentNumbers.includes(inst.installmentNumber);

                            // Điều kiện mở khóa: Đợt trước đó đã chi hoặc đang được chọn
                            let canSelect = false;
                            let prevInstLabel = '';
                            if (!isPaid) {
                              if (instIdx === 0) {
                                canSelect = true;
                              } else {
                                const prevInst = currentContractInstallments[instIdx - 1];
                                const isPrevPaid = currentContractPaidInstallmentsMap.has(prevInst.installmentNumber);
                                const isPrevSelected = selectedInstallmentNumbers.includes(prevInst.installmentNumber);
                                canSelect = isPrevPaid || isPrevSelected;
                                prevInstLabel = prevInst.shortLabel;
                              }
                            }

                            return (
                              <div
                                key={inst.installmentNumber}
                                onClick={() => {
                                  if (!isPaid && canSelect) {
                                    handleToggleInstallment(inst, instIdx);
                                  }
                                }}
                                style={{
                                  border: isSelected
                                    ? '2px solid var(--wms-accent, #16a34a)'
                                    : isPaid
                                    ? '1px dashed #cbd5e1'
                                    : !canSelect
                                    ? '1px dashed #e2e8f0'
                                    : '1px solid #cbd5e1',
                                  borderRadius: '8px',
                                  padding: '12px 14px',
                                  background: isPaid ? '#f1f5f9' : isSelected ? '#f0fdf4' : !canSelect ? '#f8fafc' : '#fff',
                                  cursor: isPaid || !canSelect ? 'not-allowed' : 'pointer',
                                  opacity: isPaid ? 0.75 : !canSelect ? 0.6 : 1,
                                  boxShadow: isSelected ? '0 2px 8px rgba(22, 163, 74, 0.15)' : 'none',
                                  transition: 'all 0.15s ease-in-out',
                                  position: 'relative',
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: '6px',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                      type="checkbox"
                                      checked={isPaid || isSelected}
                                      disabled={isPaid || !canSelect}
                                      onChange={() => {}}
                                      style={{ cursor: isPaid || !canSelect ? 'not-allowed' : 'pointer' }}
                                    />
                                    <span
                                      style={{
                                        fontWeight: 700,
                                        fontSize: '13.5px',
                                        color: isPaid || !canSelect ? '#64748b' : '#0f172a',
                                      }}
                                    >
                                      {inst.shortLabel}
                                    </span>
                                  </div>

                                  {isPaid ? (
                                    <span
                                      style={{
                                        fontSize: '11px',
                                        padding: '2px 7px',
                                        background: '#e2e8f0',
                                        color: '#475569',
                                        borderRadius: '4px',
                                        fontWeight: 600,
                                      }}
                                    >
                                      ✓ Đã chi ({paidVoucher?.voucherCode})
                                    </span>
                                  ) : isSelected ? (
                                    <span
                                      style={{
                                        fontSize: '11px',
                                        padding: '2px 7px',
                                        background: '#dcfce7',
                                        color: '#166534',
                                        borderRadius: '4px',
                                        fontWeight: 700,
                                      }}
                                    >
                                      ● Đang chọn
                                    </span>
                                  ) : canSelect ? (
                                    <span
                                      style={{
                                        fontSize: '11px',
                                        padding: '2px 7px',
                                        background: '#e0f2fe',
                                        color: '#0369a1',
                                        borderRadius: '4px',
                                        fontWeight: 600,
                                      }}
                                    >
                                      + Chọn thêm
                                    </span>
                                  ) : (
                                    <span
                                      style={{
                                        fontSize: '11px',
                                        padding: '2px 7px',
                                        background: '#f1f5f9',
                                        color: '#94a3b8',
                                        borderRadius: '4px',
                                        fontWeight: 600,
                                      }}
                                    >
                                      🔒 Chưa thể chọn
                                    </span>
                                  )}
                                </div>

                                <div
                                  style={{
                                    fontSize: '16px',
                                    fontWeight: 700,
                                    color: isPaid || !canSelect ? '#64748b' : 'var(--wms-accent-hover, #15803d)',
                                    marginBottom: '4px',
                                  }}
                                >
                                  {formatVnd(inst.amount)}
                                </div>

                                <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                                  Hạn chi:{' '}
                                  <strong>
                                    {inst.dueDate ? formatDate(inst.dueDate) : 'Theo tiến độ HĐ'}
                                  </strong>
                                </div>

                                {!isPaid && !canSelect && prevInstLabel && (
                                  <div
                                    style={{
                                      fontSize: '11px',
                                      color: '#b45309',
                                      marginTop: '4px',
                                      lineHeight: 1.3,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                  >
                                    <span>⚠️ Cần chọn/thanh toán {prevInstLabel} trước</span>
                                  </div>
                                )}

                                {inst.note && (
                                  <div
                                    style={{
                                      fontSize: '11px',
                                      color: '#475569',
                                      fontStyle: 'italic',
                                      marginTop: '4px',
                                      lineHeight: 1.3,
                                    }}
                                  >
                                    {inst.note}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}

                    {formErrors.installmentNumber && (
                      <span className="wms-error-text" style={{ marginTop: '6px', display: 'block' }}>
                        {formErrors.installmentNumber}
                      </span>
                    )}
                  </div>
                )}

              </div>
            )}

            <div className="wms-form-grid-2">
              <div className="wms-form-group">
                <label htmlFor="pv-amount" className="wms-label required">
                  {voucherForm.flowType === 'CASH_IN' ? 'Số tiền thu vào quỹ / ngân hàng (VND)' : 'Số tiền chi trả (VND)'}
                </label>
                <input
                  id="pv-amount"
                  type="number"
                  min="1"
                  step="1000"
                  className={`wms-input ${formErrors.amount ? 'wms-input-error' : ''}`}
                  placeholder={voucherForm.flowType === 'CASH_IN' ? 'Nhập số tiền thu vào...' : 'Nhập số tiền chi trả...'}
                  value={voucherForm.amount}
                  readOnly={
                    voucherForm.flowType === 'CASH_OUT' &&
                    voucherForm.category === 'SUPPLIER_PAYMENT' &&
                    Boolean(voucherForm.contractId) &&
                    installmentMode === 'INSTALLMENT' &&
                    selectedInstallmentNumbers.length > 0
                  }
                  onChange={(e) => {
                    setFormErrors((prev) => {
                      const n = { ...prev };
                      delete n.amount;
                      return n;
                    });
                    setVoucherForm((prev) => ({ ...prev, amount: e.target.value }));
                  }}
                  style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    background:
                      voucherForm.flowType === 'CASH_OUT' &&
                      voucherForm.category === 'SUPPLIER_PAYMENT' &&
                      Boolean(voucherForm.contractId) &&
                      installmentMode === 'INSTALLMENT' &&
                      selectedInstallmentNumbers.length > 0
                        ? '#f8fafc'
                        : '#fff',
                  }}
                />
                {formErrors.amount && <span className="wms-error-text">{formErrors.amount}</span>}
                {voucherForm.flowType === 'CASH_OUT' &&
                  voucherForm.category === 'SUPPLIER_PAYMENT' &&
                  Boolean(voucherForm.contractId) &&
                  installmentMode === 'INSTALLMENT' &&
                  selectedInstallmentNumbers.length > 0 && (
                    <div
                      style={{
                        padding: '6px 10px',
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        borderRadius: '6px',
                        marginTop: '6px',
                        fontSize: '12px',
                        color: '#166534',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <ShieldCheck size={14} />
                      <span>
                        Số tiền được tự động tính theo <strong>{voucherForm.installmentLabel}</strong> của hợp đồng ban đầu ({formatVnd(voucherForm.amount)}).
                      </span>
                    </div>
                  )}
                {voucherForm.amount > 0 && (
                  <div
                    className="wms-helper-text"
                    style={{
                      marginTop: '4px',
                      color: voucherForm.flowType === 'CASH_IN' ? '#15803D' : 'var(--wms-accent-hover)',
                      fontWeight: 600,
                    }}
                  >
                    Bằng chữ / Quy đổi: {formatVnd(voucherForm.amount)}
                  </div>
                )}
              </div>

              <div className="wms-form-group">
                <label htmlFor="pv-notes" className="wms-label">
                  Ghi chú nội bộ
                </label>
                <input
                  id="pv-notes"
                  type="text"
                  className="wms-input"
                  placeholder="Ghi chú thêm về chứng từ, đối tác, người giao nhận..."
                  value={voucherForm.notes}
                  onChange={(e) => setVoucherForm((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>

            {/* Dropzone tải ảnh chứng từ đính kèm */}
            <div className="wms-photo-uploader" style={{ marginTop: '16px' }}>
              <label className="wms-label">
                Chứng từ đính kèm (Biên lai nộp tiền, Phiếu thu tay, Ủy nhiệm chi, Sao kê GD, Giấy biên nhận)
              </label>
              <div className="wms-photo-dropzone">
                <input
                  type="file"
                  id="pv-file-upload"
                  multiple
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  style={{ display: 'none' }}
                  title="Chọn chứng từ ảnh đính kèm"
                />
                <label htmlFor="pv-file-upload" className="wms-dropzone-inner">
                  <UploadCloud size={28} color="var(--wms-accent)" />
                  <div>
                    <strong>Nhấn để chọn ảnh chứng từ</strong> hoặc kéo thả vào đây
                  </div>
                  <div className="wms-helper-text">
                    Hỗ trợ file PNG, JPG, JPEG, WEBP. Ảnh tự động nén tối ưu dung lượng.
                  </div>
                </label>
              </div>

              {voucherForm.supportingDocuments.length > 0 && (
                <div className="wms-photo-grid" style={{ marginTop: '12px' }}>
                  {voucherForm.supportingDocuments.map((doc, dIdx) => (
                    <div key={dIdx} className="wms-photo-card" style={{ height: '110px' }}>
                      <img src={doc.url} alt={doc.name} onClick={() => setLightboxImage(doc.url)} />
                      <button
                        type="button"
                        className="wms-photo-delete-btn"
                        onClick={() => handleRemovePhoto(dIdx)}
                        title="Xóa chứng từ này"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Form Actions */}
          <div className="wms-form-actions">
            <button
              type="button"
              className="wms-btn wms-btn-default"
              onClick={() => setActiveTab('VOUCHER_LIST')}
              disabled={submitting}
            >
              Hủy bỏ & Quay lại
            </button>

            <button
              type="submit"
              className="wms-btn"
              style={{
                backgroundColor: voucherForm.flowType === 'CASH_IN' ? '#15803D' : '#B91C1C',
                borderColor: voucherForm.flowType === 'CASH_IN' ? '#166534' : '#991B1B',
                color: '#FFFFFF',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
              disabled={submitting}
            >
              <CheckCircle2 size={16} />
              <span>
                {submitting
                  ? 'Đang tạo phiếu...'
                  : voucherForm.flowType === 'CASH_IN'
                  ? 'Lập Phiếu Thu'
                  : 'Lập Phiếu Chi'}
              </span>
            </button>

            <button
              type="button"
              className="wms-btn"
              style={{
                backgroundColor: voucherForm.flowType === 'CASH_IN' ? '#166534' : 'var(--wms-accent-hover, #15803d)',
                borderColor: voucherForm.flowType === 'CASH_IN' ? '#14532D' : '#166534',
                color: '#FFFFFF',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
              onClick={() => handleSubmitVoucher('CONFIRMED', true)}
              disabled={submitting}
              title={
                voucherForm.flowType === 'CASH_IN'
                  ? 'Tạo phiếu và mở ngay cửa sổ xác nhận đã thu tiền vào tài khoản/quỹ'
                  : 'Tạo phiếu và mở ngay cửa sổ xác nhận chi tiền xuất quỹ'
              }
            >
              <Banknote size={16} />
              <span>
                {submitting
                  ? 'Đang xử lý...'
                  : voucherForm.flowType === 'CASH_IN'
                  ? 'Lập Phiếu & Xác nhận Đã Thu tiền ngay'
                  : 'Lập Phiếu & Chi tiền ngay'}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: XEM CHI TIẾT PHIẾU THU / CHI TIỀN                                */}
      {/* ========================================================================= */}
      {selectedVoucherForDetail && (
        <div className="wms-modal-backdrop" role="dialog" aria-modal="true">
          <div className="wms-modal-dialog wide" style={{ maxWidth: '850px' }}>
            <div className="wms-modal-header">
              <div>
                <h2 className="wms-modal-title">
                  Hồ sơ Chi tiết {selectedVoucherForDetail.flowType === 'CASH_IN' ? 'Phiếu Thu Tiền' : 'Phiếu Chi Tiền'}: {selectedVoucherForDetail.voucherCode}
                </h2>
                <div className="wms-helper-text" style={{ fontSize: '12px' }}>
                  Ngày lập chứng từ: {formatDate(selectedVoucherForDetail.voucherDate)}
                </div>
              </div>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-sm"
                onClick={() => setSelectedVoucherForDetail(null)}
              >
                <X size={16} />
                Đóng
              </button>
            </div>

            <div className="wms-modal-body">
              {/* Thẻ 1: Thông tin tổng quan */}
              <div className="wms-detail-card">
                <div className="wms-detail-card-title">
                  <Receipt size={16} color="var(--wms-accent)" />
                  <span>
                    {selectedVoucherForDetail.flowType === 'CASH_IN'
                      ? 'Thông tin Thu tiền & Trạng thái'
                      : 'Thông tin Thanh toán & Trạng thái'}
                  </span>
                </div>

                <div className="wms-detail-grid-2">
                  <div className="wms-detail-item">
                    <span className="wms-detail-label">
                      {selectedVoucherForDetail.flowType === 'CASH_IN' ? 'Mã phiếu thu' : 'Mã phiếu chi'}
                    </span>
                    <span className="wms-detail-value" style={{ fontWeight: 700 }}>
                      {selectedVoucherForDetail.voucherCode}
                    </span>
                  </div>

                  <div className="wms-detail-item">
                    <span className="wms-detail-label">Trạng thái chứng từ</span>
                    <div>
                      {(() => {
                        const b = getVoucherStatusBadge(selectedVoucherForDetail);
                        return <span className={`wms-status-badge ${b.cls}`} style={b.style}>{b.label}</span>;
                      })()}
                    </div>
                  </div>

                  <div className="wms-detail-item">
                    <span className="wms-detail-label">
                      {selectedVoucherForDetail.flowType === 'CASH_IN' ? 'Số tiền thực thu' : 'Số tiền chi trả'}
                    </span>
                    <span
                      className="wms-detail-value"
                      style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        color: selectedVoucherForDetail.flowType === 'CASH_IN' ? '#15803d' : '#b91c1c',
                      }}
                    >
                      {selectedVoucherForDetail.flowType === 'CASH_IN' ? '+' : '-'}
                      {formatVnd(selectedVoucherForDetail.amount)}
                    </span>
                  </div>

                  <div className="wms-detail-item">
                    <span className="wms-detail-label">Phương thức hạch toán</span>
                    <span className="wms-detail-value">
                      {selectedVoucherForDetail.paymentMethod === 'BANK_TRANSFER'
                        ? 'Chuyển khoản Ngân hàng (UNC)'
                        : selectedVoucherForDetail.paymentMethod === 'COD_BALANCE_OFFSET'
                        ? 'Bù trừ tiền COD đối soát'
                        : 'Tiền mặt tại quỹ'}
                    </span>
                  </div>

                  <div className="wms-detail-item" style={{ gridColumn: '1 / -1' }}>
                    <span className="wms-detail-label">
                      {selectedVoucherForDetail.flowType === 'CASH_IN'
                        ? 'Lý do thu / Nội dung đối soát'
                        : 'Lý do chi / Diễn giải'}
                    </span>
                    <div style={{ fontSize: '13px', lineHeight: 1.5, marginTop: '2px', fontWeight: 600 }}>
                      {selectedVoucherForDetail.paymentReason}
                    </div>
                  </div>
                </div>
              </div>

              {/* Thẻ 2: Thông tin Đối tác giao dịch */}
              <div className="wms-detail-card">
                <div className="wms-detail-card-title">
                  <CreditCard size={16} color="var(--wms-accent)" />
                  <span>
                    {selectedVoucherForDetail.flowType === 'CASH_IN'
                      ? 'Đơn vị Thanh toán / Nộp tiền & Tài khoản'
                      : 'Đối tượng Thụ hưởng & Tài khoản Nhận tiền'}
                  </span>
                </div>

                <div className="wms-detail-grid-2">
                  <div className="wms-detail-item">
                    <span className="wms-detail-label">
                      {selectedVoucherForDetail.flowType === 'CASH_IN'
                        ? 'Tên người / Đơn vị thanh toán'
                        : 'Tên người / Đơn vị nhận'}
                    </span>
                    <span className="wms-detail-value" style={{ fontWeight: 700 }}>
                      {selectedVoucherForDetail.carrierId?.carrierName ||
                        selectedVoucherForDetail.supplierId?.supplierName ||
                        selectedVoucherForDetail.recipient?.name ||
                        (selectedVoucherForDetail.category === 'CARRIER_COD_PAYOUT' ? 'Giao Hàng Nhanh (GHN)' : '—')}
                    </span>
                  </div>

                  <div className="wms-detail-item">
                    <span className="wms-detail-label">Số điện thoại / Hotline</span>
                    <span className="wms-detail-value">
                      {selectedVoucherForDetail.carrierId?.hotline ||
                        selectedVoucherForDetail.supplierId?.phone ||
                        selectedVoucherForDetail.recipient?.phone ||
                        (selectedVoucherForDetail.category === 'CARRIER_COD_PAYOUT' ? '1900 636677' : '—')}
                    </span>
                  </div>

                  {selectedVoucherForDetail.carrierId && (
                    <div className="wms-detail-item">
                      <span className="wms-detail-label">Đối tác vận chuyển</span>
                      <span className="wms-detail-value" style={{ fontWeight: 600, color: '#15803d' }}>
                        {selectedVoucherForDetail.carrierId.carrierName || 'Giao Hàng Nhanh (GHN)'}
                        {selectedVoucherForDetail.carrierId.carrierCode ? ` (${selectedVoucherForDetail.carrierId.carrierCode})` : ''}
                      </span>
                    </div>
                  )}

                  {selectedVoucherForDetail.paymentMethod === 'BANK_TRANSFER' && selectedVoucherForDetail.bankInfo && (
                    <>
                      <div className="wms-detail-item">
                        <span className="wms-detail-label">Ngân hàng giao dịch</span>
                        <span className="wms-detail-value">
                          {selectedVoucherForDetail.bankInfo.bankName || '—'}
                        </span>
                      </div>

                      <div className="wms-detail-item">
                        <span className="wms-detail-label">Số tài khoản & Chủ tài khoản</span>
                        <span className="wms-detail-value" style={{ fontWeight: 600 }}>
                          STK: {selectedVoucherForDetail.bankInfo.accountNo || '—'} (
                          {selectedVoucherForDetail.bankInfo.accountHolder || '—'})
                        </span>
                      </div>
                    </>
                  )}

                  {selectedVoucherForDetail.supplierId && (
                    <div className="wms-detail-item">
                      <span className="wms-detail-label">Nhà cung cấp liên kết</span>
                      <span className="wms-detail-value">
                        {selectedVoucherForDetail.supplierId.supplierName} ({selectedVoucherForDetail.supplierId.supplierCode})
                      </span>
                    </div>
                  )}

                  {selectedVoucherForDetail.contractId && (
                    <div className="wms-detail-item">
                      <span className="wms-detail-label">Hợp đồng liên kết</span>
                      <span className="wms-detail-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong>
                          {selectedVoucherForDetail.contractId.contractCode || selectedVoucherForDetail.contractId}
                        </strong>
                        {selectedVoucherForDetail.installmentLabel && (
                          <span
                            style={{
                              padding: '2px 8px',
                              background: '#dbeafe',
                              color: '#1e40af',
                              borderRadius: '4px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              border: '1px solid #bfdbfe',
                            }}
                          >
                            {selectedVoucherForDetail.installmentLabel}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Thẻ 3: Lịch sử xử lý & Hạch toán */}
              <div className="wms-detail-card">
                <div className="wms-detail-card-title">
                  <Clock size={16} color="var(--wms-accent)" />
                  <span>
                    {selectedVoucherForDetail.flowType === 'CASH_IN'
                      ? 'Nhật ký Thu tiền & Đối soát'
                      : 'Nhật ký Xử lý & Thực chi'}
                  </span>
                </div>

                <div className="wms-detail-grid-2">
                  <div className="wms-detail-item">
                    <span className="wms-detail-label">Kế toán lập chứng từ</span>
                    <span className="wms-detail-value">
                      {selectedVoucherForDetail.createdByAccountantId?.fullName || 'Kế toán Kho & Tài chính'}
                    </span>
                  </div>

                  <div className="wms-detail-item">
                    <span className="wms-detail-label">Thời gian tạo lập</span>
                    <span className="wms-detail-value">
                      {formatDateTime(selectedVoucherForDetail.createdAt)}
                    </span>
                  </div>

                  {selectedVoucherForDetail.confirmedAt && (
                    <>
                      <div className="wms-detail-item">
                        <span className="wms-detail-label">Xác nhận duyệt bởi</span>
                        <span className="wms-detail-value">
                          {selectedVoucherForDetail.confirmedByAccountantId?.fullName || 'Kế toán'}
                        </span>
                      </div>

                      <div className="wms-detail-item">
                        <span className="wms-detail-label">Thời điểm duyệt</span>
                        <span className="wms-detail-value">
                          {formatDateTime(selectedVoucherForDetail.confirmedAt)}
                        </span>
                      </div>
                    </>
                  )}

                  {selectedVoucherForDetail.paidAt && (
                    <>
                      <div className="wms-detail-item">
                        <span className="wms-detail-label">
                          {selectedVoucherForDetail.flowType === 'CASH_IN' ? 'Người xác nhận thu' : 'Người thực chi'}
                        </span>
                        <span className="wms-detail-value">
                          {selectedVoucherForDetail.paidByUserId?.fullName || 'Kế toán / Thủ quỹ'}
                        </span>
                      </div>

                      <div className="wms-detail-item">
                        <span className="wms-detail-label">Mã giao dịch / Mã tham chiếu</span>
                        <span className="wms-detail-value" style={{ fontWeight: 700, color: 'var(--wms-success)' }}>
                          {selectedVoucherForDetail.transactionReference || 'Đã ghi nhận hạch toán'}
                        </span>
                      </div>
                    </>
                  )}

                  {selectedVoucherForDetail.status === 'CANCELLED' && (
                    <div className="wms-detail-item" style={{ gridColumn: '1 / -1', color: 'var(--wms-danger)' }}>
                      <span className="wms-detail-label" style={{ color: 'var(--wms-danger)' }}>Lý do hủy bỏ chứng từ</span>
                      <span className="wms-detail-value">
                        {selectedVoucherForDetail.cancellationReason || 'Hủy theo yêu cầu'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Thẻ 4: Thư viện chứng từ đính kèm */}
              <div className="wms-detail-card">
                <div className="wms-detail-card-title">
                  <ImageIcon size={16} color="var(--wms-accent)" />
                  <span>
                    Chứng từ gốc đính kèm ({selectedVoucherForDetail.supportingDocuments?.length || 0})
                  </span>
                </div>

                {selectedVoucherForDetail.supportingDocuments?.length > 0 ? (
                  <div className="wms-photo-grid">
                    {selectedVoucherForDetail.supportingDocuments.map((doc, pIdx) => (
                      <div key={pIdx} className="wms-photo-card" style={{ height: '130px' }}>
                        <img
                          src={doc.url}
                          alt={doc.name}
                          onClick={() => setLightboxImage(doc.url)}
                          title="Nhấn để xem phóng to"
                        />
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            backgroundColor: 'rgba(20, 18, 16, 0.75)',
                            color: '#FAF7F2',
                            fontSize: '11px',
                            padding: '2px 6px',
                            textAlign: 'center',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {doc.name}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="wms-helper-text" style={{ fontStyle: 'italic', padding: '6px 0' }}>
                    Chưa có ảnh chứng từ hóa đơn đính kèm cho chứng từ này.
                  </div>
                )}
              </div>
            </div>

            <div className="wms-modal-footer">
              {/* Các nút hành động theo trạng thái: Không cần chờ duyệt, có thể xác nhận chi tiền ngay */}
              {selectedVoucherForDetail.flowType !== 'CASH_IN' &&
                selectedVoucherForDetail.status !== 'PAID' &&
                selectedVoucherForDetail.status !== 'CANCELLED' && (
                  <>
                    <button
                      type="button"
                      className="wms-btn wms-btn-default"
                      onClick={() => handleOpenCancelModal(selectedVoucherForDetail)}
                    >
                      <XCircle size={15} />
                      <span>Hủy phiếu</span>
                    </button>
                    <button
                      type="button"
                      className="wms-btn wms-btn-primary"
                      style={selectedVoucherForDetail.flowType === 'CASH_IN' ? { backgroundColor: '#15803D', borderColor: '#166534' } : {}}
                      onClick={() => handleOpenDisbursementModal(selectedVoucherForDetail)}
                      disabled={submitting}
                    >
                      <Banknote size={15} />
                      <span>{selectedVoucherForDetail.flowType === 'CASH_IN' ? 'Xác nhận Thu tiền ngay' : 'Xác nhận Chi tiền ngay'}</span>
                    </button>
                  </>
                )}

              <button
                type="button"
                className="wms-btn wms-btn-default"
                onClick={() => setSelectedVoucherForDetail(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: XÁC NHẬN THU / CHI TIỀN THỰC TẾ (DISBURSEMENT / COLLECTION MODAL) */}
      {/* ========================================================================= */}
      {disbursementModalVoucher && (
        <div className="wms-modal-backdrop" role="dialog" aria-modal="true">
          <div className="wms-modal-dialog" style={{ maxWidth: '520px' }}>
            <div className="wms-modal-header">
              <h2 className="wms-modal-title">
                {disbursementModalVoucher.flowType === 'CASH_IN' ? 'Xác nhận Thu tiền: ' : 'Xác nhận Chi tiền: '}
                {disbursementModalVoucher.voucherCode}
              </h2>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-sm"
                onClick={() => setDisbursementModalVoucher(null)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleExecutePaymentSubmit}>
              <div className="wms-modal-body">
                <div style={{ marginBottom: '14px', padding: '10px 12px', backgroundColor: 'var(--wms-bg-subtle)', borderRadius: 'var(--wms-radius-sm)' }}>
                  <div style={{ fontSize: '13px' }}>
                    {disbursementModalVoucher.flowType === 'CASH_IN' ? 'Người / Đơn vị nộp tiền: ' : 'Người nhận: '}
                    <strong>{disbursementModalVoucher.recipient?.name}</strong>
                  </div>
                  <div
                    style={{
                      fontSize: '15px',
                      fontWeight: 700,
                      color: disbursementModalVoucher.flowType === 'CASH_IN' ? '#15803D' : 'var(--wms-accent-hover)',
                      marginTop: '4px',
                    }}
                  >
                    {disbursementModalVoucher.flowType === 'CASH_IN' ? 'Số tiền thu vào quỹ / TK: ' : 'Số tiền xuất quỹ: '}
                    {formatVnd(disbursementModalVoucher.amount)}
                  </div>
                </div>

                <div className="wms-form-group">
                  <label htmlFor="pv-trans-ref" className="wms-label required">
                    {disbursementModalVoucher.flowType === 'CASH_IN'
                      ? 'Mã giao dịch ngân hàng / Mã sao kê / Số biên lai thu'
                      : 'Mã giao dịch ngân hàng / Mã UNC / Số phiếu chi'}
                  </label>
                  <input
                    id="pv-trans-ref"
                    type="text"
                    required
                    className="wms-input"
                    placeholder={
                      disbursementModalVoucher.flowType === 'CASH_IN'
                        ? 'Ví dụ: FT26118899, GHN-TT-1106, BLT-001...'
                        : 'Ví dụ: UNC-889922, FT261102987...'
                    }
                    value={disbursementForm.transactionReference}
                    onChange={(e) => setDisbursementForm((p) => ({ ...p, transactionReference: e.target.value }))}
                  />
                  <span className="wms-helper-text">
                    Lưu mã đối soát để đối chiếu với sao kê tài khoản ngân hàng hoặc sổ quỹ tiền mặt.
                  </span>
                </div>

                <div className="wms-form-group" style={{ marginTop: '12px' }}>
                  <label htmlFor="pv-paid-at" className="wms-label required">
                    {disbursementModalVoucher.flowType === 'CASH_IN' ? 'Thời điểm nhận tiền' : 'Thời điểm giải ngân'}
                  </label>
                  <input
                    id="pv-paid-at"
                    type="datetime-local"
                    required
                    className="wms-input"
                    value={disbursementForm.paidAt}
                    onChange={(e) => setDisbursementForm((p) => ({ ...p, paidAt: e.target.value }))}
                  />
                </div>
              </div>

              <div className="wms-modal-footer">
                <button
                  type="button"
                  className="wms-btn wms-btn-default"
                  onClick={() => setDisbursementModalVoucher(null)}
                  disabled={submitting}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="wms-btn wms-btn-primary"
                  style={disbursementModalVoucher.flowType === 'CASH_IN' ? { backgroundColor: '#15803D', borderColor: '#166534' } : {}}
                  disabled={submitting}
                >
                  <Check size={16} />
                  <span>
                    {submitting
                      ? 'Đang xử lý...'
                      : disbursementModalVoucher.flowType === 'CASH_IN'
                      ? 'Xác nhận Đã Thu tiền'
                      : 'Xác nhận Đã Chi tiền'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: HỦY PHIẾU CHI (CANCEL MODAL)                                      */}
      {/* ========================================================================= */}
      {cancelModalVoucher && (
        <div className="wms-modal-backdrop" role="dialog" aria-modal="true">
          <div className="wms-modal-dialog" style={{ maxWidth: '480px' }}>
            <div className="wms-modal-header">
              <h2 className="wms-modal-title" style={{ color: 'var(--wms-danger)' }}>
                Hủy Phiếu Chi: {cancelModalVoucher.voucherCode}
              </h2>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-sm"
                onClick={() => setCancelModalVoucher(null)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCancelVoucherSubmit}>
              <div className="wms-modal-body">
                <p style={{ fontSize: '13px', marginBottom: '12px', color: 'var(--wms-text-primary)' }}>
                  Bạn có chắc chắn muốn hủy phiếu chi này không? Thao tác hủy sẽ ngừng việc giải ngân.
                </p>

                <div className="wms-form-group">
                  <label htmlFor="pv-cancel-reason" className="wms-label required">
                    Lý do hủy bỏ phiếu chi
                  </label>
                  <textarea
                    id="pv-cancel-reason"
                    rows={3}
                    required
                    className="wms-textarea"
                    placeholder="Nhập lý do hủy phiếu chi..."
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                  />
                </div>
              </div>

              <div className="wms-modal-footer">
                <button
                  type="button"
                  className="wms-btn wms-btn-default"
                  onClick={() => setCancelModalVoucher(null)}
                  disabled={submitting}
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  className="wms-btn wms-btn-danger"
                  disabled={submitting}
                >
                  <XCircle size={16} />
                  <span>{submitting ? 'Đang hủy...' : 'Xác nhận Hủy Phiếu'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: LIGHTBOX PHÓNG TO ẢNH CHỨNG TỪ */}
      {lightboxImage && (
        <div
          className="wms-lightbox-backdrop"
          onClick={() => setLightboxImage(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="wms-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="wms-lightbox-close"
              onClick={() => setLightboxImage(null)}
            >
              <X size={18} />
              <span>Đóng</span>
            </button>
            <img src={lightboxImage} alt="Chứng từ đính kèm phóng to" />
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentVoucherPage;

