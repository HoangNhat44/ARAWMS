/*
 * File: productValuation.service.js
 * Role: ACCOUNTANT / FINANCIAL_INTELLIGENCE
 * UC: UC 10 - View Total Inventory Valuation (Xem tổng giá trị định giá tài sản tồn kho sản phẩm)
 * Description: Dịch vụ tính toán định giá tồn kho thành phẩm theo số lượng tồn kho thực tế,
 *              hàng giữ chỗ, hàng cách ly KCS, giá vốn thực tế (COGS) và giá bán lẻ dự phóng.
 */
import Sku from '../../../models/Sku.model.js';
import Product from '../../../models/Product.model.js';
import mongoose from 'mongoose';

/**
 * 1. Lấy báo cáo tổng hợp KPI định giá tồn kho thành phẩm
 */
export const getValuationSummary = async () => {
  const [skuStats, categoryStats] = await Promise.all([
    Sku.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: null,
          totalSkuCount: { $sum: 1 },
          activeSkuCount: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
          totalOnHandQty: { $sum: '$onHandQty' },
          totalReservedQty: { $sum: '$reservedQty' },
          totalQuarantineQty: { $sum: '$defectQuarantineQty' },
          totalOnHandValue: {
            $sum: { $multiply: ['$onHandQty', '$unitCogs'] },
          },
          totalQuarantineValue: {
            $sum: { $multiply: ['$defectQuarantineQty', '$unitCogs'] },
          },
          totalReservedValue: {
            $sum: { $multiply: ['$reservedQty', '$unitCogs'] },
          },
          totalRetailPotentialValue: {
            $sum: { $multiply: ['$onHandQty', '$retailPrice'] },
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
          quarantineItemCount: {
            $sum: {
              $cond: [{ $gt: ['$defectQuarantineQty', 0] }, 1, 0],
            },
          },
        },
      },
    ]),

    // Phân tích giá trị tồn kho theo danh mục sản phẩm
    Sku.aggregate([
      { $match: { isDeleted: false } },
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ['$product.category', 'OTHER'] },
          skuCount: { $sum: 1 },
          totalQty: { $sum: '$onHandQty' },
          totalValue: {
            $sum: {
              $multiply: [
                { $add: ['$onHandQty', '$defectQuarantineQty'] },
                '$unitCogs',
              ],
            },
          },
          retailValue: {
            $sum: { $multiply: ['$onHandQty', '$retailPrice'] },
          },
        },
      },
      { $sort: { totalValue: -1 } },
    ]),
  ]);

  const stats = skuStats[0] || {
    totalSkuCount: 0,
    activeSkuCount: 0,
    totalOnHandQty: 0,
    totalReservedQty: 0,
    totalQuarantineQty: 0,
    totalOnHandValue: 0,
    totalQuarantineValue: 0,
    totalReservedValue: 0,
    totalRetailPotentialValue: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    quarantineItemCount: 0,
  };

  const totalAssetValue = stats.totalOnHandValue + stats.totalQuarantineValue;
  const totalAvailableQty = Math.max(0, stats.totalOnHandQty - stats.totalReservedQty);
  const estimatedGrossProfit = Math.max(0, stats.totalRetailPotentialValue - stats.totalOnHandValue);
  const overallMarginPercent =
    stats.totalRetailPotentialValue > 0
      ? ((estimatedGrossProfit / stats.totalRetailPotentialValue) * 100).toFixed(1)
      : '0.0';

  // Tính tỷ trọng % cho từng danh mục
  const categoriesWithShare = (categoryStats || []).map((cat) => ({
    category: cat._id,
    skuCount: cat.skuCount,
    totalQty: cat.totalQty,
    totalValue: cat.totalValue,
    retailValue: cat.retailValue,
    valueSharePercent:
      totalAssetValue > 0 ? ((cat.totalValue / totalAssetValue) * 100).toFixed(1) : '0.0',
  }));

  return {
    asOf: new Date(),
    summary: {
      totalAssetValue,
      totalOnHandValue: stats.totalOnHandValue,
      totalQuarantineValue: stats.totalQuarantineValue,
      totalReservedValue: stats.totalReservedValue,
      totalRetailPotentialValue: stats.totalRetailPotentialValue,
      estimatedGrossProfit,
      overallMarginPercent: Number(overallMarginPercent),
      totalOnHandQty: stats.totalOnHandQty,
      totalAvailableQty,
      totalReservedQty: stats.totalReservedQty,
      totalQuarantineQty: stats.totalQuarantineQty,
      totalSkuCount: stats.totalSkuCount,
      activeSkuCount: stats.activeSkuCount,
      lowStockCount: stats.lowStockCount,
      outOfStockCount: stats.outOfStockCount,
      quarantineItemCount: stats.quarantineItemCount,
    },
    categoryBreakdown: categoriesWithShare,
    valuationBasis:
      'Định giá tồn kho thành phẩm = (Số lượng tồn thực tế + Hàng cách ly) × Giá vốn đơn vị (COGS). Hàng giữ chỗ vẫn thuộc quyền sở hữu tài sản của kho cho tới khi xuất kho giao vận.',
  };
};

