/* ============================================================
   Đăng nhập Microsoft 365 bằng MSAL (msal-browser) — CHỈ quyền User.Read.
   Cung cấp window.Auth:
     init / signIn / signOut / getAccount / isAllowed
     getIdToken() -> JWT do Microsoft ký (aud = clientId) gửi cho máy chủ;
                     máy chủ tự xác minh chữ ký, tenant và đuôi email.
   ============================================================ */
(function () {
  const cfg = window.APP_CONFIG;
  const DOMAIN = "@" + String(cfg.allowedEmailDomain || "").toLowerCase();

  const msalConfig = {
    auth: {
      clientId: cfg.clientId,
      authority: "https://login.microsoftonline.com/" + cfg.tenantId,
      redirectUri: cfg.redirectUri,
      postLogoutRedirectUri: cfg.redirectUri
    },
    cache: {
      cacheLocation: "sessionStorage",   // đóng tab/trình duyệt là hết phiên
      storeAuthStateInCookie: false
    }
  };

  const pca = new msal.PublicClientApplication(msalConfig);
  let account = null;
  let redirecting = false;

  // Tài khoản hợp lệ = ĐÚNG tenant công ty VÀ email đuôi @ckthanhdat.vn.
  function isAllowed(acc) {
    if (!acc) return false;
    const claims = acc.idTokenClaims || {};
    const tid = String(claims.tid || acc.tenantId || "").toLowerCase();
    const email = String(acc.username || claims.preferred_username || "").toLowerCase();
    return tid === String(cfg.tenantId).toLowerCase()
      && DOMAIN.length > 1
      && email.endsWith(DOMAIN);
  }

  async function silent(forceRefresh) {
    if (!account) throw new Error("Chưa đăng nhập Microsoft 365");
    try {
      return await pca.acquireTokenSilent({ scopes: cfg.graphScopes, account, forceRefresh: !!forceRefresh });
    } catch (e) {
      if (e instanceof msal.InteractionRequiredAuthError && !redirecting) {
        redirecting = true;
        await pca.acquireTokenRedirect({ scopes: cfg.graphScopes, account });
      }
      throw e;
    }
  }

  const Auth = {
    isAllowed,

    async init() {
      await pca.initialize();
      const resp = await pca.handleRedirectPromise();
      if (resp && resp.account) {
        account = resp.account;
      } else {
        const accts = pca.getAllAccounts();
        account = accts.find(isAllowed) || accts[0] || null;
      }
      if (account) pca.setActiveAccount(account);
      return account;
    },

    getAccount() { return account; },

    async signIn() {
      await pca.loginRedirect({
        scopes: cfg.graphScopes,
        prompt: "select_account",
        domainHint: cfg.allowedEmailDomain
      });
    },

    async signOut() {
      await pca.logoutRedirect({ account: account || undefined });
    },

    // ID token (JWT ký bởi Microsoft) để máy chủ xác minh danh tính.
    async getIdToken() {
      if (!isAllowed(account)) throw new Error("Tài khoản không được phép dùng hệ thống");
      let r = await silent(false);
      const exp = (r.idTokenClaims && r.idTokenClaims.exp) || 0;
      if (!r.idToken || exp * 1000 < Date.now() + 120000) {
        r = await silent(true);   // sắp hết hạn -> làm mới
      }
      return r.idToken;
    }
  };

  window.Auth = Auth;
})();
