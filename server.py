"""
Server API cho Hệ thống Điều Độ Hàn Spot (FJSP)
==============================================
Chạy bằng: uvicorn server:app --host 127.0.0.1 --port 8000
Hoặc nhấp đúp file: Run_Xuong_Spot_TD.bat
"""

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
import os
import sys
import time
import threading
import logging

from fjsp_solver import solve_fjsp

# Logger: ghi chi tiết lỗi (kèm traceback) ra server để debug, KHÔNG lộ ra client.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("xuong_spot")

app = FastAPI(title="Dieu Do Han Spot - FJSP Backend API")

# ============================================================
# CHẾ ĐỘ CLOUD (Render...) — bảo mật bắt buộc
# ------------------------------------------------------------
# Khi chạy trên Internet (biến môi trường RENDER do Render tự đặt, hoặc tự đặt
# REQUIRE_AUTH=1), MỌI lời gọi /api/* phải kèm ID token Microsoft 365 hợp lệ:
#   - do đúng tenant công ty ký (kiểm tra chữ ký qua JWKS của Microsoft)
#   - cấp cho đúng ứng dụng (aud = client id)
#   - email đuôi @ckthanhdat.vn
# Đồng thời các endpoint đọc/ghi file Excel cục bộ, tắt server, đăng nhập
# Gemini bằng trình duyệt bị VÔ HIỆU trên cloud (dữ liệu chỉ nằm ở SharePoint).
# Chạy trên máy cá nhân (run.bat, 127.0.0.1) thì giữ nguyên như cũ.
# ============================================================
CLOUD_MODE = (os.environ.get("REQUIRE_AUTH", "").strip() == "1") or bool(os.environ.get("RENDER"))
ENTRA_TENANT_ID = os.environ.get("ENTRA_TENANT_ID", "2a19d75e-f60b-4a77-913c-5b28b27bef09").strip().lower()
ENTRA_CLIENT_ID = os.environ.get("ENTRA_CLIENT_ID", "3a219e32-7e6f-40df-84a8-b25a1f8f5ded").strip().lower()
ALLOWED_EMAIL_DOMAIN = os.environ.get("ALLOWED_EMAIL_DOMAIN", "ckthanhdat.vn").strip().lower().lstrip("@")
# Trên cloud, bản web chỉ làm việc với MỘT file kế hoạch (không cho chọn tên tuỳ ý
# từ client -> tránh path traversal và lộ file khác). Đổi bằng biến môi trường PLAN_FILE.
PLAN_FILE_NAME = os.path.basename(os.environ.get("PLAN_FILE", "KeHoach_HanSpot.xlsx").strip() or "KeHoach_HanSpot.xlsx")

_ALLOWED_ORIGINS = [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://kehoachsanxuat-spot.github.io",
]
_extra_origins = os.environ.get("ALLOWED_ORIGINS", "").strip()
if _extra_origins:
    # Không chấp nhận "*": chỉ nhận danh sách origin cụ thể, cách nhau bởi dấu phẩy.
    _ALLOWED_ORIGINS += [o.strip().rstrip("/") for o in _extra_origins.split(",") if o.strip() and o.strip() != "*"]

_jwk_client = None


def _verify_ms_token(token: str) -> Dict[str, Any]:
    """Xác minh ID token Microsoft Entra (chữ ký, hạn, tenant, ứng dụng, tên miền email)."""
    global _jwk_client
    import jwt  # PyJWT[crypto]
    if _jwk_client is None:
        _jwk_client = jwt.PyJWKClient(
            f"https://login.microsoftonline.com/{ENTRA_TENANT_ID}/discovery/v2.0/keys",
            cache_keys=True, lifespan=3600,
        )
    key = _jwk_client.get_signing_key_from_jwt(token).key
    claims = jwt.decode(
        token, key, algorithms=["RS256"],
        audience=ENTRA_CLIENT_ID,
        issuer=f"https://login.microsoftonline.com/{ENTRA_TENANT_ID}/v2.0",
        options={"require": ["exp", "iat", "aud", "iss"]},
        leeway=60,
    )
    if str(claims.get("tid", "")).lower() != ENTRA_TENANT_ID:
        raise ValueError("sai tenant")
    email = str(claims.get("preferred_username") or claims.get("email") or claims.get("upn") or "").lower()
    if not ALLOWED_EMAIL_DOMAIN or not email.endswith("@" + ALLOWED_EMAIL_DOMAIN):
        raise ValueError("email ngoai to chuc")
    return {"email": email, "name": claims.get("name", ""), "oid": claims.get("oid", "")}


# Giới hạn tần suất theo người dùng (bảo vệ hạn mức AI miễn phí và CPU của CP-SAT)
_rate_lock = threading.Lock()
_rate_hits: Dict[str, List[float]] = {}
_RATE_LIMITS = {"/api/ai/chat": (15, 60.0), "/api/solve": (6, 60.0), "/api/export/schedule": (20, 60.0)}


def _rate_ok(user: str, path: str) -> bool:
    lim = _RATE_LIMITS.get(path)
    if not lim:
        return True
    n, window = lim
    now = time.time()
    k = user + "|" + path
    with _rate_lock:
        hits = [t for t in _rate_hits.get(k, []) if now - t < window]
        if len(hits) >= n:
            _rate_hits[k] = hits
            return False
        hits.append(now)
        _rate_hits[k] = hits
        if len(_rate_hits) > 5000:
            _rate_hits.clear()
    return True


# Endpoint chỉ dành cho bản chạy trên máy cá nhân -> tắt hẳn trên cloud
# /api/excel/* nay ĐƯỢC phục vụ trên cloud (đã qua kiểm tra token + chỉ thao tác PLAN_FILE_NAME).
_LOCAL_ONLY_PREFIXES = ("/api/shutdown", "/api/ai/login", "/assets", "/favicon.ico")
_PUBLIC_PATHS = ("/api/health",)
_MAX_BODY_BYTES = 8 * 1024 * 1024


