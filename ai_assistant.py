# -*- coding: utf-8 -*-
"""
ai_assistant.py - Module Trí Tuệ Nhân Tạo Điều Hành Sản Xuất (Gemini AI Operations Brain)
Tích hợp trực tiếp với package brain/ trong D:\6. Web\Xuong_Spot_TD\brain
"""
import os
import sys
import json
import time
import urllib.request
import urllib.parse
from typing import Dict, Any, Optional, List

# Đảm bảo import được package brain
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

try:
    from brain.config import CONFIG, find_config, load_config
    from brain import gemini, models, auth
    cfg_path = find_config()
    if cfg_path:
        load_config(cfg_path)
except Exception as _e:
    CONFIG = {}
    gemini = None
    models = None
    auth = None

def safe_print(msg: str):
    try:
        print(msg)
    except Exception:
        try:
            print(msg.encode("ascii", errors="replace").decode("ascii"))
        except Exception:
            pass

SYSTEM_PROMPT = """Bạn là Gemini AI - Trợ lý Điều Hành Sản Xuất Thông Minh (AI Operations Copilot) của "Xưởng Hàn Spot (ckthanhdat.vn)".
Xưởng của bạn là tổ hợp sản xuất cơ khí tích hợp khép kín gồm:
1. Khu Cắt Phôi Laser: Máy cắt tấm Laser (Laser-Tam-1..2), Máy cắt ống Laser (Laser-Ong-1..2).
2. Khu Dập Định Hình: Các dòng máy dập 60T, 110T, 160T, 250T, 500T.
3. Khu Hàn Spot: 25 máy hàn pedestal C-frame (L1-1..L3-7), súng hàn cầm tay treo balancer, máy hàn tán bu-lông Soyer.
4. Khu Hàn Robot MAG: 4 trạm robot hàn MAG tự động (Robot-MAG-1..4).
5. Đội ngũ Công nhân: Thợ bậc 2, bậc 3, bậc 4 được phân công theo ca làm việc (HC, S1, S2, S6, S7, 24/7).

QUY TẮC PHẢN HỒI BẮT BUỘC (PHẢI TRẢ LỜI ĐÚNG TRỌNG TÂM CỦA QUẢN ĐỐC):
1. TRẢ LỜI ĐÚNG VÀO NỘI DUNG ĐƯỢC HỎI, KHÔNG LAN MAN:
   - Khi Quản đốc cảm ơn, chào hỏi, khen ngợi (ví dụ: "Cảm ơn bạn!", "Cảm ơn", "Chào bạn", "Tốt lắm", "Tuyệt vời", "OK cảm ơn"):
     -> Chỉ đáp lại 1-2 câu ngắn gọn, thân thiện, lịch sự, chúc ca làm việc hiệu quả và luôn sẵn sàng hỗ trợ khi Quản đốc cần. TUYỆT ĐỐI KHÔNG tự động tuôn ra bài báo cáo số liệu xưởng khi Quản đốc không yêu cầu!
   - Khi Quản đốc hỏi về một mã part hoặc máy móc cụ thể (ví dụ: "Máy L3-2 làm gì?", "Có part nào trễ không?"):
     -> Trả lời đúng duy nhất trọng tâm câu hỏi đó, ngắn gọn, chính xác số liệu, không lặp lại cả báo cáo dài dòng.
   - Khi Quản đốc bấm các nút phân tích nhanh ("Quét Điểm Nghẽn", "Dự Báo Trễ Hạn", "Tối Ưu Makespan", "Tư Vấn Công Nhân") hoặc hỏi "Báo cáo tổng quan tình hình xưởng":
     -> Mới đưa ra bài báo cáo phân tích chi tiết, có cấu trúc rõ ràng với số liệu cụ thể.

2. ĐÁNH GIÁ ĐIỂM NGHẼN CHUẨN XÁC:
   - Nếu máy bận nhất chiếm dưới 45% Makespan (hoặc đã được san tải về mức an toàn ~2.000 - 2.500 phút và đang chạy ca 24/7): Báo cáo rõ là "Dây chuyền hiện đã được san tải cân bằng rất tốt, tải trọng nằm trong ngưỡng an toàn. Không còn hiện tượng nghẽn tắc nghiêm trọng."
   - Không dùng từ "quá tải nặng" khi máy chỉ bận ~30% Makespan. Chỉ coi là quá tải nặng khi tỷ lệ bận >= 65-70%.

3. KÍCH HOẠT HÀNH ĐỘNG HỆ THỐNG (ACTION BLOCKS):
   - Khi Quản đốc yêu cầu thực hiện, áp dụng (ví dụ: "thực hiện phương án", "san tải", "đổi ca 24/7", "tái điều độ"):
     -> Trả lời xác nhận ngắn gọn và LUÔN KÈM THEO khối lệnh ```action ở cuối để Quản đốc bấm Duyệt.

=== THỰC THI HÀNH ĐỘNG HỆ THỐNG & ĐIỀU ĐỘ (AI COPILOT ACTIONS) ===
Khi Quản đốc yêu cầu THỰC HIỆN, ÁP DỤNG giải pháp (ví dụ: "thực hiện phương án đề xuất", "giải quyết điểm nghẽn", "san tải", "đổi ca 24/7", "tái điều độ", "ghi thực tế", "lưu kế hoạch động"), hãy:
  1) Trả lời phân tích ngắn gọn, xác nhận kế hoạch thực thi cụ thể.
  2) Ở CUỐI câu trả lời, LUÔN KÈM THEO DUY NHẤT MỘT khối lệnh (fenced block) đúng định dạng:
```action
{ ... }
```
Các action được hỗ trợ:
  1. "solve_bottlenecks": Kích hoạt gói giải pháp toàn diện cho điểm nghẽn (đổi ca 24/7 cho máy quá tải, san tải sang máy nhàn rỗi và tự động tái điều độ).
     Ví dụ:
```action
{"action":"solve_bottlenecks","shifts":{"L3-2":"24/7","L3-3":"24/7","L3-7":"24/7"},"reroute":{"from":["L3-7","L3-3","L3-2"],"to":["L1-6","L2-1","L2-2"]},"re_solve":true,"note":"Nâng ca 24/7 cho cụm L3 và san tải sang các máy nhàn rỗi L1-6, L2-1, L2-2"}
```
  2. "set_machine_shift": Đổi ca làm việc cho các máy (HC, S1, S2, S6, S7, 24/7) và tự động giải lại lịch.
     Ví dụ:
```action
{"action":"set_machine_shift","shifts":{"L3-2":"24/7","L3-3":"24/7","L3-7":"24/7"},"re_solve":true,"note":"Chuyển cụm máy L3 sang ca 24/7"}
```
  3. "reroute_machine": San tải từ các máy quá tải sang máy nhàn rỗi/dư công suất và tự động giải lại lịch.
     Ví dụ:
```action
{"action":"reroute_machine","from_machines":["L3-7","L3-3","L3-2"],"to_machines":["L1-6","L2-1","L2-2"],"re_solve":true,"note":"San tải từ cụm L3 sang máy L1-6, L2-1, L2-2"}
```
  4. "re_solve": Tái điều độ lại toàn bộ dây chuyền (có thể điều chỉnh cỡ lô sublot_size để gối đầu).
     Ví dụ:
```action
{"action":"re_solve","sublot_size":200,"note":"Tái điều độ lại dây chuyền với cỡ lô gối đầu 200"}
```
  5. "update_actual": ghi cột Thực tế cho từng part. "data" là danh sách {part, actual}.
     Ví dụ:
```action
{"action":"update_actual","data":[{"part":"Part-1","actual":120}],"note":"Cập nhật sản lượng thực tế"}
```
  6. "save_khsx_dong": lưu/chốt sheet Kế hoạch Động hiện tại xuống Excel (KHÔNG cần "data").
     Ví dụ:
```action
{"action":"save_khsx_dong","note":"Lưu kế hoạch động ra file Excel"}
```

QUY TẮC BẮT BUỘC:
  - Khi Quản đốc nói "đồng ý", "thực hiện đi", "triển khai phương án", "san tải", "đổi ca 24/7", "tái điều độ" -> BẮT BUỘC phải kèm khối ```action phù hợp để người dùng bấm "Duyệt" thì hệ thống mới chạy thật. TUYỆT ĐỐI không nói suông đã thực hiện mà không kèm khối ```action.
  - Tên máy trong shifts và reroute phải có thật trong danh sách machines của ngữ cảnh (ví dụ: L3-7, L3-3, L3-2, L1-6, L2-1, L2-2).
  - Không bao giờ xóa dữ liệu; chỉ ghi đúng con số được yêu cầu.
  - Người dùng sẽ bấm "Duyệt" trên giao diện thì lệnh mới thực thi — bạn chỉ ĐỀ XUẤT.
"""

