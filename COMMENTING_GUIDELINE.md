# AraWMS Source Code Commenting Guideline
> **Tiêu chuẩn Comment mã nguồn dự án AraWMS**  
> *Được kế thừa từ Java Coding Convention (Sun/Oracle), chuẩn hóa cho kiến trúc Fullstack (Node.js/Express, React, MongoDB) và đóng vai trò tài liệu chỉ thị cho AI Assistant & Developer.*

---

## 1. Mục đích & Phạm vi áp dụng

### 1.1. Mục đích
- **Đồng bộ hóa chất lượng mã nguồn**: Đảm bảo toàn bộ mã nguồn của dự án AraWMS (Front-end & Back-end) có phong cách chú thích nhất quán, dễ đọc, dễ bảo trì và dễ chuyển giao.
- **Quản lý thông tin tệp (Metadata Tracking)**: 100% tệp mã nguồn phải thể hiện rõ thông tin quản trị gồm **Title, Author, Date, Description**.
- **Đảm bảo truy vết Nghiệp vụ (Business Rule Traceability)**: Kết nối trực tiếp giữa mã nguồn và tài liệu [BR.md](./BR.md) thông qua cú pháp mã định danh `[BR: GBR-xx]`.
- **Chỉ dẫn cho AI Assistant**: Quy chuẩn này được thiết kế để các mô hình AI (Antigravity, Claude, ChatGPT, GitHub Copilot) đọc, hiểu và tự động tuân thủ nghiêm ngặt trong mọi phiên sinh mã hoặc refactor.

### 1.2. Nền tảng tiêu chuẩn
Quy chuẩn này kế thừa nguyên lý cốt lõi từ **Java Code Conventions (Mục 5: Comments)** do Sun Microsystems / Oracle ban hành:
1. **Beginning Comments (Header Comment)**: Nằm ở đầu mỗi tệp, cung cấp metadata quản lý tệp và bản quyền.
2. **Documentation Comments (Doc Comments / JSDoc / Javadoc)**: Định dạng `/** ... */`, đặc tả giao tiếp (API interface, tham số, kiểu dữ liệu trả về, ngoại lệ).
3. **Implementation Comments (Chú thích thực thi)**: Định dạng `/* ... */` hoặc `// ...`, giải thích logic nội bộ, thuật toán, quyết định rẽ nhánh và kích hoạt quy tắc nghiệp vụ.

---

## 2. Thống nhất 3 loại Comment chuẩn trong dự án

```
+-----------------------------------------------------------------------------------+
|  1. BEGINNING COMMENT (File Header)                                              |
|  - Vị trí: Dòng đầu tiên của tệp (trước import/package).                         |
|  - Cú pháp: Block comment /** ... */                                              |
|  - Nội dung: Title, Author, Date, Description, Module, Tags.                      |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|  2. DOCUMENTATION COMMENT (Doc Comments / JSDoc)                                  |
|  - Vị trí: Trước Route, Controller handler, Service method, Component, Hook.     |
|  - Cú pháp: Javadoc/JSDoc format /** ... */                                      |
|  - Nội dung: Mục đích hàm, @param, @returns, @throws, @businessRule.              |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|  3. IMPLEMENTATION COMMENT (Internal Code Notes)                                  |
|  - Vị trí: Bên trong thân hàm, luồng xử lý.                                      |
|  - Cú pháp: Single-line (//) hoặc Block (/* ... */)                               |
|  - Nội dung: Các bước Step-by-step, công thức Computation, [BR: GBR-xx].         |
+-----------------------------------------------------------------------------------+
```

---

### 2.1. Beginning Comment (File Header Comment)
Mọi file mã nguồn (`.js`, `.jsx`, `.ts`, `.tsx`, `.java`) **bắt buộc** phải có khối Beginning Comment ở dòng 1 của tệp.

#### Quy định Phân công Tác giả (Author Assignment):
> **QUY TẮC ĐẶC THÙ CHO PHÂN HỆ SELLER:**  
> Toàn bộ các tệp mã nguồn thuộc chức năng liên quan đến **Actor Seller** (bao gồm 15 Use Cases từ `UC-69` đến `UC-83`, thuộc các module: `conversational-commerce`, `order-fulfillment/order-management`, `reverse-logistics/return-merchandise-authorization`, `reverse-logistics/customer-exchange-processing`, và các trang Front-end Seller tương ứng) **BẮT BUỘC** phải đặt tác giả là:  
> `@author : Nguyễn Quang Huy`

#### Cấu trúc mẫu chuẩn cho Chức năng Seller (Mandatory Template for Seller Features):
```javascript
/**
 * ============================================================================
 * @title        : Order Management Service
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Cung cấp logic nghiệp vụ cho Quản lý Đơn hàng bán lẻ trực tiếp (UC-78..UC-81),
 *                 xác nhận giữ chỗ tồn kho (Stock Reservation), giải phóng giữ chỗ khi hủy đơn
 *                 và kiểm tra tồn khả dụng theo quy định của Seller.
 * @module       : Order Fulfillment / Order Management
 * @layer        : Service
 * ============================================================================
 */
```

