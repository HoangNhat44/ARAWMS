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

  // Facebook Messenger API Configuration
  FB: {
    APP_ID: process.env.FB_APP_ID,
    APP_SECRET: process.env.FB_APP_SECRET,
    PAGE_ACCESS_TOKEN: process.env.FB_PAGE_ACCESS_TOKEN,
    VERIFY_TOKEN: process.env.FB_VERIFY_TOKEN || 'arawms_fb_verify_token_2026',
    PAGE_ID: process.env.FB_PAGE_ID,
    PAGE_NAME: process.env.FB_PAGE_NAME || 'AraStore',

    // Cấu hình đa Fanpage (đọc động 100% từ biến môi trường .env)
    PAGES: {
      ...(process.env.FB_PAGE_ID && {
        [process.env.FB_PAGE_ID]: {
          pageId: process.env.FB_PAGE_ID,
          token: process.env.FB_PAGE_ACCESS_TOKEN,
          name: process.env.FB_PAGE_NAME || 'AraStore',
        },
      }),
      ...(process.env.FB_PAGE_LEARNMATE_ID && {
        [process.env.FB_PAGE_LEARNMATE_ID]: {
          pageId: process.env.FB_PAGE_LEARNMATE_ID,
          token: process.env.FB_PAGE_LEARNMATE_ACCESS_TOKEN,
          name: process.env.FB_PAGE_LEARNMATE_NAME || 'Learnmate',
        },
      }),
    },

    getPageToken(pageId) {
      if (pageId && this.PAGES[pageId]?.token) {
        return this.PAGES[pageId].token;
      }
      return this.PAGE_ACCESS_TOKEN;
    },

    getPageName(pageId) {
      if (pageId && this.PAGES[pageId]?.name) {
        return this.PAGES[pageId].name;
      }
      return this.PAGE_NAME || 'Facebook';
    },
  },
};

export default ENV;