@app.middleware("http")
async def _cloud_guard(request: Request, call_next):
    if not CLOUD_MODE or request.method == "OPTIONS":
        return await call_next(request)
    path = request.url.path
    if path in _PUBLIC_PATHS:
        return await call_next(request)
    if path == "/" or any(path.startswith(pfx) for pfx in _LOCAL_ONLY_PREFIXES):
        return JSONResponse({"detail": "Không khả dụng"}, status_code=404)
    try:
        if int(request.headers.get("content-length") or 0) > _MAX_BODY_BYTES:
            return JSONResponse({"detail": "Dữ liệu gửi lên quá lớn"}, status_code=413)
    except ValueError:
        return JSONResponse({"detail": "Yêu cầu không hợp lệ"}, status_code=400)
    auth_header = request.headers.get("authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        return JSONResponse({"detail": "Cần đăng nhập Microsoft 365"}, status_code=401)
    try:
        user = _verify_ms_token(auth_header[7:].strip())
    except Exception as e:
        logger.warning("Tu choi token: %s", type(e).__name__)
        return JSONResponse(
            {"detail": "Phiên đăng nhập không hợp lệ hoặc tài khoản không thuộc @" + ALLOWED_EMAIL_DOMAIN},
            status_code=401,
        )
    if not _rate_ok(user["email"], path):
        return JSONResponse({"detail": "Bạn thao tác quá nhanh, vui lòng chờ một phút rồi thử lại"}, status_code=429)
    request.state.user = user
    return await call_next(request)


# ============================================================
# Tự động tắt server khi đóng ứng dụng (trình duyệt) — Watchdog
# ------------------------------------------------------------
# Khi chạy ẩn cửa sổ (qua run.bat), đặt AUTO_SHUTDOWN=1. Trình duyệt gửi
# nhịp tim (/api/heartbeat) đều đặn; nếu không còn tab nào gửi nhịp sau
# IDLE_TIMEOUT giây, server tự thoát -> cửa sổ ẩn cũng đóng theo.
# Đóng 1 tab mà còn tab khác vẫn mở thì server vẫn sống (an toàn đa tab).
# ============================================================
_AUTO_SHUTDOWN = os.environ.get("AUTO_SHUTDOWN", "0") == "1"
_IDLE_TIMEOUT = int(os.environ.get("IDLE_TIMEOUT", "25"))   # giây không có nhịp -> tắt
_GRACE_PERIOD = int(os.environ.get("GRACE_PERIOD", "40"))   # giây chờ trình duyệt mở lần đầu
_server_start_ts = time.time()
_last_heartbeat_ts = time.time()


@app.middleware("http")
async def _touch_heartbeat(request: Request, call_next):
    # Bất kỳ request nào từ giao diện cũng tính là còn sống
    global _last_heartbeat_ts
    _last_heartbeat_ts = time.time()
    return await call_next(request)


@app.get("/api/heartbeat")
def heartbeat():
    global _last_heartbeat_ts
    _last_heartbeat_ts = time.time()
    return {"ok": True, "t": _last_heartbeat_ts}


def _is_same_origin_request(request: Request) -> bool:
    """Chỉ chấp nhận request từ ĐÚNG origin của giao diện (so khớp chính xác, không so chuỗi con)."""
    host = request.headers.get("host") or ""
    origin = (request.headers.get("origin") or "").rstrip("/")
    referer = request.headers.get("referer") or ""

    def _ok(o: str) -> bool:
        if o in _ALLOWED_ORIGINS:
            return True
        return bool(host) and o.split("://", 1)[-1] == host

    if origin:
        return _ok(origin)
    if referer:
        parts = referer.split("/")
        return _ok("/".join(parts[:3])) if len(parts) >= 3 else False
    # Không có Origin/Referer: công cụ dòng lệnh trên chính máy này (server chỉ bind 127.0.0.1)
    return not CLOUD_MODE


@app.post("/api/shutdown")
def shutdown_now(request: Request):
    """Tắt server ngay theo yêu cầu (vd nút Thoát). Chỉ nhận từ chính giao diện."""
    if not _is_same_origin_request(request):
        raise HTTPException(status_code=403, detail="Chặn yêu cầu tắt server từ nguồn lạ")
    threading.Timer(0.3, lambda: os._exit(0)).start()
    return {"status": "shutting_down"}


def _watchdog_loop():
    _dbg = os.environ.get("WD_DEBUG") == "1"
    while True:
        time.sleep(5)
        now = time.time()
        if _dbg:
            print(f"[WD] since_start={now-_server_start_ts:.1f} since_beat={now-_last_heartbeat_ts:.1f}", flush=True)
        if (now - _server_start_ts) < _GRACE_PERIOD:
            continue
        if (now - _last_heartbeat_ts) > _IDLE_TIMEOUT:
            # Không còn trình duyệt nào kết nối -> tự thoát
            if _dbg:
                print("[WD] idle -> exit", flush=True)
            os._exit(0)


if _AUTO_SHUTDOWN:
    threading.Thread(target=_watchdog_loop, daemon=True).start()

# CORS thêm SAU CÙNG để là lớp ngoài cùng: phản hồi 401/404/429 của lớp bảo vệ
# vẫn có header CORS, trình duyệt đọc được thông báo lỗi.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=3600,
)


class SolvePayload(BaseModel):
    model: Dict[str, Any]
    time_limit: Optional[float] = 25.0
    num_workers: Optional[int] = 8
    breaks: Optional[List[Dict[str, Any]]] = None
    downtimes: Optional[List[Dict[str, Any]]] = None
    min_start_time: Optional[int] = 0
    frozen_intervals: Optional[List[Dict[str, Any]]] = None
    shift_length: Optional[int] = 540
    sublot_size: Optional[int] = 500
    machine_shifts: Optional[List[Dict[str, Any]]] = None

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "FJSP Spot Welding CP-SAT Backend",
        "ortools": True
    }

@app.post("/api/solve")
def solve_endpoint(payload: SolvePayload):
    try:
        result = solve_fjsp(
            model_data=payload.model,
            time_limit=max(1.0, min(float(payload.time_limit or 25.0), 120.0)),
            num_workers=max(1, min(int(payload.num_workers or 8), 8)),
            breaks=payload.breaks,
            downtimes=payload.downtimes,
            min_start_time=payload.min_start_time or 0,
            frozen_intervals=payload.frozen_intervals,
            shift_length=payload.shift_length or 540,
            sublot_size=payload.sublot_size if payload.sublot_size is not None else 500,
            machine_shifts=payload.machine_shifts
        )
        return result
    except Exception as e:
        logger.exception("Loi /api/solve")
        raise HTTPException(status_code=500, detail="Khong giai duoc lich dieu do (xem log server).")

def get_workspace_dir() -> str:
    return os.path.dirname(os.path.abspath(__file__))

# Phục vụ thư mục assets (icon/favicon...) để web dùng được qua /assets/...
try:
    from fastapi.staticfiles import StaticFiles
    _assets_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
    if os.path.isdir(_assets_dir):
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")
except Exception as _e:
    print(f"[WARN] Khong mount duoc /assets: {_e}")


@app.get("/favicon.ico")
def favicon():
    ico = os.path.join(get_workspace_dir(), "assets", "Weld_CP-SAT.ico")
    if os.path.exists(ico):
        return FileResponse(ico, media_type="image/x-icon")
    raise HTTPException(status_code=404, detail="favicon not found")

def read_excel_bytes_safe(filepath: str, max_retries: int = 5, delay: float = 0.25) -> bytes:
    for _ in range(max_retries):
        try:
            with open(filepath, "rb") as f:
                return f.read()
        except PermissionError:
            time.sleep(delay)
    with open(filepath, "rb") as f:
        return f.read()

# ============================================================
# KHO LƯU FILE KẾ HOẠCH (cloud): repo GitHub RIÊNG TƯ qua GitHub API.
#   PLAN_REPO    = "owner/ten-repo-rieng-tu"
#   PLAN_BRANCH  = nhánh (mặc định main)
#   GITHUB_TOKEN = PAT fine-grained, quyền Contents: Read and write trên repo đó
# Nếu KHÔNG cấu hình GitHub mà vẫn CLOUD_MODE -> dùng file trên đĩa (hợp với
# kiểu chạy backend ngay trên PC + Cloudflare Tunnel).
# ============================================================
import io as _io
import json as _json
import base64 as _b64
import calendar as _cal
import re as _re_top
import urllib.request as _ureq
import urllib.parse as _uparse
import urllib.error as _uerr

