/* ============================================================
   Cấu hình kết nối Microsoft 365 cho bản web (SPA).
   clientId/tenantId là ĐỊNH DANH CÔNG KHAI (không phải mật khẩu).
   App CHỈ xin quyền User.Read (ảnh hưởng thấp — nhân viên tự đồng ý được,
   KHÔNG cần quản trị viên phê duyệt). Việc đọc/ghi file kế hoạch do MÁY CHỦ
   đảm nhiệm, có kiểm tra token @ckthanhdat.vn; trình duyệt không chạm SharePoint.
   TUYỆT ĐỐI không đặt khóa API / mật khẩu / file dữ liệu trong thư mục web.
   ============================================================ */
window.APP_CONFIG = {
  // Microsoft Entra ID (Azure AD)
  tenantId: "2a19d75e-f60b-4a77-913c-5b28b27bef09",
  clientId: "3a219e32-7e6f-40df-84a8-b25a1f8f5ded",
  // Redirect về đúng origin đang chạy (localhost:5173 khi dev, URL thật khi host).
  redirectUri: window.location.origin,

  // CHỈ tài khoản thuộc tên miền này (và đúng tenant ở trên) mới được dùng app.
  allowedEmailDomain: "ckthanhdat.vn",

  // Quyền Microsoft Graph: CHỈ User.Read (để xác định danh tính). Đây là quyền
  // "ảnh hưởng thấp" nên người dùng tự bấm Chấp nhận, không cần admin.
  graphScopes: ["User.Read"],

  // Máy chủ xử lý TẤT CẢ dữ liệu (đọc/ghi file kế hoạch, CP-SAT, Trợ lý AI,
  // xuất Excel). Mỗi lời gọi đều kèm ID token Microsoft 365; máy chủ tự xác
  // minh chữ ký + tên miền email trước khi phục vụ.
  // Máy chủ hiện tại: Hugging Face Space. Muốn quay lại Render (dự phòng) chỉ cần
  // đổi dòng dưới sang "https://kehoachsanxuat-spot-github-io.onrender.com"
  // (CSP trong index.html đã cho phép cả hai).
  solverApiBase: "https://ovcopenclaw-webapp.hf.space"
};
