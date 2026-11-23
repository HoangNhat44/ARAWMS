/*
 * File: shippingLabelData.js
 * Author: Duy Anh
 * Date: 2026-11-22
 * Description: Shared shipping values used both when creating the GHN waybill and when printing the order label,
 * so the printed label never disagrees with what the carrier actually collects.
 */
import { ENV } from '../../config/env.js';

/** GHN delivery instruction sent with every waybill created by ARAWMS. */
export const DEFAULT_GHN_REQUIRED_NOTE = 'KHONGCHOXEMHANG';

const GHN_REQUIRED_NOTE_LABELS = {
  CHOTHUHANG: 'Cho thử hàng',
  CHOXEMHANGKHONGTHU: 'Cho xem hàng, không cho thử',
  KHONGCHOXEMHANG: 'Không cho xem hàng',
};

/** Human-readable delivery instruction printed on the label. */
export const requiredNoteLabel = (code = DEFAULT_GHN_REQUIRED_NOTE) => GHN_REQUIRED_NOTE_LABELS[code] || code;

/** Sender printed on the label and used as the GHN pickup/return contact. */
export const shippingSender = () => ({
  name: ENV.GHN.SENDER.NAME,
  phone: ENV.GHN.SENDER.PHONE,
  address: ENV.GHN.SENDER.ADDRESS,
});

/**
 * Amount the carrier collects from the recipient: goods after discount, never the customer shipping fee,
 * and nothing for bank-transfer orders. This is the cod_amount sent to GHN.
 */
export const carrierCodAmount = (order) => {
  if (order?.paymentMethod === 'BANK_TRANSFER') return 0;
  const financial = order?.financialSummary || {};
  return Math.max(0, Number(financial.itemsSubtotal || 0) - Number(financial.discountAmount || 0));
};
