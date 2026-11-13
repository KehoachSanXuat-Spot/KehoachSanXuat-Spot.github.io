/* ============================================================
   Fetch-shim: chuyển mọi lời gọi "/api/..." của app.js sang MÁY CHỦ (Render),
   kèm ID token Microsoft 365. Nhờ vậy:
     - Trình duyệt KHÔNG chạm SharePoint/Graph (chỉ cần quyền User.Read).
     - Máy chủ tự xác minh token + đuôi email @ckthanhdat.vn rồi mới đọc/ghi
       file kế hoạch, giải CP-SAT, chạy Trợ lý AI, xuất Excel.
   app.js và giao diện GIỮ NGUYÊN.
   ============================================================ */
(function () {
  const origFetch = window.fetch.bind(window);
  const cfg = window.APP_CONFIG || {};
  const solverBase = String(cfg.solverApiBase || "").trim().replace(/\/+$/, "");

  function jsonResp(obj, status) {
    return new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  function timeoutSignal(ms) {
    return (window.AbortSignal && AbortSignal.timeout) ? AbortSignal.timeout(ms) : undefined;
  }
  function backendFailMsg(e) {
    const m = String((e && e.message) || e || "");
    if (/timeout|abort/i.test(m)) return "Máy chủ phản hồi quá lâu (có thể đang khởi động lại, ~1 phút). Vui lòng thử lại.";
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại sau ~1 phút.";
    return m;
  }

  // Gọi máy chủ: giữ nguyên path + query, đính kèm token, đặt timeout.
  async function toBackend(u, init, timeoutMs) {
    if (!solverBase) throw new Error("Chưa cấu hình máy chủ (solverApiBase).");
    const idToken = await window.Auth.getIdToken();
    const headers = new Headers((init && init.headers) || {});
    headers.set("Authorization", "Bearer " + idToken);
    const opts = Object.assign({}, init || {}, { headers });
    const sig = timeoutMs ? timeoutSignal(timeoutMs) : undefined;
    if (sig) opts.signal = sig;
    return origFetch(solverBase + u.pathname + u.search, opts);
  }

  async function handle(url, init) {
    const u = new URL(url, window.location.origin);
    const p = u.pathname;

    // --- Cục bộ, không cần máy chủ ---
    if (p === "/api/heartbeat") return jsonResp({ ok: true });            // web không có server cục bộ để giữ sống
    if (p === "/api/shutdown") return jsonResp({ status: "noop" });
    if (p === "/api/health") return jsonResp({ status: "ok", mode: "web" });
    if (p === "/api/ai/login") {
      return jsonResp({ success: false, message: "Bản web không đăng nhập Google: AI dùng khóa API do quản trị cấu hình trên máy chủ." });
    }

    // --- Trạng thái AI: máy chủ Render có thể đang ngủ ---
    if (p === "/api/ai/status") {
      try {
        const r = await toBackend(u, { method: "GET" }, 8000);
        if (r.ok) return r;
      } catch (e) {}
      // Đánh thức nền, báo trạng thái thật
      toBackend(u, { method: "GET" }, 90000).catch(() => {});
      return jsonResp({
        ok: true, mode: "offline", default_model: "quy tắc tại chỗ",
        status_text: "🟡 Máy chủ AI đang khởi động (~1 phút) — tạm dùng bộ phân tích quy tắc tại chỗ"
      });
    }

    // --- Chat AI: lỗi -> để app.js tự phân tích bằng bộ quy tắc ---
    if (p === "/api/ai/chat") {
      try {
        const r = await toBackend(u, init, 75000);
        if (r.ok) return r;
        const d = await r.json().catch(() => ({}));
        return jsonResp({ ok: false, fallback: true, detail: d.detail || ("HTTP " + r.status) });
      } catch (e) {
        return jsonResp({ ok: false, fallback: true, detail: backendFailMsg(e) });
      }
    }

    // --- CP-SAT & xuất Excel: nặng, cần timeout dài ---
    if (p === "/api/solve" || p === "/api/export/schedule") {
      try { return await toBackend(u, init, 180000); }
      catch (e) { return jsonResp({ detail: backendFailMsg(e) }, 503); }
    }

    // --- Đọc/ghi file kế hoạch + mọi /api khác -> máy chủ ---
    if (p.indexOf("/api/") === 0) {
      try { return await toBackend(u, init, 60000); }
      catch (e) { return jsonResp({ detail: backendFailMsg(e) }, 503); }
    }

    return origFetch(url, init);
  }

  window.fetch = function (input, init) {
    try {
      const url = (typeof input === "string") ? input : (input && input.url) || "";
      if (url) {
        const u = new URL(url, window.location.origin);
        // Chỉ chặn lời gọi /api/ tới CHÍNH origin này (app.js); không đụng tới MSAL/CDN
        if (u.origin === window.location.origin && u.pathname.indexOf("/api/") === 0) {
          return handle(url, init);
        }
      }
    } catch (e) { /* URL lỗi -> để fetch gốc xử lý */ }
    return origFetch(input, init);
  };
})();
