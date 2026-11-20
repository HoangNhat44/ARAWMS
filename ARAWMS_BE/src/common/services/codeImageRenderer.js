/*
 * File: codeImageRenderer.js
 * Author: Duy Anh
 * Date: 2026-11-18
 * Description: Renders QR and Code 128 label images on demand from codes stored in MongoDB; no image is persisted.
 */
import bwipjs from 'bwip-js';

const svgDataUrl = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;

/** Renders a Code 128 label whose visible text matches the stored barcode. Returns null for unencodable text. */
export const code128DataUrl = (text) => {
  if (!text) return null;
  try {
    return svgDataUrl(bwipjs.toSVG({ bcid: 'code128', text: String(text), height: 16, includetext: true,
      textxalign: 'center', paddingwidth: 12, paddingheight: 10, backgroundcolor: 'FFFFFF' }));
  } catch {
    return null;
  }
};

/** Renders a QR image for a value such as an order QR token. */
export const qrDataUrl = (text) => svgDataUrl(bwipjs.toSVG({ bcid: 'qrcode', text: String(text),
  padding: 12, backgroundcolor: 'FFFFFF' }));
