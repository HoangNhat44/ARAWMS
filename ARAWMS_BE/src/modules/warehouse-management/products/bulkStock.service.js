/*
 * File: bulkStock.service.js
 * Author: Duy Anh (Refactored)
 * Date: 2026-10-24
 * Description: Business logic for bulk finished goods inbound/outbound operations.
 */
import { sequelize } from '../../../config/db.js';
import { 
  StockDocument, 
  StockMovement, 
  StockBalance, 
  Sku, 
  ProductionOrder,
  SalesOrder,
  User 
} from '../../../models/index.js';

/**
 * Get available warehouse locations by type
 */
export const getAvailableLocations = async (warehouseType = 'TP') => {
  // Query distinct locations from StockBalance where warehouse_type matches
  const locations = await StockBalance.findAll({
    attributes: [
      [sequelize.fn('DISTINCT', sequelize.col('bin_location')), 'bin_location']
    ],
    where: {
      warehouse_type: warehouseType,
      bin_location: { [sequelize.Op.ne]: null }
    },
    raw: true
  });
  
  return locations.map(l => l.bin_location).sort();
};

/**
 * Get inbound document by ID with related data
 */
export const getInboundDocument = async (docId) => {
  const document = await StockDocument.findOne({
    where: { 
      document_id: docId,
      document_type: 'INBOUND_FG'
    },
    include: [
      {
        model: ProductionOrder,
        as: 'productionOrder',
        attributes: ['production_order_id', 'production_order_number', 'status']
      },
      {
        model: User,
        as: 'createdByUser',
        attributes: ['user_id', 'username', 'full_name']
      }
    ]
  });
  
  return document;
};

/**
 * Get outbound document by ID with related data
 */
export const getOutboundDocument = async (docId) => {
  const document = await StockDocument.findOne({
    where: { 
      document_id: docId,
      document_type: 'OUTBOUND_FG'
    },
    include: [
      {
        model: SalesOrder,
        as: 'salesOrder',
        attributes: ['sales_order_id', 'order_number', 'customer_name', 'status']
      },
      {
        model: User,
        as: 'createdByUser',
        attributes: ['user_id', 'username', 'full_name']
      }
    ]
  });
  
  return document;
};

/**
 * Format document response for API
 */
export const formatReceiptResponse = (document) => {
  return {
    success: true,
    data: {
      document_id: document.document_id,
      document_number: document.document_number,
      document_type: document.document_type,
      status: document.status,
      reference_id: document.reference_id,
      reference_type: document.reference_type,
      total_quantity: document.total_quantity,
      notes: document.notes,
      created_at: document.created_at,
      created_by: document.createdByUser ? {
        user_id: document.createdByUser.user_id,
        username: document.createdByUser.username,
        full_name: document.createdByUser.full_name
      } : null,
      related_order: document.productionOrder || document.salesOrder || null
    }
  };
};

/**
 * Confirm inbound receipt - create stock movements and update balances
 */