#### Các trường thông tin bắt buộc:
| Trường | Mô tả | Định dạng / Ví dụ |
|---|---|---|
| `@title` | Tên định danh chuẩn của file / module | Tên ngắn gọn (Ví dụ: `Sales Order Controller`, `LoginPage Component`) |
| `@author` | Tác giả hoặc nhóm chịu trách nhiệm | Tên kỹ sư hoặc `AraWMS Team` |
| `@createdDate` | Ngày khởi tạo file | Định dạng chuẩn `YYYY-MM-DD` |
| `@lastModified`| Ngày chỉnh sửa gần nhất | Định dạng chuẩn `YYYY-MM-DD` |
| `@description` | Mô tả súc tích phạm vi, vai trò và nghiệp vụ của file | Tối thiểu 2 câu mô tả rõ ngữ cảnh nghiệp vụ |
| `@module` | Module chức năng thuộc hệ thống AraWMS | Phù hợp với cây thư mục `src/modules/...` |
| `@layer` | Tầng kiến trúc của file | `Front-end`, `Controller`, `Service`, `Route`, `Validation`, `Model`, `Middleware` |

---

### 2.2. Documentation Comment (Doc Comments)
Được đặt ngay trước khai báo Class, Hàm, Phương thức, Component hoặc Route. Doc comment dùng để giải thích **Hàm này làm gì (What it does)** thay vì đi sâu vào thuật toán bên trong.

#### Quy tắc thẻ (Tags):
- `@param {type} name` - Mô tả tham số đầu vào.
- `@returns {type}` - Mô tả dữ liệu trả về.
- `@throws {ErrorType}` - Các ngoại lệ hàm có thể ném ra.
- `@route {METHOD} /path` - Dành riêng cho tầng Route/Controller.
- `@businessRule {GBR-ID}` - Mã quy tắc nghiệp vụ liên quan (tham chiếu `BR.md`).
- `@see {Reference}` - Liên kết tài liệu hoặc hàm liên quan.

#### Ví dụ chuẩn Service Method:
```javascript
/**
 * Xác nhận đơn hàng và kích hoạt giữ chỗ tồn kho (Stock Reservation).
 * Chuyển trạng thái đơn sang CONFIRMED_RESERVED và cộng tăng reservedQty cho từng SKU.
 *
 * @async
 * @function confirmOrderReserve
 * @param {string} orderId - ID định danh MongoDB của đơn hàng cần xác nhận.
 * @param {Object} actor - Thông tin người dùng thực hiện (từ req.user).
 * @param {Object} [req] - Đối tượng Express Request dùng để trích xuất IP/User-Agent khi ghi log.
 * @returns {Promise<Object>} Document SalesOrder sau khi cập nhật thành công.
 * @throws {Error} Nếu đơn hàng không tồn tại hoặc không ở trạng thái PENDING.
 * @throws {Error} Nếu tồn kho khả dụng không đủ đáp ứng số lượng đặt.
 * @businessRule GBR-10 Khi đơn hàng tạo/xác nhận thành công, tự động chuyển tồn kho khả dụng sang giữ chỗ.
 * @businessRule GBR-23 Ghi vết kiểm toán SystemLog cho thao tác thay đổi tồn kho & đơn hàng.
 */
```

---

### 2.3. Implementation Comment (Chú thích thực thi)
Dùng để giải thích **Tại sao làm như vậy (Why)** và **Các bước tiến hành (How)**.

#### 4 hình thức Implementation Comment chuẩn:
1. **Block Comment (`/* ... */`)**: Dùng cho khối giải thích thuật toán, công thức toán học (`Computation`), hoặc đoạn logic phức tạp nhiều dòng.
   ```javascript
   /*
    * [BR: GBR-06] Công thức tính nhu cầu vải thô cho lệnh sản xuất:
    * Demand = Unit Quota * Product Quantity * (1 + Allowable Scrap Rate)
    * Trong đó:
    * - Unit Quota: Định mức kỹ thuật tiêu hao trên 1 sản phẩm từ BOM đã duyệt.
    * - Allowable Scrap Rate: Tỷ lệ hao hụt cho phép (ví dụ 0.05 ứng với 5%).
    */
   const calculatedDemand = unitQuota * targetQuantity * (1 + scrapRate);
   ```

