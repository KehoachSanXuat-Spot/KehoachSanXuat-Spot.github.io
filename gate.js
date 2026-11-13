/* ============================================================
   Cổng đăng nhập BẮT BUỘC Microsoft 365:
   - Chỉ tài khoản ĐÚNG tenant công ty VÀ email @ckthanhdat.vn mới được vào.
   - Chỉ sau khi xác thực mới nạp three.js, xlsx và app.js.
   LƯU Ý: đây chỉ là lớp giao diện. Lớp bảo vệ thật nằm ở Microsoft Graph
   (dữ liệu SharePoint cần token) và ở backend (tự xác minh token).
   ============================================================ */
(function () {
  function qs(id) { return document.getElementById(id); }

  function setBtn(btn, icon, label, disabled) {
    if (!btn) return;
    btn.disabled = !!disabled;
    btn.textContent = "";
    const a = document.createElement("span"); a.textContent = icon;
    const b = document.createElement("span"); b.textContent = label;
    btn.appendChild(a); btn.appendChild(b);
  }

  function friendlyAuthError(e) {
    const raw = String((e && (e.errorMessage || e.message)) || e || "");
    const domain = (window.APP_CONFIG || {}).allowedEmailDomain || "";
    if (/AADSTS50020|AADSTS90072|AADSTS50177|AADSTS700016/.test(raw)) {
      return "Tài khoản vừa chọn không thuộc tổ chức " + domain + ".\nHãy đăng nhập bằng email công ty (…@" + domain + ").";
    }
    if (/AADSTS65001|AADSTS65004|AADSTS90094|consent/i.test(raw)) {
      return "Ứng dụng chưa được cấp quyền đọc file SharePoint.\nHãy bấm Chấp nhận ở màn hình xin quyền của Microsoft; nếu Microsoft báo \"Cần quản trị viên phê duyệt\" thì nhờ IT cấp quyền cho ứng dụng \"Xưởng Hàn Spot\".";
    }
    if (/AADSTS50011|redirect/i.test(raw)) {
      return "Địa chỉ trang web này chưa được đăng ký Redirect URI trong Entra ID (" + window.location.origin + ").";
    }
    if (/user_cancelled|access_denied/i.test(raw)) {
      return "Bạn đã hủy đăng nhập. Bấm nút bên trên để thử lại.";
    }
    return "Lỗi đăng nhập Microsoft 365: " + raw.slice(0, 300);
  }

  async function boot() {
    const gate = qs("authGate");
    const errEl = qs("authErr");
    const btn = qs("signInBtn");
    const who = qs("authWho");

    function showErr(m) {
      if (!errEl) return;
      errEl.textContent = m || "";
      errEl.style.display = m ? "block" : "none";
    }
    function armSignIn() {
      setBtn(btn, "🔒", "Đăng nhập Microsoft 365", false);
      if (!btn) return;
      btn.onclick = async function () {
        showErr("");
        setBtn(btn, "⏳", "Đang chuyển tới Microsoft 365...", true);
        try {
          await window.Auth.signIn();
        } catch (e) {
          armSignIn();
          showErr(friendlyAuthError(e));
        }
      };
    }

    // Chống nhúng trang vào iframe của site khác (clickjacking)
    if (window.top !== window.self) {
      showErr("Vì lý do bảo mật, ứng dụng không chạy khi bị nhúng trong trang khác. Hãy mở trực tiếp " + window.location.origin);
      setBtn(btn, "⛔", "Không khả dụng", true);
      return;
    }

    if (!window.msal || !window.Auth) {
      showErr("Không tải được thư viện đăng nhập Microsoft (MSAL). Kiểm tra kết nối mạng rồi tải lại trang.");
      setBtn(btn, "🔄", "Tải lại trang", false);
      if (btn) btn.onclick = function () { window.location.reload(); };
      return;
    }

    setBtn(btn, "⏳", "Đang kiểm tra phiên đăng nhập...", true);
    let account = null;
    try {
      account = await window.Auth.init();
    } catch (e) {
      armSignIn();
      showErr(friendlyAuthError(e));
      return;
    }

    if (!account) { armSignIn(); return; }

    // KIỂM TRA: đúng tenant công ty VÀ đúng đuôi email
    if (!window.Auth.isAllowed(account)) {
      const domain = (window.APP_CONFIG || {}).allowedEmailDomain || "";
      showErr("⛔ TỪ CHỐI TRUY CẬP\nTài khoản \"" + (account.username || "") + "\" không phải email @" + domain + ".\nBấm nút bên trên để đăng xuất và đăng nhập lại bằng email công ty.");
      setBtn(btn, "🔄", "Đổi tài khoản Microsoft 365", false);
      if (btn) btn.onclick = function () {
        setBtn(btn, "⏳", "Đang đăng xuất...", true);
        window.Auth.signOut();
      };
      return;
    }

    if (who) who.textContent = "Đã xác thực: " + (account.name || account.username);
    setBtn(btn, "⏳", "Đang mở hệ thống điều độ...", true);
    startApp(gate, account, showErr, btn);
  }

  function startApp(gate, account, showErr, btn) {
    // integrity (SRI): trình duyệt từ chối chạy nếu file trên CDN bị sửa đổi
    const scripts = [
      { src: "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js",
        sri: "sha384-qOkzR5Ke/XkQxuGVJ9hpFEpDlcoLtWwVYhnJf06cLIZa2vaIptSqaubivErzmD5O" },
      { src: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
        sri: "sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw" },
      { src: "./assets/app.js?v=" + (window.APP_BUILD_ID || "") }
    ];
    (function next(i) {
      if (i >= scripts.length) {
        // Chỉ gỡ cổng khi toàn bộ ứng dụng đã nạp xong (tránh màn hình trống)
        if (gate && gate.parentNode) gate.parentNode.removeChild(gate);
        setupUserHeader(account);
        return;
      }
      const s = document.createElement("script");
      s.src = scripts[i].src;
      if (scripts[i].sri) { s.integrity = scripts[i].sri; s.crossOrigin = "anonymous"; }
      s.onload = function () { next(i + 1); };
      s.onerror = function () {
        showErr("Không tải được thành phần: " + scripts[i].src + "\nKiểm tra kết nối mạng rồi tải lại trang.");
        setBtn(btn, "🔄", "Tải lại trang", false);
        if (btn) btn.onclick = function () { window.location.reload(); };
      };
      document.body.appendChild(s);
    })(0);
  }

  function setupUserHeader(account) {
    const nameEl = document.getElementById("userAccountName");
    const outBtn = document.getElementById("userSignOutBtn");
    if (nameEl && account) {
      nameEl.textContent = account.name || account.username;
      nameEl.title = account.username;
    }
    if (outBtn) {
      outBtn.onclick = function () {
        if (confirm("Bạn có chắc muốn đăng xuất khỏi tài khoản Microsoft 365?")) {
          window.Auth.signOut();
        }
      };
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