PLAN_REPO = os.environ.get("PLAN_REPO", "").strip() or "KehoachSanXuat-Spot/dieu-do-data"
PLAN_BRANCH = os.environ.get("PLAN_BRANCH", "main").strip() or "main"
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
USE_GITHUB = bool(CLOUD_MODE and PLAN_REPO and GITHUB_TOKEN)

_gh_lock = threading.Lock()
_gh_meta_cache = {"at": 0.0, "exists": False, "mtime": 0.0, "by": "", "sha": None}
_GH_META_TTL = 8.0


def _req_email(request) -> str:
    u = getattr(getattr(request, "state", None), "user", None)
    return u.get("email", "") if isinstance(u, dict) else ""


def _gh_api(method, path, body=None):
    req = _ureq.Request(
        "https://api.github.com" + path,
        data=(_json.dumps(body).encode("utf-8") if body is not None else None),
        method=method,
        headers={
            "Authorization": "Bearer " + GITHUB_TOKEN,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "xuong-spot-td",
            "Content-Type": "application/json",
        },
    )
    with _ureq.urlopen(req, timeout=30) as r:
        raw = r.read()
    return _json.loads(raw.decode("utf-8")) if raw else {}


def _gh_file_q():
    return _uparse.quote(PLAN_FILE_NAME)


def _gh_get_file():
    """Trả (bytes, sha) của file kế hoạch trong repo riêng tư."""
    d = _gh_api("GET", "/repos/%s/contents/%s?ref=%s" % (PLAN_REPO, _gh_file_q(), _uparse.quote(PLAN_BRANCH)))
    sha = d.get("sha")
    if d.get("encoding") == "base64" and d.get("content"):
        return _b64.b64decode(d["content"]), sha
    b = _gh_api("GET", "/repos/%s/git/blobs/%s" % (PLAN_REPO, sha))   # file >1MB
    return _b64.b64decode(b.get("content", "")), sha


def _gh_meta(force=False):
    now = time.time()
    with _gh_lock:
        if not force and _gh_meta_cache["at"] and now - _gh_meta_cache["at"] < _GH_META_TTL:
            return dict(_gh_meta_cache)
    meta = {"at": now, "exists": False, "mtime": 0.0, "by": "", "sha": None}
    try:
        commits = _gh_api("GET", "/repos/%s/commits?path=%s&sha=%s&per_page=1"
                          % (PLAN_REPO, _gh_file_q(), _uparse.quote(PLAN_BRANCH)))
        if commits:
            c = commits[0]
            date = c.get("commit", {}).get("committer", {}).get("date", "")
            try:
                meta["mtime"] = float(_cal.timegm(time.strptime(date, "%Y-%m-%dT%H:%M:%SZ")))
            except Exception:
                meta["mtime"] = 0.0
            m = _re_top.search(r"[\w.+-]+@[\w.-]+\.\w+", c.get("commit", {}).get("message", "") or "")
            meta["by"] = m.group(0) if m else ""
            meta["exists"] = True
            meta["sha"] = c.get("sha")
    except _uerr.HTTPError as e:
        if e.code != 404:
            raise
    with _gh_lock:
        _gh_meta_cache.update(meta)
    return dict(meta)


def _gh_put(content_bytes, user_email, sha):
    body = {
        "message": "Cập nhật kế hoạch bởi %s" % (user_email or "web"),
        "content": _b64.b64encode(content_bytes).decode("ascii"),
        "branch": PLAN_BRANCH,
    }
    if sha:
        body["sha"] = sha
    _gh_api("PUT", "/repos/%s/contents/%s" % (PLAN_REPO, _gh_file_q()), body)
    return _gh_meta(force=True)


# ============================================================
# KHO LƯU QUA POWER AUTOMATE (cloud): đồng bộ 2 chiều với file Excel
# trên SharePoint mà KHÔNG cần admin consent — flow chạy bằng kết nối
# SharePoint của chính người tạo flow (@ckthanhdat.vn).
#   PA_FLOW_URL = URL HTTP của flow "When an HTTP request is received"
#   PA_SECRET   = chuỗi bí mật backend gửi kèm để flow từ chối người lạ
# Backend GỬI dữ liệu có cấu trúc (không ghi đè cả file) -> flow dùng
# Office Scripts sửa đúng ô, giữ nguyên công thức/định dạng Excel.
# Thứ tự ưu tiên kho: Power Automate > GitHub > đĩa.
# ============================================================
PA_FLOW_URL = os.environ.get("PA_FLOW_URL", "").strip()
PA_SECRET = os.environ.get("PA_SECRET", "").strip()
USE_POWER_AUTOMATE = bool(CLOUD_MODE and PA_FLOW_URL)

_pa_lock = threading.Lock()
_pa_meta_cache = {"at": 0.0, "exists": False, "mtime": 0.0, "by": ""}
_PA_META_TTL = 8.0


def _pa_parse_time(s) -> float:
    """ISO 8601 (trường 'Modified' của SharePoint) -> epoch giây; 0.0 nếu lỗi."""
    if not s:
        return 0.0
    import datetime as _dt
    txt = str(s).strip().replace("Z", "+00:00")
    try:
        return _dt.datetime.fromisoformat(txt).timestamp()
    except Exception:
        pass
    try:
        return _dt.datetime.fromisoformat(txt[:19]).timestamp()
    except Exception:
        return 0.0