2. **Single-Line Comment (`// ...`)**: Dùng để phân tách các bước xử lý (Step-by-step) hoặc giải thích một điều kiện rẽ nhánh quan trọng.
   ```javascript
   // 1. [BR: GBR-01] Chặn đăng nhập nếu tài khoản người dùng đã bị vô hiệu hóa
   if (user.status !== 'ACTIVE' || user.isDeactivated) {
     throw new Error('Tài khoản đã bị khóa hoặc ngừng hoạt động. Vui lòng liên hệ Admin.');
   }
   ```

3. **Trailing / End-of-line Comment (`code; // note`)**: Dùng khi chú thích ngắn gọn một dòng mã đặc thù hoặc hằng số.
   ```javascript
   const LOCK_DURATION_MS = 30 * 60 * 1000; // [BR: GBR-02] Khóa tài khoản 30 phút
   ```

4. **Action Tag Markers**:
   - `// TODO: [Mô tả việc cần làm trong tương lai]`
   - `// FIXME: [Mô tả lỗi tạm thời hoặc điểm cần khắc phục]`
   - `// NOTE: [Lưu ý quan trọng về hiệu năng hoặc giả định nghiệp vụ]`
   - `// WARN: [Cảnh báo rủi ro xung đột hoặc race condition]`

---

## 3. Quy chuẩn Comment theo Kiến trúc 5 tầng của dự án

Hệ thống AraWMS được tổ chức theo mô hình phân tầng chặt chẽ. Mỗi tầng có mục đích riêng và phong cách comment chuyên biệt:

```
+--------------------------------------------------------------------+
|  1. FRONT-END LAYER (React/Vite - Pages, Components, Hooks)        |
+--------------------------------------------------------------------+
                                 | HTTP Request
                                 v
+--------------------------------------------------------------------+
|  2. ROUTE LAYER (Express Router, Endpoints, Middlewares)           |
+--------------------------------------------------------------------+
                                 | Dispatches to
                                 v
+--------------------------------------------------------------------+
|  3. VALIDATION LAYER (Request Schema & Input Rules)                |
+--------------------------------------------------------------------+
                                 | Validated Req
                                 v
+--------------------------------------------------------------------+
|  4. CONTROLLER LAYER (Req/Res Adapter, Status Codes)               |
+--------------------------------------------------------------------+
                                 | Calls
                                 v
+--------------------------------------------------------------------+
|  5. SERVICE LAYER (Core Business Logic, DB Queries, Transactions)  |
+--------------------------------------------------------------------+
```

---

### 3.1. Tầng Front-end (React JSX / Components / Hooks)
- **Tập trung vào**: Giao diện người dùng, ràng buộc trải nghiệm (UX constraints), sự kiện người dùng (event handlers), trạng thái (state), và phản hồi từ API.
- **Quy tắc bắt buộc**:
  - Có Beginning Comment đầy đủ thông tin quản lý.
  - Component có JSDoc mô tả mục đích và `props`.
  - Sự kiện submit/click có comment giải thích tương tác.
  - Vị trí kích hoạt hoặc chặn giao diện theo Business Rule phải gắn tag `// [BR: GBR-xx]`.

#### Ví dụ mẫu Front-end (`OrderDetailPage.jsx`):
```jsx
/**
 * ============================================================================
 * @title        : Order Detail Page Component
 * @author       : AraWMS Front-end Team
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Màn hình chi tiết đơn hàng, hiển thị thông tin sản phẩm,
 *                 trạng thái giao vận, tồn kho giữ chỗ và các hành động xử lý.
 * @module       : Order Fulfillment / Order Management
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState } from 'react';
import PropTypes from 'prop-types';

/**
 * Component hiển thị chi tiết đơn hàng và các nút tác vụ nghiệp vụ.
 *
 * @component
 * @param {Object} props - Thuộc tính truyền vào component.
 * @param {Object} props.order - Dữ liệu chi tiết đơn hàng từ API.
 * @param {Function} props.onOrderUpdated - Callback kích hoạt khi trạng thái đơn thay đổi.
 * @returns {JSX.Element} Giao diện chi tiết đơn hàng.
 */
export const OrderDetailPage = ({ order, onOrderUpdated }) => {
  const [loading, setLoading] = useState(false);

  /**
   * Xử lý hủy đơn hàng và giải phóng tồn kho giữ chỗ.
   * Kích hoạt xác nhận trước khi gửi request tới API.
   */
  const handleCancelOrder = async () => {
    // 1. Xác nhận ý định người dùng
    const confirm = window.confirm('Bạn có chắc chắn muốn hủy đơn hàng này?');
    if (!confirm) return;

    try {
      setLoading(true);
      // 2. [BR: GBR-11] Gọi API hủy đơn - BE sẽ tự động giải phóng tồn kho giữ chỗ
      await orderService.cancelOrder(order._id, { reason: 'Khách hàng đổi ý' });
      alert('Đã hủy đơn hàng và hoàn lại tồn khả dụng thành công!');
      onOrderUpdated();
    } catch (err) {
      alert(`Lỗi hủy đơn: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // [BR: GBR-12] Chỉ đơn ở trạng thái PENDING hoặc CONFIRMED mới cho phép tạo phiếu nhặt hàng (Pick-list)
  const isPickable = ['PENDING', 'CONFIRMED_RESERVED'].includes(order.status);

  return (
    <div className="order-detail-container">
      <h2>Chi tiết đơn hàng: {order.orderCode}</h2>
      
      {/* Nút in Pick-list kiểm soát theo trạng thái */}
      <button disabled={!isPickable} className="btn-picklist">
        {isPickable ? 'In phiếu nhặt hàng' : 'Không thể nhặt hàng (Trạng thái không hợp lệ)'}
      </button>

      {/* Nút hủy đơn hàng */}
      <button onClick={handleCancelOrder} disabled={loading || order.status === 'CANCELLED'}>
        Hủy đơn hàng
      </button>
    </div>
  );
};

