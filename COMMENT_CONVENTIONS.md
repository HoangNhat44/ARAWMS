# Quy chuẩn viết comment toàn dự án

**Phiên bản:** 1.0  
**Phạm vi:** Java backend (Controller, Service, Repository/DAO, Model, DTO, Config, Utility) và frontend (JSP/HTML/CSS/JavaScript).  
**Cơ sở:** _Java Code Conventions_ (Sun Microsystems, 1997), đặc biệt mục 3.1.1 (Beginning Comments), 5.1 (Implementation Comments), 5.2 (Documentation Comments).  
**Lưu ý:** Các quy định đánh dấu **[Dự án]** là quy ước bổ sung nhằm thống nhất codebase, không phải yêu cầu nguyên văn của tài liệu Sun. Quy ước Java không trực tiếp áp dụng cho cú pháp comment của HTML, JSP, CSS hoặc JavaScript.

## 1. Nguyên tắc chung

1. **[Dự án]** Viết comment bằng **tiếng Anh**, ngắn gọn, rõ nghĩa, nhất quán.
2. Comment giải thích **mục đích, hợp đồng, lý do, ràng buộc hoặc hành vi không hiển nhiên**; không diễn giải lại từng câu lệnh.
3. Comment phải đúng với code; sửa hoặc xóa comment khi hành vi thay đổi.
4. Không để thông tin nhạy cảm (mật khẩu, token, dữ liệu cá nhân) trong comment.
5. Không dùng comment để giữ code chết; dùng Git để xem lịch sử.
6. **[Dự án]** Không bắt buộc comment cho getter/setter hoặc phép gán đơn giản nếu tên đã đủ rõ; ngoại lệ khi có ràng buộc hoặc hành vi bất thường.
7. Phân biệt: `/* ... */` và `//` cho **implementation comment**; `/** ... */` cho **Javadoc**.

## 2. Beginning Comment — đầu file

Theo mục 3.1.1, mỗi source file Java nên bắt đầu bằng comment kiểu `/* ... */` chứa tên người lập trình, ngày, thông báo bản quyền (nếu có) và mô tả ngắn. **[Dự án]** Chuẩn hóa mẫu sau; chỉ ghi copyright khi thực sự áp dụng.

```java
/*
 * File: ProductController.java
 * Author: Duy Anh
 * Date: 2026-10-25
 * Description: Handles HTTP requests for product operations.
 */
package com.example.product.controller;
```

**[Dự án] Quy định nội dung:**

| Trường        | Yêu cầu                                        |
| ------------- | ---------------------------------------------- |
| `File`        | Tên file chính xác                             |
| `Author`      | Người hoặc nhóm chịu trách nhiệm               |
| `Date`        | Ngày tạo file, định dạng `YYYY-MM-DD`          |
| `Copyright`   | Tùy chọn; không tự tạo tuyên bố bản quyền      |
| `Description` | Một đến hai câu nêu trách nhiệm chính của file |

**[Dự án]** Đặt header trước `package`/`import`; nếu file có license header bắt buộc thì ưu tiên license hợp lệ và tích hợp thông tin mô tả theo chính sách dự án, không nhân đôi header. Không bắt buộc cập nhật `Date` sau mỗi lần sửa; Git lưu lịch sử thay đổi.

**Mô tả theo tầng:**

| Tầng           | Nội dung `Description` nên tập trung                            |
| -------------- | --------------------------------------------------------------- |
| FE/View        | Hiển thị trang, form, trạng thái và tương tác người dùng        |
| Controller     | Endpoint, nhận request, xác thực/kiểm tra đầu vào, trả response |
| Service        | Quy tắc nghiệp vụ, xử lý use case                               |
| DAO/Repository | Truy xuất, lưu trữ, cập nhật dữ liệu                            |
| Model/Entity   | Đại diện dữ liệu và bất biến quan trọng                         |
| DTO            | Cấu trúc dữ liệu trao đổi giữa các tầng                         |
| Config/Utility | Cấu hình hoặc chức năng hỗ trợ cụ thể                           |

**FE dùng đúng cú pháp của ngôn ngữ** (quy ước mở rộng của dự án, không phải Java Code Conventions):

```html
<!-- File: product.html | Description: Displays the product list. -->
```

```jsp
<%-- File: product.jsp | Description: Renders the product list page. --%>
```

```javascript
/*
 * File: product.js
 * Description: Handles product-list interactions.
 */
```

```css
/* File: product.css | Description: Styles the product-list view. */
```

## 3. Documentation Comment — Javadoc