def _pa_call(action: str, extra: dict = None, timeout: int = 60) -> dict:
    """Gọi flow Power Automate (POST JSON). Trả dict JSON; ném lỗi nếu ok=false."""
    if not PA_FLOW_URL:
        raise RuntimeError("PA_FLOW_URL chưa cấu hình")
    body = {"secret": PA_SECRET, "action": action, "file": PLAN_FILE_NAME}
    if extra:
        body.update(extra)
    req = _ureq.Request(
        PA_FLOW_URL,
        data=_json.dumps(body).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with _ureq.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    data = _json.loads(raw.decode("utf-8")) if raw else {}
    if isinstance(data, dict) and data.get("ok") is False:
        raise RuntimeError("Power Automate: " + str(data.get("error") or "lỗi không rõ"))
    return data if isinstance(data, dict) else {}


def _pa_get_file():
    """(bytes, mtime) của file kế hoạch lấy qua Power Automate."""
    d = _pa_call("read")
    content = _b64.b64decode(d.get("content") or "")
    # Chịu được trường hợp flow mã hoá base64 2 lần (tuỳ biểu thức người dùng đặt):
    # file .xlsx luôn bắt đầu bằng chữ ký ZIP 'PK'.
    if content[:2] != b"PK":
        try:
            again = _b64.b64decode(content)
            if again[:2] == b"PK":
                content = again
        except Exception:
            pass
    return content, _pa_parse_time(d.get("mtime") or d.get("Modified") or "")


def _pa_meta(force=False):
    now = time.time()
    with _pa_lock:
        if not force and _pa_meta_cache["at"] and now - _pa_meta_cache["at"] < _PA_META_TTL:
            return {k: _pa_meta_cache[k] for k in ("exists", "mtime", "by")}
    meta = {"exists": True, "mtime": 0.0, "by": ""}
    try:
        d = _pa_call("meta")
        meta["mtime"] = _pa_parse_time(d.get("mtime") or d.get("Modified") or "")
        meta["by"] = str(d.get("by") or "")
        meta["exists"] = bool(d.get("exists", True))
    except _uerr.HTTPError as e:
        if e.code == 404:
            meta["exists"] = False
        else:
            raise
    with _pa_lock:
        _pa_meta_cache.update(meta)
        _pa_meta_cache["at"] = now
    return dict(meta)


def _pa_save_actual(actuals, user_email):
    """Gửi danh sách {part, actual} cho flow -> Office Script ghi cột ThucTe."""
    d = _pa_call("save_actual", {"email": user_email, "actuals": actuals}, timeout=90)
    with _pa_lock:
        _pa_meta_cache["at"] = 0.0
    n = int(d.get("parts") or d.get("updated") or 0)
    return {
        "status": "ok",
        "updated": int(d.get("updated") or 0),
        "parts": n,
        "missing": int(d.get("missing") or 0),
        "mtime": _pa_parse_time(d.get("mtime") or ""),
        "filename": PLAN_FILE_NAME,
        "message": d.get("message") or ("Đã cập nhật Thực tế cho %d part lên SharePoint" % n),
    }


def _pa_save_khsx(headers, rows, user_email):
    """Gửi headers + rows cho flow -> Office Script ghi lại sheet KHSX_Dong."""
    d = _pa_call("save_khsx", {"email": user_email, "headers": headers, "rows": rows}, timeout=90)
    with _pa_lock:
        _pa_meta_cache["at"] = 0.0
    return {
        "status": "ok",
        "mtime": _pa_parse_time(d.get("mtime") or ""),
        "filename": PLAN_FILE_NAME,
    }


def _plan_read_bytes():
    """(bytes, mtime) của file kế hoạch — Power Automate/SharePoint, GitHub hoặc đĩa."""
    if USE_POWER_AUTOMATE:
        return _pa_get_file()
    if USE_GITHUB:
        content, _sha = _gh_get_file()
        return content, _gh_meta().get("mtime", 0.0)
    fp = _get_safe_excel_path(PLAN_FILE_NAME, must_exist=True)[1]
    return read_excel_bytes_safe(fp), os.path.getmtime(fp)


def _plan_meta():
    if USE_POWER_AUTOMATE:
        return _pa_meta()
    if USE_GITHUB:
        return _gh_meta()
    fp = os.path.join(get_workspace_dir(), PLAN_FILE_NAME)
    if os.path.exists(fp):
        return {"exists": True, "mtime": os.path.getmtime(fp), "by": "", "sha": None}
    return {"exists": False, "mtime": 0.0, "by": "", "sha": None}


# ============================================================
# TỰ ĐỘNG SAO LƯU XOAY VÒNG 6 BẢN / GIỜ (Ring Buffer Backup)
# Cứ mỗi 10 phút (slot 1..6 tương ứng phút 00-09, 10-19... trong giờ),
# hệ thống tự động đọc file đang chạy (SharePoint / GitHub)
# và lưu bản snapshot vào repo GitHub:
#   backups/KeHoach_HanSpot_slot1.xlsx .. slot6.xlsx
# Đến giờ tiếp theo sẽ tự động xoay vòng ghi đè lại vào slot 1..6.
# ============================================================
_last_backup_slot_key = None
_last_backup_mtime = 0.0


def _do_rolling_backup(force: bool = False):
    """Kiểm tra và thực hiện sao lưu xoay vòng vào đúng slot (1..6) nếu có thay đổi."""
    global _last_backup_slot_key, _last_backup_mtime
    repo = PLAN_REPO or "KehoachSanXuat-Spot/dieu-do-data"
    token = GITHUB_TOKEN
    if not token or not repo:
        return
    import datetime as _dt
    now = _dt.datetime.now()
    slot = (now.minute // 10) + 1  # 1..6
    slot_key = (now.year, now.month, now.day, now.hour, slot)

    try:
        content, mtime = _plan_read_bytes()
    except Exception as e:
        logger.warning("[Rolling Backup] Chua doc duoc file de sao luu: %s", e)
        return

    # Nếu không phải ép buộc và file chưa đổi mtime -> bỏ qua để tránh commit rác
    if not force:
        if slot_key == _last_backup_slot_key and mtime <= _last_backup_mtime:
            return
        if _last_backup_mtime > 0 and mtime <= _last_backup_mtime:
            return

    slot_filename = f"backups/KeHoach_HanSpot_slot{slot}.xlsx"
    slot_q = _uparse.quote(slot_filename)

    sha = None
    try:
        d = _gh_api("GET", f"/repos/{repo}/contents/{slot_q}?ref={_uparse.quote(PLAN_BRANCH)}")
        sha = d.get("sha")
    except Exception:
        sha = None

    body = {
        "message": f"Auto backup slot {slot}/6 ({now.strftime('%H:%M %d/%m/%Y')})",
        "content": _b64.b64encode(content).decode("ascii"),
        "branch": PLAN_BRANCH,
    }
    if sha:
        body["sha"] = sha

    try:
        _gh_api("PUT", f"/repos/{repo}/contents/{slot_q}", body)
        _last_backup_slot_key = slot_key
        _last_backup_mtime = mtime
        logger.info("[Rolling Backup] Da sao luu thanh cong slot %d/6 vao %s (%s)", slot, slot_filename, repo)
    except Exception as e:
        logger.warning("[Rolling Backup] Loi luu slot %d vao GitHub: %s", slot, e)


def _rolling_backup_worker():
    """Luồng chạy ngầm: định kỳ mỗi 60 giây kiểm tra mốc 10 phút để sao lưu."""
    time.sleep(30)
    while True:
        try:
            _do_rolling_backup()
        except Exception as e:
            logger.warning("[Rolling Backup Worker] Loi: %s", e)
        time.sleep(60)


if GITHUB_TOKEN:
    threading.Thread(target=_rolling_backup_worker, daemon=True).start()


def _mutate_plan_workbook(user_email, mutate_fn, local_path=None):
    """Áp mutate_fn(wb)->result vào file kế hoạch rồi lưu lại.
    GitHub: pull→sửa→commit, tự thử lại khi có người vừa commit (409 Conflict).
    Đĩa: sửa trực tiếp file (local_path)."""
    import openpyxl
    if USE_GITHUB:
        for _ in range(3):
            content, sha = _gh_get_file()
            wb = openpyxl.load_workbook(_io.BytesIO(content))
            result = mutate_fn(wb)
            buf = _io.BytesIO()
            wb.save(buf)
            try:
                meta = _gh_put(buf.getvalue(), user_email, sha)
            except _uerr.HTTPError as e:
                if e.code == 409:          # có người vừa commit -> pull lại, áp lại
                    continue
                raise
            result["mtime"] = meta.get("mtime", 0.0)
            result["filename"] = PLAN_FILE_NAME
            return result
        raise HTTPException(status_code=409, detail="File vừa được người khác lưu, vui lòng thử lại.")
    fp = local_path or _get_safe_excel_path(PLAN_FILE_NAME, must_exist=True)[1]
    wb = openpyxl.load_workbook(fp)
    result = mutate_fn(wb)
    wb.save(fp)
    result["mtime"] = os.path.getmtime(fp)
    result["filename"] = os.path.basename(fp)
    return result


def _get_safe_excel_path(filename: str, must_exist: bool = True) -> tuple:
    """Kiểm tra và chuẩn hóa tên file Excel.

    - Chặn path traversal (chỉ lấy basename).
    - Chỉ cho phép đuôi file Excel hợp lệ (.xlsx, .xlsm, .xls).
    - Chặn file ẩn (.env, .git...) và file tạm (~$...).
    - Trả về tuple (safe_name, full_path).
    """
    if not filename:
        raise HTTPException(status_code=400, detail="Tên file không được để trống")
    safe_name = os.path.basename(filename).strip()
    if safe_name.startswith(".") or safe_name.startswith("~$"):
        raise HTTPException(status_code=400, detail="Không được phép truy cập file ẩn hoặc file tạm")
    ext = os.path.splitext(safe_name)[1].lower()
    if ext not in (".xlsx", ".xlsm", ".xls"):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file định dạng Excel (.xlsx, .xlsm, .xls)")

    ws = get_workspace_dir()
    fp = os.path.abspath(os.path.join(ws, safe_name))
    try:
        common = os.path.commonpath([ws, fp])
        if os.path.abspath(common) != os.path.abspath(ws):
            raise HTTPException(status_code=403, detail="Truy cập ngoài thư mục dự án bị từ chối")
    except Exception:
        raise HTTPException(status_code=403, detail="Đường dẫn không hợp lệ")

    if must_exist and not os.path.exists(fp):
        raise HTTPException(status_code=404, detail=f"File Excel '{safe_name}' không tồn tại")

    return safe_name, fp

@app.get("/api/excel/files")
def list_excel_files():
    """Liệt kê file .xlsx. Trên cloud: chỉ đúng file kế hoạch (PLAN_FILE_NAME)."""
    if CLOUD_MODE:
        try:
            meta = _plan_meta()
        except Exception:
            logger.exception("Loi doc metadata ke hoach")
            return {"files": []}
        if meta.get("exists"):
            mtime = meta.get("mtime") or 0
            return {"files": [{"filename": PLAN_FILE_NAME, "mtime": mtime, "size": 0,
                               "time_str": time.strftime("%H:%M:%S %d/%m/%Y", time.localtime(mtime)) if mtime else "—"}]}
        return {"files": []}
    ws = get_workspace_dir()
    files = []
    for f in os.listdir(ws):
        if f.lower().endswith(".xlsx") and not f.startswith("~$"):
            fp = os.path.join(ws, f)
            try:
                mtime = os.path.getmtime(fp)
                size = os.path.getsize(fp)
                files.append({
                    "filename": f,
                    "mtime": mtime,
                    "size": size,
                    "time_str": time.strftime("%H:%M:%S %d/%m/%Y", time.localtime(mtime))
                })
            except Exception:
                pass
    files.sort(key=lambda x: x["filename"])
    return {"files": files}

@app.get("/api/excel/watch")
def watch_excel_file(filename: str = Query(...), last_mtime: float = Query(0.0)):
    """Kiểm tra xem file Excel có vừa được lưu/thay đổi hay không"""
    if CLOUD_MODE:
        try:
            meta = _plan_meta()
        except Exception:
            return {"exists": True, "filename": PLAN_FILE_NAME, "modified": False, "mtime": last_mtime}
        if not meta.get("exists"):
            return {"exists": False, "filename": PLAN_FILE_NAME, "modified": False, "mtime": 0}
        mtime = meta.get("mtime") or 0
        return {
            "exists": True, "filename": PLAN_FILE_NAME,
            "modified": mtime > (last_mtime + 0.001), "mtime": mtime,
            "time_str": time.strftime("%H:%M:%S", time.localtime(mtime)) if mtime else ""
        }
    try:
        safe_name, fp = _get_safe_excel_path(filename, must_exist=False)
    except HTTPException:
        return {"exists": False, "filename": os.path.basename(filename), "modified": False, "mtime": 0}
    if not os.path.exists(fp):
        return {"exists": False, "filename": safe_name, "modified": False, "mtime": 0}
    try:
        current_mtime = os.path.getmtime(fp)
        modified = (current_mtime > (last_mtime + 0.001))
        return {
            "exists": True,
            "filename": safe_name,
            "modified": modified,
            "mtime": current_mtime,
            "time_str": time.strftime("%H:%M:%S", time.localtime(current_mtime))
        }
    except Exception as e:
        return {"exists": False, "error": str(e), "modified": False, "mtime": 0}

@app.get("/api/excel/data")
def get_excel_data(filename: str = Query(...)):
    """Đọc dữ liệu nhị phân của file Excel (có cơ chế retry an toàn khi Excel đang ghi)"""
    if CLOUD_MODE:
        try:
            content, mtime = _plan_read_bytes()
        except HTTPException:
            raise
        except _uerr.HTTPError as e:
            raise HTTPException(status_code=(404 if e.code == 404 else 502),
                                detail="Khong doc duoc file ke hoach tu kho du lieu.")
        except Exception:
            logger.exception("Loi doc file ke hoach (cloud)")
            raise HTTPException(status_code=502, detail="Khong doc duoc file ke hoach (xem log).")
        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"X-File-Mtime": str(mtime), "X-Filename": PLAN_FILE_NAME,
                     "Cache-Control": "no-cache, no-store, must-revalidate"},
        )
    safe_name, fp = _get_safe_excel_path(filename, must_exist=True)
    try:
        mtime = os.path.getmtime(fp)
        content = read_excel_bytes_safe(fp)
        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "X-File-Mtime": str(mtime),
                "X-Filename": safe_name,
                "Cache-Control": "no-cache, no-store, must-revalidate"
            }
        )
    except Exception as e:
        logger.exception("Loi doc file Excel: %s", safe_name)
        raise HTTPException(status_code=500, detail="Khong doc duoc file Excel (xem log server).")