OrderDetailPage.propTypes = {
  order: PropTypes.object.isRequired,
  onOrderUpdated: PropTypes.func.isRequired,
};

export default OrderDetailPage;
```

---

### 3.2. Tầng Route (Express Router)
- **Tập trung vào**: Điểm tiếp nhận API (Endpoint), phương thức HTTP (GET/POST/PUT/PATCH/DELETE), phân quyền vai trò (Role-based Authorization), gắn kết middleware xác thực và validation.
- **Quy tắc bắt buộc**:
  - Có Beginning Comment đầy đủ.
  - Mỗi Route phải có Doc comment ghi rõ: HTTP Method, URL Endpoint, Quyền hạn truy cập (`@access`), và mã BR điều phối (`@see BR: GBR-xx`).

#### Ví dụ mẫu Route (`orderManagement.routes.js`):
```javascript
/**
 * ============================================================================
 * @title        : Order Management Routes
 * @author       : AraWMS Core Engineering Team
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Khai báo định tuyến và middleware kiểm soát truy cập cho
 *                 toàn bộ các API liên quan đến Quản lý Đơn hàng (FT-10).
 * @module       : Order Fulfillment / Order Management
 * @layer        : Route
 * ============================================================================
 */

import express from 'express';
import {
  createDirectOrder,
  confirmOrderReserve,
  cancelOrder,
  getOrderList,
} from './orderManagement.controller.js';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import { validateCreateOrder, validateCancelOrder } from './orderManagement.validation.js';

const router = express.Router();

// Yêu cầu xác thực JWT cho toàn bộ endpoints bên dưới
router.use(authenticate);

/**
 * @route   POST /api/orders
 * @desc    Tạo đơn hàng bán lẻ trực tiếp từ kênh Messenger/Zalo
 * @access  SELLER, OWNER
 * @see     BR: GBR-10
 */
router.post(
  '/',
  authorizeRole('SELLER', 'OWNER'),
  validateCreateOrder,
  createDirectOrder
);

/**
 * @route   POST /api/orders/:id/confirm
 * @desc    Xác nhận đơn hàng & Kích hoạt giữ chỗ tồn kho
 * @access  SELLER, OWNER
 * @see     BR: GBR-10
 */
router.post(
  '/:id/confirm',
  authorizeRole('SELLER', 'OWNER'),
  confirmOrderReserve
);

/**
 * @route   POST /api/orders/:id/cancel
 * @desc    Hủy đơn hàng & Tự động giải phóng tồn kho giữ chỗ về khả dụng
 * @access  SELLER, OWNER
 * @see     BR: GBR-11
 */
router.post(
  '/:id/cancel',
  authorizeRole('SELLER', 'OWNER'),
  validateCancelOrder,
  cancelOrder
);

export default router;
```

---

### 3.3. Tầng Validation (Request Schema & Input Validator)
- **Tập trung vào**: Kiểm tra tính hợp lệ của dữ liệu đầu vào (Payload / Query / Params), kiểu dữ liệu, các ràng buộc giá trị tối thiểu/tối đa, sự tồn tại của trường bắt buộc.
- **Quy tắc bắt buộc**:
  - Có Beginning Comment đầy đủ.
  - Comment rõ từng trường dữ liệu và ràng buộc nghiệp vụ tương ứng (`// [BR: GBR-xx]`).
  - Phản hồi mã lỗi `400 Bad Request` kèm thông điệp rõ nghĩa khi dữ liệu vi phạm.