Theo mục 5.2, Javadoc `/** ... */` đặt **ngay trước** declaration của class, interface, constructor, method hoặc field cần tài liệu hóa; nội dung mô tả **hợp đồng sử dụng**, không phải từng bước cài đặt.

### 3.1. Quy tắc bắt buộc trong dự án

- **[Dự án]** Viết Javadoc cho public class/interface và public method thuộc API nghiệp vụ hoặc được dùng từ tầng khác; ưu tiên cả protected method có hành vi đặc thù.
- **[Dự án]** Với private helper đơn giản, chỉ thêm Javadoc khi hành vi hoặc ràng buộc khó hiểu.
- Câu đầu tóm tắt chức năng; phần sau mô tả điều kiện, quy tắc và hành vi đáng chú ý.
- `@param`: mô tả ý nghĩa và giới hạn của từng tham số (nếu có).
- `@return`: mô tả kết quả, bao gồm `null`, empty list, `Optional.empty()` nếu có; **không dùng cho `void`**.
- `@throws`: nêu loại exception và điều kiện phát sinh đáng chú ý; không khai báo exception không thể xảy ra.
- `@see`, `@author`, `@version`: tùy nhu cầu và chính sách dự án.
- Khi override method đã được tài liệu hóa đầy đủ, có thể dùng `{@inheritDoc}` hoặc bổ sung phần hành vi khác biệt; không sao chép Javadoc vô ích.

### 3.2. Mẫu class

```java
/**
 * Provides business operations for managing products.
 *
 * <p>Enforces product validation rules before persistence.</p>
 */
public class ProductService {
}
```

### 3.3. Mẫu method

```java
/**
 * Finds a product by its identifier.
 *
 * @param productId the positive identifier of the product
 * @return the matching product, or {@code null} if not found
 * @throws IllegalArgumentException if {@code productId} is not positive
 */
public Product findById(long productId) {
    if (productId <= 0) {
        throw new IllegalArgumentException("productId must be positive");
    }
    return productDao.findById(productId);
}
```

### 3.4. Mẫu theo tầng

**Controller:** mô tả endpoint, dữ liệu đầu vào, kết quả HTTP và các lỗi quan trọng. Không đưa toàn bộ logic nghiệp vụ vào Javadoc.

```java
/**
 * Returns product details for the requested identifier.
 *
 * @param request the HTTP request containing the product identifier
 * @param response the HTTP response used to render the result
 * @throws ServletException if request dispatching fails
 * @throws IOException if writing the response fails
 */
@Override
protected void doGet(HttpServletRequest request,
                     HttpServletResponse response)
        throws ServletException, IOException {
    // Handle request and delegate business rules to the service.
}
```

**Service:** nêu quy tắc nghiệp vụ, điều kiện hợp lệ, kết quả và lỗi.

```java
/**
 * Reserves inventory for an order when sufficient stock is available.
 *
 * @param productId the identifier of the product
 * @param quantity the strictly positive quantity to reserve
 * @throws IllegalArgumentException if quantity is not positive
 * @throws InsufficientStockException if available stock is insufficient
 */
public void reserveStock(long productId, int quantity) {
    // Business logic.
}
```

**DAO/Repository:** nêu truy vấn/trạng thái dữ liệu ở mức hợp đồng, ý nghĩa kết quả và lỗi truy cập dữ liệu.

```java
/**
 * Loads a product by its identifier.
 *
 * @param productId the identifier of the product
 * @return the product, or {@code null} when no record exists
 * @throws SQLException if the database query fails
 */
public Product findById(long productId) throws SQLException {
    // Database access.
    return null;
}
```

**Model/DTO:** Javadoc cho class và những field/behavior có ràng buộc không hiển nhiên; không mô tả lặp lại các property đơn giản.

**FE:** HTML/CSS/JSP không có Javadoc Java; sử dụng comment của ngôn ngữ tương ứng. JavaScript có thể dùng JSDoc theo quy ước riêng của nhóm, **không coi JSDoc là quy định trong Java Code Conventions**.

## 4. Implementation Comment — giải thích bên trong code

Theo mục 5.1, implementation comment gồm block comment, single-line comment, trailing comment và end-of-line comment. Chúng dùng để giải thích chi tiết triển khai mà Javadoc không nên chứa.

### 4.1. Block comment `/* ... */`

Dùng trước một đoạn thuật toán, transaction, xử lý concurrency hoặc quyết định kỹ thuật cần giải thích nhiều dòng.

```java
/*
 * Both inventory updates belong to the same transaction.
 * Rolling back on failure prevents partial stock transfers.
 */
connection.setAutoCommit(false);
```

### 4.2. Single-line / end-of-line comment `//`