class SaveKHSXDongPayload(BaseModel):
    filename: Optional[str] = "KeHoach_HanSpot_Tuan_Thang_Mau.xlsx"
    headers: List[str]
    rows: List[List[Any]]

@app.post("/api/excel/save-khsx-dong")
def save_khsx_dong_endpoint(payload: SaveKHSXDongPayload, request: Request):
    """Ghi/cập nhật sheet KHSX_Dong vào file kế hoạch (cloud: kho GitHub; local/tunnel: đĩa)."""
    if CLOUD_MODE:
        payload.filename = PLAN_FILE_NAME
    elif not _is_same_origin_request(request):
        raise HTTPException(status_code=403, detail="Chặn thao tác ghi dữ liệu từ nguồn lạ (CSRF)")

    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    def _apply(wb):
        sheet_name = "KHSX_Dong"
        if sheet_name in wb.sheetnames:
            del wb[sheet_name]
        idx = 1 if "KeHoachSanXuat" in wb.sheetnames else 0
        ws = wb.create_sheet(title=sheet_name, index=idx)
        hdr_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
        hdr_font = Font(name="Segoe UI", size=10, bold=True, color="FFFFFF")
        regular_font = Font(name="Segoe UI", size=10)
        bold_font = Font(name="Segoe UI", size=10, bold=True)
        active_fill = PatternFill(start_color="ECFDF5", end_color="ECFDF5", fill_type="solid")
        center_align = Alignment(horizontal="center", vertical="center")
        right_align = Alignment(horizontal="right", vertical="center")
        thin_border = Border(left=Side(style="thin", color="CBD5E1"), right=Side(style="thin", color="CBD5E1"),
                             top=Side(style="thin", color="CBD5E1"), bottom=Side(style="thin", color="CBD5E1"))
        for c_idx, h in enumerate(payload.headers, start=1):
            cell = ws.cell(row=1, column=c_idx, value=h)
            cell.fill = hdr_fill
            cell.font = hdr_font
            cell.alignment = center_align
            cell.border = thin_border
        for r_idx, row in enumerate(payload.rows, start=2):
            for c_idx, val in enumerate(row, start=1):
                cell = ws.cell(row=r_idx, column=c_idx, value=val)
                cell.border = thin_border
                cell.font = regular_font
                if c_idx in [1, 4, 5, 6]:
                    cell.alignment = center_align
                elif isinstance(val, (int, float)):
                    cell.alignment = right_align
                    if c_idx >= 7 and val > 0:
                        cell.fill = active_fill
                        cell.font = bold_font
                else:
                    cell.alignment = center_align
        for col_idx in range(1, len(payload.headers) + 1):
            col_letter = get_column_letter(col_idx)
            hdr_text = str(payload.headers[col_idx - 1] or "")
            ws.column_dimensions[col_letter].width = max(11, len(hdr_text) + 4)
        return {"status": "ok"}

    try:
        if USE_POWER_AUTOMATE:
            result = _pa_save_khsx(payload.headers, payload.rows, _req_email(request))
        elif USE_GITHUB:
            result = _mutate_plan_workbook(_req_email(request), _apply)
        else:
            safe_name, fp = _get_safe_excel_path(payload.filename or "KeHoach_HanSpot_Tuan_Thang_Mau.xlsx", must_exist=True)
            result = _mutate_plan_workbook(_req_email(request), _apply, local_path=fp)
        result["message"] = "Đã lưu thành công sheet KHSX_Dong vào %s" % result.get("filename", "")
        threading.Thread(target=lambda: (time.sleep(2), _do_rolling_backup(force=True)), daemon=True).start()
        return result
    except HTTPException:
        raise
    except Exception:
        logger.exception("Loi ghi sheet KHSX_Dong")
        raise HTTPException(status_code=500, detail="Khong ghi duoc sheet KHSX_Dong (xem log server).")