#### Ví dụ mẫu Validation (`orderManagement.validation.js`):
```javascript
/**
 * ============================================================================
 * @title        : Order Management Validation
 * @author       : AraWMS Core Engineering Team
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Bộ kiểm tra tính hợp lệ dữ liệu đầu vào cho các thao tác
 *                 tạo đơn hàng, hủy đơn, và xác nhận giữ chỗ kho.
 * @module       : Order Fulfillment / Order Management
 * @layer        : Validation
 * ============================================================================
 */

/**
 * Kiểm tra dữ liệu khi tạo mới đơn hàng bán lẻ.
 * 
 * @middleware
 * @param {Object} req - Express Request
 * @param {Object} res - Express Response
 * @param {Function} next - Express Next Middleware
 */
export const validateCreateOrder = (req, res, next) => {
  const { customerId, items } = req.body;

  // 1. Bắt buộc phải có khách hàng
  if (!customerId) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu thông tin khách hàng (customerId là bắt buộc)',
    });
  }

  // 2. [BR: GBR-10] Đơn hàng phải có ít nhất 1 sản phẩm hợp lệ để giữ chỗ kho
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Đơn hàng phải chứa ít nhất một sản phẩm hợp lệ',
    });
  }

  // 3. Kiểm tra từng mặt hàng trong giỏ
  for (const item of items) {
    if (!item.skuId) {
      return res.status(400).json({
        success: false,
        message: 'Mỗi sản phẩm phải có mã định danh skuId',
      });
    }

    if (!item.orderedQty || Number(item.orderedQty) < 1) {
      return res.status(400).json({
        success: false,
        message: 'Số lượng đặt (orderedQty) của mỗi SKU phải lớn hơn hoặc bằng 1',
      });
    }
  }

  next();
};

/**
 * Kiểm tra dữ liệu khi yêu cầu hủy đơn hàng.
 */
export const validateCancelOrder = (req, res, next) => {
  const { cancelReason } = req.body;

  if (!cancelReason || cancelReason.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng cung cấp lý do hủy đơn hàng (cancelReason)',
    });
  }

  next();
};

export default {
  validateCreateOrder,
  validateCancelOrder,
};
```

---

### 3.4. Tầng Controller (HTTP Handlers & Adapters)
- **Tập trung vào**: Nhận request từ Express Route, bóc tách tham số (`req.body`, `req.params`, `req.query`, `req.user`), gọi xuống Service tương ứng, bắt lỗi ngoại lệ (`try/catch`) và trả về HTTP response chuẩn (`200 OK`, `201 Created`, `400 Bad Request`, `500 Internal Error`).
- **Quy tắc bắt buộc**:
  - Không chứa logic tính toán nghiệp vụ phức tạp (toàn bộ logic nằm ở Service).
  - Có Beginning Comment đầy đủ.
  - Doc comment ghi rõ mã Use Case (UC) hoặc mã Route tương ứng.

#### Ví dụ mẫu Controller (`orderManagement.controller.js`):
```javascript
/**
 * ============================================================================
 * @title        : Order Management Controller
 * @author       : AraWMS Core Engineering Team
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Điều phối tiếp nhận HTTP Request, gọi Service xử lý đơn hàng,
 *                 đóng gói kết quả trả về theo chuẩn API Response của hệ thống.
 * @module       : Order Fulfillment / Order Management
 * @layer        : Controller
 * ============================================================================
 */

import orderManagementService from './orderManagement.service.js';
import { successResponse, errorResponse } from '../../../common/utils/apiResponse.js';

/**
 * Xử lý yêu cầu tạo đơn hàng trực tiếp từ kênh bán lẻ.
 * 
 * @function createDirectOrder
 * @param {Object} req - Express Request chứa dữ liệu đơn hàng trong req.body
 * @param {Object} res - Express Response
 * @returns {Promise<Response>} 201 Created kèm dữ liệu đơn hàng mới tạo
 */
export const createDirectOrder = async (req, res) => {
  try {
    const order = await orderManagementService.createDirectOrder(req.body, req.user, req);
    return successResponse(res, order, 'Tạo đơn hàng thành công', 201);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

/**
 * Xử lý xác nhận đơn hàng & Kích hoạt giữ chỗ tồn kho.
 * 
 * @function confirmOrderReserve
 * @param {Object} req - Express Request chứa ID đơn hàng trong req.params.id
 * @param {Object} res - Express Response
 * @returns {Promise<Response>} 200 OK kèm thông báo thành công
 */
export const confirmOrderReserve = async (req, res) => {
  try {
    const order = await orderManagementService.confirmOrderReserve(req.params.id, req.user, req);
    return successResponse(res, order, 'Xác nhận đơn hàng và kích hoạt giữ chỗ kho thành công');
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

/**
 * Xử lý yêu cầu hủy đơn hàng & Giải phóng tồn kho giữ chỗ.
 * 
 * @function cancelOrder
 * @param {Object} req - Express Request
 * @param {Object} res - Express Response
 * @returns {Promise<Response>} 200 OK kèm kết quả giải phóng kho
 */
export const cancelOrder = async (req, res) => {
  try {
    const { cancelReason } = req.body;
    const order = await orderManagementService.cancelOrder(req.params.id, cancelReason, req.user, req);
    return successResponse(res, order, 'Hủy đơn hàng và hoàn lại tồn kho thành công');
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

export default {
  createDirectOrder,
  confirmOrderReserve,
  cancelOrder,
};
```

