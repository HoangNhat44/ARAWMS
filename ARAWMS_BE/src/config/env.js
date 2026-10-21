import dotenv from 'dotenv';
dotenv.config();

export const ENV = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET: process.env.JWT_SECRET || 'arawms_jwt_secret_key_2026',
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
