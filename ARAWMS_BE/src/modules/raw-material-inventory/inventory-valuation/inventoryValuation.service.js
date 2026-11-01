/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-15, UC-16 - Định giá tồn hiện tại theo số lượng và giá được ghi nhận trong source hiện hành.
 */
import RawMaterial from '../../../models/RawMaterial.model.js';
import Sku from '../../../models/Sku.model.js';
import { readQuery } from '../../../common/utils/ownerReadQuery.js';
import { httpError } from '../../../common/utils/httpError.js';

export const valuationReport = async (query) => {
  const { filter, page, limit } = readQuery(query, { fields: query.type === 'skus' ? ['skuCode', 'styleName'] : ['materialCode', 'materialName'], extra: ['type'] });
  // UC-15/16: Chọn đúng model và đơn giá của nguyên liệu hoặc thành phẩm.
  const type = query.type || 'materials';
  if (!['materials', 'skus'].includes(type)) throw httpError(400, 'Loại tồn kho không hợp lệ.');
  const Model = type === 'materials' ? RawMaterial : Sku;
  // UC-15/16: Hàng ngừng kinh doanh vẫn là tài sản khi còn tồn; không loại isActive=false.
  const [items, totals, total] = await Promise.all([
    // Bảng chỉ lấy một trang, nhưng số tổng bên dưới được tính trên toàn bộ kết quả lọc.
    Model.find(filter).sort({ _id: 1 }).skip((page - 1) * limit).limit(limit),
    // GBR-13: Định giá tồn chính và hàng cách ly riêng; không trộn số lượng khác đơn vị.
    Model.aggregate([{ $match: filter }, { $group: { _id: null, onHandValue: { $sum: { $multiply: ['$onHandQty', type === 'materials' ? '$unitCost' : '$unitCogs'] } },
      quarantineValue: type === 'materials' ? { $sum: 0 } : { $sum: { $multiply: ['$defectQuarantineQty', '$unitCogs'] } } } }]), Model.countDocuments(filter),
  ]);
  // Khi chưa có dữ liệu, tổng giá trị bằng 0; vẫn giữ trạng thái bảng trống ở FE.
  const values = totals[0] || { onHandValue: 0, quarantineValue: 0 };
  // Mỗi dòng giữ rõ số tồn, giữ chỗ, cách ly và đơn giá để kiểm tra phép tính.
  return { items: items.map((item) => { const cost = type === 'materials' ? item.unitCost : item.unitCogs;
    return { id: String(item._id), code: item.materialCode || item.skuCode, name: item.materialName || item.styleName,
      unit: item.unit || 'PIECE', onHandQty: item.onHandQty, reservedQty: item.reservedQty,
      availableQty: item.onHandQty - item.reservedQty, quarantineQty: item.defectQuarantineQty || 0,
      unitCost: cost, onHandValue: item.onHandQty * cost, quarantineValue: (item.defectQuarantineQty || 0) * cost,
      totalValue: (item.onHandQty + (item.defectQuarantineQty || 0)) * cost }; }),
    totals: { onHandValue: values.onHandValue, quarantineValue: values.quarantineValue, totalValue: values.onHandValue + values.quarantineValue },
    type, total, page, limit, asOf: new Date(),
    basis: 'Định giá hiện tại = số lượng tồn × đơn giá danh mục đã ghi nhận. Hàng cách ly tính riêng; tồn giữ chỗ vẫn thuộc tài sản. Không phải bảng chốt giá FIFO theo lô hay báo cáo tại ngày quá khứ.' };
};