---

### 3.5. Tầng Service (Core Business Logic Layer)
- **Tập trung vào**: Toàn bộ linh hồn nghiệp vụ của hệ thống: giao dịch CSDL (Transactions), kiểm tra điều kiện tiên quyết (Pre-conditions), tính toán số liệu (Computation), biến động tồn kho (Stock Movements), kích hoạt quy tắc (Action Enablers), và ghi nhận nhật ký kiểm toán (System Audit Log).
- **Quy tắc bắt buộc**:
  - Phải có Beginning Comment đầy đủ thông tin quản lý.
  - Mọi hàm Service phải có JSDoc chi tiết (@param, @returns, @throws, @businessRule).
  - Từng bước thực thi nghiệp vụ phải đánh số thứ tự `// 1. ...`, `// 2. ...`.
  - Mọi câu lệnh thực thi Business Rule bắt buộc phải gắn thẻ chuẩn `// [BR: GBR-xx] <Mô tả>`.

#### Ví dụ mẫu Service (`orderManagement.service.js`):
```javascript
/**
 * ============================================================================
 * @title        : Order Management Service
 * @author       : AraWMS Core Engineering Team
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Xử lý toàn bộ logic nghiệp vụ cốt lõi cho đơn hàng bán lẻ:
 *                 kiểm tra tồn khả dụng, kích hoạt giữ chỗ tồn kho (Reserved Qty),
 *                 hủy đơn hoàn kho, và ghi nhật ký kiểm toán toàn vẹn.
 * @module       : Order Fulfillment / Order Management
 * @layer        : Service
 * ============================================================================
 */

import SalesOrder from '../../../models/SalesOrder.model.js';
import Sku from '../../../models/Sku.model.js';
import InventoryTransaction from '../../../models/InventoryTransaction.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import { recordSystemLog } from '../../../common/utils/auditLogger.js';

/**
 * Xác nhận đơn hàng & Kích hoạt giữ chỗ tồn kho (+ReservedQty).
 * 
 * @async
 * @function confirmOrderReserve
 * @param {string} orderId - ID đơn hàng cần xác nhận
 * @param {Object} user - Người thực hiện
 * @param {Object} req - Express Request
 * @returns {Promise<Object>} Đơn hàng sau khi cập nhật
 * @throws {Error} Khi đơn không tồn tại, trạng thái sai, hoặc tồn khả dụng không đủ
 * @businessRule GBR-10 Tự động chuyển số lượng SKU từ tồn khả dụng sang tồn giữ chỗ
 * @businessRule GBR-23 Ghi log kiểm toán cho thao tác thay đổi tồn kho & đơn hàng
 */
export const confirmOrderReserve = async (orderId, user, req) => {
  // 1. Kiểm tra đơn hàng tồn tại
  const order = await SalesOrder.findById(orderId);
  if (!order) {
    throw new Error('Đơn hàng không tồn tại trong hệ thống');
  }

  // 2. Ràng buộc trạng thái: Chỉ xác nhận khi đơn đang ở trạng thái PENDING
  if (order.status !== 'PENDING') {
    throw new Error(`Chỉ có thể xác nhận đơn hàng ở trạng thái PENDING. Trạng thái hiện tại: ${order.status}`);
  }

  const beforeSnapshot = order.toObject();

  // 3. [BR: GBR-10] Kiểm tra tồn kho khả dụng cho toàn bộ SKU trước khi giữ chỗ
  for (const item of order.items) {
    const sku = await Sku.findById(item.skuId);
    if (!sku) {
      throw new Error(`Sản phẩm mã ${item.skuCode} không tồn tại`);
    }

    // Tồn khả dụng = Tồn thực tế (onHandQty) - Tồn giữ chỗ (reservedQty)
    const availableQty = (sku.onHandQty || 0) - (sku.reservedQty || 0);
    if (availableQty < item.orderedQty) {
      throw new Error(
        `[BR: GBR-10] Sản phẩm ${sku.skuCode} không đủ tồn khả dụng (Còn ${availableQty}, yêu cầu ${item.orderedQty})`
      );
    }
  }

  // 4. [BR: GBR-10] Thực hiện tăng tồn giữ chỗ (+reservedQty) và tạo giao dịch kho
  for (const item of order.items) {
    const sku = await Sku.findByIdAndUpdate(
      item.skuId,
      { $inc: { reservedQty: item.orderedQty } },
      { new: true }
    );

    // Ghi nhận sổ cái giao dịch tồn kho (Stock Ledger Transaction)
    const txCode = await CounterSequence.getNextSequence('INVENTORY_TX', 'TX', 6);
    await InventoryTransaction.create({
      transactionCode: txCode,
      warehouseType: 'FINISHED_GOODS',
      itemType: 'FINISHED_SKU',
      skuId: sku._id,
      transactionType: 'ORDER_RESERVE',
      referenceModel: 'SalesOrder',
      referenceId: order._id,
      quantityChange: item.orderedQty,
      onHandBefore: sku.onHandQty,
      onHandAfter: sku.onHandQty,
      unitCostSnapshot: sku.unitCogs || 0,
      performedByUserId: user._id,
    });
  }

  // 5. Cập nhật trạng thái đơn hàng sang CONFIRMED_RESERVED
  order.status = 'CONFIRMED_RESERVED';
  order.warehouseFulfillment = {
    ...order.warehouseFulfillment,
    stockReservedAt: new Date(),
  };
  await order.save();

  // 6. [BR: GBR-23] Ghi SystemLog kiểm toán vết thay đổi dữ liệu đơn hàng
  await recordSystemLog({
    actor: user,
    majorFeature: 'Order Fulfillment',
    subFeature: 'Order Management',
    action: 'CONFIRM_ORDER_RESERVE',
    targetCollection: 'SalesOrder',
    targetId: order._id,
    targetCode: order.orderCode,
    beforeSnapshot,
    afterSnapshot: order.toObject(),
    req,
  });

  return order;
};

/**
 * Hủy đơn hàng và tự động giải phóng tồn kho giữ chỗ về lại tồn khả dụng.
 * 
 * @async
 * @function cancelOrder
 * @param {string} orderId - ID đơn hàng
 * @param {string} cancelReason - Lý do hủy
 * @param {Object} user - Người thực hiện
 * @param {Object} req - Express Request
 * @returns {Promise<Object>} Đơn hàng sau khi hủy
 * @businessRule GBR-11 Đơn hàng bị hủy sẽ tự động giải phóng tồn kho giữ chỗ về tồn khả dụng
 * @businessRule GBR-23 Ghi log kiểm toán cho thao tác hủy đơn
 */
export const cancelOrder = async (orderId, cancelReason, user, req) => {
  // 1. Kiểm tra đơn hàng
  const order = await SalesOrder.findById(orderId);
  if (!order) {
    throw new Error('Đơn hàng không tồn tại');
  }

  if (['COMPLETED', 'CANCELLED'].includes(order.status)) {
    throw new Error(`Không thể hủy đơn hàng đã ở trạng thái ${order.status}`);
  }

  const beforeSnapshot = order.toObject();

  // 2. [BR: GBR-11] Nếu đơn hàng đã giữ chỗ, tiến hành hoàn lại tồn giữ chỗ (-reservedQty)
  if (order.status === 'CONFIRMED_RESERVED') {
    for (const item of order.items) {
      await Sku.findByIdAndUpdate(item.skuId, {
        $inc: { reservedQty: -item.orderedQty },
      });

      // Ghi nhận giao dịch giải phóng tồn kho
      const txCode = await CounterSequence.getNextSequence('INVENTORY_TX', 'TX', 6);
      await InventoryTransaction.create({
        transactionCode: txCode,
        warehouseType: 'FINISHED_GOODS',
        itemType: 'FINISHED_SKU',
        skuId: item.skuId,
        transactionType: 'ORDER_CANCEL_RELEASE',
        referenceModel: 'SalesOrder',
        referenceId: order._id,
        quantityChange: -item.orderedQty,
        performedByUserId: user._id,
      });
    }
  }

  // 3. Cập nhật trạng thái hủy
  order.status = 'CANCELLED';
  order.cancelReason = cancelReason;
  order.cancelledAt = new Date();
  order.cancelledByUserId = user._id;
  await order.save();

  // 4. [BR: GBR-23] Ghi SystemLog kiểm toán
  await recordSystemLog({
    actor: user,
    majorFeature: 'Order Fulfillment',
    subFeature: 'Order Management',
    action: 'CANCEL_ORDER',
    targetCollection: 'SalesOrder',
    targetId: order._id,
    targetCode: order.orderCode,
    beforeSnapshot,
    afterSnapshot: order.toObject(),
    req,
  });

  return order;
};

export default {
  confirmOrderReserve,
  cancelOrder,
};
```