class SaveActualPayload(BaseModel):
    filename: Optional[str] = "KeHoach_HanSpot_Tuan_Thang_Mau.xlsx"
    actuals: List[Dict[str, Any]]  # [{"part": "Part-01", "actual": 123}, ...]


@app.post("/api/excel/save-actual")
def save_actual_endpoint(payload: SaveActualPayload, request: Request):
    """Ghi/cập nhật cột ThucTe cho từng Part (cloud: kho GitHub; local/tunnel: đĩa).
    Cập nhật MỌI sheet có cột Part + ThucTe để giữ đồng nhất."""
    if CLOUD_MODE:
        payload.filename = PLAN_FILE_NAME
    elif not _is_same_origin_request(request):
        raise HTTPException(status_code=403, detail="Chặn thao tác ghi dữ liệu từ nguồn lạ (CSRF)")

    import re as _re
    import unicodedata as _ud

    def _norm(s):
        s = _ud.normalize("NFD", str(s if s is not None else ""))
        s = "".join(c for c in s if _ud.category(c) != "Mn")
        return _re.sub(r"[^a-z0-9]", "", s.lower())

    want = {}
    for it in (payload.actuals or []):
        pt = it.get("part")
        if pt is None:
            continue
        try:
            a_val = int(round(float(it.get("actual", 0) or 0)))
        except (ValueError, TypeError):
            a_val = 0
        want[_norm(pt)] = max(0, a_val)
    if not want:
        return {"status": "ok", "updated": 0, "message": "Không có dữ liệu để cập nhật"}

    if USE_POWER_AUTOMATE:
        clean = []
        for it in (payload.actuals or []):
            pt = it.get("part")
            if pt is None:
                continue
            try:
                av = int(round(float(it.get("actual", 0) or 0)))
            except (ValueError, TypeError):
                av = 0
            clean.append({"part": str(pt), "actual": max(0, av)})
        try:
            res = _pa_save_actual(clean, _req_email(request))
            threading.Thread(target=lambda: (time.sleep(2), _do_rolling_backup(force=True)), daemon=True).start()
            return res
        except HTTPException:
            raise
        except Exception:
            logger.exception("Loi ghi Thuc te qua Power Automate")
            raise HTTPException(status_code=502, detail="Khong ghi duoc Thuc te len SharePoint (xem log server).")

    THUCTE_ALIASES = ("thucte", "actual", "thuchien", "thuctehien", "dalam")

    def _apply(wb):
        total_updated = 0
        updated_parts = set()
        sheets_touched = []
        for sn in wb.sheetnames:
            ws = wb[sn]
            header_row = part_col = thucte_col = None
            max_scan = min(6, ws.max_row or 1)
            for r in range(1, max_scan + 1):
                cols = {}
                for c in range(1, (ws.max_column or 1) + 1):
                    v = _norm(ws.cell(row=r, column=c).value)
                    if v:
                        cols[c] = v
                pc = next((c for c, v in cols.items() if v == "part"), None)
                if pc is not None:
                    header_row, part_col = r, pc
                    thucte_col = next((c for c, v in cols.items() if v in THUCTE_ALIASES), None)
                    break
            if header_row is None or part_col is None:
                continue
            is_plan_sheet = any(k in _norm(sn) for k in ("kehoachsanxuat", "kehoach", "sanxuat", "plan"))
            if thucte_col is None:
                if not is_plan_sheet:
                    continue
                thucte_col = (ws.max_column or 0) + 1
                ws.cell(row=header_row, column=thucte_col, value="ThucTe")
            touched = 0
            for r in range(header_row + 1, (ws.max_row or header_row) + 1):
                pv = _norm(ws.cell(row=r, column=part_col).value)
                if pv and pv in want:
                    ws.cell(row=r, column=thucte_col, value=want[pv])
                    touched += 1
                    updated_parts.add(pv)
            if touched:
                sheets_touched.append(sn)
                total_updated += touched
        missing = [pp for pp in want if pp not in updated_parts]
        msg = "Đã cập nhật Thực tế cho %d part (%d ô)" % (len(updated_parts), total_updated)
        if missing:
            msg += "; %d part không tìm thấy trong file" % len(missing)
        return {
            "status": "ok",
            "updated": total_updated,
            "parts": len(updated_parts),
            "sheets": sheets_touched,
            "missing": len(missing),
            "message": msg,
        }

    try:
        if USE_GITHUB:
            res = _mutate_plan_workbook(_req_email(request), _apply)
        else:
            safe_name, fp = _get_safe_excel_path(payload.filename or "KeHoach_HanSpot_Tuan_Thang_Mau.xlsx", must_exist=True)
            res = _mutate_plan_workbook(_req_email(request), _apply, local_path=fp)
        threading.Thread(target=lambda: (time.sleep(2), _do_rolling_backup(force=True)), daemon=True).start()
        return res
    except HTTPException:
        raise
    except Exception:
        logger.exception("Loi ghi Thuc te vao Excel")
        raise HTTPException(status_code=500, detail="Khong ghi duoc Thuc te vao Excel (xem log server).")


