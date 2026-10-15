# Lộ trình phát triển — Cổng tra cứu hóa đơn

Tài liệu này rà soát app dưới góc nhìn **kế toán viên** và **kế toán trưởng** (KTT), liệt kê phần còn thiếu, xếp theo mức ưu tiên.

Ký hiệu: 🔴 cần có trước khi dùng thật · 🟠 nên có trong 1–2 tháng đầu · 🟢 nâng cao

---

## A. Phần đang mô phỏng — phải làm thật

| # | Việc | Ghi chú kỹ thuật |
|---|---|---|
| 🔴 A1 | **Đồng bộ hóa đơn từ cơ quan thuế** | Job chạy nền (Cloud Functions theo lịch) dùng tài khoản tra cứu hóa đơn của doanh nghiệp; xử lý captcha; lưu XML gốc có mã của cơ quan thuế. Phương án thay thế: API MISA (MISA báo miễn phí) hoặc API nhà cung cấp hóa đơn điện tử. Cần rà điều khoản sử dụng trước. |
| 🔴 A2 | **Ghi vào Bravo** | Chốt với Bravo: bảng trung gian / API / import. App ghi, Bravo tạo chứng từ, trả về số chứng từ và lỗi. Đồng bộ ngược danh mục NCC, tài khoản, khoản mục, công trình từ Bravo. |
| 🟠 A3 | **Tải PDF gốc** | Mỗi nhà cung cấp hóa đơn (VNPT, Viettel, MISA, BKAV…) một connector; làm trước cho 5–10 NCC xuất hóa đơn nhiều nhất. |
| 🟠 A4 | **Tra rủi ro NCC thật** | Tra trạng thái MST định kỳ; đối chiếu danh sách doanh nghiệp rủi ro cao về thuế. |
| 🔴 A5 | **Lưu file gốc** | XML, PDF, ảnh scan lên Firebase Storage, gắn vào từng hóa đơn. |

## B. Góc nhìn kế toán trưởng — còn thiếu

### Kiểm soát và trách nhiệm
| # | Việc | Vì sao KTT cần |
|---|---|---|
| 🔴 B1 | **Duyệt nhiều cấp** | Kế toán viên nhập và ghép mã; chỉ KTT (vai trò `admin`) được duyệt và đẩy sang Bravo. Hiện ai có quyền ghi cũng duyệt được. |
| 🔴 B2 | **Nhật ký thao tác (audit log)** | Ai sửa số tiền, đổi TK, xóa hóa đơn, lúc nào, giá trị trước/sau. Cần khi kiểm toán, quyết toán thuế. |
| 🔴 B3 | **Khóa sổ theo kỳ** | Sau khi nộp tờ khai thì khóa kỳ: không sửa/xóa hóa đơn của kỳ đã khóa. Hóa đơn về trễ đưa vào kỳ phát hiện hoặc kê khai bổ sung. |
| 🔴 B4 | **Không xóa cứng** | Hóa đơn xóa chuyển vào thùng rác có lý do, khôi phục được. |
| 🟠 B5 | **Quyền theo màn hình** | Bảng lương chỉ người được giao mới xem (bảo mật lương); kế toán công nợ không xem lương. |

### Tính hợp lệ của hóa đơn
| # | Việc | Vì sao KTT cần |
|---|---|---|
| 🔴 B6 | **Hóa đơn điều chỉnh, thay thế, hủy** | Liên kết với hóa đơn gốc; tự kiểm tra lại trạng thái trên cơ quan thuế trước khi kê khai (hóa đơn đã bị hủy/thay thế sau khi nhận). |
| 🔴 B7 | **Kiểm tra chữ ký số và mã cơ quan thuế** trong XML | Phát hiện XML bị sửa, hóa đơn không có mã khi bắt buộc có mã. |
| 🟠 B8 | **Kiểm tra thông tin người mua** | Tên, MST, địa chỉ người mua trên hóa đơn khớp với công ty mình; sai thì cảnh báo để yêu cầu NCC điều chỉnh. |
| 🟠 B9 | **Hóa đơn ngoại tệ** | Lưu loại tiền, tỷ giá; quy đổi VND khi hạch toán. |

