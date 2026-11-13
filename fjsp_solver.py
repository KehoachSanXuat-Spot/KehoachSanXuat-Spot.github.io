"""
Bộ giải FJSP (Flexible Job Shop Scheduling Problem) bằng OR-Tools CP-SAT
Dành cho Dây chuyền Hàn Spot Đa Máy (Unrelated Parallel Machines)
========================================================================
Phiên bản Kiến trúc Nâng cấp:
1. Tôn trọng chế độ Ca làm việc & Giờ nghỉ riêng từng máy (Machine-Specific Calendars).
2. Chuẩn hóa đơn vị thời gian: Giây (DataSetting) -> Phút (Timeline Lịch trình).
3. Hàm mục tiêu tối ưu chuẩn OR: Ưu tiên Makespan (hệ số 10,000) > Phạt Trễ Hạn > Tie-breaker hoàn thành sớm.
4. Ràng buộc FIFO hai đầu (Start & End) giữa các lô con (Sub-lot Streaming).
5. Heuristic Warm-Start đa ca máy hỗ trợ giải cực nhanh và fallback an toàn.
"""

from ortools.sat.python import cp_model
import collections
import time
from typing import Dict, Any, List, Optional


class MachineCalendar:
    """Quản lý lịch làm việc, giờ nghỉ giải lao, nghỉ đêm và sự cố riêng biệt cho từng máy."""
    def __init__(
        self,
        mi: int,
        m_name: str,
        shift_info: Optional[Dict[str, Any]] = None,
        downtimes: Optional[List[Dict[str, Any]]] = None,
        num_days: int = 60
    ):
        self.mi = mi
        self.m_name = m_name
        self.num_days = num_days
        self.day_length = 1440  # 1 ngày = 1440 phút

        info = shift_info or {}
        self.code = str(info.get("code", "HC")).strip().upper()
        self.is_broken = bool(info.get("is_broken", False)) or (self.code in ("OFF", "HONG", "DUNG", "BAOTRI", "STOP", "0"))
        if self.is_broken:
            self.shift_length = 0
            self.blocks = [{"start": 0, "end": self.num_days * self.day_length, "name": "Máy hỏng / Dừng hoạt động"}]
            return
        self.shift_length = max(60, int(info.get("shift_length", 540)))
        raw_breaks = info.get("breaks") or []

        # 1. Tạo danh sách các khoảng nghỉ trong ca & nghỉ đêm
        blocks = []
        for day in range(num_days):
            day_offset = day * self.day_length
            # Nghỉ giải lao / ăn ca
            for b in raw_breaks:
                bs = day_offset + int(b.get("start", 0))
                be = day_offset + int(b.get("end", 0))
                if be > bs:
                    blocks.append({"start": bs, "end": be, "name": b.get("name", "Nghỉ ca")})
            # Nghỉ đêm (từ cuối ca đến đầu ca hôm sau, trừ máy 24/7)
            if self.shift_length < self.day_length:
                ns = day_offset + self.shift_length
                ne = day_offset + self.day_length
                blocks.append({"start": ns, "end": ne, "name": "Ngoài giờ làm việc"})

        # 2. Sự cố / Bảo trì riêng của máy này
        if downtimes:
            m_key = m_name.strip().lower()
            for d in downtimes:
                dt_target = str(d.get("m", "")).strip().lower()
                dt_mi = d.get("mi")
                if dt_mi == mi or dt_target == m_key:
                    ds = int(d.get("start", 0))
                    de = int(d.get("end", 0))
                    if de > ds:
                        blocks.append({"start": ds, "end": de, "name": d.get("reason", "Bảo trì máy")})

        blocks.sort(key=lambda x: x["start"])
        # Hợp nhất các khoảng liền kề hoặc giao nhau
        merged = []
        for b in blocks:
            if not merged:
                merged.append(dict(b))
            else:
                prev = merged[-1]
                if b["start"] <= prev["end"]:
                    prev["end"] = max(prev["end"], b["end"])
                else:
                    merged.append(dict(b))
        self.blocks = merged

    def compute_calendar_end(self, raw_start: int, duration: int) -> int:
        """Bắc cầu qua các khoảng nghỉ và bảo trì để tính mốc thời gian hoàn thành thực tế."""
        s = raw_start
        changed = True
        guard = 0
        while changed and guard < 100:
            changed = False
            guard += 1
            for b in self.blocks:
                if b["start"] <= s < b["end"]:
                    s = b["end"]
                    changed = True
                    break

        cur = s
        rem = duration
        loop_guard = 0
        while rem > 0 and loop_guard < 200:
            loop_guard += 1
            next_block = None
            for b in self.blocks:
                if b["start"] >= cur:
                    next_block = b
                    break
            if not next_block:
                cur += rem
                rem = 0
                break

            avail = next_block["start"] - cur
            if avail >= rem:
                cur += rem
                rem = 0
                break
            else:
                rem -= avail
                cur = next_block["end"]
        return cur