# ---------------------------------------------------------------------------
# Google Gemini API chính thức (miễn phí với khóa tạo tại https://aistudio.google.com/apikey)
# ---------------------------------------------------------------------------
# Thứ tự ưu tiên model (mới nhất trước). Có thể ép model bằng biến môi trường
# GEMINI_API_MODEL. Nếu model đầu không dùng được với khóa hiện tại (hết hạn mức,
# bị khai tử...), tự động thử model kế tiếp; ngoài ra còn tự dò danh sách model
# mà khóa được phép dùng (ListModels) để luôn bắt kịp bản Flash mới nhất.
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"
GEMINI_PREFERRED_MODELS = [
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-flash-latest",
]
_gemini_model_cache: Dict[str, Any] = {"at": 0.0, "models": []}
_gemini_last_ok_model = ""


def _gemini_api_key() -> str:
    return (os.environ.get("GEMINI_API_KEY", "") or "").strip()


def _flash_rank(name: str):
    """Sắp xếp model Flash: phiên bản cao hơn trước, bản thường trước bản lite."""
    import re
    m = re.match(r"^gemini-(\d+(?:\.\d+)?)-flash(-lite)?$", name)
    if not m:
        return None
    return (float(m.group(1)), 0 if m.group(2) else 1)


def _discover_gemini_models(api_key: str) -> List[str]:
    """Hỏi Google danh sách model văn bản Flash mà khóa này dùng được (cache 6 giờ)."""
    now = time.time()
    if _gemini_model_cache["models"] and now - _gemini_model_cache["at"] < 6 * 3600:
        return _gemini_model_cache["models"]
    found = []
    try:
        req = urllib.request.Request(
            f"{GEMINI_API_BASE}/models?pageSize=200",
            headers={"x-goog-api-key": api_key},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        for m in data.get("models", []):
            name = str(m.get("name", "")).split("/", 1)[-1]
            if "generateContent" not in (m.get("supportedGenerationMethods") or []):
                continue
            if _flash_rank(name) is not None:
                found.append(name)
        found.sort(key=_flash_rank, reverse=True)
    except Exception as e:
        safe_print(f"[AI Assistant] Không dò được danh sách model Gemini: {type(e).__name__}")
    _gemini_model_cache["at"] = now
    _gemini_model_cache["models"] = found
    return found


def _gemini_candidates(api_key: str) -> List[str]:
    out: List[str] = []
    forced = (os.environ.get("GEMINI_API_MODEL", "") or "").strip()
    for name in ([forced] if forced else []) + ([_gemini_last_ok_model] if _gemini_last_ok_model else []) \
            + _discover_gemini_models(api_key)[:3] + GEMINI_PREFERRED_MODELS:
        if name and name not in out:
            out.append(name)
    return out


def _call_gemini_api(api_key: str, system_prompt: str, user_text: str) -> Optional[Dict[str, str]]:
    """Gọi Gemini API; thử lần lượt các model ứng viên. Trả {"model","text"} hoặc None."""
    global _gemini_last_ok_model
    import urllib.error
    payload = json.dumps({
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_text}]}],
        "generationConfig": {"temperature": 0.4, "maxOutputTokens": 4096},
    }).encode("utf-8")
    for api_model in _gemini_candidates(api_key)[:5]:
        try:
            req = urllib.request.Request(
                f"{GEMINI_API_BASE}/models/{urllib.parse.quote(api_model, safe='')}:generateContent",
                data=payload,
                # Khóa đặt trong header (không nằm trên URL -> không lọt vào log)
                headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
            )
            with urllib.request.urlopen(req, timeout=45) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            parts = (((data.get("candidates") or [{}])[0].get("content") or {}).get("parts") or [])
            text = "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()
            if text and not _is_error_response(text):
                _gemini_last_ok_model = api_model
                return {"model": api_model, "text": text}
            safe_print(f"[AI Assistant] Gemini API ({api_model}) trả phản hồi rỗng/lỗi, thử model kế tiếp")
        except urllib.error.HTTPError as e:
            # 404: model không tồn tại/đã khai tử · 429: hết hạn mức · 400/403: khóa sai -> dừng hẳn
            safe_print(f"[AI Assistant] Gemini API ({api_model}) HTTP {e.code}")
            if e.code in (400, 401, 403):
                break
        except Exception as e:
            safe_print(f"[AI Assistant] Lỗi khi gọi Gemini API ({api_model}): {type(e).__name__}")
    return None