Dùng cho một lý do hoặc thao tác không hiển nhiên. Trong Java, `//` có hiệu lực tới cuối dòng; có thể đứng riêng hoặc sau câu lệnh.

```java
// Normalize user input before applying case-insensitive matching.
String normalizedName = productName.trim().toLowerCase(Locale.ROOT);
```

### 4.3. Trailing comment

Chỉ dùng nếu comment ngắn và không làm dòng khó đọc; ưu tiên comment trên dòng riêng khi giải thích dài.

```java
int retryCount = 3; // Maximum attempts allowed by the external API.
```

### 4.4. Khi nào cần comment theo tầng

| Tầng           | Nên giải thích                                                           | Không cần giải thích                   |
| -------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| FE             | Workaround trình duyệt, xử lý trạng thái bất thường, tương tác phức tạp  | Click handler hiển nhiên, CSS đơn giản |
| Controller     | Lý do mapping lỗi HTTP, điều hướng đặc biệt, phân quyền không hiển nhiên | `getParameter`, gọi service đơn giản   |
| Service        | Quy tắc nghiệp vụ khó suy ra, thứ tự xử lý bắt buộc, idempotency         | `if`/`for` có tên biến rõ ràng         |
| DAO            | Transaction, locking, tối ưu SQL, ràng buộc consistency                  | CRUD SQL đơn giản                      |
| Config/Utility | Giá trị cấu hình khó hiểu, thuật toán đặc biệt                           | Hằng số tự mô tả                       |

**Ví dụ tốt:**

```java
// Lock the row to prevent concurrent orders from overselling stock.
Product product = productDao.findByIdForUpdate(productId);
```

**Ví dụ không tốt:**

```java
// Increase count by one.
count++;
```

## 5. Mẫu cấu trúc file Java hoàn chỉnh

```java
/*
 * File: ProductService.java
 * Author: Duy Anh
 * Date: 2026-10-25
 * Description: Implements product-related business operations.
 */
package com.example.product.service;

import com.example.product.dao.ProductDao;
import com.example.product.model.Product;

/**
 * Provides product lookup operations and input validation.
 */
public class ProductService {

    private final ProductDao productDao;

    /**
     * Creates a service with the required data-access dependency.
     *
     * @param productDao the product data-access component
     */
    public ProductService(ProductDao productDao) {
        this.productDao = productDao;
    }

    /**
     * Finds a product by its identifier.
     *
     * @param productId the positive identifier of the product
     * @return the product, or {@code null} if not found
     * @throws IllegalArgumentException if the identifier is not positive
     */
    public Product findById(long productId) {
        if (productId <= 0) {
            throw new IllegalArgumentException("productId must be positive");
        }

        return productDao.findById(productId);
    }
}
```

## 6. Checklist kiểm tra khi review / pull request

- [ ] File Java mới có beginning comment đúng mẫu, trừ trường hợp license/header theo chính sách riêng.
- [ ] `Description` phản ánh đúng trách nhiệm tầng kiến trúc.
- [ ] Public API quan trọng có Javadoc, mô tả hợp đồng và hành vi thực tế.
- [ ] `@param`, `@return`, `@throws` đúng chữ ký và điều kiện thực thi.
- [ ] Không dùng `@return` cho method `void`.
- [ ] Comment bên trong hàm giải thích **why/how** khi cần, không lặp lại **what** đã rõ.
- [ ] Không để comment sai, lỗi thời, code bị comment-out hoặc thông tin nhạy cảm.
- [ ] Comment FE sử dụng cú pháp đúng loại file.
- [ ] Mọi comment tuân thủ ngôn ngữ thống nhất của dự án.

## 7. Quy tắc ưu tiên và phạm vi áp dụng

1. License, bảo mật và chính sách bắt buộc của tổ chức được ưu tiên cao nhất.
2. Với Java, dựa vào _Java Code Conventions_ cho ba nhóm comment cơ bản.
3. Những mục đánh dấu **[Dự án]** là tiêu chuẩn thống nhất bổ sung, có thể điều chỉnh qua review nhóm.
4. Với FE và các ngôn ngữ ngoài Java, áp dụng tinh thần mô tả mục đích/hành vi, nhưng sử dụng cú pháp và công cụ tài liệu hóa riêng.
5. Không coi các ví dụ có phần thân placeholder (`// Business logic.`) là implementation hoàn chỉnh; phải thay bằng logic thật và đồng bộ comment với code.

## 8. Tài liệu tham khảo

- Sun Microsystems, _Java Code Conventions_ (1997), mục **3.1.1 Beginning Comments**, **5.1 Implementation Comments**, **5.2 Documentation Comments**; tài liệu PDF do nhóm dự án cung cấp: `codeconventions-150003.pdf`.
