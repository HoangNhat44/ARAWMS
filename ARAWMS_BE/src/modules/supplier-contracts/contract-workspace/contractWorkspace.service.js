import mongoose from 'mongoose';
import { objectId } from '../../../common/utils/ownerValidation.js';
import { safeUrl } from '../../../common/utils/ownerReadQuery.js';
import { httpError } from '../../../common/utils/httpError.js';
const active = { isDeleted: { $ne: true } };
const read = (name, filter, projection) => mongoose.connection.collection(name).find({ ...active, ...filter }, { projection }).toArray();
export async function contractDetail(id) {
  objectId(id);
  const [contract] = await read('supplier_contracts', { _id: new mongoose.Types.ObjectId(id) });
  if (!contract) throw httpError(404, 'Không tìm thấy hợp đồng.');
  // Native collection reads preserve the historical contract fields absent from the older Mongoose schema.
  const [suppliers, plans, payments] = await Promise.all([
    read('suppliers', { _id: contract.supplierId }, { supplierCode: 1, supplierName: 1, taxCode: 1, contactName: 1, representativeName: 1, phone: 1, email: 1, address: 1 }),
    read('material_inbound_plans', { contractId: contract._id }),
    read('cash_flow_vouchers', { contractId: contract._id, flowType: 'CASH_OUT' }),
  ]);
  const materialIds = [...(contract.contractedMaterials || []), ...plans.flatMap(p => [...(p.expectedItems || []), ...(p.batches || []).flatMap(b => b.expectedItems || [])])].map(i => i.rawMaterialId).filter(Boolean);
  const [materials, users] = await Promise.all([
    read('raw_materials', { _id: { $in: materialIds } }, { materialCode: 1, materialName: 1, unit: 1 }),
    read('users', { _id: { $in: [contract.draftedByAccountantId, contract.finalizedByOwnerId, contract.terminatedByUserId].filter(Boolean) } }, { fullName: 1 }),
  ]);
  const materialMap = new Map(materials.map(m => [String(m._id), m]));
  const name = (id) => users.find(u => String(u._id) === String(id))?.fullName || null;
  const item = (line) => { const material = materialMap.get(String(line.rawMaterialId)); return { materialId: String(line.rawMaterialId || ''), code: line.materialCodeSnapshot || material?.materialCode || null, name: line.materialNameSnapshot || material?.materialName || null, unit: line.unitSnapshot || material?.unit || null }; };
  const planItems = (lines) => (lines || []).map(line => ({ ...item(line), plannedQty: line.plannedQty, verifiedQty: line.actualVerifiedPassedQty, defectiveOrShortQty: line.actualDefectiveOrShortQty }));
  const supplier = suppliers[0];
  return {
    id: String(contract._id), code: contract.contractCode, title: contract.contractTitle, type: contract.contractType, status: contract.status,
    signingDate: contract.signingDate, effectiveFrom: contract.effectiveFrom, effectiveTo: contract.effectiveTo, createdAt: contract.createdAt,
    draftedBy: name(contract.draftedByAccountantId), finalizedBy: name(contract.finalizedByOwnerId), finalizedAt: contract.finalizedAt,
    total: contract.totalContractAmount, paid: contract.totalPaidAmount ?? 0, debt: Math.max(0, (contract.totalContractAmount ?? 0) - (contract.totalPaidAmount ?? 0)),
    buyerInfo: contract.buyerInfo || {}, commercialTerms: contract.commercialTerms || {}, qualityStandards: contract.qualityStandards || {},
    breachPenaltyClause: contract.breachPenaltyClause, disputeResolutionClause: contract.disputeResolutionClause, notes: contract.notes,
    terminationReason: contract.terminationReason, terminatedAt: contract.terminatedAt, terminatedBy: name(contract.terminatedByUserId),
    versionNumber: contract.versionNumber, amendmentReason: contract.amendmentReason,
    frameworkDocumentUrl: safeUrl(contract.frameworkDocumentUrl), signedContractDocumentUrl: safeUrl(contract.signedContractDocumentUrl),
    supplier: supplier ? { code: supplier.supplierCode, name: supplier.supplierName, taxCode: supplier.taxCode, contact: supplier.contactName || supplier.representativeName, phone: supplier.phone, email: supplier.email, address: supplier.address } : null,
    items: (contract.contractedMaterials || []).map(line => ({ ...item(line), quantity: line.contractedQty, unitPrice: line.unitPrice, vatRatePct: line.vatRatePct, composition: line.composition, colorSpec: line.colorSpec, widthCm: line.widthCm, gsm: line.gsm, shrinkageTolerancePct: line.shrinkageTolerancePct, colorFastnessGrade: line.colorFastnessGrade, qtyTolerancePct: line.qtyTolerancePct, moq: line.moq, leadTimeDays: line.leadTimeDays, packagingSpec: line.packagingSpec, technicalNote: line.technicalNote })),
    plans: plans.sort((a,b) => new Date(a.scheduledDeliveryDate) - new Date(b.scheduledDeliveryDate)).map(p => ({ id: String(p._id), code: p.planCode, status: p.status, scheduledDeliveryDate: p.scheduledDeliveryDate, notes: p.notes, items: planItems(p.expectedItems), batches: (p.batches || []).map(b => ({ number: b.batchNumber, title: b.batchTitle, percentage: b.batchPercentage, scheduledDeliveryDate: b.scheduledDeliveryDate, status: b.status, notes: b.notes, items: planItems(b.expectedItems) })) })),
    payments: payments.sort((a,b) => new Date(b.voucherDate) - new Date(a.voucherDate)).map(v => ({ id: String(v._id), code: v.voucherCode, date: v.voucherDate, category: v.category, amount: v.amount, method: v.paymentMethod, status: v.status, paidAt: v.paidAt, note: v.note, attachmentUrl: safeUrl(v.attachmentUrl) })),
    basis: 'Giá trị và số đã trả lấy từ hợp đồng; lịch sử phiếu chi hiển thị riêng, không tự cộng phiếu nháp hoặc phiếu hủy vào số đã thanh toán. Đơn vị và tên nguyên liệu ưu tiên thông tin chốt trên hợp đồng.',
  };
}