/**
 * 2. Lấy danh sách định giá chi tiết từng phân loại SKU (kèm phân trang, lọc, sắp xếp)
 */
export const getValuationList = async (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;

  const matchFilter = { isDeleted: false };

  // 1. Lọc theo trạng thái tồn kho (stockStatus)
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
  } else if (query.stockStatus === 'QUARANTINE') {
    matchFilter.defectQuarantineQty = { $gt: 0 };
  }

  // 2. Lọc theo Size
  if (query.size && query.size !== 'ALL') {
    matchFilter.size = query.size;
  }

  // Pipeline tìm kiếm & liên kết Product
  const pipeline = [
    { $match: matchFilter },
    {
      $lookup: {
        from: 'products',
        localField: 'productId',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
  ];

  // 3. Lọc theo Category
  if (query.category && query.category !== 'ALL') {
    pipeline.push({
      $match: { 'product.category': query.category },
    });
  }

  // 4. Tìm kiếm từ khóa (Search: skuCode, styleName, skuBarcode, productName)
  if (query.search && query.search.trim()) {
    const s = query.search.trim();
    const regex = new RegExp(s, 'i');
    pipeline.push({
      $match: {
        $or: [
          { skuCode: regex },
          { styleName: regex },
          { skuBarcode: regex },
          { 'product.productName': regex },
          { color: regex },
        ],
      },
    });
  }

  // Đếm tổng số bản ghi thỏa mãn điều kiện
  const countPipeline = [...pipeline, { $count: 'total' }];
  const countResult = await Sku.aggregate(countPipeline);
  const totalItems = countResult[0]?.total || 0;

  // 5. Thêm các trường tính toán (Computed Valuation Fields)
  pipeline.push({
    $addFields: {
      availableQty: {
        $max: [0, { $subtract: ['$onHandQty', '$reservedQty'] }],
      },
      onHandValue: {
        $multiply: ['$onHandQty', '$unitCogs'],
      },
      quarantineValue: {
        $multiply: ['$defectQuarantineQty', '$unitCogs'],
      },
      totalAssetValue: {
        $multiply: [
          { $add: ['$onHandQty', '$defectQuarantineQty'] },
          '$unitCogs',
        ],
      },
      retailPotentialValue: {
        $multiply: ['$onHandQty', '$retailPrice'],
      },
      grossProfitPotential: {
        $max: [
          0,
          {
            $subtract: [
              { $multiply: ['$onHandQty', '$retailPrice'] },
              { $multiply: ['$onHandQty', '$unitCogs'] },
            ],
          },
        ],
      },
    },
  });

  // 6. Sắp xếp (Sorting)
  let sortStage = { totalAssetValue: -1 };
  if (query.sortBy === 'TOTAL_VALUE_ASC') sortStage = { totalAssetValue: 1 };
  else if (query.sortBy === 'ON_HAND_DESC') sortStage = { onHandQty: -1 };
  else if (query.sortBy === 'ON_HAND_ASC') sortStage = { onHandQty: 1 };
  else if (query.sortBy === 'COGS_DESC') sortStage = { unitCogs: -1 };
  else if (query.sortBy === 'COGS_ASC') sortStage = { unitCogs: 1 };
  else if (query.sortBy === 'NAME_ASC') sortStage = { styleName: 1 };

  pipeline.push({ $sort: sortStage });
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: limit });

  // 7. Chiếu dữ liệu đầu ra chuẩn hóa
  pipeline.push({
    $project: {
      _id: 1,
      skuCode: 1,
      skuBarcode: 1,
      styleName: 1,
      color: 1,
      size: 1,
      retailPrice: 1,
      unitCogs: 1,
      onHandQty: 1,
      reservedQty: 1,
      defectQuarantineQty: 1,
      availableQty: 1,
      safetyStockThreshold: 1,
      fifoAgingThresholdDays: 1,
      isActive: 1,
      onHandValue: 1,
      quarantineValue: 1,
      totalAssetValue: 1,
      retailPotentialValue: 1,
      grossProfitPotential: 1,
      marginPercent: {
        $cond: [
          { $gt: ['$retailPrice', 0] },
          {
            $round: [
              {
                $multiply: [
                  {
                    $divide: [
                      { $subtract: ['$retailPrice', '$unitCogs'] },
                      '$retailPrice',
                    ],
                  },
                  100,
                ],
              },
              1,
            ],
          },
          0,
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
      product: {
        _id: '$product._id',
        productCode: '$product.productCode',
        productName: '$product.productName',
        category: '$product.category',
        thumbnailUrl: '$product.thumbnailUrl',
      },
    },
  });

  const items = await Sku.aggregate(pipeline);

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
 * 3. Lấy danh sách các danh mục sản phẩm (Categories) phục vụ bộ lọc
 */
export const getProductCategories = async () => {
  const categories = await Product.distinct('category', { isDeleted: false });
  return categories.filter(Boolean);
};

