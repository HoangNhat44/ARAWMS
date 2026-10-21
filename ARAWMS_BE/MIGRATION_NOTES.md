# Migration to Module-Based Architecture

## Ngày migration: 2026-10-21

### Tổng quan
Dự án đã được tổ chức lại từ cấu trúc phẳng (flat structure) sang kiến trúc module-based theo domain nghiệp vụ.

## Cấu trúc mới

```
src/
├── common/
│   ├── constants/        # Enums và constants chung
│   ├── middlewares/      # Authentication, error handling
│   ├── services/         # Shared services (orderAccess, productUnit, demo)
│   └── utils/            # Response handlers và utilities
├── config/               # Database và env configuration
├── models/               # Tất cả mongoose models
│   ├── *.model.js        # Models chuẩn với suffix .model.js
│   └── *.js              # Custom models (packing-related)
├── modules/              # Business domain modules
│   ├── order-fulfillment/
│   │   ├── order-qr-management/
│   │   │   ├── orderQrManagement.controller.js
│   │   │   ├── orderQrManagement.service.js
│   │   │   ├── orderQrManagement.routes.js
│   │   │   ├── orderQrManagement.validation.js
│   │   │   └── orderQrManagement.test.js
│   │   └── packing-verification/
│   │       ├── packingVerification.controller.js
│   │       ├── packingVerification.service.js
│   │       ├── packingVerification.routes.js
│   │       ├── packingVerification.validation.js
│   │       ├── packingVideo.service.js
│   │       ├── packingIndexes.js
│   │       └── *.test.js
│   └── [other domains]/
└── routes/
    └── index.js          # Central route mounting
```

## Thay đổi chính

### 1. Module Order Fulfillment
**Trước:**
- `src/controllers/orderQrController.js`
- `src/controllers/packingController.js`
- `src/services/orderQrService.js`
- `src/services/packingService.js`
- `src/routes/orderQrRoutes.js`

**Sau:**
- `src/modules/order-fulfillment/order-qr-management/`
- `src/modules/order-fulfillment/packing-verification/`

### 2. Common Services
Các services được share giữa nhiều modules đã được di chuyển vào `src/common/services/`:
- `orderAccessService.js` - Authorization logic
- `demoOrderService.js` - Demo order data
- `productUnitService.js` - Product unit lookup

### 3. Models
Các models từ main branch sử dụng suffix `.model.js`:
- `SalesOrder.model.js`
- `User.model.js`
- `Sku.model.js`

Custom models (packing-related) giữ nguyên naming:
- `OrderQrToken.js`
- `PackingSession.js`
- `PackingVideo.js`
- `ProductUnit.js`
- `ProductUnitAllocation.js`

### 4. Routes
Routes được mount tập trung trong `src/routes/index.js`:
```javascript
router.use('/order-qr', orderQrRoutes);
router.use('/packing', packingRoutes);
```

## API Endpoints sau migration

### Order QR Management
- `GET /api/order-qr/orders` - List orders
- `POST /api/order-qr/orders/qr/bulk` - Issue QR bulk
- `GET /api/order-qr/orders/lookup` - Lookup order
- `GET /api/order-qr/orders/:id/qr` - Get order QR
- `POST /api/order-qr/qr/resolve` - Resolve QR
- `POST /api/order-qr/orders/:id/qr/replace` - Replace QR
- `POST /api/order-qr/orders/:id/confirm` - Confirm order

### Packing Verification
- `POST /api/packing/prepare` - Prepare packing session
- `GET /api/packing/sessions/:id` - Get session
- `POST /api/packing/sessions/:id/heartbeat` - Heartbeat
- `POST /api/packing/sessions/:id/release` - Release session
- `POST /api/packing/sessions/:id/scan` - Scan product
- `POST /api/packing/sessions/:id/video` - Upload video
- `POST /api/packing/sessions/:id/video/:recordingId/sync` - Sync video
- `GET /api/packing/sessions/:id/video` - Stream video
- `POST /api/packing/product-units/register` - Register product unit

## Breaking Changes

### Import Paths
Tất cả imports cần được cập nhật:

**Trước:**
```javascript
import { sendSuccess } from '../utils/responseHandler.js';
import SalesOrder from '../models/SalesOrder.js';
```

**Sau:**
```javascript
import { sendSuccess } from '../../../common/utils/responseHandler.js';
import SalesOrder from '../../../models/SalesOrder.model.js';
```

### Middleware
**Trước:**
```javascript
import { authenticateJWT } from '../middlewares/authMiddleware.js';
```

**Sau:**
```javascript
import { authenticate } from '../../../common/middlewares/authenticate.js';
```

## Testing

Sau migration, cần test:
1. ✅ Order QR generation và resolution
2. ✅ Packing session workflow
3. ✅ Video upload và streaming
4. ✅ Product unit scanning
5. ⚠️ Integration với các modules khác từ main branch

## TODO

- [ ] Review và update validation schemas
- [ ] Integrate với authentication module từ main
- [ ] Update environment variables nếu cần
- [ ] Review error handling consistency
- [ ] Add integration tests
- [ ] Update API documentation

## Notes

- Các custom models (OrderQrToken, PackingSession, etc.) vẫn giữ nguyên schema và hoạt động bình thường
- Video upload feature (Cloudinary) vẫn hoạt động như cũ
- Demo order functionality được preserved
- Tất cả tests đã được di chuyển cùng với các modules