def get_brain_status() -> Dict[str, Any]:
    """Trạng thái THẬT của bộ não AI (không báo 'sẵn sàng' khi chưa có khóa)."""
    has_cookie = auth.has_valid_cookie() if (auth and hasattr(auth, "has_valid_cookie")) else False
    api_key = _gemini_api_key()
    openrouter_key = os.environ.get("OPENROUTER_API_KEY", "") or CONFIG.get("openrouter_api_key", "") or ""
    openrouter_model = CONFIG.get("openrouter_model", "openai/gpt-oss-120b:free")

    if api_key:
        mode = "gemini_api"
        model = (_gemini_candidates(api_key) or GEMINI_PREFERRED_MODELS)[0]
        status_text = f"🟢 Google Gemini API ({model}) sẵn sàng"
    elif has_cookie:
        mode = "gemini_web"
        model = CONFIG.get("default_model", "gemini-3.5-flash")
        status_text = "🟢 Gemini Web (Cookie) sẵn sàng"
    elif openrouter_key:
        mode = "openrouter"
        model = openrouter_model
        status_text = f"🟢 OpenRouter AI ({openrouter_model}) sẵn sàng"
    else:
        mode = "expert_rule_engine"
        model = "quy tắc"
        status_text = "🟡 Chưa cấu hình khóa AI — đang dùng bộ phân tích quy tắc (không phải Gemini)"

    return {
        "ok": True,
        "has_cookie": has_cookie,
        "has_api_key": bool(api_key),
        "has_openrouter": bool(openrouter_key),
        "default_model": model,
        "openrouter_model": openrouter_model,
        "mode": mode,
        "status_text": status_text,
    }