def solve_fjsp(
    model_data: Dict[str, Any],
    time_limit: float = 25.0,
    num_workers: int = 8,
    breaks: Optional[List[Dict[str, Any]]] = None,
    downtimes: Optional[List[Dict[str, Any]]] = None,
    min_start_time: int = 0,
    frozen_intervals: Optional[List[Dict[str, Any]]] = None,
    shift_length: Optional[int] = 540,
    sublot_size: Optional[int] = 500,
    machine_shifts: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    start_solve_time = time.time()
    machines = model_data.get("machines", [])
    parts = model_data.get("parts", [])
    if not machines or not parts:
        raise ValueError("Dữ liệu không có máy hoặc part nào.")

    m_name_to_idx = {m.strip().lower(): i for i, m in enumerate(machines)}
    num_machines = len(machines)
    breaks = breaks or model_data.get("breaks", [])
    downtimes = downtimes or model_data.get("downtimes", [])
    frozen_intervals = frozen_intervals or model_data.get("frozen_intervals", [])
    effective_sublot_size = sublot_size if sublot_size is not None else model_data.get("sublot_size", 500)

    # Khởi tạo Lịch ca riêng cho từng máy (Machine Calendars)
    machine_calendars: List[MachineCalendar] = []
    shift_dict_by_mi = {}
    if machine_shifts:
        for ms in machine_shifts:
            mi_val = ms.get("mi")
            if mi_val is not None:
                shift_dict_by_mi[int(mi_val)] = ms

    for i, m_name in enumerate(machines):
        s_info = shift_dict_by_mi.get(i)
        if not s_info:
            s_info = {
                "shift_length": shift_length or 540,
                "breaks": breaks or [],
                "code": "HC"
            }
        cal = MachineCalendar(i, m_name, s_info, downtimes=downtimes, num_days=60)
        machine_calendars.append(cal)

    # Tính "khung làm việc liên tục lớn nhất" của từng máy (phút).
    # Vì mỗi thao tác trong CP-SAT là một khối cố định KHÔNG trùng giờ nghỉ,
    # thao tác chỉ đặt được nếu thời lượng của nó <= khung trống lớn nhất của máy.
    # Máy 24/7 (không có khối nghỉ) => khung vô hạn (UNLIMITED_GAP).
    UNLIMITED_GAP = 10 ** 9
    machine_max_gap: List[int] = []
    horizon_cap_minutes = 60 * 1440  # 60 ngày
    for m in range(num_machines):
        blocks = machine_calendars[m].blocks
        if not blocks:
            machine_max_gap.append(UNLIMITED_GAP)
            continue
        mg = 0
        prev_end = 0
        for b in blocks:
            if b["start"] > prev_end:
                mg = max(mg, b["start"] - prev_end)
            prev_end = max(prev_end, b["end"])
        if horizon_cap_minutes > prev_end:
            mg = max(mg, horizon_cap_minutes - prev_end)
        machine_max_gap.append(max(1, mg))

    # 1. Chuẩn bị danh sách Jobs & Lô con (Sub-lot Streaming)
    # Quy đổi chuẩn: thời gian chu kỳ tính bằng GIÂY (DataSetting) -> PHÚT (Lịch trình)
    jobs = []
    total_units = 0
    total_pcs = 0
    warnings: List[str] = []

    for pi, p in enumerate(parts):
        # Part đã SX đủ kế hoạch (ConLai = Kế hoạch − Thực tế ≤ 0) → KHÔNG xếp lịch (tránh lô ảo "1")
        try:
            qty = int(p.get("qty", 0) or 0)
        except (ValueError, TypeError):
            qty = 0
        if qty <= 0:
            continue
        ordered = bool(p.get("ordered", True))
        priority = int(p.get("priority", 2))

        # Hiệu suất (HieuSuat): thời gian thực = thời gian chuẩn ÷ hiệu suất
        try:
            eff = float(p.get("eff", 1.0) or 1.0)
        except (ValueError, TypeError):
            eff = 1.0
        if eff <= 0:
            eff = 1.0
        eff = max(0.1, min(2.0, eff))

        # Cỡ đóng gói / lô gối đầu riêng từng part (DongGoi)
        try:
            part_pack = int(p.get("pack", 0) or 0)
        except (ValueError, TypeError):
            part_pack = 0

        due_date_clock = p.get("dueDate")
        if due_date_clock is not None:
            try:
                due_date_clock = float(due_date_clock)
            except (ValueError, TypeError):
                due_date_clock = None

        min_start_clock = p.get("minStartTime") or p.get("min_start_time") or 0
        try:
            min_start_clock = float(min_start_clock)
        except (ValueError, TypeError):
            min_start_clock = 0.0
        job_min_start = max(min_start_time, min_start_clock)

        # --- Tự điều chỉnh cỡ lô con để mỗi thao tác VỪA một khung làm việc ---
        # Với mỗi thao tác, lô con tối đa đặt được = max trên các máy đủ năng lực của
        # floor(khung_trống_lớn_nhất_của_máy * 60 / thời_gian_chu_kỳ_giây).
        # Nếu có máy 24/7 đủ năng lực thì không cần cắt (khung vô hạn).
        part_fit_cap = qty
        has_unfittable_op = False
        for o in p.get("ops", []):
            op_cap = 0
            op_has_choice = False
            for ch in o.get("choices", []):
                m_str = str(ch.get("m", "")).strip().lower()
                tm = float(ch.get("time", 0))
                if m_str in m_name_to_idx and tm > 0:
                    op_has_choice = True
                    mi = m_name_to_idx[m_str]
                    gap = machine_max_gap[mi]
                    tm_eff = tm / eff  # thời gian thực sau khi áp hiệu suất
                    if gap >= UNLIMITED_GAP:
                        cap_m = qty  # máy 24/7: không giới hạn
                    else:
                        cap_m = int((gap * 60.0) // tm_eff)
                    op_cap = max(op_cap, cap_m)
            if op_has_choice:
                if op_cap <= 0:
                    # Ngay cả 1 chiếc cũng dài hơn mọi khung ca của các máy đủ năng lực
                    has_unfittable_op = True
                else:
                    part_fit_cap = min(part_fit_cap, op_cap)
        part_fit_cap = max(1, part_fit_cap)

        # Cỡ lô mong muốn = DongGoi riêng part (nếu có) > cấu hình toàn cục > nguyên lô.
        # Cỡ lô hiệu dụng = min(mong muốn, giới hạn vừa-ca) để luôn khả thi.
        if part_pack and part_pack > 0:
            user_sublot = part_pack
        elif effective_sublot_size and effective_sublot_size > 0:
            user_sublot = effective_sublot_size
        else:
            user_sublot = qty
        eff_sublot = min(user_sublot, part_fit_cap)
        eff_sublot = max(1, eff_sublot)

        # Chỉ cảnh báo khi giới hạn vừa-ca thực sự cắt nhỏ hơn mức người dùng/định mức part
        if part_fit_cap < min(user_sublot, qty):
            warnings.append(
                f"Part {p.get('id', f'Part-{pi+1}')}: tự giảm cỡ lô con xuống {eff_sublot} chiếc "
                f"để mỗi thao tác vừa khung ca (tránh CP-SAT vô nghiệm)."
            )
        if has_unfittable_op:
            warnings.append(
                f"Part {p.get('id', f'Part-{pi+1}')}: có thao tác dài hơn mọi khung ca của máy đủ năng lực; "
                f"CP-SAT có thể phải dùng nghiệm heuristic (bắc cầu qua giờ nghỉ) cho phần này."
            )

        # Chia nhỏ lô con theo cỡ hiệu dụng
        sublots = []
        if qty > eff_sublot:
            rem_q = qty
            while rem_q > 0:
                take = min(rem_q, eff_sublot)
                sublots.append(take)
                rem_q -= take
        else:
            sublots = [qty]

        for u_idx, lot_q in enumerate(sublots):
            p_ops = []
            for o in p.get("ops", []):
                seq = int(o.get("seq", 1))
                ws_tag = str(o.get("wsTag") or "_default_")
                choices = []
                for ch in o.get("choices", []):
                    m_str = str(ch.get("m", "")).strip().lower()
                    tm = float(ch.get("time", 0))
                    if m_str in m_name_to_idx and tm > 0:
                        # Thời gian thực = chuẩn ÷ hiệu suất; chuẩn hóa (giây * SL) / 60 = phút
                        dur = max(1, int(round(((tm / eff) * lot_q) / 60.0)))
                        choices.append((m_name_to_idx[m_str], dur))
                if choices:
                    active_choices = [c for c in choices if not machine_calendars[c[0]].is_broken]
                    if active_choices:
                        choices = active_choices
                    p_ops.append({"seq": seq, "ws_tag": ws_tag, "choices": choices})

            if not p_ops:
                continue

            total_units += 1
            total_pcs += lot_q
            jobs.append({
                "part": p.get("id", f"Part-{pi+1}"),
                "pi": pi,
                "unit": u_idx + 1,
                "lot_qty": lot_q,
                "total_qty": qty,
                "is_batch": True,
                "ordered": ordered,
                "priority": priority,
                "min_start_clock": job_min_start,
                "due_date_clock": due_date_clock,
                "ops": p_ops
            })

    if not jobs:
        raise ValueError("Không có thao tác hợp lệ nào cần lên lịch.")

    # 2. Heuristic Fast Dispatcher tôn trọng Ca riêng từng máy (Warm-Start cho CP-SAT)
    m_free_clock = [float(min_start_time)] * num_machines
    heuristic_starts = {}
    heuristic_ends = {}
    heuristic_presences = {}

    # Sắp xếp thứ tự ưu tiên: Min Start -> Priority (1 trước) -> Due Date
    sorted_job_indices = sorted(
        range(len(jobs)),
        key=lambda j: (jobs[j]["min_start_clock"], jobs[j]["priority"], jobs[j]["due_date_clock"] or 99999999)
    )

    is_indep_ws = (model_data.get("dsMode") == "ALL_INDEPENDENT")

    for j_idx in sorted_job_indices:
        job = jobs[j_idx]
        job_free = job["min_start_clock"]
        ws_free = {}
        for o_idx, op in enumerate(job["ops"]):
            wt = op.get("ws_tag", "_default_")
            cur_ready = ws_free.get(wt, job["min_start_clock"]) if is_indep_ws else job_free
            best_m = None
            best_start = 999999999
            best_end = 999999999

            for mi, dur in op["choices"]:
                raw_st = max(cur_ready, m_free_clock[mi])
                cand_end = machine_calendars[mi].compute_calendar_end(int(round(raw_st)), dur)
                if cand_end < best_end:
                    best_end = cand_end
                    best_start = raw_st
                    best_m = mi

            m_free_clock[best_m] = best_end
            if is_indep_ws:
                ws_free[wt] = best_end
            else:
                job_free = best_end

            heuristic_starts[(j_idx, o_idx)] = int(round(best_start))
            heuristic_ends[(j_idx, o_idx)] = int(round(best_end))
            for mi, _ in op["choices"]:
                heuristic_presences[(j_idx, o_idx, mi)] = 1 if mi == best_m else 0

    heuristic_makespan = max(m_free_clock) if m_free_clock else 0
    horizon_clock = max(int(heuristic_makespan * 1.5 + 2880), 14400)
    horizon_days = max(10, int(horizon_clock // 1440) + 2)

    # 3. Xây dựng mô hình OR-Tools CP-SAT trên Trục Thời gian Thực (Calendar Clock Time)
    cp = cp_model.CpModel()
    starts = {}
    ends = {}
    sizes = {}
    master_intervals = {}
    presences = {}
    machine_to_intervals = collections.defaultdict(list)
    machine_job_intervals = collections.defaultdict(list)

    # 3.1. Đưa các khoảng nghỉ ca, nghỉ đêm, bảo trì của từng máy vào No-Overlap
    for m in range(num_machines):
        for b_idx, b in enumerate(machine_calendars[m].blocks):
            bs = b["start"]
            be = b["end"]
            if bs < horizon_clock and be > bs:
                actual_end = min(be, horizon_clock)
                if actual_end > bs:
                    unavail_var = cp.NewIntervalVar(bs, actual_end - bs, actual_end, f"unavail_m{m}_{b_idx}")
                    machine_to_intervals[m].append(unavail_var)

    # 3.2. Áp dụng các khoảng thời gian đã đóng băng (Frozen Intervals)
    for f_idx, f_iv in enumerate(frozen_intervals):
        m_idx = f_iv.get("mi")
        fs = int(f_iv.get("start", 0))
        fe = int(f_iv.get("end", 0))
        if m_idx is not None and 0 <= m_idx < num_machines and fe > fs:
            actual_fe = min(fe, horizon_clock)
            if actual_fe > fs:
                frozen_var = cp.NewIntervalVar(fs, actual_fe - fs, actual_fe, f"frozen_{f_idx}")
                machine_to_intervals[m_idx].append(frozen_var)

    # 3.3. Tạo biến cho từng thao tác của từng Job
    all_job_ops = []
    for j_idx, job in enumerate(jobs):
        j_min_start = int(round(job["min_start_clock"]))
        job_master_intervals = []

        for o_idx, op in enumerate(job["ops"]):
            suffix = f"_j{j_idx}_o{o_idx}"
            start = cp.NewIntVar(j_min_start, horizon_clock, f"start{suffix}")
            end = cp.NewIntVar(j_min_start, horizon_clock, f"end{suffix}")

            min_d = min(c[1] for c in op["choices"])
            max_d = max(c[1] for c in op["choices"])
            size = cp.NewIntVar(min_d, max_d, f"size{suffix}")

            starts[(j_idx, o_idx)] = start
            ends[(j_idx, o_idx)] = end
            sizes[(j_idx, o_idx)] = size

            master_iv = cp.NewIntervalVar(start, size, end, f"master_iv{suffix}")
            master_intervals[(j_idx, o_idx)] = master_iv
            job_master_intervals.append(master_iv)

            m_literals = []
            for mi, dur in op["choices"]:
                presence = cp.NewBoolVar(f"presence{suffix}_m{mi}")
                presences[(j_idx, o_idx, mi)] = presence
                m_literals.append(presence)

                opt_iv = cp.NewOptionalIntervalVar(start, dur, end, presence, f"opt_iv{suffix}_m{mi}")
                machine_to_intervals[mi].append(opt_iv)
                machine_job_intervals[mi].append(opt_iv)
                cp.Add(size == dur).OnlyEnforceIf(presence)

            cp.AddExactlyOne(m_literals)
            all_job_ops.append((j_idx, o_idx))

        n_ops = len(job["ops"])
        if job["ordered"]:
            for o in range(n_ops - 1):
                if is_indep_ws and job["ops"][o + 1].get("ws_tag") != job["ops"][o].get("ws_tag"):
                    continue
                cp.Add(starts[(j_idx, o + 1)] >= ends[(j_idx, o)])
        else:
            if n_ops > 1:
                if is_indep_ws:
                    ws_iv_groups = collections.defaultdict(list)
                    for o_i, iv_var in enumerate(job_master_intervals):
                        ws_iv_groups[job["ops"][o_i].get("ws_tag", "_default_")].append(iv_var)
                    for grp in ws_iv_groups.values():
                        if len(grp) > 1:
                            cp.AddNoOverlap(grp)
                else:
                    cp.AddNoOverlap(job_master_intervals)

    # 3.4. Ràng buộc FIFO hai đầu (Start & End) giữa các lô con của cùng một Part
    part_to_jobs = collections.defaultdict(list)
    for j_idx, job in enumerate(jobs):
        part_to_jobs[job["part"]].append(j_idx)

    for p_id, j_indices in part_to_jobs.items():
        if len(j_indices) > 1:
            for k in range(len(j_indices) - 1):
                prev_j_idx = j_indices[k]
                next_j_idx = j_indices[k + 1]
                p_job = jobs[prev_j_idx]
                n_job = jobs[next_j_idx]
                common_ops = min(len(p_job["ops"]), len(n_job["ops"]))
                for o_idx in range(common_ops):
                    # Lô trước vào trước lô sau
                    cp.Add(starts[(next_j_idx, o_idx)] >= starts[(prev_j_idx, o_idx)])
                    # Lô trước hoàn thành trước lô sau (nghiêm ngặt FIFO)
                    cp.Add(ends[(next_j_idx, o_idx)] >= ends[(prev_j_idx, o_idx)])

    # 3.5. Ràng buộc Không trùng lắp trên từng Máy (No-Overlap Machine)
    for m in range(num_machines):
        if machine_to_intervals[m]:
            cp.AddNoOverlap(machine_to_intervals[m])

    # 3.6. Ràng buộc Giới hạn Nhân lực Đứng máy (DRC-FJSP: Shared-Worker Multi-Machine Constraints)
    # Với các cụm máy chia sẻ cùng 1 thợ (hoặc K thợ với K < số lượng máy trong cụm, ví dụ: 1 thợ phụ trách L2-3 & L2-4):
    # CP-SAT ép ràng buộc số máy hoạt động đồng thời không được vượt quá số thợ khả dụng K.
    # Đặc biệt khi K = 1: Bắt buộc các máy trong cụm phải hoạt động ở các thời điểm KHÁC NHAU (No-Overlap)!
    raw_workers_cfg = model_data.get("workers", [])
    if raw_workers_cfg:
        pref_groups = collections.defaultdict(list)
        for w in raw_workers_cfg:
            prefs = [p.strip().lower() for p in w.get("prefMachines", []) if p.strip()]
            if len(prefs) > 1:
                valid_mis = tuple(sorted(list(set(m_name_to_idx[p] for p in prefs if p in m_name_to_idx))))
                if len(valid_mis) > 1:
                    pref_groups[valid_mis].append(w)

        for mis, w_list in pref_groups.items():
            shifts_cnt = collections.defaultdict(int)
            for w in w_list:
                s_code = str(w.get("shift", "ALL")).upper().strip()
                shifts_cnt[s_code] += 1
            min_workers = min(shifts_cnt.values()) if shifts_cnt else len(w_list)
            cap = max(1, min(min_workers, len(mis)))

            if cap < len(mis):
                cluster_ivs = []
                for mi in mis:
                    cluster_ivs.extend(machine_job_intervals[mi])
                if cluster_ivs:
                    if cap == 1:
                        cp.AddNoOverlap(cluster_ivs)
                    else:
                        cp.AddCumulative(cluster_ivs, [1] * len(cluster_ivs), cap)

    # 4. Ràng buộc Hạn giao (Due Date) & Hàm Mục Tiêu Chuẩn OR
    makespan = cp.NewIntVar(0, horizon_clock, "makespan")
    tardiness_terms = []
    priority_completion_terms = []

    for j_idx, job in enumerate(jobs):
        for o_idx in range(len(job["ops"])):
            cp.Add(makespan >= ends[(j_idx, o_idx)])
        last_o_idx = len(job["ops"]) - 1
        last_op_end = ends[(j_idx, last_o_idx)]

        w_pri = 4 if job["priority"] == 1 else (2 if job["priority"] == 2 else 1)
        # Tie-breaker nhỏ kéo việc hoàn thành gọn gàng về phía trước
        priority_completion_terms.append(last_op_end * w_pri)

        due_clock = job.get("due_date_clock")
        if due_clock is not None and due_clock > 0:
            due_val = int(round(due_clock))
            tardiness = cp.NewIntVar(0, horizon_clock, f"tardiness_j{j_idx}")
            diff = cp.NewIntVar(-horizon_clock, horizon_clock, f"diff_j{j_idx}")
            cp.Add(diff == last_op_end - due_val)
            cp.AddMaxEquality(tardiness, [0, diff])
            # Phạt trễ hạn giao nặng
            tardiness_terms.append(tardiness * (w_pri * 100))

    # HÀM MỤC TIÊU:
    # 10,000 * makespan đảm bảo Makespan luôn là mục tiêu tối thượng số 1!
    cp.Minimize(10000 * makespan + sum(tardiness_terms) + sum(priority_completion_terms))

    # 5. Khởi tạo Warm-Start Hints từ Heuristic Dispatcher
    for (j_idx, o_idx), s_val in heuristic_starts.items():
        if s_val < horizon_clock:
            cp.AddHint(starts[(j_idx, o_idx)], s_val)
            cp.AddHint(ends[(j_idx, o_idx)], min(heuristic_ends[(j_idx, o_idx)], horizon_clock))
    for (j_idx, o_idx, mi), p_val in heuristic_presences.items():
        cp.AddHint(presences[(j_idx, o_idx, mi)], p_val)

    # 6. Giải bài toán với CP-SAT
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(time_limit)
    solver.parameters.num_search_workers = int(num_workers)
    status = solver.Solve(cp)

    is_feasible = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)

    # 7. Thu thập kết quả
    intervals = list(frozen_intervals)
    unit_end = {}

    for j_idx, job in enumerate(jobs):
        for o_idx, op in enumerate(job["ops"]):
            if is_feasible:
                chosen_m = next(mi for mi, _ in op["choices"] if solver.Value(presences[(j_idx, o_idx, mi)]) == 1)
                s_clock = int(solver.Value(starts[(j_idx, o_idx)]))
                e_clock = int(solver.Value(ends[(j_idx, o_idx)]))
            else:
                # Fallback dùng nghiệm Heuristic tôn trọng ca máy nếu CP-SAT chưa tìm ra trong time_limit
                chosen_m = next(mi for mi, _ in op["choices"] if heuristic_presences[(j_idx, o_idx, mi)] == 1)
                s_clock = heuristic_starts[(j_idx, o_idx)]
                e_clock = heuristic_ends[(j_idx, o_idx)]

            iv = {
                "part": job["part"],
                "pi": job["pi"],
                "unit": job["unit"],
                "seq": op["seq"],
                "wsTag": op.get("ws_tag"),
                "mi": chosen_m,
                "start": s_clock,
                "end": e_clock,
                "priority": job["priority"],
                "dueDate": job["due_date_clock"],
                "lotQty": job.get("lot_qty", job.get("total_qty", 1)),
                "totalQty": job.get("total_qty"),
                "isBatch": job.get("is_batch", False)
            }
            intervals.append(iv)

            u_key = f"{job['part']}#{job['unit']}"
            unit_end[u_key] = max(unit_end.get(u_key, 0), e_clock)

    # Phân công Công nhân (DRC-FJSP: Workers assignment)
    raw_workers = model_data.get("workers", [])
    workers = list(raw_workers)
    per_worker = [[] for _ in range(len(workers))]
    worker_busy = [0] * len(workers)

    if workers:
        w_free = [0] * len(workers)
        machine_zones = model_data.get("machineZones", [])

        # Sắp xếp intervals theo start time để phân công tuần tự tôn trọng thời gian thực
        for iv in sorted(intervals, key=lambda x: (x["start"], x["end"])):
            mi = iv.get("mi", 0)
            m_name = machines[mi] if mi < len(machines) else ""
            m_zone = machine_zones[mi] if mi < len(machine_zones) else ""

            # Lọc danh sách công nhân đủ năng lực trong cùng phân xưởng
            cands = []
            for w_idx, w in enumerate(workers):
                w_zone = w.get("zone", "")
                if not w_zone or not m_zone or (w_zone.strip().lower() in m_zone.strip().lower()) or (m_zone.strip().lower() in w_zone.strip().lower()):
                    cands.append(w_idx)
            if not cands:
                cands = list(range(len(workers)))

            # Chọn công nhân tối ưu: ưu tiên máy phụ trách, đúng ca làm việc, sẵn sàng sớm nhất, tải cân bằng
            best_w = None
            best_score = float('inf')
            iv_start = iv["start"]
            cur_day_m = iv_start % 1440
            active_shift_key = "S7" if cur_day_m >= 720 else "S6"

            for w_idx in cands:
                w = workers[w_idx]
                prefs = [p.strip().lower() for p in w.get("prefMachines", [])]
                pref_bonus = -500 if m_name.strip().lower() in prefs else 0
                w_shift = str(w.get("shift", "")).upper()
                shift_bonus = -300 if (not w_shift or active_shift_key in w_shift or "24/7" in w_shift) else 500
                avail_penalty = max(0, w_free[w_idx] - iv_start) * 100
                score = avail_penalty + pref_bonus + shift_bonus + (w_free[w_idx] * 0.1)
                if score < best_score:
                    best_score = score
                    best_w = w_idx

            if best_w is not None:
                w = workers[best_w]
                iv["workerId"] = w.get("id")
                iv["workerName"] = w.get("name")
                iv["workerSkill"] = w.get("skill")
                iv["workerZone"] = w.get("zone")
                iv["workerShift"] = w.get("shift")
                iv["workerEff"] = w.get("eff", 1.0)
                w_free[best_w] = max(w_free[best_w], iv["end"])
                per_worker[best_w].append(iv)
                worker_busy[best_w] += (iv["end"] - iv["start"])

    # gom nhóm perMachine
    per_machine = [[] for _ in range(num_machines)]
    for iv in intervals:
        per_machine[iv["mi"]].append(iv)
    for a in per_machine:
        a.sort(key=lambda x: x["start"])

    busy = [sum(iv["end"] - iv["start"] for iv in per_machine[m]) for m in range(num_machines)]
    completions = sorted(list(unit_end.values()))
    makespan_clock = max(completions) if completions else 0

    # Kiểm tra số lượng trễ hạn
    tardy_units = 0
    for j_idx, job in enumerate(jobs):
        due = job.get("due_date_clock")
        if due is not None and due > 0:
            u_key = f"{job['part']}#{job['unit']}"
            if unit_end.get(u_key, 0) > due:
                tardy_units += 1

    status_name = "OPTIMAL" if status == cp_model.OPTIMAL else ("FEASIBLE" if is_feasible else "HEURISTIC")
    wall_time = round(time.time() - start_solve_time, 2)

    return {
        "status": status_name,
        "solver": "CP-SAT" if is_feasible else "Heuristic Fallback",
        "makespan": makespan_clock,
        "intervals": intervals,
        "perMachine": per_machine,
        "busy": busy,
        "completions": completions,
        "totalUnits": total_units + len(frozen_intervals),
        "totalPcs": total_pcs,
        "machines": machines,
        "parts": parts,
        "wallTime": wall_time,
        "tardyUnits": tardy_units,
        "breaks": breaks,
        "downtimes": downtimes,
        "warnings": warnings,
        "workers": workers,
        "perWorker": per_worker,
        "workerBusy": worker_busy
    }