export const confirmInboundReceipt = async (payload, user) => {
  const { document_id, items, bin_location, notes } = payload;

  // Validate required fields
  if (!document_id || !items || !Array.isArray(items) || items.length === 0) {
    const error = new Error('Thiếu thông tin phiếu nhập hoặc danh sách sản phẩm');
    error.code = 'VALIDATION_ERROR';
    error.status = 400;
    throw error;
  }

  if (!bin_location) {
    const error = new Error('Vui lòng chọn vị trí kho');
    error.code = 'MISSING_LOCATION';
    error.status = 400;
    throw error;
  }

  const transaction = await sequelize.transaction();

  try {
    // Check document exists and is pending
    const document = await StockDocument.findOne({
      where: { document_id, document_type: 'INBOUND_FG' },
      transaction
    });

    if (!document) {
      throw new Error('Không tìm thấy phiếu nhập kho');
    }

    if (document.status !== 'PENDING') {
      const error = new Error('Phiếu nhập đã được xử lý trước đó');
      error.code = 'ALREADY_PROCESSED';
      error.status = 409;
      throw error;
    }

    // Process each item
    const movements = [];
    for (const item of items) {
      const { sku_id, quantity, lot_number } = item;

      if (!sku_id || !quantity || quantity <= 0) {
        throw new Error('Thông tin sản phẩm không hợp lệ');
      }

      // Verify SKU exists
      const sku = await Sku.findByPk(sku_id, { transaction });
      if (!sku) {
        throw new Error(`Không tìm thấy SKU: ${sku_id}`);
      }

      // Create stock movement
      const movement = await StockMovement.create({
        sku_id,
        document_id,
        movement_type: 'INBOUND',
        quantity,
        warehouse_type: 'TP', // Finished goods
        bin_location,
        lot_number: lot_number || null,
        unit_cost: item.unit_cost || 0,
        notes: item.notes || notes,
        created_by: user.user_id
      }, { transaction });

      movements.push(movement);

      // Update stock balance
      const [balance] = await StockBalance.findOrCreate({
        where: {
          sku_id,
          warehouse_type: 'TP',
          bin_location
        },
        defaults: {
          quantity_on_hand: 0,
          quantity_allocated: 0,
          quantity_available: 0
        },
        transaction
      });

      await balance.increment({
        quantity_on_hand: quantity,
        quantity_available: quantity
      }, { transaction });
    }

    // Update document status
    await document.update({
      status: 'COMPLETED',
      completed_at: new Date(),
      completed_by: user.user_id,
      notes: notes || document.notes
    }, { transaction });

    await transaction.commit();

    return {
      document_id: document.document_id,
      document_number: document.document_number,
      status: 'COMPLETED',
      movements_created: movements.length,
      message: 'Nhập kho thành phẩm thành công'
    };

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Confirm outbound receipt - create stock movements and update balances
 */
export const confirmOutboundReceipt = async (payload, user) => {
  const { document_id, items, notes } = payload;

  // Validate required fields
  if (!document_id || !items || !Array.isArray(items) || items.length === 0) {
    const error = new Error('Thiếu thông tin phiếu xuất hoặc danh sách sản phẩm');
    error.code = 'VALIDATION_ERROR';
    error.status = 400;
    throw error;
  }

  const transaction = await sequelize.transaction();

  try {
    // Check document exists and is pending
    const document = await StockDocument.findOne({
      where: { document_id, document_type: 'OUTBOUND_FG' },
      transaction
    });

    if (!document) {
      throw new Error('Không tìm thấy phiếu xuất kho');
    }

    if (document.status !== 'PENDING') {
      const error = new Error('Phiếu xuất đã được xử lý trước đó');
      error.code = 'ALREADY_PROCESSED';
      error.status = 409;
      throw error;
    }

    // Process each item
    const movements = [];
    for (const item of items) {
      const { sku_id, quantity, bin_location } = item;

      if (!sku_id || !quantity || quantity <= 0) {
        throw new Error('Thông tin sản phẩm không hợp lệ');
      }

      if (!bin_location) {
        throw new Error('Vui lòng chỉ định vị trí xuất kho');
      }

      // Check stock availability
      const balance = await StockBalance.findOne({
        where: {
          sku_id,
          warehouse_type: 'TP',
          bin_location
        },
        transaction
      });

      if (!balance || balance.quantity_available < quantity) {
        const error = new Error(`Không đủ tồn kho tại vị trí ${bin_location}`);
        error.code = 'INSUFFICIENT_STOCK';
        error.status = 400;
        throw error;
      }

      // Create stock movement
      const movement = await StockMovement.create({
        sku_id,
        document_id,
        movement_type: 'OUTBOUND',
        quantity: -quantity, // Negative for outbound
        warehouse_type: 'TP',
        bin_location,
        unit_cost: item.unit_cost || 0,
        notes: item.notes || notes,
        created_by: user.user_id
      }, { transaction });

      movements.push(movement);

      // Update stock balance
      await balance.decrement({
        quantity_on_hand: quantity,
        quantity_available: quantity
      }, { transaction });
    }

    // Update document status
    await document.update({
      status: 'COMPLETED',
      completed_at: new Date(),
      completed_by: user.user_id,
      notes: notes || document.notes
    }, { transaction });

    await transaction.commit();

    return {
      document_id: document.document_id,
      document_number: document.document_number,
      status: 'COMPLETED',
      movements_created: movements.length,
      message: 'Xuất kho thành phẩm thành công'
    };

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};
