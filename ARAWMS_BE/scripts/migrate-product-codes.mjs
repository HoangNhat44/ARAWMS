/*
 * File: migrate-product-codes.mjs
 * Author: Duy Anh
 * Date: 2026-11-14
 * Description: One-off migration of existing catalog data to the product/SKU code rules
 *              (KE_HOACH_MA_SAN_PHAM.md, giai đoạn 6):
 *                - productCode: user code, ^[A-Z0-9]{2,20}$ (SP-YYYY-NNNNN -> its sampleCode, "AT-001" -> "AT001")
 *                - sampleCode is removed: productCode is the only product code field from now on
 *                - old Excel per-color products (AL186-KEM, AL186-DEN) are merged into one product AL186
 *                - skuCode: PRODUCTCODE-COLORCODE-SIZE
 *                - codeLockedAt set for ACTIVE products; PRODUCT-* counters removed
 *              Sales orders keep their skuCode snapshots; SKU barcodes are kept so printed labels still scan.
 *
 * Usage:   node scripts/migrate-product-codes.mjs            (dry-run: prints the plan, writes nothing)
 *          node scripts/migrate-product-codes.mjs --apply    (writes everything in one transaction)
 * Back up the database before --apply.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { buildSkuCode, isValidProductCode, normalizeColorKey, toColorCode } from '../src/common/utils/productCode.js';

const APPLY = process.argv.includes('--apply');
const uri = process.argv.find((arg) => arg.startsWith('--uri='))?.slice(6) || process.env.MONGODB_URI;
if (!uri) throw new Error('Thiếu MONGODB_URI');

const SP_CODE = /^SP-\d{4}-\d+$/;
const id = (value) => String(value);
/** Code text -> A-Z0-9 only (drops diacritics, dashes, underscores, spaces). */
const toCode = (value) => toColorCode(value);

/**
 * Decides which new product code a product should end up with.
 * Old Excel imports stored one product per color ("AL186-KEM"): when the last dash part is the
 * color of every SKU, that part is dropped so the colors merge under "AL186".
 */
const targetCodeOf = (product, skus) => {
  const source = SP_CODE.test(product.productCode) ? (product.sampleCode || '') : product.productCode;
  if (!source) return { code: '', reason: 'Mã SP-… nhưng không có mã mẫu (sampleCode) để lấy làm mã mới' };
  const parts = String(source).split('-');
  const colorCodes = new Set(skus.map((sku) => toColorCode(sku.color)));
  const perColor = parts.length > 1 && colorCodes.size === 1 && colorCodes.has(toColorCode(parts.at(-1)));
  const code = toCode((perColor ? parts.slice(0, -1) : parts).join(''));
  if (!isValidProductCode(code)) return { code: '', reason: `Không suy ra được mã hợp lệ từ "${source}"` };
  return { code, merged: perColor };
};

