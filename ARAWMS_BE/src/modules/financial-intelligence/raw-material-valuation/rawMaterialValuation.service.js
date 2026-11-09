/*
 * File: rawMaterialValuation.service.js
 * Role: ACCOUNTANT / FINANCIAL_INTELLIGENCE
 * UC: UC 11 - View Total Raw Material Inventory Value (Xem tổng giá trị định giá nguyên vật liệu thô tồn kho)
 * Description: Dịch vụ tính toán định giá kho nguyên phụ liệu (vải cuộn, phụ liệu, cúc, chỉ, khóa...)
 *              theo số lượng tồn kho thực tế, số lượng đã giữ chỗ lệnh may, số lượng chờ putaway,
 *              đơn giá vốn thực tế (unitCost) và cơ cấu tỷ trọng tài sản theo nhóm vải/phụ liệu.
 */

import RawMaterial from '../../../models/RawMaterial.model.js';
import Supplier from '../../../models/Supplier.model.js';
import mongoose from 'mongoose';

/**
 * 1. Lấy báo cáo tổng hợp KPI định giá tồn kho nguyên phụ liệu
 */
export const getRawMaterialValuationSummary = async () => {
  const [materialStats, typeStats, categoryStats] = await Promise.all([
    // Tổng hợp toàn kho
    RawMaterial.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: null,
          totalMaterialCount: { $sum: 1 },
          activeMaterialCount: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
          totalOnHandQty: { $sum: '$onHandQty' },
          totalPendingPutawayQty: { $sum: { $ifNull: ['$pendingPutawayQty', 0] } },
          totalReservedQty: { $sum: { $ifNull: ['$reservedQty', 0] } },
          totalOnHandValue: {
            $sum: { $multiply: ['$onHandQty', '$unitCost'] },
          },
          totalPendingValue: {
            $sum: { $multiply: [{ $ifNull: ['$pendingPutawayQty', 0] }, '$unitCost'] },
          },
          totalReservedValue: {
            $sum: { $multiply: [{ $ifNull: ['$reservedQty', 0] }, '$unitCost'] },
          },
          fabricCount: {
            $sum: { $cond: [{ $eq: ['$materialType', 'FABRIC'] }, 1, 0] },
          },
          auxiliaryCount: {
            $sum: { $cond: [{ $eq: ['$materialType', 'AUXILIARY'] }, 1, 0] },
          },
          lowStockCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ['$onHandQty', 0] },
                    { $lte: ['$onHandQty', '$safetyStockThreshold'] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          outOfStockCount: {
            $sum: {
              $cond: [{ $eq: ['$onHandQty', 0] }, 1, 0],
            },
          },
        },
      },
    ]),

    // Phân tích theo Loại nguyên phụ liệu: FABRIC (Vải cuộn) vs AUXILIARY (Phụ liệu)
    RawMaterial.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: '$materialType',
          count: { $sum: 1 },
          totalQty: { $sum: '$onHandQty' },
          totalValue: {
            $sum: {
              $multiply: [
                { $add: ['$onHandQty', { $ifNull: ['$pendingPutawayQty', 0] }] },
                '$unitCost',
              ],
            },
          },
        },
      },
      { $sort: { totalValue: -1 } },
    ]),

    // Phân tích theo Danh mục chi tiết (FABRIC_ROLL, BUTTON, THREAD, ZIPPER, NEEDLE...)
    RawMaterial.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalQty: { $sum: '$onHandQty' },
          totalValue: {
            $sum: {
              $multiply: [
                { $add: ['$onHandQty', { $ifNull: ['$pendingPutawayQty', 0] }] },
                '$unitCost',
              ],
            },
          },
        },
      },
      { $sort: { totalValue: -1 } },
    ]),
  ]);

  const stats = materialStats[0] || {
    totalMaterialCount: 0,
    activeMaterialCount: 0,
    totalOnHandQty: 0,
    totalPendingPutawayQty: 0,
    totalReservedQty: 0,
    totalOnHandValue: 0,
    totalPendingValue: 0,
    totalReservedValue: 0,
    fabricCount: 0,
    auxiliaryCount: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
  };

  const totalAssetValue = stats.totalOnHandValue + stats.totalPendingValue;
  const totalAvailableQty = Math.max(0, stats.totalOnHandQty - stats.totalReservedQty);
  const totalAvailableValue = Math.max(0, stats.totalOnHandValue - stats.totalReservedValue);

  // Phân tích tỷ trọng loại NVL
  const typeBreakdown = (typeStats || []).map((t) => ({
    materialType: t._id,
    count: t.count,
    totalQty: t.totalQty,
    totalValue: t.totalValue,
    valueSharePercent:
      totalAssetValue > 0 ? ((t.totalValue / totalAssetValue) * 100).toFixed(1) : '0.0',
  }));

  // Phân tích tỷ trọng danh mục NVL
  const categoryBreakdown = (categoryStats || []).map((c) => ({
    category: c._id,
    count: c.count,
    totalQty: c.totalQty,
    totalValue: c.totalValue,
    valueSharePercent:
      totalAssetValue > 0 ? ((c.totalValue / totalAssetValue) * 100).toFixed(1) : '0.0',
  }));

  return {
    asOf: new Date(),
    summary: {
      totalAssetValue,
      totalOnHandValue: stats.totalOnHandValue,
      totalPendingValue: stats.totalPendingValue,
      totalReservedValue: stats.totalReservedValue,
      totalAvailableValue,
      totalOnHandQty: stats.totalOnHandQty,
      totalAvailableQty,
      totalReservedQty: stats.totalReservedQty,
      totalPendingPutawayQty: stats.totalPendingPutawayQty,
      totalMaterialCount: stats.totalMaterialCount,
      activeMaterialCount: stats.activeMaterialCount,
      fabricCount: stats.fabricCount,
      auxiliaryCount: stats.auxiliaryCount,
      lowStockCount: stats.lowStockCount,
      outOfStockCount: stats.outOfStockCount,
    },
    typeBreakdown,
    categoryBreakdown,
    valuationBasis:
      'Định giá tồn kho nguyên phụ liệu = (Số lượng tồn trên kệ + Hàng đang chờ cất vào kệ sau KCS) × Đơn giá mua thực tế (unitCost). Hàng đã giữ chỗ cho lệnh xuất may gia công vẫn thuộc quyền sở hữu tài sản cho tới khi phiếu xuất kho (Stock-Out) hoàn tất.',
  };
};