class ExportSchedulePayload(BaseModel):
    filename: Optional[str] = "LichSanXuat_HanSpot.xlsx"
    machines: List[str]
    intervals: List[Dict[str, Any]]
    parts: Optional[List[Dict[str, Any]]] = None
    busy: Optional[List[float]] = None
    makespan: Optional[float] = 0
    dateLabels: Optional[List[str]] = None
    machineShifts: Optional[List[str]] = None
    workers: Optional[List[Dict[str, Any]]] = None      # Danh sách công nhân (DRC-FJSP)
    perWorker: Optional[List[List[Dict[str, Any]]]] = None  # Lịch phân công từng CN


def _fmt_clock(minutes: Any, date_labels: Optional[List[str]]) -> str:
    """Quy đổi phút-từ-mốc-0 sang chuỗi 'Nhãn-ngày HH:MM' (khớp formatCalendarTime của web)."""
    try:
        m = max(0, int(round(float(minutes))))
    except (ValueError, TypeError):
        return ""
    day_idx = m // 1440
    rem = m % 1440
    hh = rem // 60
    mm = rem % 60
    time_str = f"{hh:02d}:{mm:02d}"
    if date_labels and 0 <= day_idx < len(date_labels) and date_labels[day_idx]:
        return f"{date_labels[day_idx]} {time_str}"
    return f"N{day_idx + 1} {time_str}"


@app.post("/api/export/schedule")
def export_schedule_endpoint(payload: ExportSchedulePayload):
    """Xuất lịch điều độ hiện tại ra file Excel 3 sheet để phát xuống xưởng."""
    try:
        import io
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

        machines = payload.machines or []
        intervals = payload.intervals or []
        parts = payload.parts or []
        date_labels = payload.dateLabels
        shifts = payload.machineShifts or []

        wb = openpyxl.Workbook()

        # --- Style dùng chung ---
        hdr_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
        hdr_font = Font(name="Segoe UI", size=10, bold=True, color="FFFFFF")
        reg_font = Font(name="Segoe UI", size=10)
        bold_font = Font(name="Segoe UI", size=10, bold=True)
        bad_font = Font(name="Segoe UI", size=10, bold=True, color="C0392B")
        good_fill = PatternFill(start_color="ECFDF5", end_color="ECFDF5", fill_type="solid")
        bad_fill = PatternFill(start_color="FDECEC", end_color="FDECEC", fill_type="solid")
        center = Alignment(horizontal="center", vertical="center")
        left = Alignment(horizontal="left", vertical="center")
        thin = Side(style="thin", color="CBD5E1")
        border = Border(left=thin, right=thin, top=thin, bottom=thin)

        def write_header(ws, headers):
            for c_idx, h in enumerate(headers, start=1):
                cell = ws.cell(row=1, column=c_idx, value=h)
                cell.fill = hdr_fill
                cell.font = hdr_font
                cell.alignment = center
                cell.border = border
            ws.freeze_panes = "A2"

        def autosize(ws, headers, min_w=10):
            from openpyxl.utils import get_column_letter
            for c_idx, h in enumerate(headers, start=1):
                ws.column_dimensions[get_column_letter(c_idx)].width = max(min_w, len(str(h)) + 4)

        # ============ Sheet 1: Lịch sản xuất (Dispatch theo máy) ============
        ws1 = wb.active
        ws1.title = "LichSanXuat"
        h1 = ["Máy", "Ca", "Part", "Công đoạn", "Lô", "SL lô", "Tổng SL",
              "Bắt đầu", "Kết thúc", "Thời lượng (phút)", "Ưu tiên", "Hạn giao", "Trễ hạn?",
              "Công nhân", "Bậc thợ"]
        write_header(ws1, h1)

        ordered_iv = sorted(
            intervals,
            key=lambda iv: (iv.get("mi", 0), float(iv.get("start", 0)))
        )
        r = 2
        for iv in ordered_iv:
            mi = int(iv.get("mi", 0))
            m_name = machines[mi] if 0 <= mi < len(machines) else f"M{mi}"
            shift = shifts[mi] if 0 <= mi < len(shifts) else ""
            start_v = iv.get("start", 0)
            end_v = iv.get("end", 0)
            dur = int(round(float(end_v) - float(start_v)))
            due = iv.get("dueDate")
            is_tardy = (due is not None and due > 0 and float(end_v) > float(due))
            pri = iv.get("priority", 2)
            pri_str = {1: "1 · Gấp", 2: "2 · Tiêu chuẩn", 3: "3 · Thấp"}.get(int(pri) if pri else 2, str(pri))
            row_vals = [
                m_name, shift, iv.get("part", ""), iv.get("seq", ""),
                iv.get("unit", ""), iv.get("lotQty", ""), iv.get("totalQty", ""),
                _fmt_clock(start_v, date_labels), _fmt_clock(end_v, date_labels), dur,
                pri_str, _fmt_clock(due, date_labels) if due else "", "TRỄ" if is_tardy else "",
                iv.get("workerName", ""), iv.get("workerSkill", ""),
            ]
            for c_idx, val in enumerate(row_vals, start=1):
                cell = ws1.cell(row=r, column=c_idx, value=val)
                cell.border = border
                cell.font = bad_font if (is_tardy and c_idx == 13) else reg_font
                cell.alignment = left if c_idx in (3, 14) else center
            if is_tardy:
                ws1.cell(row=r, column=13).fill = bad_fill
            r += 1
        autosize(ws1, h1)

        # ============ Sheet 2: Tổng hợp theo Part ============
        ws2 = wb.create_sheet("TongHopPart")
        h2 = ["Part", "Kế hoạch", "Thực tế", "Cần SX", "Ưu tiên",
              "Bắt đầu sớm nhất", "Hoàn thành", "Hạn giao", "Trễ hạn"]
        write_header(ws2, h2)

        part_start = {}
        part_end = {}
        for iv in intervals:
            pid = iv.get("part", "")
            s = float(iv.get("start", 0))
            e = float(iv.get("end", 0))
            part_start[pid] = min(part_start.get(pid, s), s)
            part_end[pid] = max(part_end.get(pid, e), e)

        r = 2
        for p in parts:
            pid = p.get("id", "")
            plan_q = p.get("planQty", p.get("qty", 0))
            act_q = p.get("actualQty", 0)
            need_q = p.get("qty", 0)
            pri = p.get("priority", 2)
            pri_str = {1: "1 · Gấp", 2: "2 · Tiêu chuẩn", 3: "3 · Thấp"}.get(int(pri) if pri else 2, str(pri))
            due = p.get("dueDate")
            s_min = part_start.get(pid)
            e_min = part_end.get(pid)
            is_tardy = (due is not None and due and e_min is not None and e_min > float(due))
            tardy_txt = ""
            if is_tardy:
                diff_h = round((e_min - float(due)) / 60.0, 1)
                tardy_txt = f"Trễ {diff_h}h"
            row_vals = [
                pid, plan_q, act_q, need_q, pri_str,
                _fmt_clock(s_min, date_labels) if s_min is not None else "",
                _fmt_clock(e_min, date_labels) if e_min is not None else "—",
                _fmt_clock(due, date_labels) if due else "", tardy_txt,
            ]
            for c_idx, val in enumerate(row_vals, start=1):
                cell = ws2.cell(row=r, column=c_idx, value=val)
                cell.border = border
                cell.font = bad_font if (is_tardy and c_idx == 9) else reg_font
                cell.alignment = left if c_idx == 1 else center
            ws2.cell(row=r, column=9).fill = bad_fill if is_tardy else good_fill
            r += 1
        autosize(ws2, h2)

        # ============ Sheet 3: Thống kê máy ============
        ws3 = wb.create_sheet("ThongKeMay")
        h3 = ["Máy", "Ca", "Số lô đã xếp", "Tổng giờ hàn (phút)", "Tỷ lệ sử dụng %"]
        write_header(ws3, h3)
        makespan = float(payload.makespan or 0) or 1
        busy = payload.busy or []
        count_by_m = {}
        for iv in intervals:
            mi = int(iv.get("mi", 0))
            count_by_m[mi] = count_by_m.get(mi, 0) + 1
        r = 2
        for mi, m_name in enumerate(machines):
            b = float(busy[mi]) if mi < len(busy) else 0.0
            util = round(100.0 * b / makespan, 1)
            shift = shifts[mi] if mi < len(shifts) else ""
            for c_idx, val in enumerate([m_name, shift, count_by_m.get(mi, 0), int(round(b)), util], start=1):
                cell = ws3.cell(row=r, column=c_idx, value=val)
                cell.border = border
                cell.font = reg_font
                cell.alignment = left if c_idx == 1 else center
            r += 1
        autosize(ws3, h3)

        # ============ Sheet 4: Phân công Công nhân ============
        workers_list = payload.workers or []
        per_worker_list = payload.perWorker or []
        if workers_list:
            ws4 = wb.create_sheet("PhanCongCongNhan")
            h4 = ["Mã CN", "Họ Tên", "Phân xưởng", "Bậc thợ", "Ca", "Hiệu suất %",
                  "Số lô phân công", "Tổng thời gian (phút)", "Tỷ lệ bận %"]
            write_header(ws4, h4)
            makespan_v = float(payload.makespan or 0) or 1
            r = 2
            for w_idx, w in enumerate(workers_list):
                jobs = per_worker_list[w_idx] if w_idx < len(per_worker_list) else []
                total_busy = sum(float(j.get("end", 0)) - float(j.get("start", 0)) for j in jobs)
                util_pct = round(100.0 * total_busy / makespan_v, 1)
                eff = w.get("eff", 1.0)
                eff_pct = int(round((eff if eff else 1.0) * 100))
                row_vals = [
                    w.get("id", ""), w.get("name", ""), w.get("zone", ""),
                    w.get("skill", ""), w.get("shift", ""), eff_pct,
                    len(jobs), int(round(total_busy)), util_pct,
                ]
                for c_idx, val in enumerate(row_vals, start=1):
                    cell = ws4.cell(row=r, column=c_idx, value=val)
                    cell.border = border
                    cell.font = reg_font
                    cell.alignment = left if c_idx in (1, 2, 3) else center
                r += 1
            autosize(ws4, h4)

            # Sheet 5: Chi tiết lịch làm việc từng công nhân
            ws5 = wb.create_sheet("ChiTietCongNhan")
            h5 = ["Họ Tên", "Mã CN", "Phân xưởng", "Part", "Lô",
                  "Máy", "Bắt đầu", "Kết thúc", "Thời lượng (phút)"]
            write_header(ws5, h5)
            r = 2
            for w_idx, w in enumerate(workers_list):
                jobs = per_worker_list[w_idx] if w_idx < len(per_worker_list) else []
                jobs_sorted = sorted(jobs, key=lambda j: float(j.get("start", 0)))
                for j in jobs_sorted:
                    mi_j = int(j.get("mi", 0))
                    m_name_j = machines[mi_j] if 0 <= mi_j < len(machines) else f"M{mi_j}"
                    s_j = float(j.get("start", 0))
                    e_j = float(j.get("end", 0))
                    row_vals = [
                        w.get("name", ""), w.get("id", ""), w.get("zone", ""),
                        j.get("part", ""), j.get("unit", ""),
                        m_name_j,
                        _fmt_clock(s_j, date_labels), _fmt_clock(e_j, date_labels),
                        int(round(e_j - s_j)),
                    ]
                    for c_idx, val in enumerate(row_vals, start=1):
                        cell = ws5.cell(row=r, column=c_idx, value=val)
                        cell.border = border
                        cell.font = reg_font
                        cell.alignment = left if c_idx in (1, 2, 3, 4) else center
                    r += 1
            autosize(ws5, h5)

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        raw_name = payload.filename or "LichSanXuat_HanSpot.xlsx"
        safe_name = os.path.basename(raw_name).strip()
        if safe_name.startswith(".") or safe_name.startswith("~$") or not safe_name:
            safe_name = "LichSanXuat_HanSpot.xlsx"
        if not safe_name.lower().endswith(".xlsx"):
            safe_name += ".xlsx"
        return Response(
            content=buf.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}"'}
        )
    except Exception as e:
        logger.exception("Loi xuat lich Excel")
        raise HTTPException(status_code=500, detail="Khong xuat duoc lich Excel (xem log server).")


