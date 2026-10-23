import dotenv from 'dotenv';
import { randomBytes } from 'node:crypto';
dotenv.config();

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET phải có ít nhất 32 ký tự khi chạy production.');
}

export const ENV = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET: process.env.JWT_SECRET || randomBytes(48).toString('hex'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',

  // GHN Configuration
  GHN: {
    BASE_URL: process.env.GHN_BASE_URL || 'https://dev-online-gateway.ghn.vn/shiip/public-api',
    TOKEN: process.env.GHN_TOKEN || '',
    SHOP_ID: process.env.GHN_SHOP_ID ? Number(process.env.GHN_SHOP_ID) : 232136,
    CLIENT_ID: process.env.GHN_CLIENT_ID ? Number(process.env.GHN_CLIENT_ID) : 2542532,
  },
};

export default ENV;
