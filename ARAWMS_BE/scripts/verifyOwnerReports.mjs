import 'dotenv/config';
import dns from 'node:dns';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { bestSellersReport, bestSellerRows } from '../src/modules/managerial-financial-analytics/operations-report/bestSellers.service.js';
import { pagination } from '../src/common/utils/ownerValidation.js';
import { contractDetail } from '../src/modules/supplier-contracts/contract-workspace/contractWorkspace.service.js';
import { operationsReport, period, salesSummary } from '../src/modules/managerial-financial-analytics/operations-report/operationsReport.service.js';
import { trendReport } from '../src/modules/managerial-financial-analytics/operations-report/annualReport.service.js';
import { listStocktakes, stocktakeDetail } from '../src/modules/inventory-auditing/stock-adjustment/stockAdjustment.service.js';
import catalogRouter from '../src/modules/master-data/product-catalog/productCatalog.routes.js';
dns.setServers(['1.1.1.1']);
const catalogHandler = catalogRouter.stack.find((layer) => layer.route?.path === '/').route.stack[0].handle;
const catalog = (query) => new Promise((resolve, reject) => catalogHandler({ query }, { json: resolve }, reject));
try {
 await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS:10000 });
 const query={from:'2026-01-01',to:'2026-11-06',compareFrom:'2025-01-01',compareTo:'2025-11-06',scope:'all'};
 const report=await operationsReport(query);
 // Tổng giá trị đơn hàng bao gồm cả đơn chưa đóng gói trong tập kỳ, nhưng loại đơn hủy.
 const orderScope={isDeleted:{$ne:true},status:{$ne:'CANCELLED'},$or:[{'warehouseFulfillment.packedAt':period(query.from,query.to)},{'warehouseFulfillment.packedAt':null,createdAt:period(query.from,query.to)}]};
 const orderTotals=await mongoose.connection.collection('sales_orders').aggregate([{$match:orderScope},{$group:{_id:null,value:{$sum:'$financialSummary.totalOrderAmount'},missing:{$sum:{$cond:[{$isNumber:'$financialSummary.totalOrderAmount'},0,1]}}}}]).toArray();
 assert.equal(orderTotals[0]?.missing||0,0);assert.equal(report.sales.orderValue,orderTotals[0]?.value||0);
 assert.equal(report.sales.channels.reduce((total,row)=>total+row.orderValue,0),report.sales.orderValue);
 const sampleTotals=salesSummary([{status:'PACKED',warehouseFulfillment:{packedAt:new Date()},financialSummary:{itemsSubtotal:100,discountAmount:10,totalOrderAmount:120}},{status:'PENDING',financialSummary:{totalOrderAmount:35}},{status:'CANCELLED',financialSummary:{totalOrderAmount:999}}],[]);
 assert.equal(sampleTotals.orderValue,155);assert.equal(sampleTotals.revenue,90);

 assert.equal(pagination({}).limit,15);assert.throws(()=>pagination({limit:'0'}));
 const firstProducts=(await catalog({page:'1',limit:'15'})).data;assert.equal(firstProducts.items.length,Math.min(15,firstProducts.total));
 const ranking=await bestSellersReport(query);
 const packedFilter={isDeleted:{$ne:true},status:{$ne:'CANCELLED'},'warehouseFulfillment.packedAt':period(query.from,query.to)};
 const rawSales=await mongoose.connection.collection('sales_orders').aggregate([{$match:packedFilter},{$unwind:'$items'},{$group:{_id:'$items.skuId',quantity:{$sum:'$items.orderedQty'},grossAmount:{$sum:{$multiply:['$items.orderedQty','$items.unitSalePrice']}},orderIds:{$addToSet:'$_id'}}}]).toArray();
 assert.equal(ranking.skus.reduce((n,r)=>n+r.quantity,0),rawSales.reduce((n,r)=>n+r.quantity,0));
 assert.equal(ranking.products.reduce((n,r)=>n+r.quantity,0),rawSales.reduce((n,r)=>n+r.quantity,0));
 for(const source of rawSales){const row=ranking.skus.find(r=>r.id===String(source._id));assert.ok(row);assert.equal(row.quantity,source.quantity);assert.equal(row.grossAmount,source.grossAmount);assert.equal(row.orders,source.orderIds.length);}
 const sample=bestSellerRows([{_id:'o1',items:[{skuId:'s1',orderedQty:2,unitSalePrice:100},{skuId:'s2',orderedQty:3,unitSalePrice:200}]},{_id:'o2',items:[{skuId:'s1',orderedQty:1,unitSalePrice:100}]}],[{_id:'p1',productCode:'P1',productName:'Product'}],[{_id:'s1',productId:'p1',skuCode:'S1'},{_id:'s2',productId:'p1',skuCode:'S2'}]);
 assert.equal(sample.products[0].quantity,6);assert.equal(sample.products[0].orders,2);assert.equal(sample.products[0].grossAmount,900);
 const noPrice=bestSellerRows([{_id:'o1',items:[{skuId:'missing',skuCode:'OLD',orderedQty:2}]}],[],[]);assert.equal(noPrice.products[0].quantity,2);assert.equal(noPrice.products[0].grossAmount,null);assert.equal(noPrice.missingProductLinks,1);
 const channel='FACEBOOK';const filtered=await bestSellersReport({...query,salesChannel:channel,paymentStatus:'PAID'});
 const filteredTotal=await mongoose.connection.collection('sales_orders').aggregate([{$match:{...packedFilter,salesChannel:channel,paymentStatus:'PAID'}},{$unwind:'$items'},{$group:{_id:null,quantity:{$sum:'$items.orderedQty'}}}]).toArray();assert.equal(filtered.skus.reduce((n,r)=>n+r.quantity,0),filteredTotal[0]?.quantity||0);
 await assert.rejects(bestSellersReport({...query,salesChannel:'INVALID'}));

 const rawContracts=await mongoose.connection.collection('supplier_contracts').find({isDeleted:{$ne:true}}).toArray();
 let contractPlans=0, contractPayments=0;
 for(const original of rawContracts){
   const detail=await contractDetail(String(original._id));
   assert.equal(detail.id,String(original._id));assert.equal(detail.total,original.totalContractAmount);assert.equal(detail.paid,original.totalPaidAmount ?? 0);
   assert.equal(detail.items.length,(original.contractedMaterials || []).length);
   assert.deepEqual(detail.commercialTerms,original.commercialTerms || {});assert.deepEqual(detail.qualityStandards,original.qualityStandards || {});
   const expectedPlans=await mongoose.connection.collection('material_inbound_plans').countDocuments({contractId:original._id,isDeleted:{$ne:true}});
   assert.equal(detail.plans.length,expectedPlans);contractPlans+=detail.plans.length;contractPayments+=detail.payments.length;assert.equal(detail.payments.length,await mongoose.connection.collection('cash_flow_vouchers').countDocuments({contractId:original._id,flowType:'CASH_OUT',isDeleted:{$ne:true}}));
   for(let i=0;i<detail.items.length;i++){const stored=original.contractedMaterials[i];assert.equal(detail.items[i].quantity,stored.contractedQty);assert.equal(detail.items[i].unitPrice,stored.unitPrice);if(stored.materialCodeSnapshot)assert.equal(detail.items[i].code,stored.materialCodeSnapshot);}
 }
 await assert.rejects(contractDetail('invalid'),e=>e.statusCode===400);
 await assert.rejects(contractDetail('000000000000000000000000'),e=>e.statusCode===404);

 const active={isDeleted:{$ne:true}};
 const count=(name)=>mongoose.connection.collection(name).countDocuments(active);
 assert.equal(report.debts.length,await count('supplier_contracts'));
 assert.equal(new Set(report.purchases.map((p)=>p.planId)).size,await count('material_inbound_plans'));
 assert.equal(report.inventory.filter((p)=>p.type==='FINISHED_GOODS').length,await count('skus'));
 assert.equal(report.inventory.filter((p)=>p.type==='RAW_MATERIAL').length,await count('raw_materials'));
 const listed=[];let total=Infinity;let variants=0;
 for(let page=1;listed.length<total;page++) {const {data}=await catalog({page:String(page),limit:'15'});total=data.total;assert.ok(data.items.length<=15);assert.ok(data.items.length>0);listed.push(...data.items.map((p)=>p.id));variants+=data.items.reduce((n,p)=>n+p.variants.length,0);}
 assert.equal(listed.length,new Set(listed).size);assert.equal(listed.length,await count('products'));assert.equal(variants,await count('skus'));
 await assert.rejects(catalog({limit:'0'}));
 const stocktakes=await listStocktakes({});assert.equal(stocktakes.total,await count('stocktake_sessions'));
 for (const session of stocktakes.items) { const detail=await stocktakeDetail(String(session._id)); assert.equal(String(detail.stocktake._id), String(session._id)); }
 const warehouse=await listStocktakes({warehouseType:'RAW_MATERIAL'});assert.ok(warehouse.items.every((p)=>p.warehouseType==='RAW_MATERIAL'));
 await assert.rejects(listStocktakes({warehouseType:'INVALID'}));
 const sourceRange=period(query.from,query.to);
 const gross=await mongoose.connection.collection('sales_orders').aggregate([{$match:{isDeleted:{$ne:true},status:{$ne:'CANCELLED'},'warehouseFulfillment.packedAt':{$ne:null},$or:[{'warehouseFulfillment.packedAt':sourceRange},{'warehouseFulfillment.packedAt':null,createdAt:sourceRange}]}},{$group:{_id:null,value:{$sum:{$subtract:[{$ifNull:['$financialSummary.itemsSubtotal',0]},{$ifNull:['$financialSummary.discountAmount',0]}]}}}}]).toArray();
 const refund=await mongoose.connection.collection('return_requests').aggregate([{$match:{isDeleted:{$ne:true},status:{$in:['ACCOUNTANT_APPROVED','COMPLETED']},$or:[{'financialAccounting.approvedAt':sourceRange},{'financialAccounting.approvedAt':null,createdAt:sourceRange}]}},{$group:{_id:null,value:{$sum:{$ifNull:['$financialAccounting.returnedMerchandiseValue',0]}}}}]).toArray();
 assert.equal(report.sales.revenue,(gross[0]?.value||0)-(refund[0]?.value||0));
 const trend=await trendReport(query);assert.equal(trend.months.length,11);assert.equal(trend.months.reduce((n,m)=>n+m.orderValue,0),report.sales.orderValue);assert.ok(Math.abs(trend.months.reduce((n,m)=>n+m.revenue,0)-report.sales.revenue)<0.01);
 const daily=await trendReport({...query,from:'2026-11-01',to:'2026-11-06',bucket:'day'});assert.equal(daily.points.length,6);assert.deepEqual(daily.points.map(r=>r.key),['2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06']);
 const dailyTotal=await operationsReport({...query,from:'2026-11-01',to:'2026-11-06'});for(const metric of ['revenue','orderValue','orders','paid','unpaid','returns','shipping'])assert.ok(Math.abs(daily.points.reduce((n,p)=>n+p[metric],0)-dailyTotal.sales[metric])<0.01);
 await assert.rejects(trendReport({...query,bucket:'invalid'}));
 const partial={...query,from:'2026-10-15',to:'2026-11-02'};const partialTrend=await trendReport(partial);const partialReport=await operationsReport(partial);assert.equal(partialTrend.months.length,2);assert.ok(Math.abs(partialTrend.months.reduce((n,m)=>n+m.revenue,0)-partialReport.sales.revenue)<0.01);
 const cross=await trendReport({...query,from:'2025-12-15',to:'2026-01-15'});assert.deepEqual(cross.months.map((r)=>r.label),['12/2025','01/2026']);
 assert.throws(()=>period('2026-02-30','2026-03-01'));assert.throws(()=>period('2026-02-02','2026-02-01'));
 console.log(JSON.stringify({passed:true,bestSellerProducts:ranking.products.filter(r=>r.quantity>0).length,bestSellerSkus:ranking.skus.filter(r=>r.quantity>0).length,tablePageSize:15,contractDetailsChecked:rawContracts.length,contractPlans,contractPayments,contracts:report.debts.length,inboundPlans:new Set(report.purchases.map((p)=>p.planId)).size,products:total,variants,stocktakes:stocktakes.total,checks:['order totals independently aggregated from totalOrderAmount','cancelled order exclusion and pending order inclusion','channel/month/day order totals reconcile','15-row server pagination','best-seller totals independently aggregated in MongoDB','product grouping and unique order counts','historical missing-price handling','best-seller filters','contract detail fields and related records','contract ID validation','daily comparison totals','independent MongoDB revenue aggregation','complete lists','unique server pagination','warehouse filters','invalid filters','partial-month trend totals','cross-year trend','date validation']}));
} finally {await mongoose.disconnect();}