# =========================================================================
# AI COPILOT / OPERATIONS BRAIN API (Tích hợp Gemini AI Điều Hành Sản Xuất)
# =========================================================================
class AIChatPayload(BaseModel):
    prompt: str
    context: Optional[dict] = None
    model: Optional[str] = None

try:
    import ai_assistant
    AI_AVAILABLE = True
except Exception as e:
    ai_assistant = None
    AI_AVAILABLE = False
    print(f"[Server] Không thể tải module ai_assistant: {e}")

@app.get("/api/ai/status")
def get_ai_status():
    if not AI_AVAILABLE or not ai_assistant:
        return {
            "ok": True,
            "status_text": "🟡 Chưa nạp được module AI — dùng bộ phân tích quy tắc",
            "mode": "expert_rule_engine",
            "default_model": "quy tắc",
        }
    return ai_assistant.get_brain_status()


@app.post("/api/ai/login")
def post_ai_login(request: Request):
    if CLOUD_MODE or not AI_AVAILABLE or not ai_assistant:
        return {"success": False, "message": "Chức năng này chỉ dùng trên bản chạy tại máy cá nhân."}
    if not _is_same_origin_request(request):
        raise HTTPException(status_code=403, detail="Chặn yêu cầu từ nguồn lạ")
    return ai_assistant.login_gemini_browser()


@app.post("/api/ai/chat")
def post_ai_chat(payload: AIChatPayload, request: Request):
    if not AI_AVAILABLE or not ai_assistant:
        return {"ok": False, "fallback": True, "detail": "Module AI chưa sẵn sàng trên máy chủ"}
    if len(payload.prompt or "") > 8000:
        raise HTTPException(status_code=413, detail="Câu hỏi quá dài")
    return ai_assistant.query_gemini_brain(payload.prompt, payload.context, payload.model)


@app.get("/")
def get_index():
    html_path = os.path.join(get_workspace_dir(), "spot_weld_app.html")
    if os.path.exists(html_path):
        # no-cache: luôn nạp bản mới nhất, tránh trình duyệt giữ code cũ sau khi sửa app
        return FileResponse(
            html_path,
            media_type="text/html; charset=utf-8",
            headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Expires": "0"}
        )
    return HTMLResponse("<h1>spot_weld_app.html not found</h1>")

if __name__ == "__main__":
    import uvicorn
    # Truyền thẳng đối tượng app (không dùng chuỗi "server:app") để tránh
    # uvicorn nạp lại module lần 2 -> tránh chạy 2 watchdog gây tự tắt sai.
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)