const main = async () => {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection;
  const products = await db.collection('products').find({ isDeleted: { $ne: true } }).toArray();
  const allSkus = await db.collection('skus').find({}).toArray();
  const skusByProduct = new Map();
  for (const sku of allSkus) {
    const key = id(sku.productId);
    if (!skusByProduct.has(key)) skusByProduct.set(key, []);
    skusByProduct.get(key).push(sku);
  }
  const issues = [];

  // 6.1 Possible leftovers of the removed marketplace auto-provision (fake stock 100, COGS = 50% price).
  const autoProvision = [];
  for (const product of products.filter((item) => item.category === 'Thời Trang Thiết Kế')) {
    for (const sku of skusByProduct.get(id(product._id)) || []) {
      if (sku.unitCogs === Math.round((sku.retailPrice || 0) * 0.5)) {
        const moves = await db.collection('inventory_transactions').countDocuments({ skuId: sku._id });
        autoProvision.push({ productCode: product.productCode, skuCode: sku.skuCode, onHandQty: sku.onHandQty,
          reservedQty: sku.reservedQty, inventoryTransactions: moves });
      }
    }
  }

  // 6.2 / 6.3 Target code per product, then group products sharing a target (merge).
  const groups = new Map();
  for (const product of products) {
    const skus = skusByProduct.get(id(product._id)) || [];
    const { code, reason, merged } = targetCodeOf(product, skus);
    if (!code) { issues.push(`${product.productCode}: ${reason}`); continue; }
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push({ product, skus, merged });
  }

  const productPlans = [];
  const skuPlans = [];
  const plannedSkuCodes = new Map();
  for (const [code, members] of groups) {
    // Primary = ACTIVE first, then oldest; others are merged into it.
    members.sort((a, b) => Number(b.product.isActive) - Number(a.product.isActive) ||
      new Date(a.product.createdAt || 0) - new Date(b.product.createdAt || 0) || id(a.product._id).localeCompare(id(b.product._id)));
    const primary = members[0].product;
    const variantKeys = new Map();
    let groupOk = true;
    const groupSkuPlans = [];
    for (const { product, skus } of members) {
      for (const sku of skus) {
        const colorCode = toColorCode(sku.color);
        if (!colorCode) { issues.push(`${sku.skuCode}: màu "${sku.color}" không tạo được mã`); groupOk = false; continue; }
        const key = `${normalizeColorKey(sku.color)}:${sku.size}`;
        if (variantKeys.has(key)) {
          issues.push(`${code}: ${sku.skuCode} và ${variantKeys.get(key)} trùng màu/size khi gộp`); groupOk = false; continue;
        }
        variantKeys.set(key, sku.skuCode);
        const newCode = buildSkuCode(code, sku.color, sku.size);
        groupSkuPlans.push({ sku, from: sku.skuCode, to: newCode, fromProduct: id(product._id), toProduct: id(primary._id),
          variantKey: `${primary._id}:${key}` });
      }
    }
    if (!groupOk) { issues.push(`${code}: bỏ qua cả nhóm (${members.map((m) => m.product.productCode).join(', ')})`); continue; }
    // A target already used by a product outside this group cannot be taken.
    const foreign = products.find((item) => item.productCode === code && !members.some((m) => id(m.product._id) === id(item._id)));
    if (foreign) { issues.push(`${code}: đã có sản phẩm khác mang mã này`); continue; }
    for (const plan of groupSkuPlans) {
      if (plannedSkuCodes.has(plan.to)) { issues.push(`${plan.to}: trùng mã SKU sau khi chuyển`); groupOk = false; }
      plannedSkuCodes.set(plan.to, plan.from);
    }
    if (!groupOk) continue;
    productPlans.push({ code, primary, merged: members.slice(1).map((m) => m.product) });
    skuPlans.push(...groupSkuPlans);
  }
  // New SKU codes must not collide with SKUs that are not being renamed (e.g. soft-deleted ones).
  const renamed = new Set(skuPlans.map((plan) => id(plan.sku._id)));
  for (const sku of allSkus) {
    if (!renamed.has(id(sku._id)) && plannedSkuCodes.has(sku.skuCode)) issues.push(`${sku.skuCode}: mã đã bị một SKU khác giữ`);
  }

  // Report
  // productCode is the only code field: any remaining sampleCode is removed once its value has been used.
  const productChanges = productPlans.filter((plan) => plan.code !== plan.primary.productCode || plan.merged.length ||
    (plan.primary.isActive && !plan.primary.codeLockedAt) || plan.primary.sampleCode != null);
  // Products the script cannot resolve keep sampleCode: it may be the only record of their real code.
  const keepSampleCode = products.filter((item) => item.sampleCode != null &&
    !productPlans.some((plan) => id(plan.primary._id) === id(item._id) || plan.merged.some((old) => id(old._id) === id(item._id))));
  const deletedWithSampleCode = await db.collection('products').countDocuments({ isDeleted: true, sampleCode: { $exists: true } });
  const skuChanges = skuPlans.filter((plan) => plan.from !== plan.to || plan.fromProduct !== plan.toProduct);
  const counters = await db.collection('counter_sequences').countDocuments({ sequenceKey: /^PRODUCT-/ });
  console.log(`\n=== ${APPLY ? 'APPLY' : 'DRY-RUN'} — ${products.length} sản phẩm, ${allSkus.length} SKU ===`);
  console.log(`\n[6.1] SKU nghi do auto-provision cũ tạo (chỉ liệt kê, không sửa): ${autoProvision.length}`);
  autoProvision.forEach((item) => console.log(`  ${item.skuCode} (SP ${item.productCode}) tồn ${item.onHandQty}, giữ ${item.reservedQty}, giao dịch kho ${item.inventoryTransactions}`));
  console.log(`\n[6.2/6.3] Sản phẩm thay đổi: ${productChanges.length}`);
  for (const plan of productChanges) {
    const merged = plan.merged.length ? ` + gộp ${plan.merged.map((item) => item.productCode).join(', ')}` : '';
    console.log(`  ${plan.primary.productCode} -> ${plan.code}${merged}`);
  }
  console.log(`\n[6.4] SKU đổi mã: ${skuChanges.length}`);
  skuChanges.forEach((plan) => console.log(`  ${plan.from} -> ${plan.to}${plan.fromProduct !== plan.toProduct ? ' (chuyển sang SP chính)' : ''}`));
  console.log(`\n[6.6] Bộ đếm PRODUCT-* sẽ xóa: ${counters}`);
  console.log(`\n[sampleCode] Xóa trường sampleCode ở ${productChanges.length + productPlans.reduce((n, p) => n + p.merged.length, 0)} sản phẩm.` +
    ` Còn giữ: ${keepSampleCode.length} sản phẩm chưa xử lý được, ${deletedWithSampleCode} sản phẩm đã xóa mềm` +
    ' (phải xử lý hết trước khi gỡ trường khỏi model).');
  console.log(`\nCần xử lý tay (${issues.length}):`);
  issues.forEach((item) => console.log(`  - ${item}`));
  if (!APPLY) { console.log('\nDry-run: chưa ghi gì. Chạy lại với --apply để ghi.'); return; }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const products$ = db.collection('products');
      const skus$ = db.collection('skus');
      const now = new Date();
      // Two-phase rename so swapped codes never hit the unique indexes mid-way.
      for (const plan of skuChanges) {
        await skus$.updateOne({ _id: plan.sku._id }, { $set: { skuCode: `__MIG__${plan.sku._id}` } }, { session });
      }
      for (const plan of productChanges) {
        await products$.updateOne({ _id: plan.primary._id }, { $set: { productCode: `__MIG__${plan.primary._id}` },
          $unset: { sampleCode: '' } }, { session });
      }
      for (const plan of productChanges) {
        await products$.updateOne({ _id: plan.primary._id }, { $set: { productCode: plan.code,
          ...(plan.primary.isActive && !plan.primary.codeLockedAt ? { codeLockedAt: now } : {}) },
        $unset: { sampleCode: '' }, $inc: { version: 1 } }, { session });
        for (const old of plan.merged) {
          // Merged products are soft-deleted; their productCode stays reserved for traceability.
          await products$.updateOne({ _id: old._id }, { $set: { isDeleted: true, isActive: false, deletedAt: now,
            mergedIntoProductId: plan.primary._id }, $unset: { sampleCode: '' }, $inc: { version: 1 } }, { session });
          await db.collection('finished_goods_bulk_documents').updateMany({ 'items.productId': old._id },
            { $set: { 'items.$[item].productId': plan.primary._id } }, { arrayFilters: [{ 'item.productId': old._id }], session });
        }
      }
      for (const plan of skuPlans) {
        await skus$.updateOne({ _id: plan.sku._id }, { $set: { skuCode: plan.to, styleName: plan.to.split('-')[0],
          productId: new mongoose.Types.ObjectId(plan.toProduct), variantKey: plan.variantKey }, $inc: { version: 1 } }, { session });
      }
      await db.collection('counter_sequences').deleteMany({ sequenceKey: /^PRODUCT-/ }, { session });
    });
    console.log('\nĐã ghi xong.');
  } finally { await session.endSession(); }
};

try { await main(); } finally { await mongoose.disconnect(); }