/**
 * 2. Lấy danh sách định giá chi tiết từng mã nguyên phụ liệu (kèm lọc, phân trang, sắp xếp)
 */
export const getRawMaterialValuationList = async (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;

  const matchFilter = { isDeleted: false };

  // 1. Lọc theo Loại NVL (materialType: FABRIC | AUXILIARY)
  if (query.materialType && query.materialType !== 'ALL') {
    matchFilter.materialType = query.materialType;
  }

  // 2. Lọc theo Danh mục (category)
  if (query.category && query.category !== 'ALL') {
    matchFilter.category = query.category;
  }

  // 3. Lọc theo Tình trạng tồn kho (stockStatus)
  if (query.stockStatus === 'IN_STOCK') {
    matchFilter.onHandQty = { $gt: 0 };
  } else if (query.stockStatus === 'OUT_OF_STOCK') {
    matchFilter.onHandQty = 0;
  } else if (query.stockStatus === 'LOW_STOCK') {
    matchFilter.$expr = {
      $and: [
        { $gt: ['$onHandQty', 0] },
        { $lte: ['$onHandQty', '$safetyStockThreshold'] },
      ],
    };
  }

  // 4. Lọc theo Nhà cung cấp
  if (query.supplierId && mongoose.Types.ObjectId.isValid(query.supplierId)) {
    matchFilter.supplierId = new mongoose.Types.ObjectId(query.supplierId);
  }

  // 5. Tìm kiếm từ khóa (materialCode, materialName, color)
  if (query.search && query.search.trim()) {
    const s = query.search.trim();
    const regex = new RegExp(s, 'i');
    matchFilter.$or = [
      { materialCode: regex },
      { materialName: regex },
      { color: regex },
    ];
  }

  // Pipeline kết hợp tính toán và liên kết Supplier
  const pipeline = [
    { $match: matchFilter },
    {
      $lookup: {
        from: 'suppliers',
        localField: 'supplierId',
        foreignField: '_id',
        as: 'supplier',
      },
    },
    { $unwind: { path: '$supplier', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        pendingPutaway: { $ifNull: ['$pendingPutawayQty', 0] },
        reserved: { $ifNull: ['$reservedQty', 0] },
        availableQty: {
          $max: [
            0,
            {
              $subtract: [
                '$onHandQty',
                { $add: [{ $ifNull: ['$reservedQty', 0] }, { $ifNull: ['$pendingPutawayQty', 0] }] },
              ],
            },
          ],
        },
        onHandValue: {
          $multiply: ['$onHandQty', '$unitCost'],
        },
        pendingValue: {
          $multiply: [{ $ifNull: ['$pendingPutawayQty', 0] }, '$unitCost'],
        },
        reservedValue: {
          $multiply: [{ $ifNull: ['$reservedQty', 0] }, '$unitCost'],
        },
        totalAssetValue: {
          $multiply: [
            { $add: ['$onHandQty', { $ifNull: ['$pendingPutawayQty', 0] }] },
            '$unitCost',
          ],
        },
        stockStatus: {
          $cond: [
            { $eq: ['$onHandQty', 0] },
            'OUT_OF_STOCK',
            {
              $cond: [
                { $lte: ['$onHandQty', '$safetyStockThreshold'] },
                'LOW_STOCK',
                'NORMAL',
              ],
            },
          ],
        },
      },
    },
  ];

  // Đếm tổng số bản ghi
  const countPipeline = [...pipeline, { $count: 'total' }];
  const countResult = await RawMaterial.aggregate(countPipeline);
  const totalItems = countResult[0]?.total || 0;

  // Sắp xếp
  let sortStage = { totalAssetValue: -1 };
  if (query.sortBy === 'TOTAL_VALUE_ASC') sortStage = { totalAssetValue: 1 };
  else if (query.sortBy === 'ON_HAND_DESC') sortStage = { onHandQty: -1 };
  else if (query.sortBy === 'ON_HAND_ASC') sortStage = { onHandQty: 1 };
  else if (query.sortBy === 'COST_DESC') sortStage = { unitCost: -1 };
  else if (query.sortBy === 'COST_ASC') sortStage = { unitCost: 1 };
  else if (query.sortBy === 'NAME_ASC') sortStage = { materialName: 1 };

  pipeline.push({ $sort: sortStage });
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: limit });

  // Chiếu trường hiển thị
  pipeline.push({
    $project: {
      _id: 1,
      materialCode: 1,
      materialName: 1,
      materialType: 1,
      category: 1,
      unit: 1,
      color: 1,
      gsm: 1,
      widthCm: 1,
      unitCost: 1,
      onHandQty: 1,
      pendingPutawayQty: 1,
      reservedQty: 1,
      availableQty: 1,
      safetyStockThreshold: 1,
      fifoAgingThresholdDays: 1,
      isActive: 1,
      onHandValue: 1,
      pendingValue: 1,
      reservedValue: 1,
      totalAssetValue: 1,
      stockStatus: 1,
      supplier: {
        _id: '$supplier._id',
        supplierCode: '$supplier.supplierCode',
        supplierName: '$supplier.supplierName',
      },
    },
  });

  const items = await RawMaterial.aggregate(pipeline);

  return {
    items,
    pagination: {
      total: totalItems,
      page,
      limit,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

/**
 * 3. Lấy danh mục và danh sách NCC phục vụ bộ lọc
 */
export const getFilterMetadata = async () => {
  const [categories, suppliers] = await Promise.all([
    RawMaterial.distinct('category', { isDeleted: false }),
    Supplier.find({ isActive: true }).select('supplierName supplierCode').lean(),
  ]);

  return {
    categories: categories.filter(Boolean),
    suppliers: suppliers || [],
  };
};