### Đối chiếu
| # | Việc | Vì sao KTT cần |
|---|---|---|
| 🔴 B10 | **Đối chiếu 3 bên: cơ quan thuế ↔ app ↔ Bravo** | Hóa đơn có trên cơ quan thuế nhưng chưa hạch toán; đã hạch toán nhưng không có trên cơ quan thuế; lệch số tiền. Số dư 1331 trên Bravo khớp bảng kê. |
| 🟠 B11 | **Đối chiếu với đơn mua hàng (PO) và phiếu nhập kho** | Hóa đơn vật tư phải khớp PO và số lượng nhập kho trước khi duyệt. |
| 🟠 B12 | **Chứng từ thanh toán** | Gắn ủy nhiệm chi / sao kê ngân hàng vào hóa đơn ≥ 5 triệu (điều kiện khấu trừ thuế GTGT); cảnh báo hóa đơn đến hạn mà chưa có chứng từ thanh toán không dùng tiền mặt. |
| 🟠 B13 | **Công nợ NCC** | Hạn thanh toán theo hợp đồng, tuổi nợ, nhắc hạn; biên bản đối chiếu công nợ lấy số liệu thật. |

### Theo công trình — đặc thù nhà thầu
| # | Việc | Vì sao KTT cần |
|---|---|---|
| 🔴 B14 | **Mã công trình / dự án trên từng dòng hàng** | Chi phí phải tập hợp theo công trình để tính giá thành và lãi lỗ dự án; đồng bộ mã công trình với Bravo. |
| 🟠 B15 | **Ngân sách công trình** | So sánh chi phí thực tế với dự toán, cảnh báo vượt. |

### Thuế và báo cáo
| # | Việc | Vì sao KTT cần |
|---|---|---|
| 🟠 B16 | **Hóa đơn đầu ra** | Đủ dữ liệu cho tờ khai 01/GTGT (phần bán ra) và Mục II phụ lục giảm thuế. |
| 🟠 B17 | **Xuất XML nhập HTKK** | Nộp tờ khai không phải gõ lại. Cập nhật mẫu phụ lục giảm thuế theo nghị quyết áp dụng cho kỳ. |
| 🟠 B18 | **Cảnh báo chi phí không được trừ khi tính thuế TNDN** | Hóa đơn không hợp lệ, thanh toán tiền mặt từ 5 triệu, NCC bỏ địa chỉ kinh doanh. |
| 🟠 B19 | **Lịch nhắc hạn** | Hạn nộp tờ khai GTGT, TNCN, quyết toán; hạn nộp tiền thuế. |
| 🟢 B20 | **Dashboard quản trị** | Chi phí theo tháng, NCC, khoản mục, công trình; top NCC; xu hướng. |

### Lương và bảo hiểm
| # | Việc | Vì sao KTT cần |
|---|---|---|
| 🟠 B21 | **Bảo hiểm đầy đủ** | Tách BHXH/BHYT/BHTN phần người lao động và phần doanh nghiệp; kinh phí công đoàn; trần BHTN theo lương tối thiểu vùng. |
| 🟠 B22 | **Thuế TNCN cho thu nhập vãng lai và người không cư trú** | Khấu trừ 10% / 20%; chứng từ khấu trừ thuế TNCN điện tử. |
| 🟠 B23 | **Nhập chấm công** từ máy chấm công / Excel; lấy giờ OT từ phần mềm quản lý OT đang dùng. |
| 🟢 B24 | **Phiếu lương** gửi email từng người, có mật khẩu. |

### Lưu trữ và an toàn
| # | Việc | Vì sao KTT cần |
|---|---|---|
| 🔴 B25 | **Sao lưu tự động** | Xuất Firestore định kỳ ra Cloud Storage; chứng từ kế toán phải lưu tối thiểu 10 năm. |
| 🟠 B26 | **Xác thực 2 lớp** cho tài khoản quản trị; giới hạn đăng nhập bằng email công ty. |
| 🟢 B27 | **Tìm kiếm toàn văn** trên số lượng hóa đơn lớn (Algolia / Typesense hoặc Firestore index). |

## C. Kỹ thuật

| # | Việc |
|---|---|
| 🟠 C1 | Tách `app.js` thành module theo màn hình; chuyển sang Vite + TypeScript khi đội phát triển lớn hơn. |
| 🟠 C2 | Phân trang Firestore cho danh sách hóa đơn (hiện tải toàn bộ khi mở app). |
| 🟠 C3 | Unit test cho phần tính toán: thuế TNCN, tờ khai, đọc XML. |
| 🟢 C4 | GitHub Actions: tự deploy khi push lên `main`, chạy test trước khi deploy. |
| 🟢 C5 | Emulator Suite cho môi trường phát triển (`firebase emulators:start`). |

## D. Tính năng từ video tham khảo

- Video `youtu.be/dnxG3JAMmI4`: chưa xem được (bị chặn khi tải). Bổ sung khi có nội dung.