---

## 4. Quy ước gắn mã Business Rule `[BR: GBR-xx]` trong Comment

Nhằm đảm bảo tính minh bạch, nhất quán và khả năng quét tự động (automation indexing), mọi vị trí hiện thực Business Rule phải tuân thủ cú pháp sau:

### 4.1. Cú pháp chuẩn
| Vị trí | Cú pháp | Ví dụ |
|---|---|---|
| **Trong Doc Comment** | `@businessRule GBR-xx <Mô tả ngắn>` | `@businessRule GBR-01 Chặn đăng nhập tài khoản đã khóa` |
| **Trong Implementation Comment** | `// [BR: GBR-xx] <Mô tả hành động thực thi>` | `// [BR: GBR-01] Kiểm tra trạng thái isActive của tài khoản` |
| **Trong Khối tính toán (Computation)** | `/* [BR: GBR-xx] Công thức: ... */` | `/* [BR: GBR-14] Hoàn tiền = Giá trị SP * 90% - Phí ship */` |

### 4.2. Khả năng tìm kiếm (Grep Searchability)
Với định dạng thống nhất `[BR: GBR-xx]`, lập trình viên hoặc công cụ CI/CD có thể kiểm tra độ bao phủ mã nguồn bằng lệnh:
```bash
# Tìm tất cả vị trí áp dụng quy tắc GBR-10
grep -rn "\[BR: GBR-10\]" ./src

# Tìm tất cả các file đã gắn mã BR
grep -rn "\[BR: GBR-" ./src
```