def login_gemini_browser() -> Dict[str, Any]:
    """Mở trình duyệt cho người dùng đăng nhập tài khoản Google để lấy session cookie."""
    if not auth or not hasattr(auth, "login_and_capture_cookies"):
        return {
            "success": False,
            "message": "Trên Cloud, vui lòng nhập GEMINI_API_KEY vào Environment Variables hoặc sử dụng Chế độ Chuyên gia Điều hành."
        }
    try:
        ok = auth.login_and_capture_cookies(headless=False)
        return {
            "success": ok,
            "message": "Đăng nhập Gemini thành công! Đã lưu cookie." if ok else "Người dùng đã đóng trình duyệt hoặc đăng nhập chưa hoàn tất."
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "message": f"Không thể khởi động trình duyệt đăng nhập: {e}"
        }

def _rule_based_analysis(factory_context: Dict[str, Any], query: str = "") -> str:
    """Bộ phân tích quy tắc dự phòng — luôn trả lời bằng tiếng Việt chuyên nghiệp."""
    q_lower = (query or "").lower().strip()

    # 0. Nếu chỉ là lời cảm ơn / khen ngợi
    if any(kw in q_lower for kw in ["cảm ơn", "cam on", "thank", "tốt lắm", "tot lam", "tuyệt vời", "tuyet voi"]) and len(q_lower.split()) <= 6:
        return "Dạ không có gì ạ! Rất vui được đồng hành cùng Quản đốc. Chúc Quản đốc và toàn xưởng một ca sản xuất an toàn, thuận lợi và đạt năng suất cao nhất! Bất cứ lúc nào cần kiểm tra tiến độ hay san tải máy, Quản đốc cứ gọi tôi nhé! 🚀"

    # 0. Nếu chỉ là lời chào hỏi xã giao
    if any(kw in q_lower for kw in ["chào", "chao", "hi", "hello", "xin chào", "alo"]) and len(q_lower.split()) <= 4:
        return "Xin chào Quản đốc! Tôi là Gemini AI Copilot của Xưởng Hàn Spot. Tôi đã sẵn sàng hỗ trợ Quản đốc quét điểm nghẽn, kiểm tra tiến độ giao hàng và tối ưu lịch xưởng. Quản đốc cần kiểm tra nội dung nào trước ạ?"

    machines = factory_context.get("machines", [])
    parts = factory_context.get("parts", [])
    makespan = factory_context.get("makespan", 0)
    busy_times = factory_context.get("busyTimes", {})
    tardy_parts = factory_context.get("tardyParts", [])
    total_pcs = factory_context.get("totalPcs", 0)
    
    lines = []
    lines.append("### 🏭 Báo Cáo Phân Tích Điều Hành Xưởng Hàn Spot Toàn Diện")
    lines.append(f"- **Tổng số máy hoạt động**: {len(machines)} thiết bị.")
    lines.append(f"- **Tổng sản lượng kế hoạch**: {total_pcs:,} sản phẩm / {len(parts)} mã part.")
    if makespan > 0:
        lines.append(f"- **Makespan toàn hệ thống**: {makespan:,.0f} đơn vị thời gian (tương đương **{makespan/60:.1f} giờ** làm việc liên tục).")
    
    # 1. Điểm nghẽn (Bottlenecks)
    sorted_m = []
    idle_machines = []
    if busy_times:
        sorted_m = sorted(busy_times.items(), key=lambda x: x[1], reverse=True)
        top_busy = sorted_m[:5]
        lines.append("\n#### 🔍 Điểm Nghẽn (Bottleneck) Cần Lưu Ý:")
        for rank, (m_name, b_min) in enumerate(top_busy, 1):
            pct = (b_min / max(1, makespan)) * 100
            urgency = "🔴" if pct >= 70 else ("🟠" if pct >= 50 else ("🟡" if pct >= 35 else "🟢"))
            lines.append(f"  {rank}. {urgency} **{m_name}**: {b_min:,.0f} phút bận ({pct:.1f}% makespan)")
        # Máy nhàn rỗi
        idle_machines = [x for x in sorted_m if x[1] < makespan * 0.15]
        if idle_machines:
            lines.append(f"  * **Máy nhàn rỗi** (bận <15%): {', '.join(x[0] for x in idle_machines[:6])}")
        
        max_util_pct = (sorted_m[0][1] / max(1, makespan)) * 100 if sorted_m else 0
        if max_util_pct < 45:
            lines.append(f"\n> 🟢 **ĐÁNH GIÁ TỔNG QUAN:** Dây chuyền hiện tại **đã được cân bằng tải rất tốt**! Máy bận nhất ({sorted_m[0][0]}) chỉ chiếm **{max_util_pct:.1f}% Makespan**, các điểm nghẽn trước đây đã được giải tỏa thành công (giảm >50% tải). Hệ thống đang vận hành trong ngưỡng an toàn.")
    
    # 2. Part trễ hạn
    lines.append("\n#### ⚠️ Đánh Giá Tiến Độ & Nguy Cơ Trễ Hạn:")
    if tardy_parts:
        lines.append(f"  * 🔴 Phát hiện **{len(tardy_parts)} Part trễ hạn**: {', '.join(tardy_parts[:8])}")
        lines.append("  * **Nguyên nhân chính**: Nhu cầu dồn cục vào các máy tải cao hoặc thời điểm bắt đầu muộn (Release time).")
    else:
        lines.append("  * 🟢 **100% Đúng Hạn**: Toàn bộ các Part đều hoàn thành trước hoặc đúng ngày giao hàng quy định.")

    # 3. Đề xuất hành động — tùy theo câu hỏi
    q_lower = (query or "").lower()
    is_action_query = any(kw in q_lower for kw in [
        "thực hiện", "thuc hien", "đồng ý", "dong y", "áp dụng", "ap dung",
        "triển khai", "trien khai", "làm đi", "lam di", "kích hoạt", "kich hoat",
        "san tải", "san tai", "đổi ca", "doi ca", "24/7", "tái điều độ", "tai dieu do",
        "tối ưu ngay", "chạy đi", "chay di", "ok", "yes", "duyệt", "duyet"
    ])
    is_bottleneck_query = any(kw in q_lower for kw in [
        "nghẽn", "nghen", "bottleneck", "quá tải", "qua tai", "giải quyết", "giai quyet",
        "san tải", "san tai", "nút thắt", "nut that", "tắc", "tac", "cổ chai", "co chai",
        "overload", "chậm", "cham"
    ])

    lines.append("\n#### ⚡ Đề Xuất Hành Động Ngay Cho Quản Đốc:")

    if sorted_m:
        max_util_pct = (sorted_m[0][1] / max(1, makespan)) * 100 if sorted_m else 0
        if max_util_pct < 45:
            lines.append("  1. **Duy trì cấu hình hiện tại**: Cụm máy L3 chạy ca 24/7 và các tuyến san tải L1-6, L2-1, L2-2 đang phát huy hiệu quả rất tốt.")
            lines.append("  2. **Tập trung kiểm soát cấp phôi**: Đảm bảo phôi dập và cắt laser cấp đều đặn theo phương pháp gối đầu, không để máy hàn chờ phôi.")
            lines.append("  3. **Không cần can thiệp san tải thêm**: Tải trọng các trạm hàn hiện đã nằm trong giới hạn tối ưu an toàn.")
            lines.append(f"\n> 💡 *Dây chuyền đang ở trạng thái tối ưu ổn định. Quản đốc có muốn kiểm tra tiến độ các mã part ưu tiên hay xem báo cáo phân công công nhân không?*")
            return "\n".join(lines)

        # Chỉ lọc các máy thực sự quá tải (bận >= 50% makespan) để nâng ca và san tải
        overloaded = [m[0] for m in sorted_m if (m[1] / max(1, makespan)) >= 0.50]
        if not overloaded:
            overloaded = [sorted_m[0][0]]
        
        # Các máy nhàn rỗi nhận san tải (loại trừ các máy quá tải)
        available_idle = [m[0] for m in idle_machines if m[0] not in overloaded]
        if not available_idle:
            available_idle = [m for m in machines if m not in overloaded][:3] or ["L1-6", "L2-1", "L2-2"]

        lines.append(f"  1. **San tải hàn Spot**: Chuyển dịch công đoạn gia công từ các máy quá tải nghiêm trọng ({', '.join(overloaded)}) sang các trạm hàn Spot còn trống tải ({', '.join(available_idle[:3])}).")
        lines.append(f"  2. **Nâng ca cụm bottleneck**: Chuyển các máy {', '.join(overloaded)} sang chế độ ca **24/7** để giải phóng tải dồn cục.")
        lines.append(f"  3. **Bố trí thợ bậc cao**: Cử thợ bậc 3–4 trực tiếp hỗ trợ các ca vận hành tại {overloaded[0]} để xử lý nhanh sự cố, giảm thời gian dừng máy.")
        lines.append("  4. **Áp dụng Lot Streaming**: Chia nhỏ các lô hàng lớn để các công đoạn chạy gối đầu liên tục.")

        if is_action_query:
            shift_map = {m: "24/7" for m in overloaded}
            action_payload = {
                "action": "solve_bottlenecks",
                "shifts": shift_map,
                "reroute": {"from": overloaded, "to": available_idle[:3]},
                "re_solve": True,
                "note": f"Nâng ca 24/7 cho {', '.join(overloaded)} và san tải sang {', '.join(available_idle[:3])}"
            }
            lines.append("\n> 🚀 **Tôi đã kích hoạt khối lệnh thực thi hệ thống bên dưới.** Quản đốc vui lòng bấm nút **'🚀 Duyệt & Áp Dụng Ngay'** để hệ thống đổi ca, phân bổ lại máy và tự động tái điều độ co ngắn Makespan ngay trên màn hình!")
            lines.append(f"\n```action\n{json.dumps(action_payload, ensure_ascii=False)}\n```")
        else:
            lines.append(f"\n> 💡 *Quản đốc có thể nhắn \"Hãy thực hiện phương án trên\" để tôi kích hoạt khối lệnh tự động đổi ca và tái điều độ toàn xưởng!*")
    else:
        lines.append("  1. **Chia nhỏ lô gối đầu (Lot Streaming)**: Đặt cỡ lô 200–500 pcs để các công đoạn Laser, Dập, Spot chạy liên hoàn song song.")
        lines.append("  2. **Bố trí thợ bậc cao**: Ưu tiên phân công thợ bậc 4 vào các máy nút thắt để rút ngắn chu kỳ thao tác.")
        lines.append("  3. **Tận dụng ca làm việc**: Chuyển các máy thắt cổ chai sang chế độ ca 24/7 hoặc ca S1+S2 (6h-22h).")
        
    return "\n".join(lines)

