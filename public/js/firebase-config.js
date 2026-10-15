// =====================================================================
//  CẤU HÌNH FIREBASE — dán thông số của project Firebase của bạn vào đây
//  (Firebase Console → Project settings → General → Your apps → Web app → SDK setup and configuration → Config)
//
//  Các giá trị này KHÔNG phải mật khẩu: chúng được gửi về trình duyệt của mọi người dùng.
//  Bảo mật dữ liệu nằm ở firestore.rules và danh sách thành viên, không nằm ở đây.
//
//  Để nguyên "DIEN_..." thì app chạy ở chế độ thử: không đăng nhập, dữ liệu lưu trong trình duyệt.
// =====================================================================
export const firebaseConfig = {
  apiKey: "AIzaSyBwl_yjofWgIHLsuaWpNkSOdldoreUnISE",
  authDomain: "cong-tra-cuu-hoa-don.firebaseapp.com",
  projectId: "cong-tra-cuu-hoa-don",
  storageBucket: "cong-tra-cuu-hoa-don.firebasestorage.app",
  messagingSenderId: "714600555163",
  appId: "1:714600555163:web:1feb62dc8ddccbec3f1c3e"
};

// Nhiều công ty dùng chung app: mỗi người dùng tự tạo công ty hoặc được mời vào công ty.
// legacyOrgId: mã công ty tạo tay từ trước (bản một công ty) — app tự chuyển dữ liệu cũ sang cách mới.
export const legacyOrgId = "cong-ty-cua-toi";

// Giới hạn mặc định cho mỗi công ty. Quản trị hệ thống chỉnh riêng từng công ty trong app.
export const defaultPlan = { maxInvoices: 5000, aiDaily: 50 };

// Vùng chạy Cloud Functions — phải trùng với functions/index.js
export const functionsRegion = "asia-southeast1";