---

## 5. Nguyên tắc Viết Comment Sạch (Clean Commenting Best Practices)

### 5.1. Những việc NÊN LÀM (Do's)
- Luôn giữ comment **đồng bộ với code thực tế**. Khi cập nhật code, phải cập nhật comment ngay lập tức.
- Comment giải thích **Lý do (Why)** cho các quyết định kiến trúc hoặc ranh giới nghiệp vụ bất thường.
- Luôn có Beginning Comment đầy đủ thông tin quản lý (`Title`, `Author`, `Date`, `Description`) ở đầu tệp.
- Sử dụng tiếng Việt rõ ràng, chuẩn ngữ pháp kỹ thuật, hoặc tiếng Anh chuẩn ngành (không pha trộn lộn xộn).

### 5.2. Những việc TUYỆT ĐỐI TRÁNH (Don'ts)
- **Không viết comment thừa thãi (Noise Comments)**:  
  *Sai:* `i++; // Tăng i lên 1`  
  *Sai:* `const user = await User.findById(id); // Tìm user theo id`
- **Không để lại Code chết (Commented-out code)**: Nếu code không còn dùng, hãy xóa sạch vì Git đã lưu lịch sử.
- **Không viết comment mâu thuẫn với code**: Dẫn đến hiểu lầm tai hại cho người bảo trì tiếp theo.
- **Không bỏ trống thông tin quản trị**: Tránh tạo file mới mà không có khối Beginning Comment.

---

## 6. Hướng dẫn dành riêng cho Trợ lý AI (AI Coding Agent Directive)

> **CHỈ THỊ QUAN TRỌNG DÀNH CHO AI KHI THAO TÁC TRÊN CODEBASE ARAWMS:**
> 
> 1. **Khởi tạo / Cập nhật file**: Khi tạo hoặc sửa bất kỳ file mã nguồn nào (`.js`, `.jsx`, `.ts`, `.tsx`), AI **bắt buộc** phải chèn khối Beginning Comment ở dòng 1 với đầy đủ 4 trường cốt lõi:
>    - `@title`: Tên định danh file.
>    - `@author`: 
>      * **`Nguyễn Quang Huy`** đối với **tất cả chức năng liên quan đến Seller** (UC-69 đến UC-83, Conversational Commerce, Order Management, RMA, Exchange, và giao diện Seller).
>      * `AraWMS Engineering Team` đối với các module kỹ thuật chung khác.
>    - `@createdDate`: Ngày tạo tệp (`YYYY-MM-DD`).
>    - `@lastModified`: Ngày cập nhật gần nhất (`YYYY-MM-DD`).
>    - `@description`: Mô tả tối thiểu 2 câu về nghiệp vụ của file.
> 2. **Chỉnh sửa / Refactor file hiện có**: AI phải cập nhật trường `@lastModified` và giữ nguyên lịch sử nếu có.
> 3. **Thực thi nghiệp vụ trong [BR.md](./BR.md)**: Khi viết code liên quan đến một trong các quy tắc từ `GBR-01` đến `GBR-24`, AI **bắt buộc** phải chú thích rõ mã `// [BR: GBR-xx]` ngay tại dòng lệnh điều kiện, tính toán hoặc kiểm tra hợp lệ.
> 4. **Phân tầng chuẩn**: Tuân thủ đúng phong cách comment của 5 tầng kiến trúc:
>    - Front-end: Comment Component props, UI validation và UX disabling.
>    - Route: Comment HTTP method, URL, Role authorization.
>    - Controller: Comment adapter req/res, HTTP status codes.
>    - Service: Comment logic, Step-by-step, Transactions, `[BR: GBR-xx]`.
>    - Validation: Comment ràng buộc schema và thông điệp lỗi.
