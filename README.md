# Cổng tra cứu hóa đơn

Web app cho phòng kế toán: gom hóa đơn đầu vào, đọc XML/PDF/ảnh scan, ghép mã hạch toán, lập bảng kê và tờ khai, rồi đẩy sang phần mềm kế toán **Bravo**. Kèm các công cụ: gộp file, chuyển ảnh/PDF sang Excel bằng AI, soạn văn bản hàng loạt và tính lương.

Chạy trên **Firebase**: Hosting (web), Authentication (đăng nhập), Firestore (dữ liệu), Cloud Functions (AI đọc chứng từ).

> Trạng thái: **bản dựng từ demo**. Những phần cần kết nối hệ thống bên ngoài (cơ quan thuế, nhà cung cấp hóa đơn, Bravo) đang **mô phỏng**, xem [docs/ROADMAP.md](docs/ROADMAP.md).

---

## Mục lục
1. [Tính năng](#tính-năng)
2. [Cấu trúc thư mục](#cấu-trúc-thư-mục)
3. [Chạy thử ngay (không cần Firebase)](#chạy-thử-ngay-không-cần-firebase)
4. [Tạo Firebase từng bước](#tạo-firebase-từng-bước)
5. [Cấp quyền người dùng](#cấp-quyền-người-dùng)
6. [Bật AI đọc chứng từ (Cloud Functions)](#bật-ai-đọc-chứng-từ-cloud-functions)
7. [Cập nhật app về sau](#cập-nhật-app-về-sau)
8. [Chi phí Firebase](#chi-phí-firebase)
9. [Xử lý lỗi thường gặp](#xử-lý-lỗi-thường-gặp)

---

## Tính năng

| Nhóm | Tính năng | Trạng thái |
|---|---|---|
| Hóa đơn | Danh sách hóa đơn, đọc XML (chuẩn TT78), đọc PDF có chữ, chống trùng MST + ký hiệu + số | Chạy thật |
| | Đồng bộ hóa đơn từ cơ quan thuế | Mô phỏng |
| | Tải hàng loạt: ZIP gồm XML, bản thể hiện, bảng kê Excel | Chạy thật |
| | Lấy PDF gốc từ trang tra cứu của nhà cung cấp hóa đơn | Mô phỏng |
| | Bảng kê tổng hợp và chi tiết mặt hàng, xuất Excel | Chạy thật |
| | Kiểm tra rủi ro nhà cung cấp theo MST | Mô phỏng |
| Kế toán | Ghép mã NCC, tài khoản, khoản mục; quy tắc tự gán | Chạy thật |
| | Đẩy sang Bravo (xem trước SQL bảng trung gian / mẫu import) | Mô phỏng |
| | Tờ khai 01/GTGT phần mua vào [23] [24] [25], phụ lục giảm thuế Mục I | Chạy thật |
| Công cụ | Gộp PDF, gộp Excel/CSV | Chạy thật |
| | Ảnh/PDF → Excel bằng AI, thêm thẳng thành hóa đơn | Chạy thật (cần Cloud Functions) |
| | Soạn biên bản, hợp đồng hàng loạt, xuất Word | Chạy thật |
| Nhân sự | Chấm công, bảng lương, thuế TNCN, quyết toán năm | Chạy thật |
| Hệ thống | Đăng nhập email/Google, phân quyền Quản trị / Kế toán / Chỉ xem | Chạy thật (cần Firebase) |

## Cấu trúc thư mục

```
cong-tra-cuu-hoa-don/
├── public/                  ← web app (Firebase Hosting phục vụ thư mục này)
│   ├── index.html           ← khung trang + màn hình đăng nhập
│   ├── css/app.css
│   └── js/
│       ├── app.js           ← toàn bộ nghiệp vụ và giao diện
│       ├── cloud.js         ← kết nối Firebase (đăng nhập, lưu Firestore, gọi AI)
│       └── firebase-config.js  ← ★ DÁN CẤU HÌNH FIREBASE VÀO ĐÂY
├── functions/               ← Cloud Functions (AI đọc chứng từ)
│   ├── index.js
│   └── package.json
├── firestore.rules          ← quy tắc bảo mật dữ liệu
├── firebase.json            ← cấu hình Hosting / Firestore / Functions
├── .firebaserc              ← ★ ĐIỀN PROJECT ID VÀO ĐÂY
└── docs/ROADMAP.md          ← việc cần làm tiếp, góp ý từ góc nhìn kế toán trưởng
```

## Chạy thử ngay (không cần Firebase)

Khi `firebase-config.js` còn để nguyên `DIEN_...`, app chạy **chế độ thử**: không đăng nhập, dữ liệu lưu trong trình duyệt, tính năng AI tắt.

```bash
cd public
python -m http.server 8000      # hoặc: npx serve .
```
Mở http://localhost:8000

> Không mở trực tiếp file `index.html` bằng cách nhấp đúp: trình duyệt chặn module JavaScript khi chạy từ `file://`.

---

## Tạo Firebase từng bước

Cần: một tài khoản Google, máy đã cài **Node.js 22** trở lên (https://nodejs.org).

### Bước 1 — Tạo project
1. Vào https://console.firebase.google.com → **Create a project** (Tạo dự án).
2. Đặt tên, ví dụ `cong-tra-cuu-hoa-don`. Firebase sẽ gợi ý **Project ID** (ví dụ `cong-tra-cuu-hoa-don-1a2b3`), **ghi lại ID này**.
3. Google Analytics: có thể tắt, không cần cho app này.
4. Bấm **Create project**, đợi xong rồi **Continue**.

### Bước 2 — Đăng ký Web app và lấy cấu hình
1. Ở trang Project Overview, bấm biểu tượng **Web `</>`**.
2. App nickname: `cong-tra-cuu-hoa-don-web`. Tick **Also set up Firebase Hosting**.
3. Bấm **Register app**. Màn hình hiện đoạn `const firebaseConfig = { ... }`.
4. Mở `public/js/firebase-config.js`, thay các giá trị `DIEN_...` bằng giá trị thật (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId).
5. Đổi `orgId` thành mã công ty của bạn, chữ thường không dấu, ví dụ `abc-hcm`. **Ghi lại orgId**, bước 5 sẽ dùng.
6. Mở `.firebaserc`, thay `DIEN_PROJECT_ID` bằng Project ID ở bước 1.

> Các thông số này không phải mật khẩu, đưa lên GitHub được. Bảo mật nằm ở `firestore.rules` và danh sách thành viên.

### Bước 3 — Bật đăng nhập
1. Menu trái **Build → Authentication → Get started**.
2. Tab **Sign-in method**:
   - Bật **Email/Password** → Save.
   - Bật **Google** → chọn email hỗ trợ → Save.
3. Tab **Settings → Authorized domains**: `localhost` và `<project-id>.web.app` đã có sẵn. Nếu sau này dùng tên miền riêng, thêm vào đây.

### Bước 4 — Tạo Firestore
1. Menu trái **Build → Firestore Database → Create database**.
2. **Location**: chọn `asia-southeast1 (Singapore)`. Sau này **không đổi được**.
3. Chọn **Start in production mode** → Create. (Quy tắc thật sẽ được nạp ở bước 6.)

### Bước 5 — Tạo tài khoản quản trị đầu tiên
App chỉ cho người có tên trong danh sách thành viên vào. Người đầu tiên phải thêm tay:

1. Chạy app (bước 6 hoặc chạy thử ở máy), bấm **Tạo tài khoản** bằng email của bạn (hoặc đăng nhập Google).
2. App báo "Tài khoản chưa được cấp quyền" và hiện **UID**. Bấm **Sao chép**.
3. Vào **Firestore Database → Data → + Start collection**:
   - Collection ID: `orgs` → Next
   - Document ID: *orgId của bạn* (ví dụ `abc-hcm`), thêm 1 field tạm `name` (string) = tên công ty → Save
4. Bấm vào document vừa tạo → **+ Start collection**:
   - Collection ID: `members` → Next
   - Document ID: *dán UID của bạn*
   - Field `role` (string) = `admin`
   - Field `email` (string) = email của bạn → Save
5. Tải lại app: bạn vào được, với quyền **Quản trị**. Từ giờ thêm người khác ngay trong app (menu **Thành viên**).

### Bước 6 — Cài Firebase CLI và đưa app lên mạng
```bash
npm install -g firebase-tools
firebase login                     # mở trình duyệt để đăng nhập Google
cd cong-tra-cuu-hoa-don
firebase use --add                 # chọn project vừa tạo, alias: default
firebase deploy --only hosting,firestore
```
Xong, app chạy ở `https://<project-id>.web.app`.

Muốn chạy ở máy với Firebase thật: `firebase serve --only hosting` rồi mở http://localhost:5000.

### Cách khác — Tự động deploy bằng GitHub Actions (không cần cài gì trên máy)
Repo có sẵn `.github/workflows/deploy.yml`: mỗi lần đẩy code lên nhánh `main`, GitHub tự deploy Hosting và Firestore rules.

1. Firebase Console → bánh răng **Project settings** → tab **Service accounts** → **Generate new private key** → **Generate key**. Máy tải về một file `.json`.
2. Mở file đó bằng Notepad, chọn tất cả, copy.
3. Trên GitHub: repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Secret: dán nội dung file JSON → **Add secret**.
4. Tab **Actions** → **Deploy Firebase** → **Run workflow**. Khoảng 1–2 phút sau app chạy ở `https://<project-id>.web.app`.
5. Xóa file `.json` trên máy sau khi dán xong. File này là khóa quản trị project, không gửi cho ai và không đưa vào code.

Nếu bước deploy báo lỗi `403` / `PERMISSION_DENIED`: Google Cloud Console → **IAM** → tìm tài khoản `firebase-adminsdk-…@<project-id>.iam.gserviceaccount.com` → **Edit** → thêm vai trò **Firebase Hosting Admin** và **Firebase Rules Admin** → Save, rồi chạy lại workflow.

## Cấp quyền người dùng

| Vai trò | Được làm gì |
|---|---|
| `admin` — Quản trị (kế toán trưởng) | Mọi việc, thêm/xóa thành viên |
| `ketoan` — Kế toán | Nhập, sửa, duyệt, xuất dữ liệu |
| `xem` — Chỉ xem | Xem và xuất báo cáo, không ghi dữ liệu lên máy chủ |

Người mới: tự **Tạo tài khoản** → gửi UID cho quản trị → quản trị vào **Thành viên**, dán UID, chọn vai trò → **Cấp quyền**.

## Bật AI đọc chứng từ (Cloud Functions)

Tính năng "Đọc bằng AI" và "Ảnh/PDF → Excel" gọi hàm `docAi` trên server, server gọi **Claude API**. Khóa API chỉ nằm trên server.

1. **Nâng project lên gói Blaze** (trả theo mức dùng): Console → góc dưới trái **Upgrade** → Blaze → liên kết thẻ thanh toán. Cloud Functions bắt buộc gói này. Nên đặt **Budget alert** (ví dụ 5 USD/tháng) trong Google Cloud Billing.
2. Lấy khóa Claude API tại https://console.anthropic.com → API Keys → Create Key.
3. Lưu khóa vào Secret Manager:
   ```bash
   firebase functions:secrets:set ANTHROPIC_API_KEY
   # dán khóa khi được hỏi
   ```
4. Deploy:
   ```bash
   cd functions && npm install && cd ..
   firebase deploy --only functions
   ```
5. Tùy chỉnh (không bắt buộc), tạo file `functions/.env`:
   ```
   AI_MODEL=claude-sonnet-5-5
   AI_DAILY_LIMIT=100
   ```
   `AI_DAILY_LIMIT` là số lượt đọc tối đa mỗi người mỗi ngày.

Hàm chạy ở vùng `asia-southeast1`. Nếu đổi vùng, sửa cả `functions/index.js` và `functionsRegion` trong `firebase-config.js`.

## Cập nhật app về sau

```bash
git pull
firebase deploy                    # deploy tất cả: hosting, firestore rules, functions
firebase deploy --only hosting     # chỉ cập nhật giao diện
```

Gợi ý: bật **GitHub Actions** để mỗi lần push lên nhánh `main` thì tự deploy: chạy `firebase init hosting:github` và làm theo hướng dẫn.

## Chi phí Firebase

- **Gói Spark (miễn phí)**: đủ cho Hosting + Authentication + Firestore ở quy mô một phòng kế toán (giới hạn miễn phí của Firestore: 1 GiB dữ liệu, 50.000 lượt đọc và 20.000 lượt ghi mỗi ngày).
- **Gói Blaze**: chỉ cần khi bật Cloud Functions (AI). Phần lớn chi phí là lượt gọi Claude API, tính theo số ảnh đọc. Giới hạn bằng `AI_DAILY_LIMIT` và budget alert.

Hạn mức có thể thay đổi, xem bảng giá chính thức: https://firebase.google.com/pricing

## Xử lý lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Trang trắng, console báo lỗi module | Đang mở bằng `file://`. Chạy qua web server (xem "Chạy thử ngay"). |
| "Tài khoản chưa được cấp quyền" | Quản trị chưa thêm UID của bạn vào Thành viên, hoặc `orgId` trong config khác với document trong Firestore. |
| "Tên miền này chưa được thêm…" | Authentication → Settings → Authorized domains → thêm tên miền. |
| "Tài khoản không có quyền ghi dữ liệu" | Vai trò đang là `xem`, hoặc chưa deploy `firestore.rules`. |
| AI báo "cần cấu hình Firebase" | Chưa đăng nhập, hoặc chưa deploy Functions. |
| AI báo "Server chưa có khóa API" | Chạy lại `firebase functions:secrets:set ANTHROPIC_API_KEY` rồi deploy functions. |
| Xem log server | `firebase functions:log` |