def _is_error_response(text: str) -> bool:
    """Phát hiện phản hồi lỗi từ Gemini Web / AI provider.

    Gemini Web đôi khi trả HTTP 200 nhưng nội dung là thông báo lỗi thay vì
    câu trả lời thật. Hàm này nhận diện các mẫu lỗi phổ biến để chuỗi
    waterfall tiếp tục fallback xuống provider tiếp theo thay vì hiển thị
    thông báo lỗi tiếng Anh vô nghĩa cho Quản đốc.
    """
    if not text:
        return True
    t = text.strip().lower()
    # Quá ngắn (< 30 ký tự) thường là lỗi hoặc phản hồi rỗng
    if len(t) < 30:
        return True
    # Các mẫu lỗi phổ biến từ Gemini Web
    _ERROR_PATTERNS = [
        "i encountered an error",
        "i'm not able to help with that",
        "i can't assist with that",
        "i'm unable to",
        "could you try again",
        "something went wrong",
        "an error occurred",
        "i cannot fulfill",
        "i'm sorry, but i can't",
        "response was blocked",
        "not available right now",
        "please try again later",
    ]
    for pattern in _ERROR_PATTERNS:
        if pattern in t:
            return True
    return False


def query_gemini_brain(prompt: str, factory_context: Optional[Dict[str, Any]] = None, model_name: Optional[str] = None) -> Dict[str, Any]:
    """Gửi câu hỏi kèm ngữ cảnh nhà xưởng tới AI.

    Chuỗi waterfall: Gemini API (chính thức, miễn phí) → Gemini Web (cookie, chỉ bản
    chạy tại máy) → OpenRouter (model miễn phí) → Bộ phân tích quy tắc.
    Mỗi câu trả lời ghi rõ "provider" để giao diện hiển thị đúng nguồn.
    """
    model_name = model_name or CONFIG.get("default_model", "gemini-3.5-flash")
    context_str = ""
    if factory_context:
        # Giới hạn kích thước context gửi lên AI để tránh vượt token limit
        context_json = json.dumps(factory_context, ensure_ascii=False, indent=2)
        if len(context_json) > 48000:
            # Rút gọn: chỉ giữ thông tin quan trọng nhất
            slim_ctx = {
                "machines": factory_context.get("machines", []),
                "totalPcs": factory_context.get("totalPcs", 0),
                "makespan": factory_context.get("makespan", 0),
                "busyTimes": factory_context.get("busyTimes", {}),
                "tardyParts": factory_context.get("tardyParts", []),
            }
            # Giữ tối đa 30 part (ưu tiên part trễ hạn)
            parts = factory_context.get("parts", [])
            tardy_ids = set(factory_context.get("tardyParts", []))
            priority_parts = [p for p in parts if p.get("id") in tardy_ids]
            other_parts = [p for p in parts if p.get("id") not in tardy_ids]
            slim_ctx["parts"] = (priority_parts + other_parts)[:30]
            slim_ctx["_note"] = f"Đã rút gọn từ {len(parts)} parts xuống {len(slim_ctx['parts'])} parts (ưu tiên part trễ hạn)"
            context_json = json.dumps(slim_ctx, ensure_ascii=False, indent=2)
        context_str = "\n--- THÔNG TIN HIỆN TẠI CỦA XƯỞNG HÀN SPOT TOÀN DIỆN ---\n" + context_json + "\n----------------------------------------------------------\n"

    q_clean = (prompt or "").strip().lower()
    is_gratitude = any(w in q_clean for w in ["cảm ơn", "cam on", "thank", "tốt lắm", "tot lam", "tuyệt vời", "tuyet voi"]) and len(q_clean.split()) <= 6
    is_greeting = any(w in q_clean for w in ["chào", "chao", "hi", "hello", "alo", "xin chào"]) and len(q_clean.split()) <= 4

    if is_gratitude:
        prompt_instruction = "Quản đốc đang gửi lời cảm ơn/khen ngợi. Hãy đáp lại thật lịch sự, ngắn gọn và nhiệt tình (1-2 câu). Tuyệt đối không lặp lại báo cáo số liệu xưởng khi không được hỏi."
    elif is_greeting:
        prompt_instruction = "Quản đốc đang chào hỏi. Hãy chào lại ngắn gọn, niềm nở (1-2 câu) và hỏi Quản đốc cần kiểm tra tiến độ hay điểm nghẽn nào hôm nay."
    else:
        prompt_instruction = "Hãy trả lời ĐÚNG TRỌNG TÂM câu hỏi của Quản đốc, súc tích, thực tế và mang tính hành động cao. Không lan man sang các chủ đề không được hỏi."

    user_text = f"{context_str}\nCâu hỏi từ Quản đốc xưởng: {prompt}\n\n[HƯỚNG DẪN TRẢ LỜI]: {prompt_instruction}"
    full_prompt = f"{SYSTEM_PROMPT}\n{user_text}"

    # 1. Google Gemini API chính thức (khóa miễn phí từ AI Studio)
    api_key = _gemini_api_key()
    if api_key:
        got = _call_gemini_api(api_key, SYSTEM_PROMPT, user_text)
        if got:
            return {"ok": True, "provider": "gemini_api", "model": got["model"], "answer": got["text"]}

    # 2. Gemini Web qua cookie (chỉ có trên bản chạy tại máy cá nhân có thư mục brain/)
    if auth and hasattr(auth, "has_valid_cookie") and auth.has_valid_cookie():
        try:
            resolved = models.resolve_model(model_name)
            model_id = resolved[1]
            think_mode = resolved[2]
            response_text = gemini.generate(full_prompt, model_id=model_id, think_mode=think_mode)
            if response_text and response_text.strip() and not _is_error_response(response_text):
                return {
                    "ok": True,
                    "provider": "gemini_web",
                    "model": model_name,
                    "answer": response_text.strip()
                }
            else:
                safe_print("[AI Assistant] Gemini Web trả phản hồi lỗi, chuyển sang provider tiếp theo")
        except Exception as e:
            safe_print(f"[AI Assistant] Lỗi khi gọi Gemini Web: {type(e).__name__}")

    # 3. Kiểm tra OpenRouter API (nếu có key)
    openrouter_key = os.environ.get("OPENROUTER_API_KEY", "") or CONFIG.get("openrouter_api_key", "")
    if openrouter_key:
        try:
            or_model = CONFIG.get("openrouter_model", "openai/gpt-oss-120b:free")
            or_base = CONFIG.get("openrouter_base_url", "https://openrouter.ai/api/v1").rstrip("/")
            or_url = f"{or_base}/chat/completions"
            or_payload = {
                "model": or_model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"{context_str}\nCâu hỏi từ Quản đốc xưởng: {prompt}\n\nHãy trả lời chi tiết, thực tế và đưa ra các con số/giải pháp cụ thể:"}
                ],
                "temperature": 0.4
            }
            req = urllib.request.Request(
                or_url,
                data=json.dumps(or_payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {openrouter_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://kehoachsanxuat-spot.github.io",
                    "X-Title": "Xuong Spot Toan Dien"
                }
            )
            with urllib.request.urlopen(req, timeout=45) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                choice = data.get("choices", [{}])[0]
                text = choice.get("message", {}).get("content", "")
                if text and text.strip() and not _is_error_response(text):
                    return {
                        "ok": True,
                        "provider": "openrouter",
                        "model": or_model,
                        "answer": text.strip()
                    }
                else:
                    safe_print(f"[AI Assistant] OpenRouter trả phản hồi lỗi, chuyển sang Rule Engine")
        except Exception as e:
            safe_print(f"[AI Assistant] Lỗi khi gọi OpenRouter API: {type(e).__name__}")

    # 4. Fallback sang Bộ Phân Tích Quy Tắc Chuyên Gia Xưởng (Expert Rule Engine)
    # LUÔN thành công — không bao giờ để Quản đốc nhận thông báo lỗi trống
    safe_print("[AI Assistant] Tất cả AI provider đều thất bại → dùng Expert Rule Engine")
    fallback_text = _rule_based_analysis(factory_context or {}, prompt)
    return {
        "ok": True,
        "provider": "expert_rule_engine",
        "model": "operations-expert-v1",
        "answer": fallback_text
    }
