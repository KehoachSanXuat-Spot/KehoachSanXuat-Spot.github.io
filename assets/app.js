"use strict";
/* ============================================================
   MÔ HÌNH DỮ LIỆU
   model = { machines:[name...], parts:[{id,qty,ordered,ops:[{seq,choices:[{m,time}]}]}] }
   ============================================================ */
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const PART_HUES = [205, 28, 150, 320, 48, 265, 95, 0, 180, 230, 130, 300];
const hue = i => PART_HUES[i % PART_HUES.length];
const partColor = i => `hsl(${hue(i)} 70% 55%)`;

/* ============================================================
   ĐỊNH NGHĨA CA LÀM VIỆC & GIỜ NGHỈ (THEO QUY ĐỊNH XƯỞNG)
   ============================================================ */
const SHIFTS = {
  "HC": {
    name: "HC: Hành chính (08:00 - 17:00)",
    startH: 8, startM: 0, endH: 17, endM: 0,
    breaks: [
      { start: 90, end: 100, label: "Nghỉ sáng (09:30-09:40)" },
      { start: 240, end: 285, label: "Nghỉ trưa (12:00-12:45)" },
      { start: 450, end: 460, label: "Nghỉ chiều (15:30-15:40)" }
    ]
  },
  "S1": {
    name: "S1: Ca 1 (06:00 - 14:00)",
    startH: 6, startM: 0, endH: 14, endM: 0,
    breaks: [
      { start: 210, end: 220, label: "Nghỉ giữa ca (09:30-09:40)" },
      { start: 360, end: 405, label: "Nghỉ ăn trưa (12:00-12:45)" }
    ]
  },
  "S2": {
    name: "S2: Ca 2 (14:00 - 22:00)",
    startH: 14, startM: 0, endH: 22, endM: 0,
    breaks: [
      { start: 90, end: 100, label: "Nghỉ giữa ca (15:30-15:40)" },
      { start: 270, end: 315, label: "Nghỉ ăn tối (18:30-19:15)" }
    ]
  },
  "S3": {
    name: "S3: Ca 3 (22:00 - 06:00)",
    startH: 22, startM: 0, endH: 6, endM: 0,
    breaks: [
      { start: 120, end: 130, label: "Nghỉ giữa ca (00:00-00:10)" },
      { start: 240, end: 285, label: "Nghỉ ăn đêm (02:00-02:45)" }
    ]
  },
  "S6": {
    name: "S6: 12h ngày (06:00 - 18:00)",
    startH: 6, startM: 0, endH: 18, endM: 0,
    breaks: [
      { start: 120, end: 125, label: "Nghỉ (08:00-08:05)" },
      { start: 240, end: 270, label: "Nghỉ ăn (10:00-10:30)" },
      { start: 360, end: 365, label: "Nghỉ (12:00-12:05)" },
      { start: 480, end: 510, label: "Nghỉ giữa ca (14:00-14:30)" },
      { start: 600, end: 605, label: "Nghỉ (16:00-16:05)" }
    ]
  },
  "S7": {
    name: "S7: 12h đêm (18:00 - 06:00)",
    startH: 18, startM: 0, endH: 6, endM: 0,
    breaks: [
      { start: 120, end: 125, label: "Nghỉ (20:00-20:05)" },
      { start: 240, end: 270, label: "Nghỉ ăn (22:00-22:30)" },
      { start: 360, end: 365, label: "Nghỉ (00:00-00:05)" },
      { start: 480, end: 510, label: "Nghỉ giữa ca (02:00-02:30)" },
      { start: 600, end: 605, label: "Nghỉ (04:00-04:05)" }
    ]
  },
  "ALL_DAY": {
    name: "3 Ca 24/7 (S1 + S2 + S3 liên tục)",
    startH: 6, startM: 0, endH: 6, endM: 0,
    breaks: [
      { start: 210, end: 220, label: "Nghỉ S1 (09:30-09:40)" },
      { start: 360, end: 405, label: "Nghỉ ăn S1 (12:00-12:45)" },
      { start: 570, end: 580, label: "Nghỉ S2 (15:30-15:40)" },
      { start: 750, end: 795, label: "Nghỉ ăn S2 (18:30-19:15)" },
      { start: 1080, end: 1090, label: "Nghỉ S3 (00:00-00:10)" },
      { start: 1200, end: 1245, label: "Nghỉ ăn S3 (02:00-02:45)" }
    ]
  },
  "NONE": {
    name: "Tự do (Không áp dụng giờ nghỉ)",
    startH: 8, startM: 0, endH: 17, endM: 0,
    breaks: []
  }
};

function getMachineShiftInfo(mi){
  let raw = (model && model.machineShifts && model.machineShifts[mi]) ? String(model.machineShifts[mi]).trim() : "HC";
  const s = strip(raw);

  // Nhận diện máy HỎNG / DỪNG HOẠT ĐỘNG / OFF
  if(s === "off" || s.includes("hong") || s.includes("dung") || s.includes("baotri") || s.includes("stop") || s.includes("broken") || s === "0" || s.includes("khoa") || (model && model.machineBrokenStatus && model.machineBrokenStatus[mi])){
    return {
      key: "OFF",
      name: "OFF: Dừng hoạt động / Máy hỏng",
      isBroken: true,
      startH: 0, startM: 0, endH: 0, endM: 0,
      shiftLength: 0,
      breaks: [
        { start: 0, end: 144000, label: "Máy hỏng / Dừng hoạt động" }
      ]
    };
  }
  if(s.includes("24/7") || s.includes("3ca") || s.includes("allday") || s.includes("lien") || s.includes("24h")){
    return {
      key: "ALL_DAY",
      name: "24/7 (3 Ca liên tục)",
      startH: 6, startM: 0, endH: 6, endM: 0,
      shiftLength: 1440,
      breaks: []
    };
  }
  if(s.includes("s1") && s.includes("s2")){
    return {
      key: "S1_S2",
      name: "2 Ca (S1 + S2: 06:00 - 22:00)",
      startH: 6, startM: 0, endH: 22, endM: 0,
      shiftLength: 960,
      breaks: [
        { start: 210, end: 220, label: "Nghỉ sáng (09:30-09:40)" },
        { start: 360, end: 405, label: "Nghỉ trưa (12:00-12:45)" },
        { start: 570, end: 580, label: "Giao ca (15:30-15:40)" },
        { start: 750, end: 795, label: "Nghỉ tối (18:30-19:15)" }
      ]
    };
  }
  if(s.includes("s6") && s.includes("s7")){
    return {
      key: "S6_S7",
      name: "2 Ca 12h (S6 Ngày + S7 Đêm: 24/7)",
      startH: 6, startM: 0, endH: 6, endM: 0,
      shiftLength: 1440,
      breaks: [
        { start: 120, end: 125, label: "Nghỉ S6 (08:00-08:05)" },
        { start: 240, end: 270, label: "Ăn trưa S6 (10:00-10:30)" },
        { start: 360, end: 365, label: "Nghỉ S6 (12:00-12:05)" },
        { start: 480, end: 510, label: "Nghỉ S6 (14:00-14:30)" },
        { start: 600, end: 605, label: "Nghỉ S6 (16:00-16:05)" },
        { start: 720, end: 730, label: "Giao ca S6 -> S7 (18:00-18:10)" },
        { start: 840, end: 845, label: "Nghỉ S7 (20:00-20:05)" },
        { start: 960, end: 990, label: "Ăn đêm S7 (22:00-22:30)" },
        { start: 1080, end: 1085, label: "Nghỉ S7 (00:00-00:05)" },
        { start: 1200, end: 1230, label: "Nghỉ S7 (02:00-02:30)" },
        { start: 1320, end: 1325, label: "Nghỉ S7 (04:00-04:05)" }
      ]
    };
  }
  if(s.includes("s1")){
    return { key: "S1", name: "Ca 1 (06:00 - 14:00)", startH: 6, startM: 0, endH: 14, endM: 0, shiftLength: 480, breaks: SHIFTS["S1"].breaks };
  }
  if(s.includes("s2")){
    return { key: "S2", name: "Ca 2 (14:00 - 22:00)", startH: 14, startM: 0, endH: 22, endM: 0, shiftLength: 480, breaks: SHIFTS["S2"].breaks };
  }
  if(s.includes("s3")){
    return { key: "S3", name: "Ca 3 (22:00 - 06:00)", startH: 22, startM: 0, endH: 6, endM: 0, shiftLength: 480, breaks: SHIFTS["S3"].breaks };
  }
  if(s.includes("s6")){
    return { key: "S6", name: "12h ngày (06:00 - 18:00)", startH: 6, startM: 0, endH: 18, endM: 0, shiftLength: 720, breaks: SHIFTS["S6"].breaks };
  }
  if(s.includes("s7")){
    return { key: "S7", name: "12h đêm (18:00 - 06:00)", startH: 18, startM: 0, endH: 6, endM: 0, shiftLength: 720, breaks: SHIFTS["S7"].breaks };
  }
  return {
    key: "HC",
    name: "HC: Hành chính (08:00 - 17:00)",
    startH: 8, startM: 0, endH: 17, endM: 0,
    shiftLength: 540,
    breaks: [
      { start: 90, end: 100, label: "Nghỉ sáng (09:30-09:40)" },
      { start: 240, end: 285, label: "Nghỉ trưa (12:00-12:45)" },
      { start: 450, end: 460, label: "Nghỉ chiều (15:30-15:40)" }
    ]
  };
}

function getActiveShift(){
  return getMachineShiftInfo(0);
}
function getActiveBreaks(){
  return getActiveShift().breaks || [];
}

function formatCalendarTime(minutesFromStart){
  const m = Math.max(0, Math.round(minutesFromStart));
  const dayIdx = Math.floor(m / 1440);
  const remM = m % 1440;
  const hh = Math.floor(remM / 60);
  const mm = remM % 60;
  const timeStr = `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
  if(model && model.dateLabels && model.dateLabels[dayIdx]){
    return `${model.dateLabels[dayIdx]} ${timeStr}`;
  }
  return `N${dayIdx + 1} ${timeStr}`;
}

function formatClockTime(minutesFromStart){
  return formatCalendarTime(minutesFromStart);
}

function getMachineBlocks(mi, numDays = 60){
  const sh = getMachineShiftInfo(mi);
  const blocks = [];
  for(let day = 0; day < numDays; day++){
    const dayOffset = day * 1440;
    if(sh.breaks){
      for(const b of sh.breaks){
        blocks.push({ start: dayOffset + b.start, end: dayOffset + b.end });
      }
    }
    if(sh.shiftLength < 1440){
      blocks.push({ start: dayOffset + sh.shiftLength, end: dayOffset + 1440 });
    }
  }
  return blocks;
}

// Danh sách sự cố máy: [{ id, mi, m, start, end, reason }]
let downtimes = [];

/* ---- Dữ liệu mẫu (khớp file Excel mẫu) ---- */
const SAMPLE = {
  machines: [
    "Laser-Tam-1","Laser-Tam-2",
    "Laser-Ong-1","Laser-Ong-2",
    "Dap-60T","Dap-110T","Dap-160T","Dap-250T","Dap-500T",
    "Spot1","Spot2","Spot3","Spot4","Spot5","Spot6","Spot7","Spot8",
    "Robot-MAG-1","Robot-MAG-2","Robot-MAG-3"
  ],
  layout: [
    {x:-3,y:1},{x:-3,y:2},
    {x:-3,y:6},{x:-3,y:7},
    {x:-1,y:1},{x:-1,y:2},{x:-1,y:3},{x:-1,y:4},{x:-1,y:5},
    {x:1,y:1},{x:1,y:2},{x:1,y:3},{x:1,y:4},{x:2,y:1},{x:2,y:2},{x:2,y:3},{x:2,y:4},
    {x:5,y:2},{x:5,y:4},{x:5,y:6}
  ],
  rotations: [
    0, 0,
    0, 0,
    0, 0, 0, 0, 0,
    0, 0, 90, 90, 0, 180, 180, 270,
    0, 0, 0
  ],
  machineTypes: [
    "lasertam","lasertam",
    "laserong","laserong",
    "maydap1","maydap2","maydap3","maydap4","maydap5",
    "nho","nho","trungbinh","camtay","camtay","to","to","bulong",
    "magrobot","magrobot","magrobot"
  ],
  machinePowers: [
    "12kW","12kW",
    "6kW","6kW",
    "60T","110T","160T","250T","500T",
    "35kVA","35kVA","50kVA","75kVA","75kVA","100kVA","120kVA","100kVA",
    "350A","350A","500A"
  ],
  machineZones: [
    "Xưởng Hàn Spot","Xưởng Hàn Spot",
    "Xưởng Hàn Spot","Xưởng Hàn Spot",
    "Xưởng Hàn Spot","Xưởng Hàn Spot","Xưởng Hàn Spot","Xưởng Hàn Spot","Xưởng Hàn Spot",
    "Xưởng Hàn Spot","Xưởng Hàn Spot","Xưởng Hàn Spot","Xưởng Hàn Spot","Xưởng Hàn Spot","Xưởng Hàn Spot","Xưởng Hàn Spot","Xưởng Hàn Spot",
    "Xưởng Hàn Spot","Xưởng Hàn Spot","Xưởng Hàn Spot"
  ],
  machineShifts: [
    "S1, S2","S1, S2",
    "S1, S2","S1, S2",
    "HC","HC","HC","S1, S2","S1, S2",
    "HC","HC","HC","HC","HC","S1, S2","S1, S2","HC",
    "S1, S2","S1, S2","24/7"
  ],
  warehouses: [
    { name: "Kho-BTP", x: -12, y: 18, rot: 0, power: "10000 pcs", zone: "Xưởng Hàn Spot" },
    { name: "Linh_Kien_Mua", x: 80, y: 0, rot: 0, power: "10000 pcs", zone: "Xưởng Hàn Spot" }
  ],
  dateLabels: ["06-Nov","07-Nov","08-Nov","09-Nov","10-Nov","11-Nov","12-Nov","13-Nov","14-Nov","15-Nov"],
  dsSheets: ["DataSetting"],
  dsMode: "SINGLE_WORKSHOP",
  workers: [
    { id: "CN-SP01", name: "Nguyễn Văn Tuấn", zone: "Xưởng Hàn Spot", skill: "Bậc 3", shift: "S6, S7", eff: 1.15, prefMachines: ["Spot1", "Spot2"], note: "Thợ hàn điểm kinh nghiệm 5 năm" },
    { id: "CN-SP02", name: "Trần Đình Trọng", zone: "Xưởng Hàn Spot", skill: "Bậc 3", shift: "S6, S7", eff: 1.10, prefMachines: ["Spot3", "Spot4"], note: "Thợ hàn C-frame tay nghề cao" },
    { id: "CN-SP03", name: "Lê Văn Hùng", zone: "Xưởng Hàn Spot", skill: "Bậc 3", shift: "S6, S7", eff: 1.10, prefMachines: ["Spot5", "Spot6"], note: "Chuyên máy hàn hạng nặng" },
    { id: "CN-SP04", name: "Phạm Quốc Huy", zone: "Xưởng Hàn Spot", skill: "Bậc 2", shift: "S6, S7", eff: 1.00, prefMachines: ["Spot7", "Spot8"], note: "Chuyên hàn tự động" },
    { id: "CN-DP01", name: "Nguyễn Thành Long", zone: "Xưởng Hàn Spot", skill: "Bậc 4", shift: "HC", eff: 1.20, prefMachines: ["Dap-500T", "Dap-250T"], note: "Tổ trưởng cơ khí dập" },
    { id: "CN-DP02", name: "Đặng Đình Bách", zone: "Xưởng Hàn Spot", skill: "Bậc 3", shift: "HC", eff: 1.10, prefMachines: ["Dap-160T", "Dap-110T"], note: "Thợ dập tay nghề vững" },
    { id: "CN-DP03", name: "Phan Văn Thịnh", zone: "Xưởng Hàn Spot", skill: "Bậc 2", shift: "HC", eff: 1.05, prefMachines: ["Dap-60T"], note: "Vận hành máy dập nhỏ" },
    { id: "CN-LT01", name: "Trần Văn Toàn", zone: "Xưởng Hàn Spot", skill: "Bậc 3", shift: "S1, S2", eff: 1.15, prefMachines: ["Laser-Tam-1", "Laser-Tam-2"], note: "Vận hành cắt laser tấm CNC" },
    { id: "CN-LO01", name: "Đỗ Quốc Việt", zone: "Xưởng Hàn Spot", skill: "Bậc 3", shift: "S1, S2", eff: 1.15, prefMachines: ["Laser-Ong-1", "Laser-Ong-2"], note: "Chuyên cắt ống hộp 3D" },
    { id: "CN-MG01", name: "Trịnh Bá Thắng", zone: "Xưởng Hàn Spot", skill: "Bậc 4", shift: "S1, S2", eff: 1.20, prefMachines: ["Robot-MAG-1", "Robot-MAG-2"], note: "Lập trình viên Robot MAG" },
    { id: "CN-MG02", name: "Hoàng Minh Trí", zone: "Xưởng Hàn Spot", skill: "Bậc 3", shift: "24/7", eff: 1.10, prefMachines: ["Robot-MAG-3", "Robot-MAG-4"], note: "Vận hành và set gá hàn robot" }
  ],
  parts: [
    {id:"Part-A",qty:600,planQty:600,actualQty:0,ordered:true, priority:1, dueDate:1440, startDate:"06-Nov", pack:200, eff:0.9, ops:[
      {seq:1,wsTag:"DataSetting_LaserTam",choices:[{m:"Laser-Tam-1",time:10},{m:"Laser-Tam-2",time:10}]},
      {seq:2,wsTag:"DataSetting_Dap",choices:[{m:"Dap-60T",time:8},{m:"Dap-110T",time:7},{m:"Dap-160T",time:7}]},
      {seq:3,wsTag:"DataSetting_Spot",choices:[{m:"Spot1",time:12},{m:"Spot4",time:10}]},
      {seq:4,wsTag:"DataSetting_MAG",choices:[{m:"Robot-MAG-1",time:18},{m:"Robot-MAG-2",time:18}]}]},
    {id:"Part-B",qty:800,planQty:800,actualQty:0,ordered:true, priority:2, dueDate:2880, startDate:"06-Nov", pack:200, eff:0.85, ops:[
      {seq:1,wsTag:"DataSetting_LaserOng",choices:[{m:"Laser-Ong-1",time:12},{m:"Laser-Ong-2",time:12}]},
      {seq:2,wsTag:"DataSetting_Spot",choices:[{m:"Spot6",time:16},{m:"Spot7",time:15}]},
      {seq:3,wsTag:"DataSetting_MAG",choices:[{m:"Robot-MAG-2",time:20},{m:"Robot-MAG-3",time:18}]}]},
    {id:"Part-C",qty:500,planQty:500,actualQty:0,ordered:true, priority:2, startDate:"06-Nov", pack:250, ops:[
      {seq:1,wsTag:"DataSetting_LaserTam",choices:[{m:"Laser-Tam-1",time:9},{m:"Laser-Tam-2",time:9}]},
      {seq:2,wsTag:"DataSetting_Dap",choices:[{m:"Dap-250T",time:10},{m:"Dap-500T",time:9}]},
      {seq:3,wsTag:"DataSetting_Spot",choices:[{m:"Spot2",time:12},{m:"Spot3",time:11}]},
      {seq:4,wsTag:"DataSetting_Spot",choices:[{m:"Spot8",time:12}]}]},
    {id:"Part-D",qty:400,planQty:400,actualQty:0,ordered:false, priority:3, startDate:"07-Nov", pack:200, ops:[
      {seq:1,wsTag:"DataSetting_Dap",choices:[{m:"Dap-160T",time:7},{m:"Dap-250T",time:7}]},
      {seq:2,wsTag:"DataSetting_Spot",choices:[{m:"Spot5",time:14},{m:"Spot6",time:12}]},
      {seq:3,wsTag:"DataSetting_MAG",choices:[{m:"Robot-MAG-1",time:16},{m:"Robot-MAG-3",time:15}]}]}
  ]
};

let model=null, schedule=null, sim={t:0,end:1,playing:false,speed:1,liveMode:false,realRatio:0};

/* ============================================================
   ĐỌC EXCEL  (sheet "May" + sheet "KeHoach" long-format)
   ============================================================ */
const strip = s => (s==null?"":String(s)).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/\s|_/g,"");
const isYes = v => ["y","yes","co","có","true","1","x","ordered","trinhtu"].includes(strip(v));

function pickSheet(wb, keys){
  for(const nm of wb.SheetNames){ const s=strip(nm); if(keys.some(k=>s.includes(k))) return wb.Sheets[nm]; }
  return null;
}
function col(headers, keys){
  for(let i=0;i<headers.length;i++){ const h=strip(headers[i]); if(keys.some(k=>h.includes(k))) return i; }
  return -1;
}
function colExact(headers, names){ // khớp chính xác (dùng cho cột X, Y để tránh "tenmay" dính 'y')
  for(let i=0;i<headers.length;i++){ if(names.includes(strip(headers[i]))) return i; }
  return -1;
}

// Định dạng giá trị ngày từ Excel (chuẩn hoá cả số serial date 46339, đối tượng Date hoặc text "13-Nov")
function formatExcelDateValue(rawVal){
  if(rawVal == null) return '';
  if(rawVal instanceof Date){
    const d = rawVal.getDate();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return (d < 10 ? '0' : '') + d + '-' + months[rawVal.getMonth()];
  }
  const num = Number(rawVal);
  if(!isNaN(num) && num >= 30000 && num <= 65000){
    // Mã serial ngày của Excel (ví dụ 46339 = 13-Nov-2026)
    const dt = new Date(Math.round((num - 25569) * 86400 * 1000));
    const d = dt.getUTCDate();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return (d < 10 ? '0' : '') + d + '-' + months[dt.getUTCMonth()];
  }
  const s = String(rawVal).trim();
  const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(mIso){
    const day = parseInt(mIso[3], 10);
    const mIdx = parseInt(mIso[2], 10) - 1;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return (day < 10 ? '0' : '') + day + '-' + months[mIdx];
  }
  return s;
}

// Chuyển đổi nhãn ngày (09-Nov, 15-Nov, N3 17:00, 48h...) thành phút mốc thời gian trên timeline
function convertDateStringToOffsetMinutes(dateStr, dateHeaders, isEnd = false, shiftLength = 540){
  if(!dateStr) return null;
  const s = formatExcelDateValue(dateStr);
  if(!s) return null;

  // 1. Dạng N{day} HH:MM, ví dụ: N3 17:00
  const mDayHour = s.match(/^N(\d+)\s+(\d{1,2}):(\d{2})$/i);
  if(mDayHour){
    const day = parseInt(mDayHour[1], 10);
    const hh = parseInt(mDayHour[2], 10);
    const mm = parseInt(mDayHour[3], 10);
    const sh = getActiveShift();
    const shiftStartMin = sh ? (sh.startH * 60 + sh.startM) : 480;
    return Math.max(0, (day - 1) * 1440 + (hh * 60 + mm) - shiftStartMin);
  }

  // 2. Dạng giờ tròn: 48h
  const mHours = s.match(/^(\d+)\s*h$/i);
  if(mHours){
    return parseInt(mHours[1], 10) * 60;
  }

  // 3. Khớp chính xác với danh sách các cột ngày (ví dụ: ['06-Nov', '07-Nov', ...])
  const cleanStr = strip(s);
  if(dateHeaders && dateHeaders.length > 0){
    const exactIdx = dateHeaders.findIndex(dh => strip(dh) === cleanStr);
    if(exactIdx >= 0){
      return isEnd ? (exactIdx * 1440 + shiftLength) : (exactIdx * 1440);
    }
  }

  // 4. Phân tích DD-MMM hoặc DD/MM so với cột ngày đầu tiên
  if(dateHeaders && dateHeaders.length > 0){
    const firstHeader = dateHeaders[0];
    const parseDayMonth = (str) => {
      const m = str.match(/(\d{1,2})[-/]([A-Za-z]{3}|\d{1,2})/i);
      if(!m) return null;
      const day = parseInt(m[1], 10);
      const monthStr = m[2].toLowerCase();
      const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      let month = parseInt(monthStr, 10);
      if(isNaN(month)){
        month = months.indexOf(monthStr.slice(0, 3)) + 1;
      }
      return { day, month };
    };

    const baseDM = parseDayMonth(firstHeader);
    const targetDM = parseDayMonth(s);
    if(baseDM && targetDM && baseDM.month > 0 && targetDM.month > 0){
      const currentYear = new Date().getFullYear();
      const dBase = new Date(currentYear, baseDM.month - 1, baseDM.day);
      const dTarget = new Date(currentYear, targetDM.month - 1, targetDM.day);
      const diffDays = Math.round((dTarget - dBase) / (1000 * 60 * 60 * 24));
      return isEnd ? Math.max(0, diffDays * 1440 + shiftLength) : Math.max(0, diffDays * 1440);
    }
  }

  // 5. Nếu là số phút trực tiếp
  const val = Number(s);
  if(!isNaN(val) && val > 0) return val;

  return null;
}

function friendlyDsSheetLabel(nm){
  const s = strip(nm);
  if(s.includes("lasertam") || s.includes("cattam")) return `⚡ Khu Cắt Laser Tấm (${nm})`;
  if(s.includes("laserong") || s.includes("catong")) return `🟢 Khu Cắt Laser Ống (${nm})`;
  if(s.includes("dap") || s.includes("stamp"))       return `🔨 Xưởng Dập (${nm})`;
  if(s.includes("spot"))                             return `🏭 Xưởng Hàn Spot (${nm})`;
  if(s.includes("mag") || s.includes("robot"))       return `🤖 Xưởng Hàn MAG Robot (${nm})`;
  return `🔧 Thông số Routing (${nm})`;
}

function parseWorkbook(wb, preferredPlanSheet = null, preferredDsMode = null){
  const warnings=[];
  let dateLabels = [];
  const sh = getActiveShift();
  const shiftLength = sh ? ((sh.endH*60 + sh.endM) - (sh.startH*60 + sh.startM)) : 540;
  
  // 1. Tìm sheet Máy
  let mSheetName = wb.SheetNames.find(nm => {
    const s = strip(nm);
    return s.includes("may") || s.includes("machine");
  }) || wb.SheetNames[0];
  const mSheet = wb.Sheets[mSheetName];

  // 2. Tìm TẤT CẢ các sheet DataSetting (hỗ trợ tách riêng DataSetting_Spot, DataSetting_Dap, DataSetting_LaserTam, DataSetting_LaserOng, DataSetting_MAG...)
  const rawDsSheets = wb.SheetNames.filter(nm => {
    const s = strip(nm);
    return s.includes("datasetting") || s.includes("setting") || s.includes("thongso") || s.includes("routing");
  });
  const sheetRank = nm => {
    const s = strip(nm);
    if(s.includes("lasertam") || s.includes("cattam")) return 1;
    if(s.includes("laserong") || s.includes("catong")) return 2;
    if(s.includes("dap") || s.includes("stamp"))       return 3;
    if(s.includes("spot"))                             return 4;
    if(s.includes("mag") || s.includes("robot"))       return 5;
    return 6;
  };
  const dsSheets = [...rawDsSheets].sort((a, b) => sheetRank(a) - sheetRank(b));
  const dsSet = new Set(dsSheets);

  let dsMode = preferredDsMode;
  if(!dsMode || (dsMode !== "ALL_INDEPENDENT" && dsMode !== "ALL_LINKED" && !dsSet.has(dsMode))){
    dsMode = dsSheets.length > 1 ? "ALL_INDEPENDENT" : (dsSheets[0] || "");
  }
  const activeDsSheets = (dsMode === "ALL_INDEPENDENT" || dsMode === "ALL_LINKED")
    ? dsSheets
    : (dsMode && wb.Sheets[dsMode] ? [dsMode] : []);

  // 3. Tìm sheet KeHoachSanXuat (chứa kế hoạch ngày/tuần/tháng, số lượng, thực tế, ngày bắt đầu, hạn giao)
  const planSheets = wb.SheetNames.filter(nm => {
    const s = strip(nm);
    return nm !== mSheetName && !dsSet.has(nm) && !s.includes("khsxdong") && (
      s.includes("kehoachsanxuat") || s.includes("sanxuat") || s.includes("kehoach") || s.includes("plan") || s.includes("tuan") || s.includes("thang")
    );
  });
  let khSheetName = (preferredPlanSheet && wb.Sheets[preferredPlanSheet] && !dsSet.has(preferredPlanSheet))
    ? preferredPlanSheet
    : (planSheets[0] || "");
  if(!khSheetName){
    const candidates = wb.SheetNames.filter(nm => nm !== mSheetName && !dsSet.has(nm) && !strip(nm).includes("khsxdong"));
    if(candidates.length > 0) khSheetName = candidates[0];
  }

  // --- 4. Đọc danh sách máy & kho từ sheet May (toạ độ X,Y, Công suất, Kiểu máy, Khu vực, Setup và Ca làm việc) ---
  let machines=[], layout=[], machineShifts=[], rotations=[], machineTypes=[], machinePowers=[], machineZones=[], machineSetups=[], warehouses=[], machineBrokenStatus=[];
  if(mSheet){
    const rows=XLSX.utils.sheet_to_json(mSheet,{header:1,blankrows:false});
    if(rows.length){
      const hdr=rows[0]; let ci=col(hdr,["tenmay","may","machine","ten"]); if(ci<0) ci=0;
      const xi=colExact(hdr,["x","toadox","trucx","hoanhdo"]);
      const yi=colExact(hdr,["y","toadoy","trucy","tungdo"]);
      const cShift=col(hdr,["ca","calamviec","shift","chedo"]);
      const cRot=col(hdr,["gocquay","goc","rot","rotation","quay"]);
      const cType=col(hdr,["kieumay","loaimay","type","model","kieu","dongmay"]);
      const cPower=col(hdr,["congsuat","power","capacity","kva","capa","cs","succhua"]);
      const cZone=col(hdr,["khuvuc","xuong","phanxuong","zone","area"]);
      const cSetup=col(hdr,["setup","thaykhuon","doiga","setupphut","changeover"]);
      const cStatus=col(hdr,["trangthai","status","tinhtrang","tinhtrangmay","hoatdong","tinhtranghoatdong"]);
      const cNote=col(hdr,["ghichu","note","mota","ghichumay"]);

      for(let r=1;r<rows.length;r++){ const v=rows[r][ci]; if(v!=null&&String(v).trim()){
        const mNameStr = String(v).trim();
        const px=xi>=0?Number(rows[r][xi]):NaN, py=yi>=0?Number(rows[r][yi]):NaN;
        const shVal = (cShift>=0 && rows[r][cShift]) ? String(rows[r][cShift]).trim() : "HC";
        const rotVal = (cRot>=0 && rows[r][cRot]!=null) ? (parseFloat(rows[r][cRot])||0) : 0;
        const powVal = (cPower>=0 && rows[r][cPower]!=null) ? String(rows[r][cPower]).trim() : "";
        let rawZone = (cZone>=0 && rows[r][cZone]!=null && String(rows[r][cZone]).trim()!=="") ? String(rows[r][cZone]).trim() : "";
        const rawSetup = (cSetup>=0 && rows[r][cSetup]!=null && String(rows[r][cSetup]).trim()!=="") ? parseFloat(String(rows[r][cSetup]).replace(/[^0-9.]/g,"")) : NaN;
        const statusVal = (cStatus>=0 && rows[r][cStatus]!=null) ? String(rows[r][cStatus]).trim().toLowerCase() : "";
        const noteVal = (cNote>=0 && rows[r][cNote]!=null) ? String(rows[r][cNote]).trim().toLowerCase() : "";
        const shNorm = strip(shVal).toLowerCase();

        // Nhận diện máy HỎNG / DỪNG HOẠT ĐỘNG / BẢO TRÌ:
        const isBroken = (shNorm === "off" || shNorm.includes("hong") || shNorm.includes("dung") || shNorm.includes("baotri") || shNorm.includes("stop") || shNorm.includes("broken") || shNorm === "0") ||
                         (statusVal.includes("hong") || statusVal.includes("suco") || statusVal.includes("baotri") || statusVal.includes("broken") || statusVal.includes("stop") || statusVal.includes("dung") || statusVal.includes("off")) ||
                         (noteVal.includes("hong") || noteVal.includes("su co") || noteVal.includes("sự cố") || noteVal.includes("bao tri") || noteVal.includes("bảo trì") || noteVal.includes("broken") || noteVal.includes("dừng"));

        let typeVal = (cType>=0 && rows[r][cType]!=null) ? strip(rows[r][cType]).toLowerCase() : strip(mNameStr).toLowerCase();
        const mNameLow = strip(mNameStr).toLowerCase();

        // Nhận diện dòng khai báo KHO / KHU HÀNG CHỜ BTP / KHO LINH KIỆN MUA (KieuMay = Kho / WIP / KeHang / Staging / LinhKien)
        if(typeVal.includes("kho") || typeVal.includes("wip") || typeVal.includes("kehang") || typeVal.includes("staging") || typeVal.includes("supermarket") || typeVal.includes("linhkien") || mNameLow.includes("linh_kien") || mNameLow.includes("linhkien") || mNameLow.includes("kho")){
          warehouses.push({
            name: mNameStr,
            x: isFinite(px) ? px : 0,
            y: isFinite(py) ? py : 0,
            rot: rotVal,
            power: powVal,
            zone: rawZone
          });
          continue;
        }

        machines.push(mNameStr);
        layout.push(isFinite(px)&&isFinite(py)?{x:px,y:py}:null);
        machineShifts.push(isBroken ? "OFF" : shVal);
        machineBrokenStatus.push(isBroken);
        rotations.push(rotVal);
        machinePowers.push(powVal);
        machineSetups.push(isFinite(rawSetup) && rawSetup >= 0 ? rawSetup : null);

        // Tự động thêm Downtime nếu máy được đánh dấu hỏng
        if(isBroken){
          const mIdx = machines.length - 1;
          const dtExist = downtimes.some(d => d.m === mNameStr || d.mi === mIdx);
          if(!dtExist){
            downtimes.push({
              id: Date.now() + r,
              mi: mIdx,
              m: mNameStr,
              start: 0,
              end: 144000,
              reason: noteVal || statusVal || "Máy hỏng / Dừng hoạt động"
            });
          }
        }

        if(typeVal.includes("laserong")||typeVal.includes("catong")||typeVal.includes("tube")||typeVal.includes("pipe")){
          typeVal = "laserong";
        } else if(typeVal.includes("lasertam")||typeVal.includes("cattam")||typeVal.includes("sheet")||typeVal.includes("laser")){
          typeVal = "lasertam";
        } else if(typeVal.includes("dap")||typeVal.includes("press")||typeVal.includes("stamp")){
          // Phân loại 5 cỡ mô hình 3D Máy Dập theo mã kiểu (MayDap1..5, Nho/Vua/Trung/Lon/To) hoặc tự động theo Công suất (Tấn)
          const tonMatch = (powVal + " " + mNameStr).match(/(\d+(?:\.\d+)?)\s*t/i) || powVal.match(/(\d+)/);
          const ton = tonMatch ? parseFloat(tonMatch[1]) : 160;
          if(typeVal.includes("1") || typeVal.includes("nho") || typeVal.includes("mini")){
            typeVal = "maydap1"; // C-Frame Nhỏ (35T-60T)
          } else if(typeVal.includes("2") || typeVal.includes("vua")){
            typeVal = "maydap2"; // C-Frame Vừa (80T-125T)
          } else if(typeVal.includes("3") || typeVal.includes("trung")){
            typeVal = "maydap3"; // H-Frame Trung (150T-200T)
          } else if(typeVal.includes("4") || typeVal.includes("lon") || typeVal.includes("2truc")){
            typeVal = "maydap4"; // H-Frame Lớn 2 trục (250T-350T)
          } else if(typeVal.includes("5") || typeVal.includes("to") || typeVal.includes("thuyluc") || typeVal.includes("heavy")){
            typeVal = "maydap5"; // Thủy lực / Vuốt sâu Hạng nặng (400T-630T+)
          } else {
            if(ton <= 70) typeVal = "maydap1";
            else if(ton <= 135) typeVal = "maydap2";
            else if(ton <= 220) typeVal = "maydap3";
            else if(ton <= 360) typeVal = "maydap4";
            else typeVal = "maydap5";
          }
        } else if(typeVal.includes("mag")||typeVal.includes("robot")||typeVal.includes("mig")){
          typeVal = "magrobot";
        } else if(typeVal.includes("bulong")||typeVal.includes("tanoc")||typeVal.includes("stud")||typeVal.includes("soyer")||typeVal.includes("nut")||mNameLow.includes("soyer")||mNameLow.includes("bulong")||mNameLow.includes("tanoc")){
          typeVal = "bulong";
        } else if(typeVal.includes("camtay")||typeVal.includes("sung")||typeVal.includes("gun")||typeVal.includes("treo")||typeVal.includes("balancer")){
          typeVal = "camtay";
        } else if(typeVal.includes("nho")||typeVal.includes("mini")||typeVal.includes("deban")||typeVal.includes("bench")){
          typeVal = "nho";
        } else if(typeVal.includes("to")||typeVal.includes("lon")||typeVal.includes("heavy")||typeVal.includes("large")){
          typeVal = "to";
        } else {
          typeVal = "trungbinh";
        }
        machineTypes.push(typeVal);

        let zoneVal = rawZone;
        if(!zoneVal){
          if(typeVal === "lasertam") zoneVal = "Khu Cắt Laser Tấm";
          else if(typeVal === "laserong") zoneVal = "Khu Cắt Laser Ống";
          else if(typeVal.startsWith("maydap")) zoneVal = "Xưởng Dập";
          else if(typeVal === "magrobot") zoneVal = "Xưởng Hàn MAG Robot";
          else zoneVal = "Xưởng Hàn Spot";
        }
        machineZones.push(zoneVal);
      }}
    }
  }

  // --- 4b. Đọc danh sách Công nhân từ sheet CongNhan (MaCN, HoTen, PhanXuong, BacTho, Ca, HieuSuat, MayUuTien, GhiChu) ---
  let rawWorkers = [];
  const cnSheetName = wb.SheetNames.find(nm => {
    const s = strip(nm);
    return s.includes("congnhan") || s.includes("worker") || s.includes("nhansu") || s.includes("nhanluc");
  });
  if(cnSheetName && wb.Sheets[cnSheetName]){
    const cnSheet = wb.Sheets[cnSheetName];
    const cnRows = XLSX.utils.sheet_to_json(cnSheet, {header: 1, blankrows: false});
    if(cnRows.length > 1){
      const cnHdr = cnRows[0];
      const cId = col(cnHdr, ["macn", "id", "ma", "code", "manhanvien"]);
      const cName = col(cnHdr, ["hoten", "ten", "name", "tencongnhan"]);
      const cZone = col(cnHdr, ["phanxuong", "xuong", "khuvuc", "zone", "line"]);
      const cSkill = col(cnHdr, ["bactho", "taynghe", "bac", "skill", "level"]);
      const cShift = col(cnHdr, ["ca", "calamviec", "shift"]);
      const cEff = col(cnHdr, ["hieusuat", "eff", "nangsuat", "efficiency"]);
      const cPref = col(cnHdr, ["mayuutien", "may", "preferred", "mayphutrach"]);
      const cNote = col(cnHdr, ["ghichu", "note", "mota"]);

      for(let r = 1; r < cnRows.length; r++){
        const row = cnRows[r];
        if(!row || row.length === 0) continue;
        const idVal = cId >= 0 && row[cId] != null ? String(row[cId]).trim() : `CN-${r}`;
        const nameVal = cName >= 0 && row[cName] != null ? String(row[cName]).trim() : idVal;
        if(!idVal && !nameVal) continue;
        const zoneVal = cZone >= 0 && row[cZone] != null ? String(row[cZone]).trim() : "";
        const skillVal = cSkill >= 0 && row[cSkill] != null ? String(row[cSkill]).trim() : "Bậc 2";
        const shiftVal = cShift >= 0 && row[cShift] != null ? String(row[cShift]).trim() : "HC";
        let effVal = 1.0;
        if(cEff >= 0 && row[cEff] != null){
          const num = parseFloat(String(row[cEff]).replace("%","").trim());
          if(!isNaN(num) && num > 0) effVal = num > 2 ? num / 100 : num;
        }
        let prefList = [];
        if(cPref >= 0 && row[cPref] != null){
          prefList = String(row[cPref]).split(/[,/;\+]/).map(s => s.trim()).filter(Boolean);
        }
        const noteVal = cNote >= 0 && row[cNote] != null ? String(row[cNote]).trim() : "";

        rawWorkers.push({
          id: idVal,
          name: nameVal,
          zone: zoneVal,
          skill: skillVal,
          shift: shiftVal,
          eff: effVal,
          prefMachines: prefList,
          note: noteVal
        });
      }
    }
  }
  let workers = [...rawWorkers];

  let parts = [];

  // =========================================================================
  // TRƯỜNG HỢP A: File có một hoặc nhiều sheet DataSetting (DataSetting_Spot, DataSetting_Dap, DataSetting_LaserTam, DataSetting_LaserOng, DataSetting_MAG...)
  // =========================================================================
  if(activeDsSheets.length > 0){
    const dataSettings = new Map();
    const usedMachinesInActiveDs = new Set();

    for(const shName of activeDsSheets){
      const dsSheet = wb.Sheets[shName];
      if(!dsSheet) continue;
      const dsRows = XLSX.utils.sheet_to_json(dsSheet, {header: 1, blankrows: false});
      if(!dsRows.length) continue;
      const dsHdr = dsRows[0];

      const cPart = col(dsHdr, ["part","sanpham","ma"]);
      const cOrd  = col(dsHdr, ["trinhtu","ordered","thutu","order"]);
      const cOp   = col(dsHdr, ["thaotac","op","buoc","step","seq","congdoan"]);
      const cTime = col(dsHdr, ["thoigian","time","giay","phut","duration","tg"]);
      const cDesc = col(dsHdr, ["hangmuc","mota","chitiet","desc","loaihan"]);
      const cPts  = col(dsHdr, ["sodiem","sonut","diem","points"]);
      const cRate = col(dsHdr, ["dongiagiay","dongia","giaytrennut","secperpoint","rate"]);

      if(cPart < 0 || cTime < 0) continue;

      const machineCols = [];
      for(let c = 0; c < dsHdr.length; c++){
        if(c === cPart || c === cOrd || c === cOp || c === cTime || c === cDesc || c === cPts || c === cRate) continue;
        const h = strip(dsHdr[c]);
        if(h.startsWith("may") || h.startsWith("mach") || h.startsWith("spot") || /^m\d+$/i.test(h) || h.startsWith("line") || /^l\d+/i.test(h)){
          machineCols.push(c);
        }
      }
      if(machineCols.length === 0){
        const ci = col(dsHdr, ["may", "machine"]);
        if(ci >= 0) machineCols.push(ci);
      }
      if(machineCols.length === 0) continue;

      for(let r = 1; r < dsRows.length; r++){
        const row = dsRows[r];
        if(row[cPart] == null || String(row[cPart]).trim() === "") continue;
        const pid = String(row[cPart]).trim();
        const tm = Number(row[cTime]);
        if(!(tm > 0)) continue;
        const localSeq = cOp >= 0 ? (Number(row[cOp]) || 1) : 1;
        const ordVal = cOrd >= 0 ? isYes(row[cOrd]) : true;
        const descVal = (cDesc >= 0 && row[cDesc] != null) ? String(row[cDesc]).trim() : "";
        const ptsVal  = (cPts >= 0 && row[cPts] != null) ? (Number(row[cPts]) || 0) : 0;

        const eligibleMachines = [];
        for(const mcIdx of machineCols){
          const val = row[mcIdx];
          if(val != null && String(val).trim() !== ""){
            const str = String(val).trim();
            const sub = str.split(/[,/;\+]/).map(s => s.trim()).filter(Boolean);
            sub.forEach(mName => {
              if(!eligibleMachines.includes(mName)) eligibleMachines.push(mName);
              usedMachinesInActiveDs.add(strip(mName));
            });
          }
        }
        if(eligibleMachines.length === 0) continue;

        if(!dataSettings.has(pid)){
          dataSettings.set(pid, { ordered: ordVal, sheetsMap: new Map() });
        }
        const ds = dataSettings.get(pid);
        if(cOrd >= 0) ds.ordered = ordVal;
        if(!ds.sheetsMap.has(shName)){
          ds.sheetsMap.set(shName, { opmap: new Map(), opmeta: new Map() });
        }
        const shEntry = ds.sheetsMap.get(shName);
        if(!shEntry.opmap.has(localSeq)) shEntry.opmap.set(localSeq, []);
        if(descVal || ptsVal){
          shEntry.opmeta.set(localSeq, { desc: descVal, pts: ptsVal });
        }
        eligibleMachines.forEach(m => {
          if(!shEntry.opmap.get(localSeq).some(ch => ch.m === m)){
            shEntry.opmap.get(localSeq).push({ m, time: tm });
          }
        });
      }
    }

    // Chuyển đổi sheetsMap của từng Part thành mảng ops tuần tự (kèm nhãn wsTag của từng xưởng)
    function buildOpsFromDs(ds){
      const opsList = [];
      let globalSeq = 1;
      for(const shName of activeDsSheets){
        if(!ds.sheetsMap.has(shName)) continue;
        const shEntry = ds.sheetsMap.get(shName);
        const sortedLocal = [...shEntry.opmap.keys()].sort((a, b) => a - b);
        for(const lSeq of sortedLocal){
          const meta = shEntry.opmeta.get(lSeq);
          opsList.push({
            seq: globalSeq++,
            wsTag: shName,
            desc: meta ? meta.desc : "",
            pts: meta ? meta.pts : 0,
            choices: shEntry.opmap.get(lSeq)
          });
        }
      }
      return opsList;
    }

    // Nếu người dùng đang chọn LÀM VIỆC ĐỘC LẬP 1 XƯỞNG CỤ THỂ (vd: chỉ DataSetting_Dap hoặc chỉ DataSetting_Spot):
    // Lọc danh sách máy & kho để giao diện 3D, Gantt, WIP chỉ hiển thị đúng các máy và kho thuộc xưởng đó!
    const isSingleWorkshopScope = (dsSheets.length > 1 && dsMode !== "ALL_INDEPENDENT" && dsMode !== "ALL_LINKED");
    if(isSingleWorkshopScope && machines.length > 0){
      const targetZones = new Set();
      const sMode = strip(dsMode);
      machines.forEach((mName, idx) => {
        if(usedMachinesInActiveDs.has(strip(mName))){
          targetZones.add(strip(machineZones[idx] || ""));
        }
      });
      if(targetZones.size === 0){
        machines.forEach((_, idx) => {
          const z = strip(machineZones[idx] || "");
          if((sMode.includes("lasertam") && z.includes("lasertam")) ||
             (sMode.includes("laserong") && z.includes("laserong")) ||
             (sMode.includes("dap") && z.includes("dap")) ||
             (sMode.includes("spot") && z.includes("spot")) ||
             (sMode.includes("mag") && z.includes("mag"))){
            targetZones.add(z);
          }
        });
      }
      const keepIndices = [];
      machines.forEach((mName, idx) => {
        if(usedMachinesInActiveDs.has(strip(mName)) || targetZones.has(strip(machineZones[idx] || ""))){
          keepIndices.push(idx);
        }
      });
      if(keepIndices.length > 0){
        machines      = keepIndices.map(i => machines[i]);
        layout        = keepIndices.map(i => layout[i]);
        machineShifts = keepIndices.map(i => machineShifts[i]);
        rotations     = keepIndices.map(i => rotations[i]);
        machineTypes  = keepIndices.map(i => machineTypes[i]);
        machinePowers = keepIndices.map(i => machinePowers[i]);
        machineZones  = keepIndices.map(i => machineZones[i]);
        machineSetups = keepIndices.map(i => machineSetups[i]);
        warehouses    = warehouses.filter(w => !w.zone || targetZones.has(strip(w.zone || "")) || strip(w.name).toLowerCase().includes("linh_kien") || strip(w.name).toLowerCase().includes("linhkien"));
        if(workers.length > 0){
          workers = rawWorkers.filter(w => targetZones.has(strip(w.zone || "")) || !w.zone);
        }
      }
    }

    // Đọc sheet KeHoachSanXuat (nếu có)
    const productionPlans = new Map();
    if(khSheetName && wb.Sheets[khSheetName]){
      const khSheet = wb.Sheets[khSheetName];
      const khRows = XLSX.utils.sheet_to_json(khSheet, {header: 1, blankrows: false});
      if(khRows.length > 0){
        const khHdr = khRows[0];
        const khPart = col(khHdr, ["part","sanpham","ma"]);
        const khQty  = col(khHdr, ["soluong","qty","quantity","sl","kehoach","kh"]);
        const khAct  = col(khHdr, ["thucte","thuchien","dasanxuat","dalam","actual","tt"]);
        const khPri  = col(khHdr, ["uutien","priority","capdo","cap","muc"]);
        const khStart= col(khHdr, ["batdau","start","ngaybatdau","ngaybd","ngay"]);
        const khDue  = col(khHdr, ["hangiao","duedate","deadline","han","gio","ngaygiao"]);
        const khPack = col(khHdr, ["donggoi","quycachdonggoi","quycach","packing","packsize","pack"]);
        const khEff  = col(khHdr, ["hieusuat","hieuxuat","efficiency","eff"]);

        // Nhận diện các cột ngày (06-Nov, 07-Nov, 08-Nov...)
        const dateCols = [];
        for(let c = 0; c < khHdr.length; c++){
          const h = formatExcelDateValue(khHdr[c]);
          if(/\d{1,2}-[A-Za-z]{3}/i.test(h) || /\d{1,2}\/\d{1,2}/.test(h)){
            dateCols.push({ colIdx: c, label: h });
          }
        }
        dateLabels = dateCols.map(d => d.label);

        for(let r = 1; r < khRows.length; r++){
          const row = khRows[r];
          if(row[khPart] == null || String(row[khPart]).trim() === "") continue;
          const pid = String(row[khPart]).trim();
          const rawQ = khQty >= 0 ? row[khQty] : null;
          const planQ = (rawQ != null && String(rawQ).trim() !== "") ? Math.max(0, Math.round(Number(rawQ) || 0)) : 0;
          const actQ  = khAct >= 0 ? Math.max(0, Math.round(Number(row[khAct]) || 0)) : 0;
          const pri   = khPri >= 0 ? Math.max(1, Math.min(3, parseInt(row[khPri]) || 2)) : 2;
          const sStart= khStart >= 0 && row[khStart] != null ? formatExcelDateValue(row[khStart]) : "";
          const sDue  = khDue >= 0 && row[khDue] != null ? formatExcelDateValue(row[khDue]) : "";

          const minStartMin = convertDateStringToOffsetMinutes(sStart, dateLabels, false, shiftLength) || 0;
          const dueDateMin  = convertDateStringToOffsetMinutes(sDue, dateLabels, true, shiftLength) || null;

          // Cỡ đóng gói / lô gối đầu riêng từng part (DongGoi)
          const packQ = khPack >= 0 ? Math.max(0, Math.round(Number(row[khPack]) || 0)) : 0;
          // Hiệu suất (HieuSuat): thời gian thực = thời gian chuẩn ÷ hiệu suất. Chấp nhận "85", "85%", "0.85"
          let effRaw = (khEff >= 0 && row[khEff] != null) ? String(row[khEff]).replace("%","").trim() : "";
          let eff = parseFloat(effRaw);
          if(!isFinite(eff) || eff <= 0) eff = 1;
          else if(eff > 2) eff = eff / 100;     // 85 -> 0.85
          eff = Math.max(0.1, Math.min(2, eff));

          const daily = {};
          dateCols.forEach(d => {
            const val = row[d.colIdx];
            if(val != null && Number(val) > 0){
              daily[d.label] = Number(val);
            }
          });

          productionPlans.set(pid, {
            planQty: planQ,
            actualQty: actQ,
            priority: pri,
            startDateStr: sStart,
            dueDateStr: sDue,
            minStartTime: minStartMin,
            dueDate: dueDateMin,
            pack: packQ,
            eff: eff,
            daily
          });
        }
      }
    }

    // Ghép dữ liệu giữa KeHoachSanXuat và các sheet DataSetting đang chọn
    if(productionPlans.size > 0){
      productionPlans.forEach((plan, pid) => {
        if(dataSettings.has(pid)){
          const ds = dataSettings.get(pid);
          const remQ = Math.max(0, plan.planQty - plan.actualQty);
          parts.push({
            id: pid,
            planQty: plan.planQty,
            actualQty: plan.actualQty,
            qty: remQ,  // Còn lại cần SX; = 0 nếu đã đủ kế hoạch hoặc SoLuong = 0 (không xếp lịch)
            isDone: (plan.actualQty >= plan.planQty && plan.actualQty > 0),
            ordered: ds.ordered,
            priority: plan.priority,
            startDate: plan.startDateStr,
            dueDate: plan.dueDate,
            dueDateStr: plan.dueDateStr,
            minStartTime: plan.minStartTime,
            pack: plan.pack || 0,
            eff: plan.eff || 1,
            daily: plan.daily,
            ops: buildOpsFromDs(ds)
          });
        } else if(!isSingleWorkshopScope && plan.planQty > 0){
          warnings.push(`Part "${pid}" có trong KeHoachSanXuat nhưng chưa khai báo thông số công đoạn trong DataSetting.`);
        }
      });
      // Bổ sung các part có trong DataSetting nhưng chưa có dòng trong KeHoachSanXuat (đặt SoLuong = 0 để tra cứu danh mục)
      dataSettings.forEach((ds, pid) => {
        if(!productionPlans.has(pid)){
          parts.push({
            id: pid,
            planQty: 0,
            actualQty: 0,
            qty: 0,
            isDone: false,
            ordered: ds.ordered,
            priority: 2,
            startDate: "",
            dueDate: null,
            minStartTime: 0,
            ops: buildOpsFromDs(ds)
          });
        }
      });
    } else {
      // Nếu không có sheet KeHoachSanXuat, chỉ lấy part từ DataSetting
      dataSettings.forEach((ds, pid) => {
        parts.push({
          id: pid,
          planQty: 100,
          actualQty: 0,
          qty: 100,
          isDone: false,
          ordered: ds.ordered,
          priority: 2,
          startDate: "",
          dueDate: null,
          minStartTime: 0,
          ops: buildOpsFromDs(ds)
        });
      });
    }
  }
  // =========================================================================
  // TRƯỜNG HỢP B: Tương thích ngược file Excel cũ 1 sheet duy nhất
  // =========================================================================
  else {
    const chosenPlanSheet = khSheetName || wb.SheetNames.filter(nm => nm !== mSheetName)[0] || wb.SheetNames[0];
    const pSheet = wb.Sheets[chosenPlanSheet];
    if(!pSheet) throw new Error("Không tìm thấy sheet kế hoạch nào trong file.");
    const rows = XLSX.utils.sheet_to_json(pSheet,{header:1,blankrows:false});
    if(!rows.length) throw new Error(`Sheet kế hoạch "${chosenPlanSheet}" rỗng.`);
    const hdr = rows[0];

    const cPart = col(hdr,["part","sanpham","ma"]);
    const cQty  = col(hdr,["soluong","qty","quantity","sl","kehoach","kh"]);
    const cAct  = col(hdr,["thucte","thuchien","dasanxuat","dalam","actual","tt"]);
    const cOrd  = col(hdr,["trinhtu","ordered","thutu","order"]);
    const cOp   = col(hdr,["thaotac","op","buoc","step","seq","congdoan"]);
    const cTime = col(hdr,["thoigian","time","giay","phut","duration","tg"]);
    const cPri  = col(hdr,["uutien","priority","capdo","cap","muc"]);
    const cDue  = col(hdr,["hangiao","duedate","deadline","han","gio"]);

    if(cPart < 0 || cTime < 0) throw new Error("Thiếu cột bắt buộc trong sheet kế hoạch: Part, ThoiGian.");

    const machineCols = [];
    for(let c = 0; c < hdr.length; c++){
      if(c === cPart || c === cQty || c === cAct || c === cOrd || c === cOp || c === cTime || c === cPri || c === cDue) continue;
      const h = strip(hdr[c]);
      if(h.startsWith("may") || h.startsWith("mach") || h.startsWith("spot") || /^m\d+$/.test(h)){
        machineCols.push(c);
      }
    }
    if(machineCols.length === 0){
      const ci = col(hdr, ["may", "machine"]);
      if(ci >= 0) machineCols.push(ci);
    }
    if(machineCols.length === 0) throw new Error("Thiếu cột máy (May, May1, May2...) trong sheet kế hoạch.");

    const byPart=new Map();
    for(let r=1;r<rows.length;r++){
      const row=rows[r];
      if(row[cPart]==null||String(row[cPart]).trim()==="") continue;
      const pid=String(row[cPart]).trim();
      const tm=Number(row[cTime]);
      if(!(tm>0)) continue;
      const seq = cOp>=0 ? (Number(row[cOp])||1) : 1;

      const eligibleMachines = [];
      for(const mcIdx of machineCols){
        const val = row[mcIdx];
        if(val != null && String(val).trim() !== ""){
          const str = String(val).trim();
          const sub = str.split(/[,/;\+]/).map(s => s.trim()).filter(Boolean);
          sub.forEach(mName => {
            if(!eligibleMachines.includes(mName)) eligibleMachines.push(mName);
          });
        }
      }
      if(eligibleMachines.length === 0) continue;

      const pri = cPri>=0 ? Math.max(1, Math.min(3, parseInt(row[cPri])||2)) : 2;
      let due = null;
      if(cDue>=0 && row[cDue]!=null && String(row[cDue]).trim()!==""){
        due = convertDateStringToOffsetMinutes(row[cDue], [], true, shiftLength);
      }

      const planQ = cQty>=0 ? Math.max(1, Math.round(Number(row[cQty])||1)) : 1;
      const actQ  = cAct>=0 ? Math.max(0, Math.round(Number(row[cAct])||0)) : 0;
      const remQ  = Math.max(0, planQ - actQ);

      if(!byPart.has(pid)){
        byPart.set(pid, {
          id: pid,
          planQty: planQ,
          actualQty: actQ,
          qty: remQ > 0 ? remQ : planQ,
          isDone: (actQ >= planQ && actQ > 0),
          ordered: cOrd>=0 ? isYes(row[cOrd]) : true,
          priority: pri,
          dueDate: due,
          minStartTime: 0,
          opmap: new Map()
        });
      }

      const P = byPart.get(pid);
      if(cQty>=0 && Number(row[cQty])>0) P.planQty = Math.max(1, Math.round(Number(row[cQty])));
      if(cAct>=0 && Number(row[cAct])>=0) P.actualQty = Math.max(0, Math.round(Number(row[cAct])));
      const curRem = Math.max(0, P.planQty - P.actualQty);
      P.qty = curRem;  // = 0 nếu đã đủ kế hoạch → không xếp lịch
      P.isDone = (P.actualQty >= P.planQty && P.actualQty > 0);
      if(cOrd>=0) P.ordered = isYes(row[cOrd]);
      if(cPri>=0 && row[cPri]!=null) P.priority = pri;
      if(cDue>=0 && due!=null) P.dueDate = due;

      if(!P.opmap.has(seq)) P.opmap.set(seq, []);
      eligibleMachines.forEach(m => {
        if(!P.opmap.get(seq).some(ch => ch.m === m)){
          P.opmap.get(seq).push({ m, time: tm });
        }
      });
    }

    parts = [...byPart.values()].map(P=>({
      id: P.id,
      qty: P.qty,
      planQty: P.planQty,
      actualQty: P.actualQty,
      isDone: P.isDone,
      ordered: P.ordered,
      priority: P.priority || 2,
      dueDate: P.dueDate,
      minStartTime: 0,
      ops: [...P.opmap.keys()].sort((a,b)=>a-b).map(seq=>({
        seq,
        choices: P.opmap.get(seq)
      }))
    }));
  }

  // Kiểm tra máy xuất hiện trong kế hoạch/DataSetting so với sheet May
  const mset=new Set(machines.map(strip));
  const missingFromMay=new Set();
  parts.forEach(p=>p.ops.forEach(o=>o.choices.forEach(c=>{
    if(!mset.has(strip(c.m))){ missingFromMay.add(c.m); }
  })));

  if(machines.length===0){
    // Nếu file hoàn toàn không có sheet May, tự động lấy máy từ DataSetting
    machines=[...new Set(parts.flatMap(p=>p.ops.flatMap(o=>o.choices.map(c=>c.m))))];
    layout=machines.map(()=>null);
    rotations=machines.map(()=>0);
    machineTypes=machines.map(()=>"trungbinh");
    machinePowers=machines.map(()=>"");
    machineZones=machines.map(()=>"Xưởng Hàn Spot");
  } else if(missingFromMay.size > 0){
    // Sheet May ĐÃ KHAI BÁO MÁY CHÍNH THỨC: Không tự thêm máy thừa để tránh vỡ mặt bằng & nhân đôi dây chuyền!
    warnings.push(`⚠ Cảnh báo: Có ${missingFromMay.size} máy trong DataSetting (${[...missingFromMay].map(m=>`"${m}"`).join(", ")}) không tồn tại trong sheet "May". Vui lòng kiểm tra lại vì có thể bạn vừa sửa tên máy ở sheet May nhưng chưa cập nhật trong sheet DataSetting!`);

    // Lọc bỏ các máy không tồn tại khỏi choices của từng part
    parts.forEach(p => {
      p.ops.forEach(o => {
        const validChoices = o.choices.filter(c => mset.has(strip(c.m)));
        if(validChoices.length === 0){
          warnings.push(`Part "${p.id}" công đoạn #${o.seq} không có máy hợp lệ nào trong sheet May!`);
        }
        o.choices = validChoices;
      });
    });
  }

  if(!parts.length) throw new Error("Không đọc được part nào từ file Excel.");

  return {
    machines,
    parts,
    workers: (workers && workers.length > 0) ? workers : (SAMPLE.workers || []),
    warnings,
    layout,
    rotations,
    machineTypes,
    machineShifts,
    machinePowers,
    machineZones,
    machineSetups,
    machineBrokenStatus,
    warehouses,
    dateLabels,
    dsSheets,
    dsMode,
    planSheets: [khSheetName || "KeHoachSanXuat"],
    currentPlanSheet: khSheetName || "KeHoachSanXuat"
  };
}

/* ============================================================
   BỘ LẬP LỊCH HEURISTIC (FJSP + Ca nghỉ từng máy + Sự cố + Ưu tiên + Hạn giao)
   ============================================================ */
function computeCalendarEnd(rawStart, duration, mi, breaks, dts){
  const mBlocks = getMachineBlocks(mi, 60);
  let s = rawStart;
  let changed = true;
  let guard = 0;
  while(changed && guard++ < 60){
    changed = false;
    for(const b of mBlocks){
      if(s >= b.start && s < b.end){ s = b.end; changed = true; break; }
    }
    if(changed) continue;
    for(const dt of dts){
      if(dt.mi === mi && s >= dt.start && s < dt.end){ s = dt.end; changed = true; break; }
    }
  }

  // Tích lũy thời gian làm việc thực tế (bắc cầu qua các khoảng nghỉ hoặc sự cố)
  let cur = s;
  let rem = duration;
  let loopGuard = 0;
  while(rem > 0 && loopGuard++ < 120){
    let nextBlock = null;
    let nextStart = Infinity;
    for(const b of mBlocks){
      if(b.start >= cur && b.start < nextStart){ nextStart = b.start; nextBlock = b; }
    }
    for(const dt of dts){
      if(dt.mi === mi && dt.start >= cur && dt.start < nextStart){ nextStart = dt.start; nextBlock = dt; }
    }
    const avail = nextStart - cur;
    if(avail >= rem){
      cur += rem;
      rem = 0;
    } else {
      cur = nextBlock.end;
      rem -= Math.max(0, avail);
    }
  }
  return { start: s, end: cur };
}

function solve(model, opts){
  const {machines,parts}=model;
  const mIndex=new Map(machines.map((m,i)=>[strip(m),i]));
  const setup = Math.max(0, opts.setup||0);
  const balance = opts.objective==="balance";
  const breaks = opts.breaks || [];
  const dts = opts.downtimes || [];
  const minStartTime = opts.minStartTime || 0;
  const frozenIntervals = opts.frozenIntervals || [];

  // Tự động chuyển sang Chế độ Lô sản xuất (Batch Mode) khi tổng số lượng lớn để tránh treo trình duyệt
  const totalRawUnits = parts.reduce((s, p) => s + (p.qty || 0), 0);
  const isBatchMode = (totalRawUnits > 50) || (opts.scheduleMode === "batch");
  const sublotSize = (opts.sublotSize !== undefined) ? opts.sublotSize : (document.getElementById("subLotSize") ? parseInt(document.getElementById("subLotSize").value, 10) : 500);

  // tạo "job" = từng Lô con gối đầu (Sub-lot) hoặc từng unit
  const jobs=[];
  let totalPcs = 0;
  parts.forEach((p,pi)=>{
    // Part đã SX đủ kế hoạch (ConLai = Kế hoạch − Thực tế ≤ 0) → KHÔNG xếp lịch, tránh lô ảo "1"
    if((p.qty || 0) <= 0) return;
    totalPcs += (p.qty || 1);
    const jobMinStart = Math.max(minStartTime, p.minStartTime || 0);
    // Cỡ đóng gói/lô gối đầu riêng từng part (DongGoi); trống -> dùng mặc định toàn cục
    const partPack = (p.pack && p.pack > 0) ? p.pack : sublotSize;
    // Hiệu suất riêng từng part: thời gian thực = thời gian chuẩn ÷ hiệu suất
    const partEff = (p.eff && p.eff > 0) ? p.eff : 1;
    if(isBatchMode){
      // Chia nhỏ thành các lô con gối đầu (Sub-lot)
      const sublots = [];
      const remPcs = p.qty || 1;
      if(partPack > 0 && remPcs > partPack){
        let remQ = remPcs;
        while(remQ > 0){
          const take = Math.min(remQ, partPack);
          sublots.push(take);
          remQ -= take;
        }
      } else {
        sublots.push(remPcs);
      }

      sublots.forEach((lotQ, uIdx) => {
        jobs.push({
          part: p.id,
          pi,
          unit: uIdx + 1,
          lotQty: lotQ,
          totalQty: p.qty,
          isBatch: true,
          ordered: p.ordered,
          priority: p.priority || 2,
          minStartTime: jobMinStart,
          dueDate: p.dueDate,
          ops: p.ops.map(o => ({
            seq: o.seq,
            wsTag: o.wsTag || "_default_",
            choices: o.choices.map(c => {
              // Thời gian thực = chuẩn ÷ hiệu suất; chuẩn hóa (giây * SL) / 60 = phút
              const scaled = Math.max(1, Math.round(((c.time / partEff) * lotQ) / 60));
              return { mi: mIndex.get(strip(c.m)), time: scaled };
            }).filter(c => c.mi != null)
          })),
          done: [], remaining: null, ptr: 0, freeAt: jobMinStart, wsFree: {}
        });
      });
    } else {
      for(let u=0;u<p.qty;u++){
        jobs.push({ part:p.id, pi, unit:u+1, lotQty:1, totalQty:p.qty, isBatch:false, ordered:p.ordered,
          priority: p.priority || 2,
          minStartTime: jobMinStart,
          dueDate: p.dueDate,
          ops:p.ops.map(o=>({seq:o.seq, wsTag: o.wsTag || "_default_",
            choices:o.choices.map(c=>({mi:mIndex.get(strip(c.m)),time:Math.max(1, Math.round((c.time / partEff) / 60))})).filter(c=>c.mi!=null)})),
          done:[], remaining:null, ptr:0, freeAt:jobMinStart, wsFree: {} });
      }
    }
  });
  jobs.forEach(j=>{ j.remaining = j.ops.map((_,k)=>k); });

  const mFree = new Array(machines.length).fill(minStartTime);
  const mLoad = new Array(machines.length).fill(0);
  const mLast = new Array(machines.length).fill(null);
  const intervals = [...frozenIntervals];

  // Khởi tạo tài nguyên Công nhân (DRC-FJSP: Dual-Resource Constrained)
  const workers = (model.workers && model.workers.length > 0) ? model.workers : [];
  const wFree = new Array(workers.length).fill(minStartTime);
  const wLoad = new Array(workers.length).fill(0);
  const wJobs = new Array(workers.length).fill(0);

  // Áp dụng các việc đã đóng băng (nếu tái điều độ)
  frozenIntervals.forEach(f => {
    if(f.mi != null && f.mi < machines.length){
      mFree[f.mi] = Math.max(mFree[f.mi], f.end);
      mLoad[f.mi] += (f.end - f.start);
      mLast[f.mi] = f.part;
    }
  });

  let totalOps = jobs.reduce((s,j)=>s+j.ops.length,0), placed=0, guard=0;
  const isIndepWs = (model.dsMode === "ALL_INDEPENDENT");

  while(placed<totalOps && guard++<totalOps*3+30){
    let best=null;
    for(const j of jobs){
      if(j.remaining.length===0) continue;
      let cands;
      if(!j.ordered){
        cands = j.remaining.slice();
      } else if(isIndepWs){
        // Mỗi xưởng (wsTag) chạy độc lập song song, nhưng trong cùng 1 xưởng vẫn giữ đúng thứ tự TrinhTu
        const seenWs = new Set();
        cands = [];
        for(const ok of j.remaining){
          const wt = j.ops[ok].wsTag || "_default_";
          if(!seenWs.has(wt)){
            seenWs.add(wt);
            cands.push(ok);
          }
        }
      } else {
        cands = [j.remaining[0]];
      }
      for(const ok of cands){
        const op=j.ops[ok];
        const wt = op.wsTag || "_default_";
        const jobReady = isIndepWs ? (j.wsFree[wt] !== undefined ? j.wsFree[wt] : j.freeAt) : j.freeAt;
        for(const ch of op.choices){
          const mSetupVal = (model.machineSetups && model.machineSetups[ch.mi] != null) ? model.machineSetups[ch.mi] : setup;
          const su = (mLast[ch.mi]!=null && mLast[ch.mi]!==j.part) ? mSetupVal : 0;
          const rawMStart = Math.max(jobReady, mFree[ch.mi], minStartTime, j.minStartTime || 0) + su;
          const mName = machines[ch.mi] || "";
          const mZone = (model.machineZones && model.machineZones[ch.mi]) ? model.machineZones[ch.mi] : "Xưởng Hàn Spot";

          // Tìm công nhân phù hợp nhất (DRC-FJSP)
          let candW = null, chosenWIdx = null, effOpTime = ch.time, rawStart = rawMStart;
          if(workers.length > 0){
            let eligibleW = [];
            workers.forEach((w, wIdx) => {
              const wz = strip(w.zone || "");
              const mz = strip(mZone || "");
              if(!wz || !mz || wz.includes(mz) || mz.includes(wz)){
                eligibleW.push({ w, wIdx });
              }
            });
            if(eligibleW.length === 0){
              eligibleW = workers.map((w, wIdx) => ({ w, wIdx }));
            }

            let bestWScore = Infinity;
            for(const ew of eligibleW){
              const w = ew.w;
              const wIdx = ew.wIdx;
              const wAvail = wFree[wIdx];
              const wReady = Math.max(rawMStart, wAvail);
              const isPref = w.prefMachines && w.prefMachines.some(pm => {
                const pNorm = strip(pm).toLowerCase().replace(/[-_ ]/g, "");
                const mNorm = strip(mName).toLowerCase().replace(/[-_ ]/g, "");
                return pNorm === mNorm || mNorm.includes(pNorm) || pNorm.includes(mNorm);
              });
              const prefBonus = isPref ? -50000 : 0;
              const curDayM = (wReady % 1440);
              const activeShiftKey = (curDayM >= 720) ? "S7" : "S6";
              const shiftMatch = w.shift && String(w.shift).toUpperCase().includes(activeShiftKey);
              const shiftBonus = shiftMatch ? -30000 : 0;
              const waitPen = Math.max(0, wAvail - rawMStart) * 500;
              const priMatch = (j.priority === 1 && (String(w.skill).includes("3") || String(w.skill).includes("4"))) ? -20000 : 0;
              const score = wReady * 1000 + waitPen + prefBonus + priMatch + shiftBonus + wLoad[wIdx];
              if(score < bestWScore){
                bestWScore = score;
                candW = w;
                chosenWIdx = wIdx;
                rawStart = wReady;
                // Hiệu suất công nhân (Phase B: Skill matrix & Efficiency)
                const wEff = (w.eff && w.eff > 0) ? w.eff : 1.0;
                effOpTime = Math.max(1, Math.round(ch.time / wEff));
              }
            }
          }

          const timeSlot = computeCalendarEnd(rawStart, effOpTime, ch.mi, breaks, dts);
          const start = timeSlot.start;
          const end = timeSlot.end;

          // Tiêu chí chọn: P1 thưởng lớn, P3 phạt, trễ hạn phạt cực nặng
          const priBonus = (j.priority === 1 ? -300000 : (j.priority === 2 ? 0 : 200000));
          const duePenalty = (j.dueDate && end > j.dueDate) ? (end - j.dueDate) * 15000 : 0;
          let key = priBonus + duePenalty + (balance ? (mLoad[ch.mi]*1000+end) : (end*1000+start));

          if(!best || key<best.key || (key===best.key && end<best.end)){
            best={job:j,ok,mi:ch.mi,start,end,time:effOpTime,su,key,wIdx:chosenWIdx,worker:candW};
          }
        }
      }
    }
    if(!best) break;
    const j=best.job;
    const pickedOp = j.ops[best.ok];
    intervals.push({
      part: j.part,
      pi: j.pi,
      unit: j.unit,
      seq: pickedOp.seq,
      wsTag: pickedOp.wsTag,
      mi: best.mi,
      start: best.start,
      end: best.end,
      priority: j.priority,
      dueDate: j.dueDate,
      lotQty: j.lotQty || j.totalQty || 1,
      totalQty: j.totalQty,
      isBatch: j.isBatch,
      workerId: best.worker ? best.worker.id : null,
      workerName: best.worker ? best.worker.name : null,
      workerSkill: best.worker ? best.worker.skill : null,
      workerZone: best.worker ? best.worker.zone : null,
      workerShift: best.worker ? best.worker.shift : null,
      workerEff: best.worker ? (best.worker.eff || 1.0) : 1.0
    });
    mFree[best.mi]=best.end; mLoad[best.mi]+=best.time; mLast[best.mi]=j.part;
    if(best.wIdx != null){
      wFree[best.wIdx] = best.end;
      wLoad[best.wIdx] += best.time;
      wJobs[best.wIdx]++;
    }
    if(isIndepWs){
      j.wsFree[pickedOp.wsTag || "_default_"] = best.end;
    } else {
      j.freeAt=best.end;
    }
    j.remaining=j.remaining.filter(x=>x!==best.ok);
    placed++;
  }

  if(placed < totalOps){
    console.warn(`[Heuristic] Cảnh báo: Chỉ xếp được ${placed} / ${totalOps} thao tác! Một số part hoặc thao tác không có máy hàn hợp lệ.`);
    if(model && model.warnings){
      model.warnings.push(`Cảnh báo Heuristic: Chỉ xếp được ${placed}/${totalOps} thao tác. Vui lòng kiểm tra lại cấu hình máy hợp lệ trong sheet DataSetting!`);
    }
  }

  const makespan = intervals.reduce((m,iv)=>Math.max(m,iv.end),0);
  const unitEnd=new Map();
  intervals.forEach(iv=>{ const k=iv.part+"#"+iv.unit;
    unitEnd.set(k, Math.max(unitEnd.get(k)||0, iv.end)); });
  const completions=[...unitEnd.values()].sort((a,b)=>a-b);
  const totalUnits=jobs.length + frozenIntervals.length;

  // per-machine intervals
  const perMachine=machines.map(()=>[]);
  intervals.forEach(iv=>perMachine[iv.mi].push(iv));
  perMachine.forEach(a=>a.sort((x,y)=>x.start-y.start));
  const busy=perMachine.map(a=>a.reduce((s,iv)=>s+(iv.end-iv.start),0));

  // per-worker intervals
  const perWorker = (workers && workers.length > 0) ? workers.map(() => []) : [];
  intervals.forEach(iv => {
    if(iv.workerId){
      const wIdx = workers.findIndex(w => w.id === iv.workerId);
      if(wIdx >= 0) perWorker[wIdx].push(iv);
    }
  });
  const workerBusy = perWorker.map(arr => arr.reduce((s, iv) => s + (iv.end - iv.start), 0));

  return {intervals,perMachine,busy,makespan,completions,totalUnits,totalPcs,machines,parts,breaks,downtimes:dts,workers:workers||[],perWorker,workerBusy};
}

/* ============================================================
   RENDER DỮ LIỆU CỘT 1
   ============================================================ */
/* Xác định ô vị trí từng máy: toạ độ tùy chỉnh (X,Y) nếu đủ & không trùng, nếu không thì lưới tự động */
function computeLayout(model){
  const N=model.machines.length, lay=model.layout||[];
  let custom = lay.length===N && N>0 && lay.every(p=>p&&isFinite(p.x)&&isFinite(p.y));
  if(custom){ const seen=new Set();
    for(const p of lay){ const k=p.x+","+p.y; if(seen.has(k)){custom=false;break;} seen.add(k); } }
  model.layoutMode = custom?"custom":"grid";
  model.cellX=[]; model.cellY=[];
  if(custom){ lay.forEach(p=>{model.cellX.push(p.x);model.cellY.push(p.y);}); }
  else{ const cols=Math.ceil(Math.sqrt(N)); for(let i=0;i<N;i++){model.cellX.push(i%cols);model.cellY.push(Math.floor(i/cols));} }
  model._layoutWarn = (!custom && lay.some(p=>p&&isFinite(p.x)&&isFinite(p.y)));
}
let currentPartPage = 1;
const PARTS_PER_PAGE = 25;

function renderPartListFiltered(){
  const pl = document.getElementById("plist");
  const pCount = document.getElementById("pCount");
  const pageInfo = document.getElementById("pPageInfo");
  const searchInput = document.getElementById("partSearch");
  const query = (searchInput ? searchInput.value.trim().toLowerCase() : "");

  if(!model || !model.parts) return;
  const filtered = model.parts.filter(p => !query || p.id.toLowerCase().includes(query));
  if(pCount) pCount.textContent = `${filtered.length}/${model.parts.length}`;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PARTS_PER_PAGE));
  if(currentPartPage > totalPages) currentPartPage = totalPages;
  if(currentPartPage < 1) currentPartPage = 1;

  const startIdx = (currentPartPage - 1) * PARTS_PER_PAGE;
  const pageParts = filtered.slice(startIdx, startIdx + PARTS_PER_PAGE);

  pl.innerHTML = "";
  pageParts.forEach((p, idx)=>{
    const origIdx = model.parts.findIndex(x => x.id === p.id);
    const d = document.createElement("div"); d.className = "pitem";
    const route = p.ops.map(o => {
      const mList = o.choices.map(c=>c.m.replace("Spot","#")).join("/");
      const cyc = (o.choices[0] && o.choices[0].time) ? `${o.choices[0].time}s` : "";
      if(o.desc){
        return `<b>B${o.seq}:</b> ${o.desc} <span style="color:var(--accent)">[${cyc} · ${mList}]</span>`;
      }
      return cyc ? `${mList} (${cyc})` : mList;
    }).join(" → ");
    
    // Badge ưu tiên, Ngày bắt đầu & Hạn giao
    const pBadge = p.priority===1 ? '<span class="ptag" style="background:#e8611f;color:#fff;font-weight:bold">P1 · Gấp</span>' :
                   (p.priority===3 ? '<span class="ptag" style="background:var(--line);color:var(--muted)">P3 · Thấp</span>' :
                   '<span class="ptag" style="background:var(--accent-soft);color:var(--accent)">P2</span>');
    const startStr = p.startDate ? `<span class="ptag" style="background:rgba(59,130,246,0.15);color:#3b82f6;font-weight:600">BĐ: ${formatExcelDateValue(p.startDate)}</span>` : '';
    const dueStr = p.dueDateStr ? `<span class="ptag" style="background:var(--warn);color:#000;font-weight:600">🚩 Hạn: ${formatExcelDateValue(p.dueDateStr)}</span>` :
                   (p.dueDate ? `<span class="ptag" style="background:var(--warn);color:#000;font-weight:600">🚩 Hạn: ${formatClockTime(p.dueDate)}</span>` : '');
    const packStr = (p.pack && p.pack>0) ? `<span class="ptag" style="background:rgba(16,185,129,0.15);color:#059669;font-weight:600" title="Quy cách đóng gói / cỡ lô gối đầu riêng part">📦 Lô: ${Number(p.pack).toLocaleString()}</span>` : '';
    const effStr = (p.eff && p.eff>0 && Math.abs(p.eff-1)>0.001) ? `<span class="ptag" style="background:rgba(139,92,246,0.15);color:#7c3aed;font-weight:600" title="Hiệu suất: thời gian thực = thời gian chuẩn ÷ hiệu suất">⚙ HS: ${Math.round(p.eff*100)}%</span>` : '';

    const planQ = (p.planQty != null) ? p.planQty : (p.qty || 0);
    const actQ  = p.actualQty || 0;
    const remQ  = Math.max(0, planQ - actQ);
    const pct   = planQ > 0 ? Math.min(100, Math.round((actQ / planQ) * 100)) : 0;

    let dailyHtml = '';
    if(p.daily && Object.keys(p.daily).length > 0){
      const dailySummary = Object.entries(p.daily).map(([d, q]) => `${d}: ${Number(q).toLocaleString()}`).join(' · ');
      dailyHtml = `<div style="font-size:10px;color:var(--muted);margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="Phân bổ ngày: ${dailySummary}">📅 Phân bổ: <b>${dailySummary}</b></div>`;
    }

    d.innerHTML=`<div class="ph">
      <span class="pswatch" style="background:${partColor(origIdx >= 0 ? origIdx : idx)}"></span>
      <span class="pname">${p.id}</span>
      <span class="ptag ${p.ordered?'ord':'free'}">${p.ordered?'Trình tự':'Tự do'}</span>
      ${pBadge}
      ${startStr}
      ${dueStr}
      ${packStr}
      ${effStr}
      <span class="pqty">KH: ${planQ.toLocaleString()}</span></div>
      <div style="font-size:10.5px;color:var(--muted);margin:3px 0 2px 0;display:flex;justify-content:space-between">
        <span>Thực tế: <b>${actQ.toLocaleString()}</b> pcs (${pct}%)</span>
        <span>Còn lại: <b style="color:var(--accent)">${remQ.toLocaleString()}</b> pcs</span>
      </div>
      <div style="height:3px;background:var(--line);border-radius:2px;overflow:hidden;margin-bottom:4px">
        <div style="width:${pct}%;height:100%;background:${pct>=100?'var(--good)':'var(--accent)'}"></div>
      </div>
      ${dailyHtml}
      <div class="pops" style="line-height:1.45">${p.ops.length} thao tác · ${route}</div>`;
    pl.appendChild(d);
  });

  if(pageInfo){
    if(filtered.length > PARTS_PER_PAGE){
      pageInfo.innerHTML = `
        <span>Trang <b>${currentPartPage}</b> / ${totalPages} (${filtered.length} part)</span>
        <div style="display:flex;gap:4px">
          <button class="btn ghost" style="padding:2px 8px;font-size:10px" id="prevPartPageBtn" ${currentPartPage <= 1 ? 'disabled':''}>◀</button>
          <button class="btn ghost" style="padding:2px 8px;font-size:10px" id="nextPartPageBtn" ${currentPartPage >= totalPages ? 'disabled':''}>▶</button>
        </div>
      `;
      const btnPrev = document.getElementById("prevPartPageBtn");
      const btnNext = document.getElementById("nextPartPageBtn");
      if(btnPrev) btnPrev.onclick = () => { currentPartPage--; renderPartListFiltered(); };
      if(btnNext) btnNext.onclick = () => { currentPartPage++; renderPartListFiltered(); };
    } else {
      pageInfo.innerHTML = `<span>Hiển thị ${filtered.length} part</span>`;
    }
  }
}

function renderData(){
  document.getElementById("nMach").textContent=model.machines.length;
  document.getElementById("nPart").textContent=model.parts.length;
  const nop=model.parts.reduce((s,p)=>s+p.ops.length*(p.qty||0),0);
  document.getElementById("nOp").textContent=nop.toLocaleString();

  // Hiển thị Tổng Kế hoạch và Thực tế
  const totalPlan = model.parts.reduce((s, p) => s + (p.planQty != null ? p.planQty : (p.qty || 0)), 0);
  const totalActual = model.parts.reduce((s, p) => s + (p.actualQty || 0), 0);
  const sPlan = document.getElementById("sPlan");
  const sActual = document.getElementById("sActual");
  const elPlanQty = document.getElementById("nPlanQty");
  const elActualQty = document.getElementById("nActualQty");
  if(sPlan && elPlanQty){
    sPlan.style.display = "flex";
    elPlanQty.textContent = totalPlan.toLocaleString();
  }
  if(sActual && elActualQty){
    sActual.style.display = "flex";
    elActualQty.textContent = totalActual.toLocaleString();
  }
  
  // Cập nhật danh sách máy cho ô Khai báo sự cố
  const machSelect = document.getElementById("dtMach");
  if(machSelect && machSelect.options.length !== model.machines.length){
    machSelect.innerHTML = model.machines.map((m, i) => `<option value="${i}">${m}</option>`).join("");
  }

  currentPartPage = 1;
  renderPartListFiltered();
  const searchInput = document.getElementById("partSearch");
  if(searchInput && !searchInput._bound){
    searchInput._bound = true;
    searchInput.addEventListener("input", () => {
      currentPartPage = 1;
      renderPartListFiltered();
    });
  }
}
function showWarnings(ws){
  const el=document.getElementById("warn"); el.innerHTML="";
  if(ws&&ws.length){ const d=document.createElement("div"); d.className="warnbox";
    d.textContent="⚠ "+ws.join(" "); el.appendChild(d); }
}

/* ============================================================
   MÔ PHỎNG 3D (Three.js)
   ============================================================ */
let THREE_OK = (typeof THREE!=="undefined");
let renderer,scene,camera,machineMeshes=[],partCubes=[],threeReady=false;
let orbit={az:-0.6,el:0.95,r:1,cx:0,cy:0,cz:0,drag:false,dragMode:"rotate",px:0,py:0};

function fitView3D(){
  setCameraPreset("overview");
}
window.fitView3D = fitView3D;

let targetOrbit = null;
function setCameraPreset(preset){
  if(!threeReady) return;
  const numM = (model && model.machines) ? model.machines.length : 25;
  const defaultR = Math.max(50, Math.min(280, numM * 4.2 + 40));

  let tOrbit = { cx: 30, cy: 0, cz: 18, az: -0.65, el: 0.82, r: 135 };

  if(preset === "overview"){
    // Toàn cảnh nhà xưởng (Isometric Overview)
    tOrbit = { cx: 30, cy: 0, cz: 18, az: -0.65, el: 0.82, r: 135 };
  } else if(preset === "topdown"){
    // Nhìn thẳng từ trên trần xuống sàn (2D Layout Floor Plan)
    tOrbit = { cx: 30, cy: 0, cz: 18, az: 0, el: 1.54, r: 120 };
  } else if(preset === "l1"){
    // Cụm L1: Máy hàn tán bu lông, đai ốc (Z=36, X=0..70)
    tOrbit = { cx: 35, cy: 0, cz: 36, az: -0.3, el: 0.65, r: 65 };
  } else if(preset === "l2"){
    // Cụm L2: Súng hàn cầm tay treo balancer, máy pedestal (Z=18, X=0..60)
    tOrbit = { cx: 30, cy: 0, cz: 18, az: -0.3, el: 0.65, r: 65 };
  } else if(preset === "l3"){
    // Cụm L3: Cụm máy hàn C-frame công suất lớn 100-150kVA (Z=0, X=0..60)
    tOrbit = { cx: 30, cy: 0, cz: 0, az: -0.3, el: 0.65, r: 65 };
  } else if(preset === "worker"){
    // Góc nhìn ngang tầm mắt người vận hành từ lối đi chính
    tOrbit = { cx: 25, cy: -2, cz: 18, az: -1.57, el: 0.18, r: 35 };
  }

  targetOrbit = tOrbit;
  animateCameraTransition();
}
window.setCameraPreset = setCameraPreset;

function animateCameraTransition(){
  if(!targetOrbit) return;
  const lerpSpeed = 0.14;
  orbit.cx += (targetOrbit.cx - orbit.cx) * lerpSpeed;
  orbit.cy += (targetOrbit.cy - orbit.cy) * lerpSpeed;
  orbit.cz += (targetOrbit.cz - orbit.cz) * lerpSpeed;
  orbit.az += (targetOrbit.az - orbit.az) * lerpSpeed;
  orbit.el += (targetOrbit.el - orbit.el) * lerpSpeed;
  orbit.r  += (targetOrbit.r  - orbit.r)  * lerpSpeed;

  const dist = Math.abs(targetOrbit.cx - orbit.cx) + 
               Math.abs(targetOrbit.cz - orbit.cz) + 
               Math.abs(targetOrbit.az - orbit.az) + 
               Math.abs(targetOrbit.el - orbit.el) + 
               Math.abs(targetOrbit.r  - orbit.r);

  if(dist < 0.04){
    Object.assign(orbit, targetOrbit);
    targetOrbit = null;
  } else {
    requestAnimationFrame(animateCameraTransition);
  }
  if(typeof renderThree === "function") renderThree();
}

function initThree(){
  if(!THREE_OK) return;
  const canvas=document.getElementById("three");
  renderer=new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
  });

  // Tối ưu độ nét cực cao (HiDPI / SuperSharp 2.5x)
  renderer.setPixelRatio(Math.min(2.5, window.devicePixelRatio || 1));
  if(THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  else if(THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  // Bóng đổ tiếp xúc chân thực (Contact Soft Shadows)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(40, 1, 0.5, 2500);

  // Hệ thống chiếu sáng nổi khối công nghiệp
  scene.add(new THREE.AmbientLight(0xffffff, 0.72));
  const dir=new THREE.DirectionalLight(0xffffff, 1.05);
  dir.position.set(45, 90, 35);
  dir.castShadow = true;
  dir.shadow.mapSize.width = 2048;
  dir.shadow.mapSize.height = 2048;
  dir.shadow.camera.near = 10;
  dir.shadow.camera.far = 400;
  dir.shadow.camera.left = -90;
  dir.shadow.camera.right = 90;
  dir.shadow.camera.top = 90;
  dir.shadow.camera.bottom = -90;
  dir.shadow.bias = -0.0004;
  scene.add(dir);

  const dir2=new THREE.DirectionalLight(0x93c5fd, 0.42);
  dir2.position.set(-35, 45, -45);
  scene.add(dir2);

  buildMachines();
  bindOrbit(canvas);
  threeReady=true;
  const ro=new ResizeObserver(resizeThree); ro.observe(canvas.parentElement);
  resizeThree();
}
let factoryEnvGroup = null;
let agvFleet = [];
let stagingOrigin = { x: -30, z: 0 };
let stagingCrates = [];

function clearGroup(){
  machineMeshes.forEach(o=>scene.remove(o.g));
  machineMeshes=[];
  if(factoryEnvGroup){ scene.remove(factoryEnvGroup); factoryEnvGroup=null; }
  agvFleet.forEach(a=>scene.remove(a.g));
  agvFleet=[];
  stagingCrates=[];
}

function makeZoneBanner(title, borderHex){
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 192;
  const x = c.getContext("2d");
  x.fillStyle = "rgba(15, 23, 42, 0.94)";
  roundRect(x, 10, 10, 1004, 172, 24);
  x.fill();
  x.lineWidth = 10;
  x.strokeStyle = borderHex || "#38bdf8";
  x.stroke();
  x.font = "bold 60px 'IBM Plex Sans',sans-serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillStyle = "#ffffff";
  x.shadowColor = "rgba(0,0,0,0.95)";
  x.shadowBlur = 10;
  x.fillText(title, 512, 96);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4; tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthWrite: false}));
  sp.scale.set(13.5, 2.5, 1);
  return sp;
}

function makeSmallTag(text, bgHex, fgHex){
  const c = document.createElement("canvas");
  c.width = 256; c.height = 56;
  const x = c.getContext("2d");
  x.fillStyle = bgHex || "rgba(15, 23, 42, 0.88)";
  roundRect(x, 4, 4, 248, 48, 10);
  x.fill();
  x.font = "bold 22px 'IBM Plex Mono',monospace";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillStyle = fgHex || "#fcd34d";
  x.fillText(text, 128, 28);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthWrite: false}));
  sp.scale.set(3.6, 0.8, 1);
  return sp;
}

function makeBreakdownTag(mName, reason){
  const c = document.createElement("canvas");
  c.width = 512; c.height = 192;
  const x = c.getContext("2d");

  // Nền đỏ cảnh báo nguy hiểm #b91c1c
  x.fillStyle = "rgba(185, 28, 28, 0.94)";
  roundRect(x, 6, 6, 500, 180, 14);
  x.fill();

  // Viền vàng Hazard phản quang
  x.lineWidth = 6;
  x.strokeStyle = "#facc15";
  x.stroke();

  // Dải sọc vàng đen Hazard trên đỉnh
  x.fillStyle = "#facc15";
  x.fillRect(6, 6, 500, 26);
  x.fillStyle = "#000000";
  for(let i = 8; i < 500; i += 34){
    x.beginPath();
    x.moveTo(i, 6);
    x.lineTo(i + 16, 6);
    x.lineTo(i + 8, 32);
    x.lineTo(i - 8, 32);
    x.fill();
  }

  // Dòng 1: Icon cảnh báo & Tên máy HỎNG
  x.font = "bold 44px 'IBM Plex Mono',sans-serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillStyle = "#ffffff";
  x.shadowColor = "rgba(0,0,0,0.85)";
  x.shadowBlur = 6;
  x.fillText(`⚠ ${mName}: MÁY HỎNG / SỰ CỐ`, 256, 80);

  // Dòng 2: Trạng thái DỪNG HOẠT ĐỘNG
  x.font = "bold 28px 'IBM Plex Mono',sans-serif";
  x.fillStyle = "#fef08a";
  x.fillText(reason || "DỪNG HOẠT ĐỘNG · CHỜ BẢO TRÌ", 256, 138);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthWrite: false}));
  sp.scale.set(5.2, 1.95, 1);
  return sp;
}

function makeWorkerLabel(name, skill, workerId, shift){
  const c = document.createElement("canvas");
  c.width = 512; c.height = 144;
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthWrite: false}));
  sp.scale.set(4.3, 1.21, 1);
  sp._canvas = c;
  sp._tex = tex;
  updateWorkerSprite(sp, name, skill, "ready", workerId, shift);
  return sp;
}

function updateWorkerSprite(sp, name, skill, status, workerId, shift){
  if(!sp || !sp._canvas) return;
  const c = sp._canvas;
  const x = c.getContext("2d");
  x.clearRect(0, 0, 512, 144);
  const isWelding = (status === "welding");
  const strokeColor = isWelding ? "#a855f7" : "#0284c7"; // Tím khi đang làm việc, xanh biển khi sẵn sàng
  x.fillStyle = isWelding ? "rgba(15, 23, 42, 0.94)" : "rgba(15, 23, 42, 0.88)";
  if(x.roundRect) x.roundRect(8, 8, 496, 128, 20);
  else x.fillRect(8, 8, 496, 128);
  x.fill();
  x.lineWidth = 6;
  x.strokeStyle = strokeColor;
  x.stroke();

  // Dòng 1: [Mã Thẻ] Họ Tên Công Nhân
  x.font = "bold 38px 'IBM Plex Sans', sans-serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.shadowColor = "rgba(0,0,0,0.95)";
  x.shadowBlur = 8;
  x.fillStyle = "#ffffff";
  const idTag = workerId ? `[${workerId}] ` : "";
  x.fillText("👷 " + idTag + (name || "Thợ trực máy"), 256, 48);

  // Dòng 2: Bậc Thợ · Ca Làm Việc · Trạng Thái
  x.font = "bold 28px 'IBM Plex Sans', sans-serif";
  x.fillStyle = isWelding ? "#fcd34d" : "#7dd3fc";
  const skillTag = skill || "Bậc 3";
  const shiftTag = shift ? ` · Ca ${shift}` : "";
  const stateTag = isWelding ? " · Đang làm" : " · Sẵn sàng";
  x.fillText(skillTag + shiftTag + stateTag, 256, 100);

  if(sp._tex) sp._tex.needsUpdate = true;
}

function buildMachines(){
  if(!threeReady && !scene) return;
  clearGroup();
  const N = model.machines.length; const gap = 10.5;
  if(!_sparkTex) _sparkTex = makeSparkTexture();
  const assignedWorkerIds = new Set();

  function workerMatchesMachine(w, mName){
    if(!w) return false;
    const prefs = Array.isArray(w.prefMachines) ? w.prefMachines : (w.pref ? [w.pref] : []);
    const mNorm = strip(mName || "").toLowerCase().replace(/[-_ ]/g, "");
    return prefs.some(pm => {
      const pNorm = strip(pm).toLowerCase().replace(/[-_ ]/g, "");
      return pNorm === mNorm || mNorm.includes(pNorm) || pNorm.includes(mNorm);
    });
  }

  // scale toạ độ sao cho hai máy gần nhau nhất cách ~gap; căn giữa quanh gốc
  const avg = a => a.reduce((s,v)=>s+v, 0)/(a.length || 1);
  let dmin = Infinity;
  for(let a=0; a<N; a++) for(let b=a+1; b<N; b++){
    const d = Math.hypot(model.cellX[a]-model.cellX[b], model.cellY[a]-model.cellY[b]);
    if(d > 1e-6 && d < dmin) dmin = d;
  }
  if(!isFinite(dmin)) dmin = 1;
  const mscale = gap / dmin, mcx = avg(model.cellX), mcy = avg(model.cellY);

  // Bộ vật liệu đa dạng theo loại máy
  const steelGreen = new THREE.MeshStandardMaterial({color: 0x3c5a40, roughness: .66, metalness: .35});
  const steelDark  = new THREE.MeshStandardMaterial({color: 0x223525, roughness: .60, metalness: .45}); // máy to
  const mint       = new THREE.MeshStandardMaterial({color: 0xb9d1b9, roughness: .8,  metalness: .12});
  const mintDark   = new THREE.MeshStandardMaterial({color: 0x93ab93, roughness: .75, metalness: .2});
  const panelMat   = new THREE.MeshStandardMaterial({color: 0x4a6b4e, roughness: .58, metalness: .3});
  const copperMat  = new THREE.MeshStandardMaterial({color: 0xb06a34, roughness: .35, metalness: .85});
  const greyMetal  = new THREE.MeshStandardMaterial({color: 0x8d939a, roughness: .4,  metalness: .78});
  const dgreyMetal = new THREE.MeshStandardMaterial({color: 0x40464c, roughness: .5,  metalness: .6});
  const yellowSafe = new THREE.MeshStandardMaterial({color: 0xdf9a14, roughness: .45, metalness: .35}); // súng treo / robot
  const robotOrange= new THREE.MeshStandardMaterial({color: 0xf59e0b, roughness: .35, metalness: .45}); // cánh tay robot MAG
  const laserWhite = new THREE.MeshStandardMaterial({color: 0xe2e8f0, roughness: .4,  metalness: .3});  // vỏ máy cắt laser
  const laserBlue  = new THREE.MeshStandardMaterial({color: 0x0284c7, roughness: .45, metalness: .4});  // viền máy laser
  const laserGlass = new THREE.MeshStandardMaterial({color: 0x0f172a, roughness: .15, metalness: .9, transparent: true, opacity: 0.72});
  const pressTeal  = new THREE.MeshStandardMaterial({color: 0x115e59, roughness: .55, metalness: .45}); // thân máy dập
  const arcScreen  = new THREE.MeshStandardMaterial({color: 0xea580c, roughness: .3,  metalness: .1, transparent: true, opacity: 0.35}); // vách chắn hồ quang
  const redAcc     = new THREE.MeshStandardMaterial({color: 0xc83222, roughness: .5,  metalness: .3}); // balancer
  const bluePress  = new THREE.MeshStandardMaterial({color: 0x204875, roughness: .55, metalness: .45}); // Soyer bulong
  const tableTop   = new THREE.MeshStandardMaterial({color: 0x4e555e, roughness: .65, metalness: .6}); // bàn thép
  const tableLeg   = new THREE.MeshStandardMaterial({color: 0x282c32, roughness: .8,  metalness: .5});
  const bowlMat    = new THREE.MeshStandardMaterial({color: 0xc2c7ce, roughness: .3,  metalness: .9}); // inox phễu rung
  const woodPallet = new THREE.MeshStandardMaterial({color: 0x926239, roughness: .85, metalness: .08}); // pallet gỗ/nhựa
  const inZoneMat  = new THREE.MeshStandardMaterial({color: 0xf59e0b, roughness: .7,  metalness: .1});  // vạch vị trí hàng chờ
  const outZoneMat = new THREE.MeshStandardMaterial({color: 0x10b981, roughness: .7,  metalness: .1});  // vạch vị trí hàng xong

  model.machines.forEach((name, i) => {
    const g = new THREE.Group();
    const cx = (model.cellX[i] - mcx) * mscale, cz = (model.cellY[i] - mcy) * mscale;
    g.position.set(cx, 0, cz);

    // Cài đặt Góc quay máy (GocQuay)
    const rotDeg = (model.rotations && model.rotations[i] != null) ? Number(model.rotations[i]) : 0;
    const rotRad = (rotDeg * Math.PI) / 180;
    g.rotation.y = rotRad;

    // Kiểu máy (KieuMay): to, trungbinh, nho, camtay, bulong, lasertam, laserong, maydap, magrobot
    const mType = (model.machineTypes && model.machineTypes[i]) ? String(model.machineTypes[i]).toLowerCase() : "trungbinh";
    const power = (model.machinePowers && model.machinePowers[i]) ? String(model.machinePowers[i]).trim() : "";
    const zoneName = (model.machineZones && model.machineZones[i]) ? String(model.machineZones[i]).trim() : "Xưởng Hàn Spot";

    const upElecMat = new THREE.MeshStandardMaterial({color: 0xc98b4a, roughness: .35, metalness: .8, emissive: 0x000000});
    const loElecMat = new THREE.MeshStandardMaterial({color: 0xc98b4a, roughness: .35, metalness: .8, emissive: 0x000000});
    const ledMat    = new THREE.MeshStandardMaterial({color: 0x2e7d55, emissive: 0x1a9e6a, emissiveIntensity: .6});
    const workMat   = new THREE.MeshStandardMaterial({color: 0xe8611f, roughness: .5, metalness: .1, emissive: 0x000000});

    let upElec, work, spark, led, lab, feederBowl = null, dispenserNut = null;
    let weldX = -2.4, weldY = 4.0, baseElecY = 4.25, baseElecX = -2.4, baseElecZ = 0;

    if(mType === "lasertam"){
      // ==========================================
      // 6. MÁY CẮT TẤM LASER FIBER CNC (LASERTAM)
      // ==========================================
      weldX = -1.6; weldY = 2.45; baseElecY = 3.1; baseElecX = -1.6; baseElecZ = 0;

      // Bệ khung máy dài (Cabin cắt + Bàn tráo pallet kép phía trước)
      const bed = new THREE.Mesh(new THREE.BoxGeometry(7.8, 1.8, 4.2), dgreyMetal); bed.position.set(0.2, 0.9, 0); g.add(bed);
      // Cabin bảo vệ chính (phía sau) sơn trắng-xám + dải xanh công nghiệp
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.4, 4.4), laserWhite); cabin.position.set(1.8, 3.5, 0); g.add(cabin);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.45, 0.45, 4.46), laserBlue); stripe.position.set(1.8, 4.7, 0); g.add(stripe);
      // Cửa kính quan sát chống tia laser
      const winFront = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.8, 3.2), laserGlass); winFront.position.set(-0.42, 3.5, 0); g.add(winFront);
      const winSide  = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.6, 4.48), laserGlass); winSide.position.set(1.6, 3.5, 0); g.add(winSide);

      // Bàn tráo phôi tấm phía trước (Shuttle Pallet Table) + Tấm tôn phôi
      const grate = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 3.6), greyMetal); grate.position.set(-1.8, 1.95, 0); g.add(grate);
      const rawSheet = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 3.0), bowlMat); rawSheet.position.set(-1.8, 2.15, 0); g.add(rawSheet);

      // Cầu trục Gantry & Đầu cắt Laser (upElec dịch chuyển cắt tấm)
      const gantry = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 4.0), yellowSafe); gantry.position.set(weldX, 3.7, 0); g.add(gantry);
      upElec = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.06, 1.1, 14), upElecMat);
      upElec.position.set(baseElecX, baseElecY, baseElecZ); g.add(upElec);

      // Tủ nguồn Fiber Laser + Hệ thống hút lọc bụi khói bên cạnh
      const resonator = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3.6, 1.4), panelMat); resonator.position.set(2.4, 1.8, -2.9); g.add(resonator);
      const chiller   = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 1.2), laserWhite); chiller.position.set(0.4, 1.2, -2.8); g.add(chiller);

      // Cột đèn tín hiệu + Phôi cắt + Tia cắt Laser
      led = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), ledMat); led.position.set(-0.3, 5.5, 1.8); g.add(led);
      work = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 2.6), workMat); work.position.set(weldX, weldY, 0); work.visible = false; g.add(work);
      spark = new THREE.Sprite(new THREE.SpriteMaterial({map: _sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
      spark.position.set(weldX, weldY + 0.2, 0); spark.scale.set(2.3, 2.3, 1); spark.visible = false; g.add(spark);
      lab = makeLabel(name, power); lab.position.set(0.5, power ? 9.6 : 9.2, 0); g.add(lab);

    } else if(mType === "laserong"){
      // ==========================================
      // 7. MÁY CẮT ỐNG LASER CNC (LASERONG - TUBE LASER)
      // ==========================================
      weldX = -1.8; weldY = 2.85; baseElecY = 3.55; baseElecX = -1.8; baseElecZ = 0;

      // Thân giường máy dài đỡ ống
      const longBed = new THREE.Mesh(new THREE.BoxGeometry(8.6, 1.6, 2.4), dgreyMetal); longBed.position.set(0.4, 0.8, 0); g.add(longBed);
      // Buồng cabin đầu cắt laser phía trước
      const headCab = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.6, 3.0), laserWhite); headCab.position.set(-1.6, 3.2, 0); g.add(headCab);
      const blueBand = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.4, 3.05), laserBlue); blueBand.position.set(-1.6, 4.6, 0); g.add(blueBand);
      const cabWin  = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 3.06), laserGlass); cabWin.position.set(-1.6, 3.3, 0); g.add(cabWin);

      // Mâm cặp xoay 360 độ (Rotary Chuck) kẹp phôi ống
      const chuckBody = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 2.0), yellowSafe); chuckBody.position.set(1.2, 2.7, 0); g.add(chuckBody);
      const chuckJaw  = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.5, 16), greyMetal);
      chuckJaw.rotation.z = Math.PI / 2; chuckJaw.position.set(0.5, 2.85, 0); g.add(chuckJaw);

      // Phôi ống thép dài xuyên qua mâm cặp + Dàn cấp phôi ống bên cạnh
      const mainTube = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 7.6, 16), bowlMat);
      mainTube.rotation.z = Math.PI / 2; mainTube.position.set(0.6, 2.85, 0); g.add(mainTube);
      [-0.6, -1.0, -1.4].forEach(zOff => {
        const rawPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 5.2, 12), greyMetal);
        rawPipe.rotation.z = Math.PI / 2; rawPipe.position.set(1.8, 1.85, zOff - 1.2); g.add(rawPipe);
      });

      // Đầu phóng tia Laser cắt ống
      upElec = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.06, 1.0, 14), upElecMat);
      upElec.position.set(baseElecX, baseElecY, baseElecZ); g.add(upElec);

      led = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), ledMat); led.position.set(-1.6, 5.3, 1.1); g.add(led);
      work = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 2.2, 16), workMat);
      work.rotation.z = Math.PI / 2; work.position.set(weldX, weldY, 0); work.visible = false; g.add(work);
      spark = new THREE.Sprite(new THREE.SpriteMaterial({map: _sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
      spark.position.set(weldX, weldY + 0.15, 0); spark.scale.set(2.1, 2.1, 1); spark.visible = false; g.add(spark);
      lab = makeLabel(name, power); lab.position.set(0.0, power ? 9.4 : 9.0, 0); g.add(lab);

    } else if(mType === "maydap1"){
      // ==========================================
      // 8A. MÁY DẬP KHUNG CHỮ C NHỎ (MAYDAP1 - 35T-60T OPEN C-FRAME)
      // ==========================================
      weldX = -0.7; weldY = 2.65; baseElecY = 3.55; baseElecX = -0.7; baseElecZ = 0;

      const pBase = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.55, 3.0), steelDark); pBase.position.set(0.3, 0.28, 0); g.add(pBase);
      const bolster = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 2.5), laserBlue); bolster.position.set(0.1, 1.3, 0); g.add(bolster);
      // Cột lưng chữ C & Đầu máy nhô ra phía trước
      const cSpine = new THREE.Mesh(new THREE.BoxGeometry(1.8, 4.2, 2.2), laserBlue); cSpine.position.set(1.1, 3.8, 0); g.add(cSpine);
      const cHead  = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.8, 2.3), laserBlue); cHead.position.set(0.4, 5.4, 0); g.add(cHead);
      const flywheel = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.4, 18), redAcc);
      flywheel.position.set(0.5, 5.6, 1.35); flywheel.rotation.x = Math.PI / 2; g.add(flywheel);

      const loDie = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 1.4), dgreyMetal); loDie.position.set(weldX, 2.25, 0); g.add(loDie);
      upElec = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.05, 1.45), upElecMat);
      upElec.position.set(baseElecX, baseElecY, baseElecZ); g.add(upElec);

      // Bàn đạp chân
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.75), yellowSafe); pedal.position.set(-1.6, 0.1, 0); g.add(pedal);

      led = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), ledMat); led.position.set(-0.9, 5.6, 1.2); g.add(led);
      work = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.28, 1.2), workMat); work.position.set(weldX, weldY, 0); work.visible = false; g.add(work);
      spark = new THREE.Sprite(new THREE.SpriteMaterial({map: _sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
      spark.position.set(weldX, weldY, 0); spark.scale.set(1.5, 1.5, 1); spark.visible = false; g.add(spark);
      lab = makeLabel(name, power); lab.position.set(0.2, power ? 8.2 : 7.8, 0); g.add(lab);

    } else if(mType === "maydap2"){
      // ==========================================
      // 8B. MÁY DẬP KHUNG CHỮ C ĐƠN TRỤC VỪA (MAYDAP2 - 80T-125T SINGLE-CRANK C-FRAME)
      // ==========================================
      weldX = -0.7; weldY = 2.95; baseElecY = 4.1; baseElecX = -0.7; baseElecZ = 0;

      const pBase = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.68, 3.6), steelDark); pBase.position.set(0.3, 0.34, 0); g.add(pBase);
      const bolster = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.75, 3.1), steelGreen); bolster.position.set(0.1, 1.55, 0); g.add(bolster);
      // Thân đúc chữ C hạng trung
      const cSpine = new THREE.Mesh(new THREE.BoxGeometry(2.2, 5.2, 2.7), steelGreen); cSpine.position.set(1.2, 4.5, 0); g.add(cSpine);
      const cHead  = new THREE.Mesh(new THREE.BoxGeometry(3.5, 2.1, 2.85), steelGreen); cHead.position.set(0.4, 6.6, 0); g.add(cHead);
      const hStripe= new THREE.Mesh(new THREE.BoxGeometry(3.56, 0.35, 2.9), yellowSafe); hStripe.position.set(0.4, 7.2, 0); g.add(hStripe);
      // Xy-lanh cân bằng trên đỉnh & Bánh đà hông
      const topCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.9, 14), greyMetal); topCyl.position.set(-0.2, 8.0, 0); g.add(topCyl);
      const flywheel = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.5, 18), redAcc);
      flywheel.position.set(0.6, 6.7, 1.65); flywheel.rotation.x = Math.PI / 2; g.add(flywheel);

      const loDie = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.45, 1.8), dgreyMetal); loDie.position.set(weldX, 2.65, 0); g.add(loDie);
      upElec = new THREE.Mesh(new THREE.BoxGeometry(1.85, 1.35, 1.9), upElecMat);
      upElec.position.set(baseElecX, baseElecY, baseElecZ); g.add(upElec);

      const pedPost = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 2.4, 10), greyMetal); pedPost.position.set(-2.0, 1.2, 1.2); g.add(pedPost);
      const pedBox  = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.95), yellowSafe); pedBox.position.set(-2.0, 2.4, 1.2); g.add(pedBox);

      led = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), ledMat); led.position.set(-1.1, 6.8, 1.45); g.add(led);
      work = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.32, 1.6), workMat); work.position.set(weldX, weldY, 0); work.visible = false; g.add(work);
      spark = new THREE.Sprite(new THREE.SpriteMaterial({map: _sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
      spark.position.set(weldX, weldY, 0); spark.scale.set(1.8, 1.8, 1); spark.visible = false; g.add(spark);
      lab = makeLabel(name, power); lab.position.set(0.2, power ? 9.8 : 9.4, 0); g.add(lab);

    } else if(mType === "maydap3" || mType === "maydap"){
      // ==========================================
      // 8C. MÁY DẬP KHUNG CHỮ H TRUNG BÌNH (MAYDAP3 - 150T-200T STRAIGHT-SIDE H-FRAME)
      // ==========================================
      weldX = -0.6; weldY = 3.2; baseElecY = 4.6; baseElecX = -0.6; baseElecZ = 0;

      // Chân đế đúc & Bàn máy dập (Bolster Plate)
      const pBase = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.8, 4.8), steelDark); pBase.position.set(0.2, 0.4, 0); g.add(pBase);
      const bolster = new THREE.Mesh(new THREE.BoxGeometry(4.0, 2.0, 3.8), pressTeal); bolster.position.set(0.2, 1.8, 0); g.add(bolster);
      // 2 Cột trụ khung chữ H (Side Columns) + Dầm đỉnh (Crown)
      const colL = new THREE.Mesh(new THREE.BoxGeometry(2.8, 6.4, 0.9), pressTeal); colL.position.set(0.4, 5.0, -1.7); g.add(colL);
      const colR = new THREE.Mesh(new THREE.BoxGeometry(2.8, 6.4, 0.9), pressTeal); colR.position.set(0.4, 5.0,  1.7); g.add(colR);
      const crown = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.4, 4.6), pressTeal); crown.position.set(0.4, 8.8, 0); g.add(crown);
      const crownStripe = new THREE.Mesh(new THREE.BoxGeometry(3.86, 0.45, 4.66), yellowSafe); crownStripe.position.set(0.4, 9.4, 0); g.add(crownStripe);

      // Bánh đà & Động cơ truyền động trên đỉnh
      const flywheel = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.6, 20), redAcc);
      flywheel.position.set(0.6, 9.2, 2.5); flywheel.rotation.x = Math.PI / 2; g.add(flywheel);

      // Khuôn dưới (Lower Die) + Đầu trượt dập & Khuôn trên (Ram / Upper Die = upElec)
      const loDie = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 2.2), dgreyMetal); loDie.position.set(weldX, 2.9, 0); g.add(loDie);
      upElec = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.6, 2.3), upElecMat);
      upElec.position.set(baseElecX, baseElecY, baseElecZ); g.add(upElec);

      // Trạm nút bấm an toàn 2 tay phía trước máy dập
      const pedPost = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 2.6, 10), greyMetal); pedPost.position.set(-2.3, 1.3, 1.4); g.add(pedPost);
      const pedBox  = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 1.1), yellowSafe); pedBox.position.set(-2.3, 2.6, 1.4); g.add(pedBox);

      led = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), ledMat); led.position.set(-1.3, 8.6, 1.9); g.add(led);
      work = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.35, 2.0), workMat); work.position.set(weldX, weldY, 0); work.visible = false; g.add(work);
      spark = new THREE.Sprite(new THREE.SpriteMaterial({map: _sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
      spark.position.set(weldX, weldY, 0); spark.scale.set(2.0, 2.0, 1); spark.visible = false; g.add(spark);
      lab = makeLabel(name, power); lab.position.set(0.2, power ? 11.6 : 11.2, 0); g.add(lab);

    } else if(mType === "maydap4"){
      // ==========================================
      // 8D. MÁY DẬP CHỮ H KHỔ RỘNG 2 TRỤC (MAYDAP4 - 250T-350T DOUBLE-CRANK WIDE PRESS)
      // ==========================================
      weldX = -0.5; weldY = 3.45; baseElecY = 5.05; baseElecX = -0.5; baseElecZ = 0;

      const pBase = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.95, 6.0), steelDark); pBase.position.set(0.2, 0.48, 0); g.add(pBase);
      const bolster = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.2, 5.2), bluePress); bolster.position.set(0.2, 2.0, 0); g.add(bolster);
      // 2 Cột khung chữ H bản rộng
      const colL = new THREE.Mesh(new THREE.BoxGeometry(3.2, 7.2, 1.1), bluePress); colL.position.set(0.4, 5.6, -2.3); g.add(colL);
      const colR = new THREE.Mesh(new THREE.BoxGeometry(3.2, 7.2, 1.1), bluePress); colR.position.set(0.4, 5.6,  2.3); g.add(colR);
      const crown = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.8, 5.8), bluePress); crown.position.set(0.4, 9.8, 0); g.add(crown);
      const crownStripe = new THREE.Mesh(new THREE.BoxGeometry(4.26, 0.5, 5.86), yellowSafe); crownStripe.position.set(0.4, 10.5, 0); g.add(crownStripe);

      // 2 Xy-lanh cân bằng kép trên đỉnh + 2 Bánh đà hông
      [-1.1, 1.1].forEach(zOff => {
        const bCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.2, 16), greyMetal);
        bCyl.position.set(0.3, 11.6, zOff); g.add(bCyl);
      });
      [-3.1, 3.1].forEach(zOff => {
        const fw = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.55, 20), redAcc);
        fw.position.set(0.6, 10.0, zOff); fw.rotation.x = Math.PI / 2; g.add(fw);
      });

      // Khuôn liên hoàn khổ rộng
      const loDie = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.65, 3.2), dgreyMetal); loDie.position.set(weldX, 3.15, 0); g.add(loDie);
      upElec = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.85, 3.3), upElecMat);
      upElec.position.set(baseElecX, baseElecY, baseElecZ); g.add(upElec);

      const pedPost = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 2.7, 10), greyMetal); pedPost.position.set(-2.6, 1.35, 1.8); g.add(pedPost);
      const pedBox  = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 1.2), yellowSafe); pedBox.position.set(-2.6, 2.7, 1.8); g.add(pedBox);

      led = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), ledMat); led.position.set(-1.6, 9.6, 2.4); g.add(led);
      work = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 2.9), workMat); work.position.set(weldX, weldY, 0); work.visible = false; g.add(work);
      spark = new THREE.Sprite(new THREE.SpriteMaterial({map: _sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
      spark.position.set(weldX, weldY, 0); spark.scale.set(2.4, 2.4, 1); spark.visible = false; g.add(spark);
      lab = makeLabel(name, power); lab.position.set(0.2, power ? 13.4 : 13.0, 0); g.add(lab);

    } else if(mType === "maydap5"){
      // ==========================================
      // 8E. MÁY DẬP THỦY LỰC / VUỐT SÂU SIÊU TRỌNG (MAYDAP5 - 400T-630T+ HEAVY HYDRAULIC PRESS)
      // ==========================================
      weldX = -0.4; weldY = 3.7; baseElecY = 5.5; baseElecX = -0.4; baseElecZ = 0;

      const pBase = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.1, 6.4), dgreyMetal); pBase.position.set(0.2, 0.55, 0); g.add(pBase);
      const bolster = new THREE.Mesh(new THREE.BoxGeometry(5.0, 2.4, 5.6), steelDark); bolster.position.set(0.2, 2.2, 0); g.add(bolster);
      // 2 Vách trụ khổng lồ + 4 Cột dẫn hướng mạ crôm sáng bóng
      const colL = new THREE.Mesh(new THREE.BoxGeometry(3.6, 8.2, 1.25), steelDark); colL.position.set(0.4, 6.2, -2.5); g.add(colL);
      const colR = new THREE.Mesh(new THREE.BoxGeometry(3.6, 8.2, 1.25), steelDark); colR.position.set(0.4, 6.2,  2.5); g.add(colR);
      [[-1.1, -1.6], [-1.1, 1.6], [1.5, -1.6], [1.5, 1.6]].forEach(([px, pz]) => {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 7.6, 16), bowlMat);
        pillar.position.set(px, 6.4, pz); g.add(pillar);
      });

      // Dầm đỉnh siêu trọng + Bồn dầu thủy lực & 3 Xy-lanh thủy lực chính/phụ
      const crown = new THREE.Mesh(new THREE.BoxGeometry(4.8, 3.1, 6.4), pressTeal); crown.position.set(0.4, 10.9, 0); g.add(crown);
      const crownStripe = new THREE.Mesh(new THREE.BoxGeometry(4.86, 0.55, 6.46), redAcc); crownStripe.position.set(0.4, 11.7, 0); g.add(crownStripe);
      const mainCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 2.0, 20), redAcc); mainCyl.position.set(0.2, 13.1, 0); g.add(mainCyl);
      [-1.7, 1.7].forEach(zOff => {
        const subCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.6, 16), greyMetal);
        subCyl.position.set(0.2, 12.9, zOff); g.add(subCyl);
      });
      // Cầu thang bảo trì bên hông máy dập hạng nặng
      const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9.5, 0.15), yellowSafe); ladder.position.set(1.8, 5.5, 3.25); g.add(ladder);

      const loDie = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.75, 3.5), dgreyMetal); loDie.position.set(weldX, 3.4, 0); g.add(loDie);
      upElec = new THREE.Mesh(new THREE.BoxGeometry(3.1, 2.1, 3.6), upElecMat);
      upElec.position.set(baseElecX, baseElecY, baseElecZ); g.add(upElec);

      const pedPost = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 2.8, 10), greyMetal); pedPost.position.set(-2.9, 1.4, 2.0); g.add(pedPost);
      const pedBox  = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 1.3), yellowSafe); pedBox.position.set(-2.9, 2.8, 2.0); g.add(pedBox);

      led = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 12), ledMat); led.position.set(-1.9, 10.8, 2.7); g.add(led);
      work = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.48, 3.2), workMat); work.position.set(weldX, weldY, 0); work.visible = false; g.add(work);
      spark = new THREE.Sprite(new THREE.SpriteMaterial({map: _sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
      spark.position.set(weldX, weldY, 0); spark.scale.set(2.7, 2.7, 1); spark.visible = false; g.add(spark);
      lab = makeLabel(name, power); lab.position.set(0.2, power ? 15.1 : 14.7, 0); g.add(lab);

    } else if(mType === "magrobot"){
      // ==========================================
      // 9. CELL HÀN MAG ROBOT 6 TRỤC TỰ ĐỘNG (MAGROBOT)
      // ==========================================
      weldX = -1.7; weldY = 2.85; baseElecY = 3.55; baseElecX = -1.7; baseElecZ = 0;

      // Sàn đế Cell Robot + Vách kính chắn tia hồ quang an toàn 2 bên
      const cellPad = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.25, 5.2), dgreyMetal); cellPad.position.set(0.2, 0.12, 0); g.add(cellPad);
      const screenL = new THREE.Mesh(new THREE.BoxGeometry(5.0, 3.8, 0.12), arcScreen); screenL.position.set(0.4, 2.0, -2.4); g.add(screenL);
      const screenR = new THREE.Mesh(new THREE.BoxGeometry(5.0, 3.8, 0.12), arcScreen); screenR.position.set(0.4, 2.0,  2.4); g.add(screenR);

      // Bệ trụ & Thân xoay Robot 6 bậc tự do (màu vàng cam công nghiệp)
      const rPed   = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 1.2, 18), tableLeg); rPed.position.set(1.4, 0.7, 0); g.add(rPed);
      const rWaist = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.1, 16), robotOrange); rWaist.position.set(1.4, 1.8, 0); g.add(rWaist);
      // Cánh tay dưới (Lower Arm) nghiêng về phía trước
      const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.8, 0.65), robotOrange);
      arm1.position.set(1.0, 3.4, 0); arm1.rotation.z = 0.28; g.add(arm1);
      // Khớp khuỷu & Cánh tay trên (Upper Forearm) vươn ra bàn gá
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 14), tableLeg); elbow.position.set(0.6, 4.7, 0); g.add(elbow);
      const arm2  = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.5), robotOrange);
      arm2.position.set(-0.5, 4.4, 0); arm2.rotation.z = 0.18; g.add(arm2);

      // Cụm cổ tay & Mỏ hàn MAG cong (upElec quét đường hàn)
      upElec = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.05, 1.15, 12), upElecMat);
      upElec.position.set(baseElecX, baseElecY, baseElecZ); upElec.rotation.z = -0.35; g.add(upElec);

      // Bàn gá xoay 2 trạm (Positioner Table) phía trước Robot
      const posBase = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 3.2), bluePress); posBase.position.set(weldX, 1.2, 0); g.add(posBase);
      const jigPl   = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 2.8), greyMetal); jigPl.position.set(weldX, 2.45, 0); g.add(jigPl);

      // Nguồn hàn MAG & Thùng dây hàn phía sau
      const magPwr = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 1.2), redAcc); magPwr.position.set(2.5, 1.2, -1.4); g.add(magPwr);
      const wireDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 1.5, 14), bowlMat); wireDrum.position.set(2.5, 0.9, 1.2); g.add(wireDrum);

      led = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), ledMat); led.position.set(0.6, 5.4, 0); g.add(led);
      work = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 2.0), workMat); work.position.set(weldX, weldY, 0); work.visible = false; g.add(work);
      spark = new THREE.Sprite(new THREE.SpriteMaterial({map: _sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
      spark.position.set(weldX, weldY + 0.25, 0); spark.scale.set(2.4, 2.4, 1); spark.visible = false; g.add(spark);
      lab = makeLabel(name, power); lab.position.set(0.2, power ? 9.4 : 9.0, 0); g.add(lab);

    } else if(mType === "to"){
      // ==========================================
      // 1. MÁY HÀN CÔNG SUẤT LỚN (TO - 100kVA-150kVA)
      // ==========================================
      weldX = -3.2; weldY = 4.6; baseElecY = 5.0;

      // Chân đế đôi rộng bản
      const s1 = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.6, 1.2), steelDark); s1.position.set(0.6, 0.3, -2.2); g.add(s1);
      const s2 = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.6, 1.2), steelDark); s2.position.set(0.6, 0.3,  2.2); g.add(s2);
      // Bệ đúc lớn
      const base = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.8, 5.0), mintDark); base.position.set(1.8, 0.9, 0); g.add(base);
      const ped  = new THREE.Mesh(new THREE.BoxGeometry(3.0, 3.8, 3.8), mintDark); ped.position.set(1.8, 3.2, 0); g.add(ped);
      const body = new THREE.Mesh(new THREE.BoxGeometry(3.5, 5.6, 4.0), steelDark); body.position.set(1.9, 7.8, 0); g.add(body);
      // Cần hàn đồng vươn xa
      const armG = new THREE.BoxGeometry(4.4, 0.8, 0.8);
      const upArm = new THREE.Mesh(armG, copperMat); upArm.position.set(-1.0, 5.9, 0); g.add(upArm);
      const loArm = new THREE.Mesh(armG, copperMat); loArm.position.set(-1.0, 3.8, 0); g.add(loArm);
      const holdG = new THREE.BoxGeometry(0.7, 0.8, 0.9);
      const upHold = new THREE.Mesh(holdG, copperMat); upHold.position.set(weldX, 5.5, 0); g.add(upHold);
      const loHold = new THREE.Mesh(holdG, copperMat); loHold.position.set(weldX, 4.2, 0); g.add(loHold);
      // Điện cực
      const elecG = new THREE.CylinderGeometry(0.24, 0.14, 1.2, 14);
      upElec = new THREE.Mesh(elecG, upElecMat); upElec.position.set(weldX, baseElecY, 0); g.add(upElec);
      const loElec = new THREE.Mesh(elecG, loElecMat); loElec.rotation.z = Math.PI; loElec.position.set(weldX, 4.3, 0); g.add(loElec);
      // Xy-lanh đôi khí nén
      const cG = new THREE.CylinderGeometry(0.55, 0.55, 2.4, 16);
      const capG = new THREE.CylinderGeometry(0.65, 0.65, 0.35, 16);
      [-0.7, 0.7].forEach(zOff => {
        const cyl = new THREE.Mesh(cG, greyMetal); cyl.position.set(-0.4, 8.2, zOff); g.add(cyl);
        const cap = new THREE.Mesh(capG, dgreyMetal); cap.position.set(-0.4, 9.5, zOff); g.add(cap);
      });
      // Tủ điện công nghiệp sau lưng
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 6.0, 3.8), panelMat); cab.position.set(3.8, 6.2, 0); g.add(cab);
      // Màn hình HMI cảm ứng
      const hmi = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.8, 2.2), new THREE.MeshStandardMaterial({color: 0x11161d, roughness: .2, metalness: .8}));
      hmi.position.set(3.8, 7.2, 1.95); g.add(hmi);
      // Đèn tháp tín hiệu 3 màu trên đỉnh tủ
      [0xc82323, 0xe5a110, 0x1a9e6a].forEach((colorHex, idx) => {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.28, 12), new THREE.MeshStandardMaterial({color: colorHex, emissive: colorHex, emissiveIntensity: .4}));
        seg.position.set(4.2, 9.4 + idx * 0.32, 1.2); g.add(seg);
      });
      // Đèn trạng thái
      led = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), ledMat); led.position.set(0.6, 9.0, 2.1); g.add(led);
      // Phôi & Tia lửa
      work = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 2.2), workMat); work.position.set(weldX, weldY, 0); work.visible = false; g.add(work);
      spark = new THREE.Sprite(new THREE.SpriteMaterial({map: _sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
      spark.position.set(weldX, weldY, 0); spark.scale.set(2.2, 2.2, 1); spark.visible = false; g.add(spark);
      lab = makeLabel(name, power); lab.position.set(-0.8, power ? 11.2 : 10.8, 0); g.add(lab);

    } else if(mType === "nho"){
      // ==========================================
      // 2. MÁY HÀN NHỎ / ĐỂ BÀN (NHO - BENCHTOP 25-35kVA)
      // ==========================================
      weldX = -1.4; weldY = 3.65; baseElecY = 3.9;

      // Bàn thao tác thép 4 chân
      const top = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.3, 3.2), tableTop); top.position.set(0.2, 2.3, 0); g.add(top);
      [[-1.6, -1.3], [-1.6, 1.3], [2.0, -1.3], [2.0, 1.3]].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.2, 0.22), tableLeg);
        leg.position.set(lx, 1.1, lz); g.add(leg);
      });
      // Giằng chân bàn
      const brace = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 2.6), tableLeg); brace.position.set(0.2, 0.6, 0); g.add(brace);
      // Thân máy nhỏ trên bàn
      const bBase = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 2.2), mint); bBase.position.set(1.0, 2.6, 0); g.add(bBase);
      const bBody = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.4, 2.0), steelGreen); bBody.position.set(1.0, 3.9, 0); g.add(bBody);
      // Tủ điều khiển nhỏ
      const bCtrl = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 1.4), panelMat); bCtrl.position.set(1.0, 4.2, 1.1); g.add(bCtrl);
      // Tay hàn đồng nhỏ
      const upArm = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.36, 0.4), copperMat); upArm.position.set(-0.3, 4.3, 0); g.add(upArm);
      const loArm = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.36, 0.4), copperMat); loArm.position.set(-0.3, 3.2, 0); g.add(loArm);
      // Điện cực
      const elecG = new THREE.CylinderGeometry(0.12, 0.07, 0.8, 12);
      upElec = new THREE.Mesh(elecG, upElecMat); upElec.position.set(weldX, baseElecY, 0); g.add(upElec);
      const loElec = new THREE.Mesh(elecG, loElecMat); loElec.rotation.z = Math.PI; loElec.position.set(weldX, 3.4, 0); g.add(loElec);
      // Xy-lanh nhỏ
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.2, 14), greyMetal); cyl.position.set(-0.2, 5.2, 0); g.add(cyl);
      // Bàn đạp chân dưới sàn
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.8), tableLeg); pedal.position.set(-0.8, 0.1, 0); g.add(pedal);
      // Đèn trạng thái
      led = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), ledMat); led.position.set(0.4, 4.8, 1.1); g.add(led);
      // Phôi & Tia lửa
      work = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 1.1), workMat); work.position.set(weldX, weldY, 0); work.visible = false; g.add(work);
      spark = new THREE.Sprite(new THREE.SpriteMaterial({map: _sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
      spark.position.set(weldX, weldY, 0); spark.scale.set(1.2, 1.2, 1); spark.visible = false; g.add(spark);
      lab = makeLabel(name, power); lab.position.set(-0.2, power ? 7.0 : 6.6, 0); g.add(lab);

    } else if(mType === "camtay"){
      // ==========================================
      // 3. SÚNG HÀN CẦM TAY / TREO BALANCER (CAMTAY)
      // ==========================================
      weldX = -1.6; weldY = 2.4; baseElecY = 2.65;

      // Cột giàn treo màu vàng an toàn đặt phía sau (X = 1.8)
      const basePlate = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 0.25, 16), steelDark); basePlate.position.set(1.8, 0.12, 0); g.add(basePlate);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 8.6, 16), yellowSafe); post.position.set(1.8, 4.4, 0); g.add(post);
      // Cần cẩu vươn ngang trên cao (Jib Crane Arm) ở độ cao 8.8m
      const jib = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.35, 0.35), yellowSafe); jib.position.set(0.2, 8.8, 0); g.add(jib);
      // Thanh giằng chéo
      const strut = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 0.15), yellowSafe);
      strut.position.set(1.1, 8.0, 0); strut.rotation.z = Math.PI / 4; g.add(strut);
      // Biến áp gắn trên cột
      const xfmr = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 1.4), panelMat); xfmr.position.set(1.8, 5.8, 0); g.add(xfmr);
      // Bộ cuộn lò xo tự cân bằng lực (Tool Balancer) màu đỏ treo trên cao
      const bal = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.25, 0.9, 14), redAcc); bal.position.set(-1.2, 8.2, 0); g.add(bal);
      // Dây cáp treo thả từ balancer xuống kìm hàn
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 5.2, 8), greyMetal); cable.position.set(-1.2, 5.6, 0); g.add(cable);

      // Thân kìm súng hàn cầm tay đặt ngang ngực/tay thao tác (Y = 2.4 - 2.5)
      const gunBody = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.9), greyMetal); gunBody.position.set(-0.8, 2.5, 0); g.add(gunBody);
      // 2 Tay cầm cao su (Dual Handles)
      const h1 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 10), tableLeg); h1.position.set(-0.4, 2.5, 0.7); g.add(h1);
      const h2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 10), tableLeg); h2.position.set(-0.4, 2.5, -0.7); g.add(h2);
      // Càng hàn chữ C đồng
      const cArmG = new THREE.BoxGeometry(1.4, 0.35, 0.4);
      const upArm = new THREE.Mesh(cArmG, copperMat); upArm.position.set(-1.5, 2.9, 0); g.add(upArm);
      const loArm = new THREE.Mesh(cArmG, copperMat); loArm.position.set(-1.5, 2.1, 0); g.add(loArm);
      // Điện cực
      const elecG = new THREE.CylinderGeometry(0.14, 0.08, 0.65, 12);
      upElec = new THREE.Mesh(elecG, upElecMat); upElec.position.set(weldX, baseElecY, 0); g.add(upElec);
      const loElec = new THREE.Mesh(elecG, loElecMat); loElec.rotation.z = Math.PI; loElec.position.set(weldX, 2.15, 0); g.add(loElec);
      // Dây cáp điện công suất uốn cong võng an toàn phía sau, không chạm đầu người
      const powerCable = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 10), tableLeg);
      powerCable.position.set(0.7, 4.4, -0.6); powerCable.rotation.x = -0.28; powerCable.rotation.z = -Math.PI / 4; g.add(powerCable);
      // Đèn trạng thái trên súng
      led = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), ledMat); led.position.set(-0.6, 3.0, 0.3); g.add(led);
      // Phôi & Tia lửa
      work = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 1.4), workMat); work.position.set(weldX, weldY, 0); work.visible = false; g.add(work);
      spark = new THREE.Sprite(new THREE.SpriteMaterial({map: _sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
      spark.position.set(weldX, weldY, 0); spark.scale.set(1.5, 1.5, 1); spark.visible = false; g.add(spark);
      lab = makeLabel(name, power); lab.position.set(0.2, power ? 10.2 : 9.8, 0); g.add(lab);

    } else if(mType === "bulong"){
      // ==========================================
      // 4. MÁY HÀN BU LÔNG / TÁN ĐAI ỐC (BULONG / SOYER)
      // ==========================================
      weldX = -0.6; weldY = 3.35; baseElecY = 3.9;

      // Khung máy dập đứng màu xanh dương công nghiệp
      const bBase = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.7, 3.6), steelDark); bBase.position.set(0.8, 0.35, 0); g.add(bBase);
      const column = new THREE.Mesh(new THREE.BoxGeometry(2.2, 6.8, 2.8), bluePress); column.position.set(1.3, 4.2, 0); g.add(column);
      // Bàn dập dưới phẳng có đĩa đồng gá tán ốc
      const tablePl = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 2.4), greyMetal); tablePl.position.set(-0.4, 2.4, 0); g.add(tablePl);
      const nutPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.7, 0.3, 16), copperMat); nutPlate.position.set(weldX, 2.8, 0); g.add(nutPlate);
      // Chốt định vị bu lông (locator pin)
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 10), greyMetal); pin.position.set(weldX, 3.1, 0); g.add(pin);

      // Đầu trượt dập trên vuông vắn
      const slide = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.0, 1.4), greyMetal); slide.position.set(weldX, 5.0, 0); g.add(slide);
      // Xy-lanh dập công suất cao trên đỉnh
      const pressCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.0, 16), bluePress); pressCyl.position.set(weldX, 6.8, 0); g.add(pressCyl);
      // Điện cực dập trên
      upElec = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.7, 16), upElecMat); upElec.position.set(weldX, baseElecY, 0); g.add(upElec);
      const loElec = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16), loElecMat); loElec.position.set(weldX, 3.0, 0); g.add(loElec);

      // Phễu rung cấp bu lông/tán ốc tự động (Vibratory Feeder Bowl)
      const bowlBracket = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 1.6), steelDark); bowlBracket.position.set(-0.5, 3.2, 2.0); g.add(bowlBracket);
      feederBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 1.0, 18), bowlMat);
      feederBowl.position.set(-0.5, 4.3, 2.0);
      // Rãnh xoắn ốc cấp linh kiện bên trong phễu rung (Helical Spiral Track)
      const bowlSpiral = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 8, 20), greyMetal);
      bowlSpiral.rotation.x = Math.PI / 2; bowlSpiral.position.set(0, 0.24, 0); feederBowl.add(bowlSpiral);
      // Đai ốc lục giác 3D kim loại vàng sáng nằm bên trong phễu rung
      const nutGoldMat = new THREE.MeshStandardMaterial({color: 0xf59e0b, roughness: 0.22, metalness: 0.88});
      for(let n = 0; n < 5; n++){
        const miniNut = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 6), nutGoldMat);
        miniNut.position.set(Math.cos(n * 1.3) * 0.38, 0.26, Math.sin(n * 1.3) * 0.38);
        miniNut.rotation.y = n * 0.8;
        feederBowl.add(miniNut);
      }
      g.add(feederBowl);

      // Ống dẫn bu lông/đai ốc uốn cong vào đầu hàn
      const feedTube = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.9, 10), greyMetal);
      feedTube.position.set(-0.55, 3.9, 0.9); feedTube.rotation.x = Math.PI / 3; g.add(feedTube);

      // Đai ốc động chạy dọc ống dẫn vào mỏ hàn (Animated Dispenser Nut)
      dispenserNut = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 6), nutGoldMat);
      dispenserNut.position.set(-0.55, 4.4, 1.8);
      g.add(dispenserNut);

      // Tủ điều khiển số Soyer mặt trước
      const soyerPanel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 2.0), new THREE.MeshStandardMaterial({color: 0x111e2e, roughness: .3, metalness: .7}));
      soyerPanel.position.set(1.3, 5.2, 1.45); g.add(soyerPanel);
      // Đèn led trạng thái
      led = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), ledMat); led.position.set(0.3, 6.2, 1.45); g.add(led);
      // Phôi & Tia lửa
      work = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 1.2), workMat); work.position.set(weldX, weldY, 0); work.visible = false; g.add(work);
      spark = new THREE.Sprite(new THREE.SpriteMaterial({map: _sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
      spark.position.set(weldX, weldY, 0); spark.scale.set(1.8, 1.8, 1); spark.visible = false; g.add(spark);
      lab = makeLabel(name, power); lab.position.set(0.2, power ? 9.2 : 8.8, 0); g.add(lab);

    } else {
      // ==========================================
      // 5. MÁY HÀN C-FRAME TIÊU CHUẨN (TRUNGBINH - 50-75kVA)
      // ==========================================
      weldX = -2.4; weldY = 4.0; baseElecY = 4.25;

      const s1 = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.4, 0.8), steelGreen); s1.position.set(0.4, 0.2, -1.7); g.add(s1);
      const s2 = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.4, 0.8), steelGreen); s2.position.set(0.4, 0.2,  1.7); g.add(s2);
      const base = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 4.0), mint); base.position.set(1.4, 0.65, 0); g.add(base);
      const ped  = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.0, 3.0), mint); ped.position.set(1.5, 2.4, 0); g.add(ped);
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 4.4, 3.2), steelGreen); body.position.set(1.6, 6.1, 0); g.add(body);
      const ctrl = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.5, 1.1), panelMat); ctrl.position.set(2.7, 6.4, -1.0); g.add(ctrl);

      const armG = new THREE.BoxGeometry(3.3, 0.55, 0.6);
      const upArm = new THREE.Mesh(armG, copperMat); upArm.position.set(-0.7, 5.0, 0); g.add(upArm);
      const loArm = new THREE.Mesh(armG, copperMat); loArm.position.set(-0.7, 3.4, 0); g.add(loArm);
      const holdG = new THREE.BoxGeometry(0.5, 0.5, 0.7);
      const upHold = new THREE.Mesh(holdG, copperMat); upHold.position.set(weldX, 4.75, 0); g.add(upHold);
      const loHold = new THREE.Mesh(holdG, copperMat); loHold.position.set(weldX, 3.65, 0); g.add(loHold);

      const elecG = new THREE.CylinderGeometry(0.16, 0.09, 1.0, 12);
      upElec = new THREE.Mesh(elecG, upElecMat); upElec.position.set(weldX, baseElecY, 0); g.add(upElec);
      const loElec = new THREE.Mesh(elecG, loElecMat); loElec.rotation.z = Math.PI; loElec.position.set(weldX, 3.75, 0); g.add(loElec);

      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.0, 16), greyMetal); cyl.position.set(-0.3, 6.4, 0); g.add(cyl);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.3, 16), dgreyMetal); cap.position.set(-0.3, 7.5, 0); g.add(cap);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.4, 10), greyMetal); rod.position.set(-0.3, 5.45, 0); g.add(rod);

      led = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), ledMat); led.position.set(0.5, 7.0, 1.5); g.add(led);
      work = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 1.7), workMat); work.position.set(weldX, weldY, 0); work.visible = false; g.add(work);
      spark = new THREE.Sprite(new THREE.SpriteMaterial({map: _sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
      spark.position.set(weldX, weldY, 0); spark.scale.set(1.6, 1.6, 1); spark.visible = false; g.add(spark);
      lab = makeLabel(name, power); lab.position.set(-0.6, power ? 9.1 : 8.7, 0); g.add(lab);
    }

    // =========================================================================
    // VỊ TRÍ ĐỂ HÀNG TẠI MÁY (MACHINE BUFFER) & VỊ TRÍ CÔNG NHÂN CHUẨN AN TOÀN LAO ĐỘNG
    // =========================================================================
    // =========================================================================
    // VỊ TRÍ CÔNG NHÂN & PALLET HÀNG THEO TỶ LỆ KÍCH THƯỚC MÁY (SOP & ERGONOMICS)
    // Máy to hơn thì vị trí đứng lùi xa hơn tỷ lệ thuận với kích thước thực tế
    // =========================================================================
    let workerPosX = -3.6;
    let workerPosZ = 0.0;
    let workerRotY = Math.PI / 2; // Mặc định quay mặt hướng +X trực diện máy
    let inLocalX = -3.2, inLocalZ = 2.4;
    let outLocalX = -3.2, outLocalZ = -2.4;

    if(mType === "maydap5"){
      // Máy dập thủy lực siêu trọng 500T (Bệ máy sâu 6.4m, rộng 6.4m, vươn tới X = -3.0)
      // Thợ dập đứng cách tâm 4.8m (ngoài bệ 1.8m, trước bàn thao tác an toàn 2 nút)
      workerPosX = -4.8;
      workerPosZ = 0.0;
      workerRotY = Math.PI / 2;
      inLocalX = -4.2; inLocalZ = 4.8; // Pallet đặt ngoài khung bệ máy rộng 6.4m
      outLocalX = -4.2; outLocalZ = -4.8;
    } else if(mType === "maydap4"){
      // Máy dập chữ H 2 trục 250T (Bệ máy sâu 5.8m, rộng 6.0m, vươn tới X = -2.7)
      // Thợ dập đứng cách tâm 4.4m (ngoài bệ 1.7m, trước bàn nút bấm)
      workerPosX = -4.4;
      workerPosZ = 0.0;
      workerRotY = Math.PI / 2;
      inLocalX = -3.8; inLocalZ = 4.2;
      outLocalX = -3.8; outLocalZ = -4.2;
    } else if(mType === "maydap3" || mType === "maydap"){
      // Máy dập chữ H 160T (Bệ máy sâu 5.2m, rộng 4.8m, vươn tới X = -2.4)
      workerPosX = -3.9;
      workerPosZ = 0.0;
      workerRotY = Math.PI / 2;
      inLocalX = -3.4; inLocalZ = 3.6;
      outLocalX = -3.4; outLocalZ = -3.6;
    } else if(mType === "maydap2"){
      // Máy dập chữ C 110T (Bệ máy sâu 4.4m, vươn tới X = -1.9)
      workerPosX = -3.3;
      workerPosZ = 0.0;
      workerRotY = Math.PI / 2;
      inLocalX = -2.9; inLocalZ = 3.0;
      outLocalX = -2.9; outLocalZ = -3.0;
    } else if(mType === "maydap1"){
      // Máy dập chữ C nhỏ 60T (Bệ máy sâu 3.6m, vươn tới X = -1.5)
      workerPosX = -2.7;
      workerPosZ = 0.0;
      workerRotY = Math.PI / 2;
      inLocalX = -2.4; inLocalZ = 2.6;
      outLocalX = -2.4; outLocalZ = -2.6;
    } else if(mType === "to"){
      // Máy hàn pedestal hạng nặng 100kVA-150kVA (chân đế dài vươn tới X = -2.9, đầu hàn weldX = -3.2)
      workerPosX = -4.6;
      workerPosZ = 0.0;
      workerRotY = Math.PI / 2;
      inLocalX = -3.8; inLocalZ = 3.2;
      outLocalX = -3.8; outLocalZ = -3.2;
    } else if(mType === "trungbinh"){
      // Máy hàn pedestal tiêu chuẩn 75kVA-100kVA (đầu hàn weldX = -2.4)
      workerPosX = -3.7;
      workerPosZ = 0.0;
      workerRotY = Math.PI / 2;
      inLocalX = -3.1; inLocalZ = 2.6;
      outLocalX = -3.1; outLocalZ = -2.6;
    } else if(mType === "nho"){
      // Máy hàn nhỏ 35kVA-50kVA (đầu hàn weldX = -1.8)
      workerPosX = -3.0;
      workerPosZ = 0.0;
      workerRotY = Math.PI / 2;
      inLocalX = -2.5; inLocalZ = 2.2;
      outLocalX = -2.5; outLocalZ = -2.2;
    } else if(mType === "bulong"){
      // Máy hàn bu lông / tán ốc Soyer (đầu hàn weldX = -1.4)
      workerPosX = -2.7;
      workerPosZ = 0.0;
      workerRotY = Math.PI / 2;
      inLocalX = -2.3; inLocalZ = 2.2;
      outLocalX = -2.3; outLocalZ = -2.2;
    } else if(mType === "camtay"){
      // Súng hàn cầm tay treo balancer trên cần cẩu jib crane (Cột cẩu phía sau X = 1.8, kìm X = -0.8..-1.6)
      // Thợ đứng tại X = -2.8, Z = 0.0, quay mặt hướng +X trực diện kìm hàn và phôi
      workerPosX = -2.8;
      workerPosZ = 0.0;
      workerRotY = Math.PI / 2;
      inLocalX = -2.8;  inLocalZ = 2.4;
      outLocalX = -2.8; outLocalZ = -2.4;
    } else if(mType === "magrobot"){
      // Cell robot hàn MAG (sàn cell vươn tới X = -2.9, bàn gá xoay ở weldX = -1.7)
      workerPosX = -3.9;
      workerPosZ = 0.0;
      workerRotY = Math.PI / 2;
      inLocalX = -3.6; inLocalZ = 3.2;
      outLocalX = -3.6; outLocalZ = -3.2;
    } else if(mType === "lasertam"){
      // Máy cắt tấm laser bàn tráo phôi
      workerPosX = -1.8;
      workerPosZ = 3.2;
      workerRotY = Math.PI;
      inLocalX = -3.6; inLocalZ = 3.2;
      outLocalX = 0.6;  outLocalZ = 3.2;
    } else if(mType === "laserong"){
      // Máy cắt ống laser mâm cặp
      workerPosX = -1.6;
      workerPosZ = 2.6;
      workerRotY = Math.PI;
      inLocalX = 1.6;  inLocalZ = 2.6;
      outLocalX = -3.6; outLocalZ = 2.6;
    }

    // 1. Ô vạch kẻ vàng & Pallet HÀNG CHỜ TẠI MÁY (IN BUFFER)
    const inPad = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.04, 1.45), inZoneMat);
    inPad.position.set(inLocalX, 0.02, inLocalZ); g.add(inPad);
    const inPallet = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 1.2), woodPallet);
    inPallet.position.set(inLocalX, 0.10, inLocalZ); g.add(inPallet);

    const inCrateMat = new THREE.MeshStandardMaterial({color: 0xf59e0b, roughness: 0.45, metalness: 0.15});
    const inCrates = [];
    for(let k = 0; k < 3; k++){
      const bx = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.42, 0.96), inCrateMat);
      bx.position.set(inLocalX, 0.39 + k * 0.45, inLocalZ);
      g.add(bx);
      inCrates.push(bx);
    }

    // Giá khay nhựa Kanban (KLT Red/Blue) chứa Đai ốc & Bu lông cấp riêng cho các máy hàn Nut
    if(mType === "bulong" || (name && (name.includes("L1-") || name.toLowerCase().includes("soyer")))){
      const kltGrp = new THREE.Group();
      const kltStand = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.9), steelDark);
      kltStand.position.set(inLocalX + 1.25, 0.25, inLocalZ);
      kltGrp.add(kltStand);

      const kltBinM1 = new THREE.MeshStandardMaterial({color: 0xdc2626, roughness: 0.35, metalness: 0.15}); // Đỏ: Nut M5/M6
      const kltBinM2 = new THREE.MeshStandardMaterial({color: 0x2563eb, roughness: 0.35, metalness: 0.15}); // Xanh: Nut M8/M10
      const kltGoldNutM = new THREE.MeshStandardMaterial({color: 0xf59e0b, roughness: 0.22, metalness: 0.88});
      const kltZincBoltM = new THREE.MeshStandardMaterial({color: 0xd4d4d8, roughness: 0.25, metalness: 0.92});

      const bin1 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.38), kltBinM1);
      bin1.position.set(inLocalX + 1.25, 0.61, inLocalZ - 0.22);
      kltGrp.add(bin1);
      for(let q = -1; q <= 1; q++){
        const nut3d = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 6), kltGoldNutM);
        nut3d.position.set(inLocalX + 1.25 + q * 0.14, 0.73, inLocalZ - 0.22);
        kltGrp.add(nut3d);
      }

      const bin2 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.38), kltBinM2);
      bin2.position.set(inLocalX + 1.25, 0.61, inLocalZ + 0.22);
      kltGrp.add(bin2);
      for(let q = -1; q <= 1; q++){
        const bolt3d = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.18, 8), kltZincBoltM);
        bolt3d.rotation.x = Math.PI / 4;
        bolt3d.position.set(inLocalX + 1.25 + q * 0.14, 0.76, inLocalZ + 0.22);
        kltGrp.add(bolt3d);
      }

      const binTag = makeSmallTag("🔩 NUT & BULONG", "rgba(15,23,42,0.9)", "#38bdf8");
      binTag.position.set(inLocalX + 1.25, 1.25, inLocalZ);
      kltGrp.add(binTag);
      g.add(kltGrp);
    }

    // 2. Ô vạch kẻ xanh lá & Pallet HÀNG ĐÃ XONG TẠI MÁY (OUT BUFFER)
    const outPad = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.04, 1.45), outZoneMat);
    outPad.position.set(outLocalX, 0.02, outLocalZ); g.add(outPad);
    const outPallet = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 1.2), woodPallet);
    outPallet.position.set(outLocalX, 0.10, outLocalZ); g.add(outPallet);

    const outCrateMat = new THREE.MeshStandardMaterial({color: 0x10b981, roughness: 0.45, metalness: 0.15});
    const outCrates = [];
    for(let k = 0; k < 3; k++){
      const bx = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.42, 0.96), outCrateMat);
      bx.position.set(outLocalX, 0.39 + k * 0.45, outLocalZ);
      bx.visible = false;
      g.add(bx);
      outCrates.push(bx);
    }

    // Tính toạ độ thế giới (World Position) của Pallet Hàng Chờ tại máy để Xe AGV chạy tới cấp hàng
    const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
    const inWorldX = cx + (inLocalX * cosR + inLocalZ * sinR);
    const inWorldZ = cz + (-inLocalX * sinR + inLocalZ * cosR);

    // =========================================================================
    // THẢM BẢO HỘ AN TOÀN CHỐNG MỎI / CÁCH ĐIỆN DƯỚI CHÂN CÔNG NHÂN (ERGONOMIC SAFETY MAT)
    // =========================================================================
    const sMatBorder = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 1.4), new THREE.MeshStandardMaterial({color: 0xfacc15, roughness: 0.6, metalness: 0.2}));
    sMatBorder.position.set(workerPosX, 0.02, workerPosZ);
    if(workerRotY !== 0) sMatBorder.rotation.y = workerRotY;
    g.add(sMatBorder);
    const sMatInner = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.05, 1.24), new THREE.MeshStandardMaterial({color: 0x1e293b, roughness: 0.9, metalness: 0.1}));
    sMatInner.position.set(workerPosX, 0.03, workerPosZ);
    if(workerRotY !== 0) sMatInner.rotation.y = workerRotY;
    g.add(sMatInner);

    // Bàn đạp chân an toàn (Foot Pedal) cho các máy hàn pedestal
    if(mType === "nho" || mType === "trungbinh" || mType === "to" || mType === "bulong"){
      const fPedal = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.7), yellowSafe);
      fPedal.position.set(weldX - 0.65, 0.07, 0);
      g.add(fPedal);
    }

    // =========================================================================
    // 3D MODEL CÔNG NHÂN VẬN HÀNH (Phase B: Human Worker Character)
    // =========================================================================
    const workerGrp = new THREE.Group();
    workerGrp.position.set(workerPosX, 0, workerPosZ);
    workerGrp.rotation.y = workerRotY;

    const wBootsM = new THREE.MeshStandardMaterial({color: 0x18181b, roughness: 0.8, metalness: 0.2});
    const wPantsM = new THREE.MeshStandardMaterial({color: 0x1e293b, roughness: 0.7, metalness: 0.1});
    const wShirtM = new THREE.MeshStandardMaterial({color: 0x0369a1, roughness: 0.6, metalness: 0.1});
    const wVestM  = new THREE.MeshStandardMaterial({color: 0xf97316, roughness: 0.5, metalness: 0.2});
    const wStripeM= new THREE.MeshStandardMaterial({color: 0xf8fafc, roughness: 0.3, metalness: 0.8});
    const wSkinM  = new THREE.MeshStandardMaterial({color: 0xfcd34d, roughness: 0.6, metalness: 0.05});
    const wHelmM  = new THREE.MeshStandardMaterial({color: 0xeab308, roughness: 0.4, metalness: 0.3});

    // Giày, Chân, Thân
    const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.52), wBootsM); bootL.position.set(-0.25, 0.11, 0.06); workerGrp.add(bootL);
    const bootR = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.52), wBootsM); bootR.position.set( 0.25, 0.11, 0.06); workerGrp.add(bootR);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.25, 0.34), wPantsM); legL.position.set(-0.25, 0.84, 0); workerGrp.add(legL);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.25, 0.34), wPantsM); legR.position.set( 0.25, 0.84, 0); workerGrp.add(legR);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.35, 0.52), wShirtM); torso.position.set(0, 2.14, 0); workerGrp.add(torso);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.90, 1.15, 0.56), wVestM); vest.position.set(0, 2.15, 0); workerGrp.add(vest);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.14, 0.58), wStripeM); stripe.position.set(0, 2.05, 0); workerGrp.add(stripe);

    // Cánh tay & Bàn tay
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.95, 0.24), wShirtM); armL.position.set(-0.52, 2.15, 0.35); armL.rotation.x = Math.PI / 4; workerGrp.add(armL);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.95, 0.24), wShirtM); armR.position.set( 0.52, 2.15, 0.35); armR.rotation.x = Math.PI / 4; workerGrp.add(armR);
    const handL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.26), wBootsM); handL.position.set(-0.52, 1.85, 0.65); workerGrp.add(handL);
    const handR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.26), wBootsM); handR.position.set( 0.52, 1.85, 0.65); workerGrp.add(handR);

    // Đầu & Mũ bảo hộ
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.25, 10), wSkinM); neck.position.set(0, 2.92, 0); workerGrp.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.46), wSkinM); head.position.set(0, 3.25, 0); workerGrp.add(head);
    const helmDome = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.44, 0.36, 14), wHelmM); helmDome.position.set(0, 3.55, 0); workerGrp.add(helmDome);
    const helmBrim = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.08, 0.65), wHelmM); helmBrim.position.set(0, 3.42, 0.08); workerGrp.add(helmBrim);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.12), new THREE.MeshStandardMaterial({color: 0x0f172a, roughness: 0.2, metalness: 0.9})); visor.position.set(0, 3.32, 0.24); workerGrp.add(visor);

    // Tìm công nhân phụ trách máy này (từ sheet CongNhan)
    // 1. Ưu tiên công nhân chưa gán mà có đăng ký máy này trong MayUuTien
    let assignedWorker = (model.workers || []).find(w => !assignedWorkerIds.has(w.id) && workerMatchesMachine(w, name));
    // 2. Nếu tất cả đã được gán, lấy công nhân đăng ký máy này
    if(!assignedWorker){
      assignedWorker = (model.workers || []).find(w => workerMatchesMachine(w, name));
    }
    // 3. Nếu máy không ai đăng ký, tìm công nhân chưa gán trong cùng Phân Xưởng
    if(!assignedWorker){
      assignedWorker = (model.workers || []).find(w => !assignedWorkerIds.has(w.id) && strip(w.zone || "") === strip(zoneName || ""));
    }
    // 4. Nếu vẫn chưa có, lấy tuần tự theo danh sách công nhân
    if(!assignedWorker && model.workers && model.workers.length > 0){
      assignedWorker = model.workers[i % model.workers.length];
    }
    if(assignedWorker && assignedWorker.id){
      assignedWorkerIds.add(assignedWorker.id);
    }

    const defaultWorkerName = assignedWorker ? assignedWorker.name : "Thợ trực máy";
    const defaultWorkerSkill = assignedWorker ? assignedWorker.skill : "Bậc 3";
    const defaultWorkerId = assignedWorker ? (assignedWorker.id || "") : "";
    const defaultWorkerShift = assignedWorker ? (assignedWorker.shift || "") : "";

    // Bảng tên công nhân — LUÔN HIỂN THỊ (visible = true) để mọi máy đều có tên người trực
    const workerLabel = makeWorkerLabel(defaultWorkerName, defaultWorkerSkill, defaultWorkerId, defaultWorkerShift);
    workerLabel.position.set(0, 4.4, 0);
    workerLabel.visible = true; // LUÔN LUÔN HIỂN THỊ TÊN RÕ RÀNG!
    workerGrp.add(workerLabel);

    workerGrp.visible = true;
    g.add(workerGrp);

    // Biển cảnh báo 3D MÁY HỎNG / SỰ CỐ (Breakdown Hazard Tag)
    const isBroken = !!(model.machineBrokenStatus && model.machineBrokenStatus[i]);
    const breakdownTag = makeBreakdownTag(name, "MÁY HỎNG / DỪNG SỰ CỐ");
    breakdownTag.position.set(0, power ? 10.8 : 10.2, 0);
    breakdownTag.visible = isBroken;
    g.add(breakdownTag);

    // Kích hoạt bóng đổ nổi khối sắc nét công nghiệp (Shadow Casting & Receiving)
    g.traverse(child => {
      if(child.isMesh){
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    scene.add(g);
    machineMeshes.push({
      g, upElecMat, loElecMat, upElec, work, workMat, spark, ledMat,
      weldY, baseElecY, baseElecX, baseElecZ, mType, zoneName,
      inCrates, outCrates, inCrateMat, outCrateMat,
      inWorldX, inWorldZ, cx, cz, name,
      workerGrp, armL, armR, workerLabel,
      breakdownTag, isBroken,
      feederBowl, dispenserNut,
      feederBowlBaseX: -0.5, feederBowlBaseY: 4.3, feederBowlBaseZ: 2.0,
      feedStart: { x: -0.55, y: 4.4, z: 1.8 },
      feedEnd: { x: weldX, y: 3.1, z: 0 },
      _assignedWorkerName: defaultWorkerName,
      _assignedWorkerSkill: defaultWorkerSkill,
      _assignedWorkerId: defaultWorkerId,
      _assignedWorkerShift: defaultWorkerShift,
      _curWorkerName: defaultWorkerName,
      _curWorkerSkill: defaultWorkerSkill,
      _curWorkerId: defaultWorkerId,
      _curWorkerShift: defaultWorkerShift,
      _curStatus: "ready"
    });
  });

  // =====================================================================
  // VÁCH NGĂN PHÂN KHU XƯỞNG 3D + HỆ THỐNG KHO / KHU HÀNG CHỜ BTP + XE AGV CẤP HÀNG
  // =====================================================================
  factoryEnvGroup = new THREE.Group();
  const zoneMap = new Map();
  let globalMinX = Infinity, globalMaxX = -Infinity, globalMinZ = Infinity, globalMaxZ = -Infinity;

  machineMeshes.forEach((m) => {
    const zn = m.zoneName || "Xưởng Hàn Spot";
    if(!zoneMap.has(zn)){
      zoneMap.set(zn, { minX: m.cx, maxX: m.cx, minZ: m.cz, maxZ: m.cz, count: 0 });
    }
    const zb = zoneMap.get(zn);
    zb.minX = Math.min(zb.minX, m.cx);
    zb.maxX = Math.max(zb.maxX, m.cx);
    zb.minZ = Math.min(zb.minZ, m.cz);
    zb.maxZ = Math.max(zb.maxZ, m.cz);
    zb.count++;

    globalMinX = Math.min(globalMinX, m.cx);
    globalMaxX = Math.max(globalMaxX, m.cx);
    globalMinZ = Math.min(globalMinZ, m.cz);
    globalMaxZ = Math.max(globalMaxZ, m.cz);
  });

  if(!isFinite(globalMinX)){
    globalMinX = -20; globalMaxX = 20; globalMinZ = -20; globalMaxZ = 20;
  }

  // Chuẩn bị danh sách Kho / Khu hàng chờ BTP (đọc từ model.warehouses trong sheet May hoặc tạo mặc định)
  const rawWarehouses = (model.warehouses && model.warehouses.length > 0) ? model.warehouses : [];
  const warehouseNodes = [];
  if(rawWarehouses.length > 0 && model.layoutMode === "custom"){
    rawWarehouses.forEach((w) => {
      const wx = (w.x - mcx) * mscale;
      const wz = (w.y - mcy) * mscale;
      const wZone = (w.zone || "").trim();
      warehouseNodes.push({
        name: w.name || "Kho BTP",
        wx,
        wz,
        rot: Number(w.rot) || 0,
        power: w.power || "",
        zone: wZone
      });
      // Nếu Kho khai báo cùng tên KhuVuc với một Phân xưởng máy -> Mở rộng vách ngăn phân xưởng ôm trọn cả Kho của xưởng đó
      if(wZone && zoneMap.has(wZone)){
        const zb = zoneMap.get(wZone);
        zb.minX = Math.min(zb.minX, wx);
        zb.maxX = Math.max(zb.maxX, wx);
        zb.minZ = Math.min(zb.minZ, wz);
        zb.maxZ = Math.max(zb.maxZ, wz);
      }
      globalMinX = Math.min(globalMinX, wx);
      globalMaxX = Math.max(globalMaxX, wx);
      globalMinZ = Math.min(globalMinZ, wz);
      globalMaxZ = Math.max(globalMaxZ, wz);
    });
  } else {
    // Mặc định nếu trong sheet May chưa khai báo dòng KieuMay = Kho: Tạo 1 Khu Hàng Chờ Trung Tâm ở đầu xưởng
    warehouseNodes.push({
      name: "KHU HÀNG CHỜ BTP",
      wx: globalMinX - 16.5,
      wz: (globalMinZ + globalMaxZ) / 2,
      rot: 0,
      power: "",
      zone: ""
    });
  }
  stagingOrigin = { x: warehouseNodes[0].wx, z: warehouseNodes[0].wz, nodes: warehouseNodes };

  // Bảng màu từng Phân khu (hỗ trợ cả các tên phân xưởng tuỳ chỉnh mới)
  const zonePalette = [
    { match: "lasertam", floor: 0x0c4a6e, wall: 0x0369a1, border: "#38bdf8", icon: "⚡ " },
    { match: "laserong", floor: 0x064e3b, wall: 0x047857, border: "#34d399", icon: "🟢 " },
    { match: "dap",      floor: 0x4c1d95, wall: 0x6d28d9, border: "#a78bfa", icon: "🔨 " },
    { match: "mag",      floor: 0x7c2d12, wall: 0xc2410c, border: "#fb923c", icon: "🤖 " },
    { match: "spot",     floor: 0x1e293b, wall: 0x334155, border: "#93c5fd", icon: "🏭 " }
  ];
  const extraPalettes = [
    { floor: 0x3b0764, wall: 0x7e22ce, border: "#e879f9", icon: "🏗️ " },
    { floor: 0x14532d, wall: 0x15803d, border: "#86efac", icon: "⚙️ " },
    { floor: 0x701a75, wall: 0xa21caf, border: "#f472b6", icon: "🔧 " },
    { floor: 0x1e3a8a, wall: 0x1d4ed8, border: "#60a5fa", icon: "🏭 " }
  ];

  // =====================================================================
  // VẬT LIỆU SÀN XƯỞNG CHUẨN 5S (THEO ẢNH MẪU THỰC TẾ):
  // 1. Nền trắng xám trong phần để máy (Light-Grey Machine Bay Floor)
  // 2. Vạch kẻ vàng phân định ranh giới (Safety Yellow Boundary Line 5S)
  // 3. Màu xanh đường đi (Epoxy Blue Walkway)
  // =====================================================================
  const machineFloorMat = new THREE.MeshStandardMaterial({
    color: 0x94a0ad,       // Nền trắng xám công nghiệp phẳng mịn đúng như ảnh mẫu
    roughness: 0.40,
    metalness: 0.08,
    transparent: false
  });

  const borderLineM = new THREE.MeshStandardMaterial({
    color: 0xfacc15,       // Vạch sơn vàng an toàn 5S rực rỡ nổi bật
    roughness: 0.32,
    metalness: 0.20,
    emissive: 0x443000,
    emissiveIntensity: 0.28
  });

  // Phân cụm các máy thành từng Dãy máy / Bệ máy công nghiệp (Machine Bays)
  // để giữa các dãy máy là đường đi màu xanh (Epoxy Blue Walkways) chuẩn 5S
  const machineBays = [];
  const assignedBay = new Set();

  machineMeshes.forEach((m, idx) => {
    if(assignedBay.has(idx)) return;
    const cluster = [m];
    assignedBay.add(idx);

    let expanded = true;
    while(expanded){
      expanded = false;
      machineMeshes.forEach((other, oIdx) => {
        if(assignedBay.has(oIdx)) return;
        if(other.zoneName !== m.zoneName) return;
        const isNear = cluster.some(c => {
          const dx = Math.abs(c.cx - other.cx);
          const dz = Math.abs(c.cz - other.cz);
          // Cùng hàng (dz nhỏ) hoặc cùng cột (dx nhỏ) hoặc cự ly gần
          return (dz < 4.8 && dx < 15.0) || (dx < 4.8 && dz < 15.0) || (Math.hypot(dx, dz) < 9.5);
        });
        if(isNear){
          cluster.push(other);
          assignedBay.add(oIdx);
          expanded = true;
        }
      });
    }

    let bMinX = Infinity, bMaxX = -Infinity, bMinZ = Infinity, bMaxZ = -Infinity;
    cluster.forEach(cm => {
      bMinX = Math.min(bMinX, cm.cx);
      bMaxX = Math.max(bMaxX, cm.cx);
      bMinZ = Math.min(bMinZ, cm.cz);
      bMaxZ = Math.max(bMaxZ, cm.cz);
    });

    machineBays.push({
      zoneName: m.zoneName,
      machines: cluster,
      minX: bMinX, maxX: bMaxX, minZ: bMinZ, maxZ: bMaxZ
    });
  });

  // 1. Dựng bệ sàn NỀN TRẮNG XÁM và VẠCH KẺ VÀNG phân định ranh giới cho từng bệ máy
  const lineThick = 0.32;  // Bề rộng vạch sơn vàng (~15cm)
  const lineH = 0.055;     // Nổi nhẹ trên sàn
  const yLine = 0.042;     // Tránh hiện tượng chớp nháy (z-fighting)

  machineBays.forEach((bay) => {
    const padX = 4.2, padZ = 4.0;
    const x1 = bay.minX - padX, x2 = bay.maxX + padX;
    const z1 = bay.minZ - padZ, z2 = bay.maxZ + padZ;
    const wX = x2 - x1, wZ = z2 - z1;
    const midX = (x1 + x2) / 2, midZ = (z1 + z2) / 2;

    // Nền trắng xám trong phần để máy (Light-Grey Floor Pad)
    const bayFloor = new THREE.Mesh(new THREE.BoxGeometry(wX, 0.04, wZ), machineFloorMat);
    bayFloor.position.set(midX, 0.02, midZ);
    bayFloor.receiveShadow = true;
    factoryEnvGroup.add(bayFloor);

    // Vạch kẻ vàng phân định ranh giới bao quanh bệ để máy
    const bTop = new THREE.Mesh(new THREE.BoxGeometry(wX + lineThick, lineH, lineThick), borderLineM);
    bTop.position.set(midX, yLine, z1); factoryEnvGroup.add(bTop);
    const bBot = new THREE.Mesh(new THREE.BoxGeometry(wX + lineThick, lineH, lineThick), borderLineM);
    bBot.position.set(midX, yLine, z2); factoryEnvGroup.add(bBot);
    const bLft = new THREE.Mesh(new THREE.BoxGeometry(lineThick, lineH, wZ + lineThick), borderLineM);
    bLft.position.set(x1, yLine, midZ); factoryEnvGroup.add(bLft);
    const bRgt = new THREE.Mesh(new THREE.BoxGeometry(lineThick, lineH, wZ + lineThick), borderLineM);
    bRgt.position.set(x2, yLine, midZ); factoryEnvGroup.add(bRgt);
  });

  // 2. Ô vuông vạch kẻ vàng an toàn 5S trên đường đi màu xanh (như trong ảnh mẫu)
  function addYellowSquare(cx, cz, size = 2.6, thick = 0.22){
    const sqGrp = new THREE.Group();
    const half = size / 2;
    const yP = 0.025;
    const t = new THREE.Mesh(new THREE.BoxGeometry(size, 0.04, thick), borderLineM);
    t.position.set(0, yP, -half); sqGrp.add(t);
    const b = new THREE.Mesh(new THREE.BoxGeometry(size, 0.04, thick), borderLineM);
    b.position.set(0, yP, half); sqGrp.add(b);
    const l = new THREE.Mesh(new THREE.BoxGeometry(thick, 0.04, size), borderLineM);
    l.position.set(-half, yP, 0); sqGrp.add(l);
    const r = new THREE.Mesh(new THREE.BoxGeometry(thick, 0.04, size), borderLineM);
    r.position.set(half, yP, 0); sqGrp.add(r);
    sqGrp.position.set(cx, 0, cz);
    factoryEnvGroup.add(sqGrp);
  }

  // Đặt các ô vuông vàng 5S trên đường đi gần các dãy máy và lối vào kho
  machineBays.forEach((bay) => {
    addYellowSquare(bay.maxX + 5.8, (bay.minZ + bay.maxZ) / 2, 2.5, 0.22);
  });

  // =====================================================================
  // 3. TƯỜNG BAO QUANH XƯỞNG & VÁCH NGĂN PHÂN KHU CÔNG NGHIỆP 3D
  // =====================================================================
  const wallBaseMat  = new THREE.MeshStandardMaterial({color: 0x334155, roughness: 0.7, metalness: 0.35});
  const postMat      = new THREE.MeshStandardMaterial({color: 0xeab308, roughness: 0.5, metalness: 0.4});
  const wallPanelMat = new THREE.MeshStandardMaterial({color: 0xdde4ec, roughness: 0.35, metalness: 0.25});

  // Hàm dựng 1 bức tường/vách ngăn có chừa cổng lối đi (nếu hasDoor = true)
  function addPartitionWall(x1, z1, x2, z2, wallMat, hasDoor, doorWidth = 7.0){
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if(len < 1) return;
    const angle = Math.atan2(dx, dz);
    const doorW = (hasDoor && len > 10) ? Math.min(doorWidth, len * 0.45) : 0;
    const segs = doorW > 0 ? [
      { offset: -(doorW + (len - doorW) / 2) / 2, l: (len - doorW) / 2 },
      { offset:  (doorW + (len - doorW) / 2) / 2, l: (len - doorW) / 2 }
    ] : [{ offset: 0, l: len }];

    const wallGrp = new THREE.Group();
    wallGrp.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
    wallGrp.rotation.y = angle;

    segs.forEach(sg => {
      if(sg.l <= 0.4) return;
      // Chân tường bê tông kiên cố (cao 1.5m)
      const lowWall = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.5, sg.l), wallBaseMat);
      lowWall.position.set(0, 0.75, sg.offset);
      lowWall.receiveShadow = true;
      wallGrp.add(lowWall);

      // Thân tường tôn panel / kính sáng màu (cao 2.4m)
      const upWall = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.4, sg.l), wallMat || wallPanelMat);
      upWall.position.set(0, 2.7, sg.offset);
      wallGrp.add(upWall);

      // Dầm viền đỉnh tường (Top Rail)
      const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, sg.l), postMat);
      topRail.position.set(0, 3.9, sg.offset);
      wallGrp.add(topRail);
    });

    // Cột thép kết cấu chịu lực
    const postPositions = [-len / 2, len / 2];
    if(doorW > 0){
      postPositions.push(-doorW / 2, doorW / 2);
    }
    const numMidPosts = Math.floor(len / 14);
    for(let p = 1; p <= numMidPosts; p++){
      const posZ = -len / 2 + (len / (numMidPosts + 1)) * p;
      if(doorW <= 0 || Math.abs(posZ) > (doorW / 2 + 1.2)){
        postPositions.push(posZ);
      }
    }

    postPositions.forEach(pz => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.38, 4.2, 0.38), postMat);
      post.position.set(0, 2.1, pz);
      post.castShadow = true;
      wallGrp.add(post);
    });

    factoryEnvGroup.add(wallGrp);
  }

  // DỰNG TƯỜNG BAO QUANH TOÀN BỘ NHÀ XƯỞNG (4 mặt tường bao quanh các chuyền máy và kho)
  const wPadX = 10.0, wPadZ = 8.5;
  const fx1 = globalMinX - wPadX, fx2 = globalMaxX + wPadX;
  const fz1 = globalMinZ - wPadZ, fz2 = globalMaxZ + wPadZ;
  const wFactory = fx2 - fx1, dFactory = fz2 - fz1;
  const midFactoryX = (fx1 + fx2) / 2, midFactoryZ = (fz1 + fz2) / 2;

  // 1. SÀN ĐƯỜNG ĐI MÀU XANH EPOXY CHỈ NẰM TRONG KHU VỰC XƯỞNG (BÊN TRONG TƯỜNG BAO)
  const walkwayBlueMat = new THREE.MeshStandardMaterial({
    color: 0x1e72a8,      // Màu xanh dương epoxy đường đi nhà xưởng như ảnh mẫu
    roughness: 0.30,      // Độ bóng sơn sàn epoxy phản chiếu ánh sáng xưởng
    metalness: 0.12,
  });
  const factoryFloor = new THREE.Mesh(new THREE.BoxGeometry(wFactory, 0.025, dFactory), walkwayBlueMat);
  factoryFloor.position.set(midFactoryX, 0.0125, midFactoryZ);
  factoryFloor.receiveShadow = true;
  factoryEnvGroup.add(factoryFloor);

  addPartitionWall(fx1, fz1, fx2, fz1, wallPanelMat, true, 8.5); // Tường Bắc (Cổng chính Bắc)
  addPartitionWall(fx1, fz2, fx2, fz2, wallPanelMat, true, 8.5); // Tường Nam (Cổng chính Nam)
  addPartitionWall(fx1, fz1, fx1, fz2, wallPanelMat, true, 7.5); // Tường Tây (Cổng khu nhập BTP)
  addPartitionWall(fx2, fz1, fx2, fz2, wallPanelMat, true, 7.5); // Tường Đông (Cổng khu xuất hàng)

  // Vạch kẻ vàng phân định ngưỡng cửa tại 4 cổng ra vào xưởng
  const gateN = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.03, 0.32), borderLineM);
  gateN.position.set(midFactoryX, 0.025, fz1); factoryEnvGroup.add(gateN);
  const gateS = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.03, 0.32), borderLineM);
  gateS.position.set(midFactoryX, 0.025, fz2); factoryEnvGroup.add(gateS);
  const gateW = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 7.5), borderLineM);
  gateW.position.set(fx1, 0.025, midFactoryZ); factoryEnvGroup.add(gateW);
  const gateE = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 7.5), borderLineM);
  gateE.position.set(fx2, 0.025, midFactoryZ); factoryEnvGroup.add(gateE);

  // Nếu có nhiều phân xưởng (zoneMap.size > 1): dựng thêm vách ngăn kính giữa các phân xưởng
  if(zoneMap.size > 1){
    let zIdx = 0;
    zoneMap.forEach((zb, zName) => {
      const zKey = strip(zName).toLowerCase();
      const pal = zonePalette.find(p => zKey.includes(p.match)) || extraPalettes[zIdx % extraPalettes.length];
      zIdx++;
      const zPadX = 5.2, zPadZ = 5.0;
      const zx1 = zb.minX - zPadX, zx2 = zb.maxX + zPadX;
      const zz1 = zb.minZ - zPadZ, zz2 = zb.maxZ + zPadZ;
      const glassMat = new THREE.MeshStandardMaterial({
        color: pal.wall,
        roughness: 0.2,
        metalness: 0.6,
        transparent: true,
        opacity: 0.30
      });
      addPartitionWall(zx1, zz1, zx2, zz1, glassMat, true, 5.5);
      addPartitionWall(zx1, zz2, zx2, zz2, glassMat, true, 5.5);
      addPartitionWall(zx1, zz1, zx1, zz2, glassMat, true, 5.5);
      addPartitionWall(zx2, zz1, zx2, zz2, glassMat, true, 5.5);
    });
  }

  // Biển tên Phân Xưởng 3D treo trên cao
  let zoneIdx = 0;
  zoneMap.forEach((zb, zName) => {
    const zKey = strip(zName).toLowerCase();
    const pal = zonePalette.find(p => zKey.includes(p.match)) || extraPalettes[zoneIdx % extraPalettes.length];
    zoneIdx++;
    const midX = (zb.minX + zb.maxX) / 2, midZ = (zb.minZ + zb.maxZ) / 2;
    const banner = makeZoneBanner(pal.icon + zName.toUpperCase(), pal.border);
    banner.position.set(midX, 13.8, midZ);
    factoryEnvGroup.add(banner);
  });

  // =====================================================================
  // DỰNG CÁC KHO / KHU HÀNG CHỜ BTP 3D (HỖ TRỢ 1 KHO HOẶC MỖI XƯỞNG 1 KHO)
  // =====================================================================
  const rackUprightMat = new THREE.MeshStandardMaterial({color: 0x1d4ed8, roughness: 0.5, metalness: 0.5});
  const rackBeamMat    = new THREE.MeshStandardMaterial({color: 0xea580c, roughness: 0.5, metalness: 0.4});
  const stgFloorMat    = new THREE.MeshStandardMaterial({color: 0x78350f, roughness: 0.8, metalness: 0.15, transparent: true, opacity: 0.52});

  warehouseNodes.forEach((wh, wIdx) => {
    const wg = new THREE.Group();
    wg.position.set(wh.wx, 0, wh.wz);
    wg.rotation.y = (wh.rot * Math.PI) / 180;

    const isNutBoltWh = /linh[_\s-]?kien|nut|bulong|oc|tan|hardware/i.test(wh.name) || (wh.power && /linh[_\s-]?kien|nut|bulong/i.test(wh.power));

    if(isNutBoltWh){
      const stgW = 7.2, stgD = 9.2;
      const nutWhFloorMat = new THREE.MeshStandardMaterial({color: 0x1e293b, roughness: 0.45, metalness: 0.15});
      const stgFloor = new THREE.Mesh(new THREE.BoxGeometry(stgW, 0.05, stgD), nutWhFloorMat);
      stgFloor.position.set(0, 0.02, 0); stgFloor.receiveShadow = true; wg.add(stgFloor);

      // Viền vàng 5S an toàn
      const sb1 = new THREE.Mesh(new THREE.BoxGeometry(stgW, 0.06, 0.22), borderLineM); sb1.position.set(0, 0.04, -stgD/2); wg.add(sb1);
      const sb2 = new THREE.Mesh(new THREE.BoxGeometry(stgW, 0.06, 0.22), borderLineM); sb2.position.set(0, 0.04,  stgD/2); wg.add(sb2);
      const sb3 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, stgD), borderLineM); sb3.position.set(-stgW/2, 0.04, 0); wg.add(sb3);
      const sb4 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, stgD), borderLineM); sb4.position.set( stgW/2, 0.04, 0); wg.add(sb4);

      // Dựng 2 dãy Kệ Chứa Linh Kiện Chuẩn Kanban (3 tầng kệ thép xanh dương, chứa nhiều khay nhựa KLT)
      const steelShelfMat = new THREE.MeshStandardMaterial({color: 0x1e40af, roughness: 0.45, metalness: 0.5});
      const deckMat       = new THREE.MeshStandardMaterial({color: 0x94a3b8, roughness: 0.35, metalness: 0.6});
      const kltRedMat     = new THREE.MeshStandardMaterial({color: 0xdc2626, roughness: 0.4, metalness: 0.15}); // Hộp Đỏ: Đai ốc M5, M6
      const kltBlueMat    = new THREE.MeshStandardMaterial({color: 0x2563eb, roughness: 0.4, metalness: 0.15}); // Hộp Xanh: Đai ốc M8, M10
      const kltYelMat     = new THREE.MeshStandardMaterial({color: 0xeab308, roughness: 0.4, metalness: 0.15}); // Hộp Vàng: Bu lông hàn (Stud bolts)
      const kltGrnMat     = new THREE.MeshStandardMaterial({color: 0x059669, roughness: 0.4, metalness: 0.15}); // Hộp Xanh Lá: Long đền/vòng đệm
      const nutGoldMat    = new THREE.MeshStandardMaterial({color: 0xf59e0b, roughness: 0.22, metalness: 0.9}); // Đai ốc mạ vàng
      const boltZincMat   = new THREE.MeshStandardMaterial({color: 0xd4d4d8, roughness: 0.25, metalness: 0.92});// Bu lông mạ kẽm

      [-2.1, 2.1].forEach((bz) => {
        // Cột kệ thép 4 góc
        [[-1.8, -1.6], [-1.8, 1.6], [1.8, -1.6], [1.8, 1.6]].forEach(([ux, uz]) => {
          const colM = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.2, 0.12), steelShelfMat);
          colM.position.set(ux, 2.1, bz + uz);
          wg.add(colM);
        });
        // 3 tầng đợt mâm kệ
        [0.4, 1.7, 3.0].forEach((ry, tierIdx) => {
          const deck = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.08, 3.3), deckMat);
          deck.position.set(0, ry, bz);
          wg.add(deck);

          // Xếp các thùng nhựa KLT chứa linh kiện trên mỗi tầng
          const binMats = [kltRedMat, kltBlueMat, kltYelMat, kltGrnMat];
          for(let bx = -1.2; bx <= 1.25; bx += 0.82){
            for(let bzi = -1.0; bzi <= 1.05; bzi += 1.0){
              const bMat = binMats[(Math.round(bx * 3 + bzi * 2 + tierIdx) + 8) % binMats.length];
              const bin = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.35, 0.82), bMat);
              bin.position.set(bx, ry + 0.22, bz + bzi);
              wg.add(bin);

              // 3D Hex Nuts & Bolts bên trên khay
              if(bMat === kltRedMat || bMat === kltBlueMat){
                const nutMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.10, 6), nutGoldMat);
                nutMesh.position.set(bx, ry + 0.44, bz + bzi);
                nutMesh.rotation.y = (bx + bzi) * 2;
                wg.add(nutMesh);
              } else {
                const bHead = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 6), boltZincMat);
                bHead.position.set(bx, ry + 0.46, bz + bzi);
                wg.add(bHead);
                const bShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.26, 10), boltZincMat);
                bShaft.position.set(bx, ry + 0.32, bz + bzi);
                wg.add(bShaft);
              }
            }
          }
        });
      });

      // Thùng phuy kim loại trữ bu lông đai ốc số lượng lớn ở khu đệm
      const drumMat = new THREE.MeshStandardMaterial({color: 0x0284c7, roughness: 0.4, metalness: 0.6});
      [-1.2, 1.2].forEach(dx => {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.95, 14), drumMat);
        drum.position.set(dx, 0.50, 0);
        wg.add(drum);
      });

      // Biển tên Kho Linh Kiện Mua chữ lớn nổi bật
      const wLab = makeLabel("🔩 " + (wh.name.replace(/_/g, " ") || "KHO LINH KIỆN MUA"), wh.power ? `${wh.power} · Bu Lông, Đai Ốc, Studs` : "Kho Linh Kiện Mua (Nut & Bulong)");
      wLab.position.set(0, 7.2, 0);
      wg.add(wLab);

      factoryEnvGroup.add(wg);
      return;
    }

    const stgW = 6.2, stgD = 8.4;
    const stgFloor = new THREE.Mesh(new THREE.BoxGeometry(stgW, 0.05, stgD), machineFloorMat);
    stgFloor.position.set(0, 0.02, 0);
    stgFloor.receiveShadow = true;
    wg.add(stgFloor);

    // Viền vàng quanh Kho BTP
    const sb1 = new THREE.Mesh(new THREE.BoxGeometry(stgW, 0.06, 0.22), borderLineM); sb1.position.set(0, 0.04, -stgD/2); wg.add(sb1);
    const sb2 = new THREE.Mesh(new THREE.BoxGeometry(stgW, 0.06, 0.22), borderLineM); sb2.position.set(0, 0.04,  stgD/2); wg.add(sb2);
    const sb3 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, stgD), borderLineM); sb3.position.set(-stgW/2, 0.04, 0); wg.add(sb3);
    const sb4 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, stgD), borderLineM); sb4.position.set( stgW/2, 0.04, 0); wg.add(sb4);

    // Dựng 2 dãy kệ chứa hàng BTP 2 tầng trong mỗi Kho
    [-1.9, 1.9].forEach((bz, bIdx) => {
      [-1.3, 1.3].forEach((rx) => {
        [[-0.7, -1.2], [-0.7, 1.2], [0.7, -1.2], [0.7, 1.2]].forEach(([ux, uz]) => {
          const upCol = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.8, 0.14), rackUprightMat);
          upCol.position.set(rx + ux, 1.9, bz + uz);
          wg.add(upCol);
        });
        [0.25, 1.95].forEach((ry, tierIdx) => {
          const beam1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 2.5), rackBeamMat); beam1.position.set(rx - 0.7, ry, bz); wg.add(beam1);
          const beam2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 2.5), rackBeamMat); beam2.position.set(rx + 0.7, ry, bz); wg.add(beam2);
          const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.10, 2.3), woodPallet); shelf.position.set(rx, ry + 0.09, bz); wg.add(shelf);

          const cCol = new THREE.Color(partColor((wIdx * 3 + bIdx * 2 + tierIdx) % 12));
          const stCrateMat = new THREE.MeshStandardMaterial({color: cCol, roughness: 0.45, metalness: 0.15});
          const stCrate = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.95, 1.85), stCrateMat);
          stCrate.position.set(rx, ry + 0.64, bz);
          wg.add(stCrate);
          stagingCrates.push(stCrate);
        });
      });
    });

    // Biển tên Kho + Sức chứa chữ đỏ phía trên
    const wLab = makeLabel("📦 " + wh.name, wh.power);
    wLab.position.set(0, wh.power ? 6.8 : 6.4, 0);
    wg.add(wLab);

    factoryEnvGroup.add(wg);
  });

  scene.add(factoryEnvGroup);

  // Gán Kho cấp hàng gần nhất / cùng phân xưởng cho từng máy
  // (Kho BTP cấp phôi tấm/ống/khung, Kho Linh Kiện Mua cấp đai ốc & bu lông hàn)
  const nutBoltWh = warehouseNodes.find(w => /linh[_\s-]?kien|nut|bulong|oc|tan/i.test(w.name)) || warehouseNodes[warehouseNodes.length - 1];
  const btpWh = warehouseNodes.find(w => !/linh[_\s-]?kien|nut|bulong|oc|tan/i.test(w.name)) || warehouseNodes[0];

  machineMeshes.forEach((m) => {
    let bestWh = warehouseNodes.find(w => w.zone && strip(w.zone) === strip(m.zoneName) && !/linh[_\s-]?kien|nut|bulong/i.test(w.name));
    if(!bestWh){
      let minDist = Infinity;
      warehouseNodes.forEach(w => {
        if(/linh[_\s-]?kien|nut|bulong/i.test(w.name)) return;
        const d = Math.hypot(m.cx - w.wx, m.cz - w.wz);
        if(d < minDist){ minDist = d; bestWh = w; }
      });
    }
    m.sourceWh = bestWh || btpWh;
    m.nutWh = nutBoltWh;
  });

  // =====================================================================
  // ĐỘI XE CẤP HÀNG TỰ HÀNH (AGV / FORKLIFT MATERIAL DELIVERY FLEET)
  // =====================================================================
  const agvBodyMat  = new THREE.MeshStandardMaterial({color: 0xf59e0b, roughness: 0.4, metalness: 0.45});
  const agvBumperM  = new THREE.MeshStandardMaterial({color: 0x1e293b, roughness: 0.7, metalness: 0.3});
  const NUM_AGVS = Math.max(4, warehouseNodes.filter(w => !/linh[_\s-]?kien|nut|bulong/i.test(w.name)).length);

  for(let a = 0; a < NUM_AGVS; a++){
    const homeWh = btpWh;
    const agvG = new THREE.Group();
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 1.45), agvBodyMat);
    chassis.position.set(0, 0.42, 0); agvG.add(chassis);
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.22, 1.55), agvBumperM);
    bumper.position.set(0, 0.22, 0); agvG.add(bumper);
    [[-0.7, -0.72], [-0.7, 0.72], [0.7, -0.72], [0.7, 0.72]].forEach(([wx, wz]) => {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.18, 12), tableLeg);
      wh.rotation.x = Math.PI / 2; wh.position.set(wx, 0.22, wz); agvG.add(wh);
    });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8), agvBumperM);
    mast.position.set(0.85, 1.2, 0.55); agvG.add(mast);
    const beaconMat = new THREE.MeshStandardMaterial({color: 0xff7a2d, emissive: 0xff7a2d, emissiveIntensity: 1.2});
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), beaconMat);
    beacon.position.set(0.85, 1.85, 0.55); agvG.add(beacon);

    const pal = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 1.2), woodPallet);
    pal.position.set(-0.1, 0.76, 0); agvG.add(pal);
    const cargoMat = new THREE.MeshStandardMaterial({color: 0x38bdf8, roughness: 0.4, metalness: 0.15});
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.75, 1.05), cargoMat);
    cargo.position.set(-0.1, 1.22, 0); agvG.add(cargo);

    const tag = makeSmallTag(`🚚 AGV #${a+1}`, "rgba(15,23,42,0.9)", "#facc15");
    tag.position.set(0, 2.65, 0);
    agvG.add(tag);

    agvG.position.set(homeWh.wx, 0, homeWh.wz);
    scene.add(agvG);
    agvFleet.push({ g: agvG, cargo, cargoMat, beaconMat, idx: a, homeWh, isNutBoltAgv: false });
  }

  // XE CẤP LINH KIỆN CHUYÊN DỤNG: XE CẤP NUT & BULONG (NUT & BOLT DELIVERY SHUTTLE)
  const nutAgvG = new THREE.Group();
  const nutChassisMat = new THREE.MeshStandardMaterial({color: 0x0284c7, roughness: 0.35, metalness: 0.5});
  const nutChassis = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.55, 1.5), nutChassisMat);
  nutChassis.position.set(0, 0.42, 0); nutAgvG.add(nutChassis);
  const nutBumper = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.22, 1.6), yellowSafe);
  nutBumper.position.set(0, 0.22, 0); nutAgvG.add(nutBumper);
  [[-0.72, -0.74], [-0.72, 0.74], [0.72, -0.74], [0.72, 0.74]].forEach(([wx, wz]) => {
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.18, 12), tableLeg);
    wh.rotation.x = Math.PI / 2; wh.position.set(wx, 0.22, wz); nutAgvG.add(wh);
  });
  const nutMast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 8), agvBumperM);
  nutMast.position.set(0.9, 1.25, 0.6); nutAgvG.add(nutMast);
  const nutBeaconMat = new THREE.MeshStandardMaterial({color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 1.4});
  const nutBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), nutBeaconMat);
  nutBeacon.position.set(0.9, 1.95, 0.6); nutAgvG.add(nutBeacon);

  // Kệ khay chở các hộp linh kiện KLT Nut & Bu Lông
  const nutPal = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 1.3), steelDark);
  nutPal.position.set(-0.1, 0.74, 0); nutAgvG.add(nutPal);
  const nutCargoGrp = new THREE.Group();
  nutCargoGrp.position.set(-0.1, 0.82, 0);

  const kltColors = [0xdc2626, 0x2563eb, 0xeab308, 0xdc2626];
  const goldNutM = new THREE.MeshStandardMaterial({color: 0xf59e0b, roughness: 0.22, metalness: 0.9});
  const zincBoltM = new THREE.MeshStandardMaterial({color: 0xd4d4d8, roughness: 0.25, metalness: 0.92});
  [[-0.38, -0.32], [-0.38, 0.32], [0.38, -0.32], [0.38, 0.32]].forEach(([kx, kz], kIdx) => {
    const kBin = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.32, 0.52), new THREE.MeshStandardMaterial({color: kltColors[kIdx], roughness: 0.35, metalness: 0.2}));
    kBin.position.set(kx, 0.16, kz);
    nutCargoGrp.add(kBin);

    if(kIdx % 2 === 0){
      const nutMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 6), goldNutM);
      nutMesh.position.set(kx, 0.36, kz);
      nutCargoGrp.add(nutMesh);
    } else {
      const boltMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.16, 6), zincBoltM);
      boltMesh.position.set(kx, 0.40, kz);
      nutCargoGrp.add(boltMesh);
    }
  });
  nutAgvG.add(nutCargoGrp);

  const nutTag = makeSmallTag("🔩 CẤP NUT & BULONG", "rgba(15,23,42,0.95)", "#38bdf8");
  nutTag.position.set(0, 2.75, 0);
  nutAgvG.add(nutTag);

  nutAgvG.position.set(nutBoltWh.wx, 0, nutBoltWh.wz);
  scene.add(nutAgvG);
  agvFleet.push({
    g: nutAgvG,
    cargo: nutCargoGrp,
    cargoMat: nutChassisMat,
    beaconMat: nutBeaconMat,
    idx: NUM_AGVS,
    homeWh: nutBoltWh,
    isNutBoltAgv: true
  });

  // tâm + bán kính để camera fit toàn bộ các phân khu + hệ thống kho
  let ext = 10;
  machineMeshes.forEach(m => ext = Math.max(ext, Math.abs(m.g.position.x), Math.abs(m.g.position.z)));
  warehouseNodes.forEach(w => ext = Math.max(ext, Math.abs(w.wx) + 6, Math.abs(w.wz) + 6));
  orbit.cx = 0; orbit.cz = 0; orbit.r = ext * 2.05 + 24;

  // Nền không gian bên ngoài nhà xưởng: Luôn là màu nền ứng dụng (Dark / Light theme)
  const floorOld = scene.getObjectByName("floor"); if(floorOld) scene.remove(floorOld);
  const outerFloorMat = new THREE.MeshStandardMaterial({
    color: 0x18212b,
    roughness: 1.0,
    metalness: 0.05
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(orbit.r * 4.5, orbit.r * 4.5), outerFloorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(orbit.cx, -0.01, orbit.cz);
  floor.name = "floor";
  floor.receiveShadow = true;
  scene.add(floor);

  // Lưới tọa độ không gian bên ngoài nhà xưởng
  const grid = new THREE.GridHelper(orbit.r * 4.5, 48, 0x33414f, 0x222b35);
  if(grid.material){
    grid.material.transparent = true;
    grid.material.opacity = 0.40;
  }
  grid.position.set(orbit.cx, 0.0, orbit.cz);
  const og = scene.getObjectByName("grid"); if(og) scene.remove(og);
  grid.name = "grid";
  scene.add(grid);
  updateSceneTheme();
}
function makeLabel(text, power){
  const c = document.createElement("canvas");
  if(!power){
    c.width = 512; c.height = 128; const x = c.getContext("2d");
    x.fillStyle = "rgba(0,0,0,0)"; x.fillRect(0, 0, 512, 128);
    x.font = "bold 68px 'IBM Plex Mono',monospace"; x.textAlign = "center"; x.textBaseline = "middle";
    x.shadowColor = "rgba(0,0,0,0.95)"; x.shadowBlur = 8;
    x.fillStyle = "#ffffff"; x.fillText(text, 256, 68);
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4; tex.minFilter = THREE.LinearFilter;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthWrite: false}));
    sp.scale.set(5.0, 1.25, 1); return sp;
  }
  // Có công suất máy: Vẽ 2 dòng sắc nét cực đại (512x220)
  c.width = 512; c.height = 220; const x = c.getContext("2d");
  x.fillStyle = "rgba(0,0,0,0)"; x.fillRect(0, 0, 512, 220);
  x.textAlign = "center"; x.textBaseline = "middle";

  // Dòng trên: Công suất máy MÀU ĐỎ nổi bật (#ff2222)
  x.font = "bold 56px 'IBM Plex Mono',monospace";
  x.shadowColor = "rgba(0,0,0,0.95)"; x.shadowBlur = 8;
  x.fillStyle = "#ff2222";
  x.fillText(power, 256, 60);

  // Dòng dưới: Tên máy MÀU TRẮNG (#ffffff)
  x.font = "bold 68px 'IBM Plex Mono',monospace";
  x.shadowColor = "rgba(0,0,0,0.95)"; x.shadowBlur = 8;
  x.fillStyle = "#ffffff";
  x.fillText(text, 256, 155);

  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4; tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthWrite: false}));
  sp.scale.set(5.2, 2.2, 1); return sp;
}
let _sparkTex=null;
function makeSparkTexture(){
  const c=document.createElement("canvas"); c.width=c.height=64; const x=c.getContext("2d");
  const g=x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,"rgba(255,248,210,1)"); g.addColorStop(.22,"rgba(255,180,70,.95)");
  g.addColorStop(.55,"rgba(255,120,30,.4)"); g.addColorStop(1,"rgba(255,120,30,0)");
  x.fillStyle=g; x.fillRect(0,0,64,64);
  const t=new THREE.CanvasTexture(c); return t;
}
function bindOrbit(canvas){
  // Chặn contextmenu và kéo rê mặc định trên canvas
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  canvas.style.touchAction = "none"; // Bắt buộc để nhận Pointer Events mượt mà

  let lastClickTime = 0;

  const onPointerDown = e => {
    // Ngăn chặn triệt để tính năng Auto-Scroll của trình duyệt Windows khi bấm chuột giữa hoặc chuột phải
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch(err){}

    orbit.px = e.clientX;
    orbit.py = e.clientY;
    orbit.drag = true;

    // Phân loại nút chuột theo chuẩn Siemens NX:
    // e.button: 0 = Trái (MB1), 1 = Giữa (MB2), 2 = Phải (MB3)
    if(e.button === 1){
      // Chuột giữa (MB2 - Chuẩn NX cốt lõi)
      if(e.shiftKey){
        orbit.dragMode = "pan";      // Shift + MB2 = Pan (Dời góc nhìn)
      } else if(e.ctrlKey){
        orbit.dragMode = "zoom";     // Ctrl + MB2 = Zoom
      } else {
        orbit.dragMode = "rotate";   // MB2 = Xoay 3D (Rotate/Orbit)
      }
    } else if(e.button === 2){
      // Chuột phải (MB3): Pan dời khung nhìn
      orbit.dragMode = "pan";
    } else {
      // Chuột trái (MB1):
      if(e.shiftKey){
        orbit.dragMode = "pan";
      } else {
        orbit.dragMode = "rotate";
      }
    }

    // Double click MB2 (hoặc MB1) -> Fit View toàn xưởng
    const now = performance.now();
    if(now - lastClickTime < 280 && (e.button === 1 || e.button === 0)){
      fitView3D();
      orbit.drag = false;
    }
    lastClickTime = now;
  };

  const onPointerMove = e => {
    if(!orbit.drag) return;
    e.preventDefault();

    const dx = e.clientX - orbit.px;
    const dy = e.clientY - orbit.py;
    orbit.px = e.clientX;
    orbit.py = e.clientY;

    if(orbit.dragMode === "rotate"){
      // Xoay 3D (Orbit Rotate)
      orbit.az -= dx * 0.0075;
      orbit.el = Math.max(0.08, Math.min(1.52, orbit.el - dy * 0.0055));
    } else if(orbit.dragMode === "pan"){
      // Pan camera (Dời khung nhìn theo phương mặt phẳng nhìn)
      const panFactor = orbit.r * 0.0016;
      const sinAz = Math.sin(orbit.az);
      const cosAz = Math.cos(orbit.az);
      orbit.cx -= (dx * cosAz + dy * sinAz * Math.sin(orbit.el)) * panFactor;
      orbit.cz += (dx * sinAz - dy * cosAz * Math.sin(orbit.el)) * panFactor;
      orbit.cy = (orbit.cy || 0) + dy * Math.cos(orbit.el) * panFactor;
    } else if(orbit.dragMode === "zoom"){
      // Zoom bằng Ctrl + MB2
      orbit.r = Math.max(12, Math.min(500, orbit.r * (1 + dy * 0.01)));
    }
  };

  const onPointerUp = e => {
    orbit.drag = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch(err){}
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  // Lăn bánh xe chuột (Wheel) để Zoom mượt mà
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.08 : 0.92;
    orbit.r = Math.max(12, Math.min(500, orbit.r * factor));
  }, {passive: false});
}
function resizeThree(){
  if(!renderer)return; const c=document.getElementById("three"); const p=c.parentElement;
  const w=p.clientWidth,h=p.clientHeight; if(w<2||h<2)return;
  renderer.setPixelRatio(Math.min(2.5, window.devicePixelRatio || 1));
  renderer.setSize(w,h,false);
  camera.aspect=w/h; camera.updateProjectionMatrix();
}
function updateSceneTheme(){
  if(!scene)return;
  const floor=scene.getObjectByName("floor");
  const grid=scene.getObjectByName("grid");
  const dark=document.documentElement.getAttribute("data-theme")==="dark"||
    (!document.documentElement.getAttribute("data-theme")&&matchMedia("(prefers-color-scheme:dark)").matches);
  if(floor && floor.material){
    // Nền bên ngoài xưởng luôn là màu nền ứng dụng (Dark: #18212b, Light: #dfe5ec)
    floor.material.color.set(dark ? 0x18212b : 0xdfe5ec);
    floor.material.roughness = 1.0;
  }
  if(grid && grid.material){
    grid.material.opacity = dark ? 0.40 : 0.22;
  }
}
function getOnDutyWorker(m, t){
  if(!model || !model.workers || model.workers.length === 0) return null;
  const curDayM = (t % 1440);
  // Ca S6: 06:00 - 18:00 (0 -> 720 phút), Ca S7: 18:00 - 06:00 (720 -> 1440 phút)
  const isNight = (curDayM >= 720);
  const activeShiftKey = isNight ? "S7" : "S6";
  const mNorm = strip(m.name || "").toLowerCase().replace(/[-_ ]/g, "");

  // 1. Tìm công nhân có máy ưu tiên trùng với máy này VÀ trùng ca làm việc đang trực
  const sw = model.workers.find(w => {
    if(!w) return false;
    const wShift = String(w.shift || "").toUpperCase();
    if(!wShift.includes(activeShiftKey)) return false;
    const prefs = Array.isArray(w.prefMachines) ? w.prefMachines : (w.pref ? [w.pref] : []);
    return prefs.some(pm => {
      const pNorm = strip(pm).toLowerCase().replace(/[-_ ]/g, "");
      return pNorm === mNorm || mNorm.includes(pNorm) || pNorm.includes(mNorm);
    });
  });
  return sw || null;
}

const HOT=0xff7a2d, ARC=0x36c3f2;
function renderThree(){
  if(!threeReady)return;
  const cyVal = orbit.cy || 0;
  camera.position.set(
    orbit.cx + orbit.r * Math.cos(orbit.el) * Math.sin(orbit.az),
    cyVal + orbit.r * Math.sin(orbit.el),
    orbit.cz + orbit.r * Math.cos(orbit.el) * Math.cos(orbit.az)
  );
  camera.lookAt(orbit.cx, cyVal + 3.4, orbit.cz);
  const nowMs = performance.now();
  const t=sim.t, pulse=0.55+0.45*Math.sin(nowMs*0.018);

  const deliveryTargets = [];

  // --- Dynamic Single-Presence Worker Allocation ---
  // Mỗi công nhân là một con người duy nhất ngoài đời thực, không thể xuất hiện đồng thời ở 2 trạm máy tại cùng 1 thời điểm t.
  // Nếu 1 thợ phụ trách nhiều máy (ví dụ Nguyễn Văn Thiện phụ trách L2-3 và L2-4):
  // - Khi 1 máy đang hàn (iv != null): Thợ lập tức có mặt tại máy đó để thao tác.
  // - Trạm máy còn lại của thợ sẽ ở trạng thái chờ/không người trực (workerGrp.visible = false).
  // - Khi cả 2 máy đều rảnh: Thợ đứng trực tại máy chính (máy đầu tiên trong MayUuTien). Trạm phụ không hiển thị bản sao của thợ.
  const workerLocationMap = new Map(); // workerKey (MaCN hoặc Name) -> { machineIndex, isWelding }

  // Lượt 1: Các máy đang chạy hàn (Active Welding) được ưu tiên tối đa để giữ thợ tại trạm
  machineMeshes.forEach((m, i) => {
    const iv = schedule ? activeInterval(i, t) : null;
    if (iv) {
      const onDuty = getOnDutyWorker(m, t);
      const wId = iv.workerId || (onDuty ? onDuty.id : m._assignedWorkerId);
      const wName = iv.workerName || (onDuty ? onDuty.name : m._assignedWorkerName);
      const key = String(wId || wName || "").trim().toLowerCase();
      if (key && !workerLocationMap.has(key)) {
        workerLocationMap.set(key, { machineIndex: i, isWelding: true });
      }
    }
  });

  // Lượt 2: Các thợ chưa bận hàn sẽ đứng trực tại trạm chính (Primary Station) nếu máy đó đang rảnh
  machineMeshes.forEach((m, i) => {
    const iv = schedule ? activeInterval(i, t) : null;
    if (!iv) {
      const onDuty = getOnDutyWorker(m, t);
      const wId = onDuty ? onDuty.id : m._assignedWorkerId;
      const wName = onDuty ? onDuty.name : m._assignedWorkerName;
      const key = String(wId || wName || "").trim().toLowerCase();
      if (key && !workerLocationMap.has(key)) {
        let isPrimaryStation = true;
        if (onDuty && onDuty.prefMachines && onDuty.prefMachines.length > 1) {
          const mNorm = strip(m.name || "").toLowerCase().replace(/[-_ ]/g, "");
          const firstPref = strip(onDuty.prefMachines[0] || "").toLowerCase().replace(/[-_ ]/g, "");
          if (mNorm !== firstPref && !mNorm.includes(firstPref) && !firstPref.includes(mNorm)) {
            isPrimaryStation = false;
          }
        }
        if (isPrimaryStation) {
          workerLocationMap.set(key, { machineIndex: i, isWelding: false });
        }
      }
    }
  });

  machineMeshes.forEach((m,i)=>{
    const iv = schedule ? activeInterval(i,t) : null;
    const machIvs = (schedule && schedule.perMachine && schedule.perMachine[i]) ? schedule.perMachine[i] : [];

    // 1. Cập nhật Số lượng kiện hàng tại VỊ TRÍ ĐỂ HÀNG TẠI MÁY (IN BUFFER & OUT BUFFER)
    let waitingLots = 0, doneLots = 0, nextIv = iv;
    for(const v of machIvs){
      if(v.end <= t) doneLots++;
      else if(v.start >= t && v.start <= t + 240){
        waitingLots++;
        if(!nextIv) nextIv = v;
      }
    }
    if(iv) waitingLots = Math.max(1, waitingLots);

    const inTierCount = Math.min(3, waitingLots);
    if(m.inCrates){
      if(nextIv && m.inCrateMat){
        m.inCrateMat.color.set(partColor(nextIv.pi));
      }
      m.inCrates.forEach((bx, k) => { bx.visible = (k < inTierCount); });
    }
    const outTierCount = Math.min(3, doneLots);
    if(m.outCrates){
      m.outCrates.forEach((bx, k) => { bx.visible = (k < outTierCount); });
    }

    if(nextIv){
      deliveryTargets.push({ m, iv: nextIv });
    }

    // 2. Chuyển động đặc thù theo từng Kiểu máy (Laser tấm, Laser ống, 5 cỡ Máy dập, Robot MAG, Hàn Spot)
    const bY = (m.baseElecY != null ? m.baseElecY : 4.25);
    const bX = (m.baseElecX != null ? m.baseElecX : m.upElec.position.x);
    const bZ = (m.baseElecZ != null ? m.baseElecZ : 0);

    // Kiểm tra máy có đang bị HỎNG hoặc nằm trong sự cố bảo trì (Downtime) không
    const dt = downtimes.find(d => (d.mi === i || (d.m && d.m === m.name)) && t >= d.start && t < d.end);
    const isDown = m.isBroken || !!dt;

    if(isDown){
      if(m.breakdownTag){
        m.breakdownTag.visible = true;
        const bPulse = 0.92 + 0.08 * Math.sin(nowMs * 0.008);
        m.breakdownTag.scale.set(5.2 * bPulse, 1.95 * bPulse, 1);
      }
      // Đèn LED chớp nháy ĐỎ BÁO ĐỘNG khẩn cấp
      m.ledMat.color.setHex(0xef4444);
      m.ledMat.emissive.setHex(0xff0000);
      m.ledMat.emissiveIntensity = 0.5 + 0.5 * Math.sin(nowMs * 0.015);

      m.upElecMat.emissiveIntensity = 0;
      m.loElecMat.emissiveIntensity = 0;
      m.work.visible = false;
      m.spark.visible = false;
      m.upElec.position.set(bX, bY, bZ);
      if(m.workerGrp) m.workerGrp.visible = false;
      return; // Dừng, không thực hiện chu trình hàn bình thường khi máy hỏng
    } else {
      if(m.breakdownTag) m.breakdownTag.visible = false;
    }

    if(iv){
      m.upElecMat.emissive.setHex(HOT); m.upElecMat.emissiveIntensity=pulse*1.9;
      m.loElecMat.emissive.setHex(HOT); m.loElecMat.emissiveIntensity=pulse*1.9;
      m.ledMat.color.setHex(0xff7a2d); m.ledMat.emissive.setHex(HOT); m.ledMat.emissiveIntensity=pulse;
      const col=new THREE.Color(partColor(iv.pi));
      m.work.visible=true; m.workMat.color.copy(col); m.workMat.emissive.copy(col).multiplyScalar(0.18);

      if(m.mType === "lasertam"){
        const dx = Math.sin(nowMs * 0.006) * 0.85;
        const dz = Math.cos(nowMs * 0.009) * 0.95;
        m.upElec.position.set(bX + dx, bY - 0.12, bZ + dz);
        m.spark.position.set(bX + dx, m.weldY + 0.2, bZ + dz);
      } else if(m.mType === "laserong"){
        const dx = Math.sin(nowMs * 0.008) * 0.55;
        m.upElec.position.set(bX + dx, bY - 0.1, bZ);
        m.work.rotation.x = nowMs * 0.005;
        m.spark.position.set(bX + dx, m.weldY + 0.18, bZ);
      } else if(m.mType && m.mType.startsWith("maydap")){
        // Đầu trượt 5 dòng máy dập (Slide/Ram) dập theo biên độ tương ứng công suất
        const strokeMap = { maydap1: 0.55, maydap2: 0.70, maydap3: 0.85, maydap4: 1.0, maydap5: 1.15, maydap: 0.85 };
        const maxStroke = strokeMap[m.mType] || 0.85;
        const stroke = Math.max(0, Math.sin(nowMs * 0.012)) * maxStroke;
        m.upElec.position.y = bY - stroke;
      } else if(m.mType === "magrobot"){
        const dz = Math.sin(nowMs * 0.007) * 0.8;
        const dy = Math.cos(nowMs * 0.014) * 0.12;
        m.upElec.position.set(bX, bY + dy, bZ + dz);
        m.spark.position.set(bX, m.weldY + 0.25, bZ + dz);
      } else if(m.mType === "bulong"){
        // Chuyển động đặc thù của máy hàn bu lông / tán đai ốc (Nut / Bolt Welder)
        // 1. Phễu rung rung lắc ở tần số cao cấp phôi
        if(m.feederBowl){
          m.feederBowl.position.x = m.feederBowlBaseX + Math.sin(nowMs * 0.08) * 0.04;
          m.feederBowl.position.z = m.feederBowlBaseZ + Math.cos(nowMs * 0.09) * 0.04;
          m.feederBowl.rotation.y = (nowMs * 0.003) % (Math.PI * 2);
        }
        // 2. Con đai ốc / bu lông trượt dọc ống dẫn vào chốt định vị đĩa hàn
        if(m.dispenserNut && m.feedStart && m.feedEnd){
          const feedProg = Math.min(1.0, (1.0 - pulse) * 1.5);
          m.dispenserNut.position.x = m.feedStart.x + (m.feedEnd.x - m.feedStart.x) * feedProg;
          m.dispenserNut.position.y = m.feedStart.y + (m.feedEnd.y - m.feedStart.y) * feedProg;
          m.dispenserNut.position.z = m.feedStart.z + (m.feedEnd.z - m.feedStart.z) * feedProg;
          m.dispenserNut.rotation.y = nowMs * 0.01;
          m.dispenserNut.visible = true;
        }
        // Đầu ép trên hạ xuống ép tán ốc
        m.upElec.position.y = bY - 0.28 * pulse;
      } else {
        m.upElec.position.y = bY - 0.08*pulse;
      }

      m.spark.visible=true; const sc=1.1+0.85*pulse; m.spark.scale.set(sc,sc,1);
      m.spark.material.opacity=0.55+0.45*pulse;

      // 3D Worker Character Animation (Dynamic Single-Presence)
      if(m.workerGrp){
        const onDuty = getOnDutyWorker(m, t);
        const wId = iv.workerId || (onDuty ? onDuty.id : m._assignedWorkerId);
        const wName = iv.workerName || (onDuty ? onDuty.name : m._assignedWorkerName);
        const key = String(wId || wName || "").trim().toLowerCase();
        const loc = key ? workerLocationMap.get(key) : null;
        const isWorkerHere = loc && (loc.machineIndex === i);

        if(isWorkerHere){
          m.workerGrp.visible = true;
          if(m.armL && m.armR){
            const armBob = Math.sin(nowMs * 0.012) * 0.08;
            m.armL.rotation.x = Math.PI / 4 + armBob;
            m.armR.rotation.x = Math.PI / 4 - armBob;
          }
          if(m.workerLabel){
            m.workerLabel.visible = true;
            const wSkill = iv.workerSkill || (onDuty ? onDuty.skill : m._assignedWorkerSkill) || "Bậc 3";
            const wShift = iv.workerShift || (onDuty ? onDuty.shift : m._assignedWorkerShift) || "";
            if(m._curWorkerName !== wName || m._curWorkerSkill !== wSkill || m._curWorkerId !== wId || m._curWorkerShift !== wShift || m._curWorkerStatus !== "welding"){
              m._curWorkerName = wName;
              m._curWorkerSkill = wSkill;
              m._curWorkerId = wId;
              m._curWorkerShift = wShift;
              m._curWorkerStatus = "welding";
              updateWorkerSprite(m.workerLabel, wName, wSkill, "welding", wId, wShift);
            }
          }
        } else {
          m.workerGrp.visible = false;
          m._curWorkerStatus = "unmanned";
        }
      }
    } else {
      const waiting = schedule && hasFuture(i,t);
      m.upElecMat.emissive.setHex(0x000000); m.upElecMat.emissiveIntensity=0;
      m.loElecMat.emissive.setHex(0x000000); m.loElecMat.emissiveIntensity=0;
      m.ledMat.color.setHex(waiting?0x2f6ea0:0x2e7d55);
      m.ledMat.emissive.setHex(waiting?ARC:0x1a9e6a); m.ledMat.emissiveIntensity=.5;
      m.work.visible=false; m.spark.visible=false;
      m.upElec.position.set(bX, bY, bZ);
      if(m.mType === "bulong"){
        if(m.feederBowl){
          m.feederBowl.position.set(m.feederBowlBaseX, m.feederBowlBaseY, m.feederBowlBaseZ);
          m.feederBowl.rotation.y = 0;
        }
        if(m.dispenserNut && m.feedStart){
          m.dispenserNut.position.set(m.feedStart.x, m.feedStart.y, m.feedStart.z);
          m.dispenserNut.visible = true;
        }
      }

      // Công nhân ở trạng thái nghỉ/sẵn sàng (Dynamic Single-Presence)
      if(m.workerGrp){
        const onDuty = getOnDutyWorker(m, t);
        const wId = onDuty ? onDuty.id : m._assignedWorkerId;
        const wName = onDuty ? onDuty.name : m._assignedWorkerName;
        const key = String(wId || wName || "").trim().toLowerCase();
        const loc = key ? workerLocationMap.get(key) : null;
        const isWorkerHere = loc && (loc.machineIndex === i);

        if(isWorkerHere){
          m.workerGrp.visible = true;
          if(m.armL && m.armR){
            m.armL.rotation.x = 0.15;
            m.armR.rotation.x = 0.15;
          }
          if(m.workerLabel){
            m.workerLabel.visible = true;
            const wSkill = onDuty ? onDuty.skill : (m._assignedWorkerSkill || "Bậc 3");
            const wShift = onDuty ? onDuty.shift : (m._assignedWorkerShift || "");
            if(m._curWorkerName !== wName || m._curWorkerSkill !== wSkill || m._curWorkerId !== wId || m._curWorkerShift !== wShift || m._curWorkerStatus !== "ready"){
              m._curWorkerName = wName;
              m._curWorkerSkill = wSkill;
              m._curWorkerId = wId;
              m._curWorkerShift = wShift;
              m._curWorkerStatus = "ready";
              updateWorkerSprite(m.workerLabel, wName, wSkill, "ready", wId, wShift);
            }
          }
        } else {
          // Thợ đang bận ở trạm máy khác hoặc đây là trạm phụ chưa đến lượt thao tác: ẩn để không nhân bản người!
          m.workerGrp.visible = false;
          m._curWorkerStatus = "unmanned";
        }
      }
    }
  });

  // 3. Mô phỏng Xe AGV Cấp Hàng di chuyển từ KHO CỦA PHÂN XƯỞNG (hoặc Kho gần nhất) -> VỊ TRÍ ĐỂ HÀNG TẠI MÁY
  agvFleet.forEach((agv, aIdx) => {
    if(agv.isNutBoltAgv){
      // Chuyển động riêng của Xe Cấp Nut & Bu Lông:
      // Di chuyển liên tục từ Kho Linh Kiện Mua -> các trạm hàn tán đai ốc / bu lông (L1-1..L1-4, Soyer, L1-7, L1-8, L2-7)
      const nutMachines = machineMeshes.filter(m => m.mType === "bulong" || (m.name && (m.name.includes("L1-") || m.name.toLowerCase().includes("soyer") || m.name.includes("L2-7"))));
      const targetMachines = nutMachines.length > 0 ? nutMachines : machineMeshes;
      const targetM = targetMachines[Math.floor((nowMs * 0.00008) + aIdx) % targetMachines.length];
      const srcWh = agv.homeWh || { wx: stagingOrigin.x, wz: stagingOrigin.z };
      const destX = targetM.inWorldX;
      const destZ = targetM.inWorldZ;
      const startX = srcWh.wx;
      const startZ = srcWh.wz;

      const cycle = ((nowMs * 0.00014) + aIdx * 0.3) % 1.0;
      const isOutbound = cycle < 0.55;
      const u = isOutbound ? (cycle / 0.55) : ((1.0 - cycle) / 0.45);

      let curX, curZ, rotY = 0;
      if(u < 0.4){
        const p = u / 0.4;
        curX = startX;
        curZ = startZ + (destZ - startZ) * p;
        rotY = (destZ >= startZ) ? Math.PI / 2 : -Math.PI / 2;
      } else {
        const p = (u - 0.4) / 0.6;
        curX = startX + (destX - startX) * p;
        curZ = destZ;
        rotY = (destX >= startX) ? 0 : Math.PI;
      }
      if(!isOutbound) rotY += Math.PI;

      agv.g.position.set(curX, 0, curZ);
      agv.g.rotation.y = rotY;
      agv.cargo.visible = true; // Luôn chở khay hộp linh kiện Nut & Bulong
      agv.beaconMat.emissiveIntensity = 0.6 + 1.4 * Math.abs(Math.sin(nowMs * 0.02));
      return;
    }

    if(deliveryTargets.length === 0){
      const hw = agv.homeWh || stagingOrigin;
      agv.g.position.set(hw.wx ?? hw.x, 0, hw.wz ?? hw.z);
      agv.g.rotation.y = 0;
      agv.cargo.visible = false;
      return;
    }
    const target = deliveryTargets[aIdx % deliveryTargets.length];
    const srcWh = target.m.sourceWh || agv.homeWh || { wx: stagingOrigin.x, wz: stagingOrigin.z };
    const destX = target.m.inWorldX;
    const destZ = target.m.inWorldZ;
    const startX = srcWh.wx;
    const startZ = srcWh.wz;

    // Chu kỳ di chuyển khứ hồi: 0 -> 0.5 (đi giao hàng từ Khu chờ tới Máy), 0.5 -> 1.0 (quay về Khu chờ)
    const cycle = ((nowMs * 0.00012) + aIdx * 0.21) % 1.0;
    const isOutbound = cycle < 0.55;
    const u = isOutbound ? (cycle / 0.55) : ((1.0 - cycle) / 0.45);

    // Đi theo quỹ đạo chữ L dọc hành lang (trước tiên đi theo Z, sau đó rẽ vào X của máy)
    let curX, curZ, rotY = 0;
    if(u < 0.4){
      const p = u / 0.4;
      curX = startX;
      curZ = startZ + (destZ - startZ) * p;
      rotY = (destZ >= startZ) ? Math.PI / 2 : -Math.PI / 2;
    } else {
      const p = (u - 0.4) / 0.6;
      curX = startX + (destX - startX) * p;
      curZ = destZ;
      rotY = (destX >= startX) ? 0 : Math.PI;
    }
    if(!isOutbound) rotY += Math.PI;

    agv.g.position.set(curX, 0, curZ);
    agv.g.rotation.y = rotY;
    agv.cargo.visible = isOutbound; // Lúc đi chở đầy BTP, lúc về rỗng
    if(isOutbound && target.iv){
      agv.cargoMat.color.set(partColor(target.iv.pi));
    }
    agv.beaconMat.emissiveIntensity = 0.5 + 1.2 * Math.abs(Math.sin(nowMs * 0.015 + aIdx));
  });

  renderer.render(scene,camera);
}
function activeInterval(mi,t){
  if(!schedule)return null; const arr=schedule.perMachine[mi];
  for(const iv of arr){ if(iv.start<=t&&t<iv.end) return iv; } return null;
}
function hasFuture(mi,t){ const arr=schedule.perMachine[mi]; for(const iv of arr){ if(iv.end>t) return true; } return false; }

/* ============================================================
   SƠ ĐỒ MÁY 2D (canvas) — luôn hoạt động kể cả khi 3D lỗi
   ============================================================ */
function renderSchematic(){
  const cv=document.getElementById("schematic"); const p=cv.parentElement;
  const dpr=Math.min(2,devicePixelRatio); const w=p.clientWidth,h=p.clientHeight;
  if(w<2||h<2)return; cv.width=w*dpr;cv.height=h*dpr; const x=cv.getContext("2d"); x.scale(dpr,dpr);
  x.clearRect(0,0,w,h);
  const N=model.machines.length;
  // xếp theo ô vị trí (toạ độ tùy chỉnh hoặc lưới), fit vừa khung
  let minX=Math.min(...model.cellX),maxX=Math.max(...model.cellX),minY=Math.min(...model.cellY),maxY=Math.max(...model.cellY);
  const spanX=(maxX-minX)||1, spanY=(maxY-minY)||1, pad=16;
  const cell=Math.min((w-pad*2)/(spanX+1),(h-pad*2)/(spanY+1));
  const cw=Math.min(cell*0.86,150), ch=Math.min(cell*0.64,110);
  const fg=cssVar("--fg"),muted=cssVar("--muted"),line=cssVar("--line"),hot=cssVar("--hot"),accent=cssVar("--accent"),panel=cssVar("--panel-2");
  for(let i=0;i<N;i++){
    const px=pad+(model.cellX[i]-minX+0.5)*cell, py=pad+(model.cellY[i]-minY+0.5)*cell;
    const gx=px-cw/2, gy=py-ch/2;
    const iv=schedule?activeInterval(i,sim.t):null;
    const waiting=schedule&&hasFuture(i,sim.t);
    x.fillStyle=panel; x.strokeStyle=iv?hot:(waiting?accent:line); x.lineWidth=iv?2.2:1;
    roundRect(x,gx,gy,cw,ch,8); x.fill(); x.stroke();
    if(iv){ x.fillStyle=partColor(iv.pi); roundRect(x,gx,gy,cw,6,3); x.fill(); }
    x.save(); x.beginPath(); x.rect(gx,gy,cw,ch); x.clip();
    x.fillStyle=fg; x.font="600 12px 'IBM Plex Mono',monospace"; x.textBaseline="top";
    x.fillText(model.machines[i], gx+7, gy+(iv?12:8));
    if(ch>34){
      x.font="11px 'IBM Plex Sans',sans-serif"; x.fillStyle=iv?hot:muted;
      x.fillText(iv?`▶ ${iv.part}`:(waiting?"chờ":"rảnh"), gx+7, gy+ch-20);
      const u=sim.t>0?Math.min(1,busyUntil(i,sim.t)/sim.t):0;
      x.fillStyle=line; roundRect(x,gx+7,gy+ch-8,cw-14,4,2); x.fill();
      x.fillStyle=accent; roundRect(x,gx+7,gy+ch-8,(cw-14)*u,4,2); x.fill();
    }
    x.restore();
  }
}
function busyUntil(mi,t){ let s=0; for(const iv of schedule.perMachine[mi]){ if(iv.start>=t)break; s+=Math.min(iv.end,t)-iv.start; } return s; }
function roundRect(x,a,b,w,h,r){ r=Math.min(r,w/2,h/2); x.beginPath();
  x.moveTo(a+r,b); x.arcTo(a+w,b,a+w,b+h,r); x.arcTo(a+w,b+h,a,b+h,r); x.arcTo(a,b+h,a,b,r); x.arcTo(a,b,a+w,b,r); x.closePath(); }

/* ============================================================
   GANTT (canvas) - Nâng cấp trực quan, tiêu đề ngày & Tooltip chi tiết
   ============================================================ */
let ganttHoveredIv = null;

function renderGantt(){
  const cv=document.getElementById("gantt"); const p=cv.parentElement;
  const dpr=Math.min(2,devicePixelRatio); const w=p.clientWidth,h=p.clientHeight;
  if(w<2||h<2||!schedule)return; cv.width=w*dpr;cv.height=h*dpr; const x=cv.getContext("2d"); x.scale(dpr,dpr);
  x.clearRect(0,0,w,h);

  const fg=cssVar("--fg"),muted=cssVar("--muted"),line=cssVar("--line"),hot=cssVar("--hot");
  const labW=92, padT=34, padB=28, N=model.machines.length;
  const rowH=Math.max(12,Math.min(28,(h-padT-padB)/N));
  const scale=(w-labW-14)/Math.max(1,schedule.makespan);
  const numDays = Math.ceil(schedule.makespan / 1440) || 1;

  // 1. Nền hàng máy xen kẽ (Zebra rows) để dễ theo dõi từng máy
  for(let i=0; i<N; i++){
    const gy = padT + i * rowH;
    x.fillStyle = (i % 2 === 0) ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.08)";
    x.fillRect(0, gy, w, rowH);
    x.strokeStyle = "rgba(255, 255, 255, 0.04)";
    x.lineWidth = 1;
    x.beginPath(); x.moveTo(0, gy + rowH); x.lineTo(w, gy + rowH); x.stroke();
  }

  // 2. Vùng nghỉ ca & Vùng hết ca theo từng máy
  for(let d=0; d<numDays; d++){
    const dayOffset = d * 1440;
    for(let i=0; i<N; i++){
      const mSh = getMachineShiftInfo(i);
      const gy = padT + i * rowH;

      if(mSh.breaks){
        mSh.breaks.forEach(b => {
          const bs = dayOffset + b.start;
          const be = dayOffset + b.end;
          if(bs < schedule.makespan){
            const bx = labW + bs * scale;
            const bw = Math.max(2, (Math.min(be, schedule.makespan) - bs) * scale);
            x.fillStyle = "rgba(100, 116, 139, 0.22)";
            x.fillRect(bx, gy, bw, rowH);
          }
        });
      }

      if(mSh.shiftLength < 1440){
        const nightS = dayOffset + mSh.shiftLength;
        const nightE = dayOffset + 1440;
        if(nightS < schedule.makespan){
          const nx = labW + nightS * scale;
          const nw = Math.max(2, (Math.min(nightE, schedule.makespan) - nightS) * scale);
          x.fillStyle = "rgba(15, 23, 42, 0.42)";
          x.fillRect(nx, gy, nw, rowH);
        }
      }
    }
  }

  // 3. Header ngày ở trên cùng (Dải tiêu đề ngày sắc nét)
  x.fillStyle = "rgba(30, 58, 138, 0.35)";
  x.fillRect(0, 0, w, padT - 4);
  x.strokeStyle = "rgba(59, 130, 246, 0.4)";
  x.lineWidth = 1;
  x.beginPath(); x.moveTo(0, padT - 4); x.lineTo(w, padT - 4); x.stroke();

  for(let d=0; d<numDays; d++){
    const dayStart = d * 1440;
    const dayEnd = (d + 1) * 1440;
    const sx = labW + dayStart * scale;
    const ex = Math.min(w, labW + dayEnd * scale);
    const boxW = ex - sx;

    // Vạch chia ngày từ trên xuống dưới
    x.strokeStyle = "rgba(59, 130, 246, 0.55)";
    x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(sx, 0); x.lineTo(sx, padT + N * rowH); x.stroke();

    if(boxW > 25){
      const dateLabel = (model.dateLabels && model.dateLabels[d]) ? model.dateLabels[d] : `Ngày ${d+1}`;
      x.fillStyle = "#93c5fd";
      x.font = "bold 11px 'IBM Plex Sans',sans-serif";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText(`📅 ${dateLabel}`, sx + boxW / 2, (padT - 4) / 2);
    }
  }

  // 4. Cột nhãn máy bên trái
  x.fillStyle = "rgba(15, 23, 42, 0.85)";
  x.fillRect(0, 0, labW, h);
  x.strokeStyle = "rgba(59, 130, 246, 0.3)";
  x.beginPath(); x.moveTo(labW, 0); x.lineTo(labW, h); x.stroke();

  for(let i=0; i<N; i++){
    const gy = padT + i * rowH;
    const mName = model.machines[i];
    const mSh = getMachineShiftInfo(i);
    const shiftCode = mSh.code || (mSh.label ? mSh.label.split(":")[0] : "HC");

    x.textAlign = "left";
    x.textBaseline = "middle";
    x.font = "bold 10.5px 'IBM Plex Mono',monospace";
    x.fillStyle = fg;
    x.fillText(mName, 7, gy + rowH / 2);

    x.textAlign = "right";
    x.font = "600 8.5px 'IBM Plex Sans',sans-serif";
    x.fillStyle = shiftCode.includes("24") ? "var(--good)" : "var(--muted)";
    x.fillText(shiftCode, labW - 6, gy + rowH / 2);
  }

  // 5. Thước đo thời gian dưới chân Gantt
  x.strokeStyle = line;
  x.fillStyle = muted;
  x.textAlign = "center";
  x.textBaseline = "top";
  const step = niceStep(schedule.makespan);
  for(let tt=0; tt<=schedule.makespan+0.5; tt+=step){
    const gx = labW + tt * scale;
    x.globalAlpha = 0.35;
    x.beginPath(); x.moveTo(gx, padT); x.lineTo(gx, padT + N * rowH); x.stroke();
    x.globalAlpha = 1;
    x.font = "9px 'IBM Plex Mono',monospace";
    x.fillText(Math.round(tt) + "p", gx, h - 22);
    x.font = "8px 'IBM Plex Mono',monospace";
    x.fillText(formatClockTime(tt), gx, h - 11);
  }

  // 6. Vùng sự cố máy (Downtimes)
  downtimes.forEach(dt => {
    if(dt.mi < N && dt.start < schedule.makespan){
      const gy = padT + dt.mi * rowH;
      const bx = labW + dt.start * scale;
      const bw = Math.max(3, (Math.min(dt.end, schedule.makespan) - dt.start) * scale);
      x.fillStyle = "rgba(232, 97, 31, 0.4)";
      roundRect(x, bx, gy+2, bw, rowH-4, 3);
      x.fill();
      x.strokeStyle = hot;
      x.stroke();
      if(bw > 22){
        x.save();
        x.fillStyle = "#fff";
        x.font = "8.5px 'IBM Plex Mono',monospace";
        x.textBaseline = "middle";
        x.fillText("⚠ " + dt.reason, bx + 3, gy + rowH/2);
        x.restore();
      }
    }
  });

  // 7. Vẽ các khối công việc hàn (Task Blocks) - Cắt tỉa (clip) chữ gọn gàng
  for(let i=0; i<N; i++){
    const gy = padT + i * rowH;
    schedule.perMachine[i].forEach(iv => {
      const bx = labW + iv.start * scale;
      const bw = Math.max(3, (iv.end - iv.start) * scale);
      const isHovered = (ganttHoveredIv === iv);

      x.fillStyle = partColor(iv.pi);
      roundRect(x, bx, gy + 2, bw, rowH - 4, 3);
      x.fill();

      x.strokeStyle = isHovered ? "#ffffff" : "rgba(0, 0, 0, 0.4)";
      x.lineWidth = isHovered ? 2 : 0.6;
      x.stroke();
      x.lineWidth = 1;

      // Nhãn chữ bên trong ô - Clip bảo đảm không bị tràn chữ sang ô khác
      if(bw > 18){
        x.save();
        x.beginPath();
        x.rect(bx + 1, gy + 1, bw - 2, rowH - 2);
        x.clip();

        x.fillStyle = "#ffffff";
        x.shadowColor = "rgba(0,0,0,0.85)";
        x.shadowBlur = 2;
        x.font = "bold 9px 'IBM Plex Mono',monospace";
        x.textBaseline = "middle";
        x.textAlign = "left";

        let tag = (iv.priority === 1 ? "★ " : "") + iv.part.replace("Part-", "P");
        if(iv.unit && iv.lotQty && iv.totalQty && iv.totalQty > iv.lotQty){
          tag += `#${iv.unit} (${iv.lotQty})`;
        } else if(iv.lotQty && iv.lotQty > 1){
          tag += ` (${iv.lotQty})`;
        }
        x.fillText(tag, bx + 3, gy + rowH / 2);
        x.restore();
      }
    });
  }

  // 8. Cờ hạn giao (Due Date Markers)
  model.parts.forEach(p => {
    if(p.dueDate && p.dueDate <= schedule.makespan){
      const dx = labW + p.dueDate * scale;
      x.save();
      x.strokeStyle = "rgba(239, 68, 68, 0.85)";
      x.lineWidth = 1.5;
      x.setLineDash([3, 3]);
      x.beginPath();
      x.moveTo(dx, padT - 4);
      x.lineTo(dx, padT + N * rowH);
      x.stroke();
      x.fillStyle = "#ef4444";
      x.font = "bold 9px 'IBM Plex Sans',sans-serif";
      x.textAlign = "left";
      x.fillText(`🚩 ${p.id} (${formatClockTime(p.dueDate)})`, dx + 3, padT + 8);
      x.restore();
    }
  });

  // 9. Vạch thời gian mô phỏng hiện tại
  const cx = labW + sim.t * scale;
  x.strokeStyle = hot;
  x.lineWidth = 2;
  x.beginPath(); x.moveTo(cx, padT - 4); x.lineTo(cx, padT + N * rowH + 2); x.stroke();
  x.lineWidth = 1;
}
function niceStep(span){ const raw=span/8; const p=Math.pow(10,Math.floor(Math.log10(raw)));
  const n=raw/p; return (n<1.5?1:n<3.5?2:n<7.5?5:10)*p; }

/* ============================================================
   CỘT 3: SẢN LƯỢNG THỜI GIAN THỰC & BIỂU ĐỒ TIẾN ĐỘ THEO NGÀY
   ============================================================ */
let chartHoverT = null;

function getPcsCompletedAt(tm){
  if(!schedule || !schedule.intervals || !model || !model.parts) return 0;
  const lastOps = new Map();
  model.parts.forEach(p => {
    const maxSeq = Math.max(...p.ops.map(o => o.seq));
    lastOps.set(p.id, maxSeq);
  });
  let pcs = 0;
  const totalPcsGoal = model.parts.reduce((s, p) => s + (p.qty || 0), 0);
  schedule.intervals.forEach(iv => {
    if(iv.seq === lastOps.get(iv.part)){
      // Mỗi lô con hoàn thành công đoạn cuối = lotQty chiếc (KHÔNG phải totalQty = cả part)
      const q = (iv.lotQty != null) ? iv.lotQty : (iv.isBatch ? (iv.totalQty || 1) : 1);
      if(tm >= iv.end) pcs += q;
      else if(tm > iv.start) pcs += Math.round(q * (tm - iv.start) / Math.max(1, iv.end - iv.start));
    }
  });
  return Math.min(totalPcsGoal, pcs);
}

// Tổng kế hoạch & tổng thực tế của toàn bộ part
function totalPlanPcs(){ return model.parts.reduce((s, p) => s + (p.planQty != null ? p.planQty : (p.qty || 0)), 0); }
function totalActualPcs(){ return model.parts.reduce((s, p) => s + (p.actualQty || 0), 0); }

/* ===== Đường cong KẾ HOẠCH chuẩn (lập lịch TOÀN BỘ kế hoạch, KHÔNG phụ thuộc Thực tế) =====
   Dùng cho "Kế hoạch đến thời điểm t": chỉ đổi theo con trỏ thời gian t, KHÔNG đổi khi sửa Thực tế. */
let _planRefSched = null, _planRefSig = "";
function _planSignature(){
  // Chữ ký CHỈ gồm kế hoạch + routing + tham số lịch (KHÔNG gồm actualQty) → sửa Thực tế không làm tính lại
  const ps = (model.parts || []).map(p => [p.id, (p.planQty != null ? p.planQty : (p.qty || 0)), p.pack || 0, p.eff || 1, p.minStartTime || 0, p.priority || 2, p.ordered ? 1 : 0, (p.ops || []).length].join(",")).join("|");
  const subLot = (document.getElementById("subLotSize") || {}).value || "";
  const obj = (document.getElementById("objective") || {}).value || "";
  const setup = (document.getElementById("setup") || {}).value || "";
  const shifts = (model.machineShifts || []).join(",");
  return [ps, (model.machines || []).length, shifts, subLot, obj, setup, (downtimes || []).length].join("#");
}
function getPlanRefSched(){
  if(!model || !model.parts) return null;
  const sig = _planSignature();
  if(_planRefSched && _planRefSig === sig) return _planRefSched;
  // Clone model: mỗi part chạy ĐỦ kế hoạch (qty = planQty), bỏ qua Thực tế → đường cong kế hoạch cố định
  const planParts = model.parts.map(p => Object.assign({}, p, { qty: (p.planQty != null ? p.planQty : (p.qty || 0)), actualQty: 0, isDone: false }));
  const planModel = Object.assign({}, model, { parts: planParts });
  const breaks = getActiveBreaks();
  const elSubLot = document.getElementById("subLotSize");
  const sublotSize = elSubLot ? parseInt(elSubLot.value, 10) : 500;
  const opts = {
    objective: (document.getElementById("objective") || {}).value,
    setup: +((document.getElementById("setup") || {}).value) || 0,
    sublotSize, breaks, downtimes, minStartTime: 0, frozenIntervals: []
  };
  try { _planRefSched = solve(planModel, opts); _planRefSig = sig; }
  catch(e){ _planRefSched = null; console.warn("plan-ref solve failed", e); }
  return _planRefSched;
}
function planRefMakespan(){ const s = getPlanRefSched(); return (s && s.makespan) ? s.makespan : (schedule ? schedule.makespan : 1); }
// Sản lượng tích luỹ (theo công đoạn cuối) tới thời điểm tm, trên một lịch cho trước
function cumAtSched(sched, tm){
  if(!sched || !sched.intervals) return 0;
  const lastOps = new Map();
  (model.parts || []).forEach(p => lastOps.set(p.id, Math.max.apply(null, p.ops.map(o => o.seq))));
  let pcs = 0;
  sched.intervals.forEach(iv => {
    if(iv.seq === lastOps.get(iv.part)){
      const q = (iv.lotQty != null) ? iv.lotQty : (iv.isBatch ? (iv.totalQty || 1) : 1);
      if(tm >= iv.end) pcs += q;
      else if(tm > iv.start) pcs += Math.round(q * (tm - iv.start) / Math.max(1, iv.end - iv.start));
    }
  });
  return pcs;
}
// "Kế hoạch đến thời điểm t" = sản lượng kế hoạch tích luỹ tới t (CỐ ĐỊNH, không đổi khi sửa Thực tế)
function plannedCumAt(tm){ return Math.min(totalPlanPcs(), cumAtSched(getPlanRefSched(), tm)); }

function renderStats(){
  if(!schedule)return;
  const t=sim.t;
  
  // Hiển thị Makespan
  const mk = Math.round(schedule.makespan);
  if(mk >= 1440){
    const d = Math.floor(mk / 1440);
    const remM = mk % 1440;
    const h = Math.floor(remM / 60);
    document.getElementById("kMake").innerHTML = `${d}d ${h}h <span style="font-size:11px;color:var(--muted)">(${mk.toLocaleString()}p)</span>`;
    document.getElementById("kMake").title = `${mk.toLocaleString()} phút`;
  } else {
    document.getElementById("kMake").textContent = mk + "p";
    document.getElementById("kMake").title = `${mk} phút`;
  }

  // Tính tổng số chiếc (Pcs) và số chiếc đã hoàn thành
  const totalPcsGoal = model.parts.reduce((s, p) => s + (p.qty || 0), 0);      // phần CÒN LẠI cần SX (cho biểu đồ)
  const pcsDone = getPcsCompletedAt(t);                                        // SX được tới thời điểm t (trong lịch)
  const pctDone = Math.round((pcsDone / Math.max(1, totalPcsGoal)) * 100);     // % so với phần còn lại (cho biểu đồ)

  // Ô "Hoàn thành" = SỐ LƯỢNG THỰC TẾ đã SX / TỔNG KẾ HOẠCH (%) — tiến độ thật, ổn định
  const totalPlanAll = totalPlanPcs();
  const totalActualAll = totalActualPcs();
  const pctReal = Math.min(100, Math.round((totalActualAll / Math.max(1, totalPlanAll)) * 100));
  document.getElementById("kDone").innerHTML = `<span style="color:var(--good);font-weight:700">${totalActualAll.toLocaleString()}</span> <span style="font-size:11.5px;color:var(--muted)">/ ${totalPlanAll.toLocaleString()} · ${pctReal}%</span>`;
  
  let active=0; for(let i=0;i<model.machines.length;i++) if(activeInterval(i,t)) active++;
  document.getElementById("kActive").innerHTML = `<span style="color:var(--hot);font-weight:700">${active}</span> <span style="font-size:11px;color:var(--muted)">/ ${model.machines.length} máy</span>`;
  
  // Tính số lượng part trễ hạn — hoàn thành của part = lúc muộn nhất trong TẤT CẢ lô con
  let tardyCount = 0;
  if(schedule && schedule.intervals){
    const partEnd = new Map();
    schedule.intervals.forEach(iv => { partEnd.set(iv.part, Math.max(partEnd.get(iv.part)||0, iv.end)); });
    model.parts.forEach(p => {
      if(p.dueDate && (partEnd.get(p.id)||0) > p.dueDate) tardyCount++;
    });
  }
  const elTardy = document.getElementById("kTardy");
  if(elTardy){
    elTardy.textContent = tardyCount;
    elTardy.style.color = tardyCount > 0 ? "var(--bad)" : "var(--good)";
  }

  // Cập nhật thanh thông tin phía trên biểu đồ
  const elChartTime = document.getElementById("chartTime");
  const elChartPcs = document.getElementById("chartPcs");
  if(chartHoverT == null){
    const planCum = plannedCumAt(t);
    const pctCum = Math.min(100, Math.round((planCum / Math.max(1, totalPlanAll)) * 100));
    if(elChartTime) elChartTime.textContent = `${formatCalendarTime(t)} (${Math.round(t)}p)`;
    if(elChartPcs) elChartPcs.textContent = `${planCum.toLocaleString()} / ${totalPlanAll.toLocaleString()} pcs (${pctCum}%)`;
  }

  // hiệu suất TB tới thời điểm t
  let util=0; if(t>0){ let s=0; for(let i=0;i<model.machines.length;i++) s+=busyUntil(i,t)/t; util=s/model.machines.length; }
  document.getElementById("kUtil").textContent=Math.round(util*100)+"%";
  document.getElementById("prog").style.width=(100*Math.min(1,t/schedule.makespan))+"%";
  renderOutChart();
  renderMachList();
}

function renderOutChart(){
  const cv=document.getElementById("outchart"); if(!cv) return;
  const w=cv.clientWidth||cv.parentElement.clientWidth-28;
  const dpr=Math.min(2,devicePixelRatio); const h=150; cv.width=w*dpr; cv.height=h*dpr; cv.style.height=h+"px";
  const x=cv.getContext("2d"); x.scale(dpr,dpr); x.clearRect(0,0,w,h);
  const line=cssVar("--line"), muted=cssVar("--muted"), accent=cssVar("--accent"), hot=cssVar("--hot");

  const totalPcsGoal = totalPlanPcs();  // trục Y = TỔNG kế hoạch (đường cong = kế hoạch tích luỹ theo thời gian)
  const span = Math.max(1, schedule.makespan, planRefMakespan());  // trục X phủ hết thời gian của TOÀN BỘ kế hoạch
  const padL = 42, padR = 14, padT = 12, padB = 22;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const sx = t => padL + plotW * (Math.min(span, Math.max(0, t)) / span);
  const sy = pcs => (padT + plotH) - plotH * (Math.min(totalPcsGoal, Math.max(0, pcs)) / Math.max(1, totalPcsGoal));

  // 1. Trục và đường lưới ngang Y (Số sản phẩm Pcs hoàn thành)
  x.strokeStyle = line; x.lineWidth = 1;
  x.fillStyle = muted; x.font = "8.5px 'IBM Plex Mono',monospace"; x.textAlign = "right"; x.textBaseline = "middle";

  const ySteps = [0, 0.5, 1];
  ySteps.forEach(ratio => {
    const yVal = sy(totalPcsGoal * ratio);
    x.beginPath(); x.moveTo(padL, yVal); x.lineTo(w - padR, yVal); x.stroke();
    const lblVal = Math.round(totalPcsGoal * ratio);
    const lblText = lblVal >= 1000 ? `${(lblVal/1000).toFixed(lblVal % 1000 === 0 ? 0 : 1)}k` : `${lblVal}`;
    x.fillText(lblText, padL - 4, yVal);
  });

  // 2. Đường lưới dọc theo Ngày (X-axis date ticks)
  const numDays = Math.ceil(span / 1440);
  const dateLabels = (model && model.dateLabels && model.dateLabels.length > 0) ? model.dateLabels : [];
  const daySkip = numDays > 10 ? 2 : 1;

  for(let d = 0; d <= numDays; d++){
    const dayT = d * 1440;
    if(dayT > span) break;
    const gx = sx(dayT);
    x.strokeStyle = line; x.globalAlpha = 0.5;
    x.beginPath(); x.moveTo(gx, padT); x.lineTo(gx, padT + plotH); x.stroke(); x.globalAlpha = 1;

    if(d % daySkip === 0){
      const dayLbl = dateLabels[d] || `N${d+1}`;
      x.fillStyle = muted; x.font = "8.5px 'IBM Plex Sans',sans-serif"; x.textAlign = "center"; x.textBaseline = "top";
      x.fillText(dayLbl, gx, padT + plotH + 4);
    }
  }

  // 3. Đường cong sản lượng tích luỹ theo thời gian
  const numSamples = Math.min(150, Math.max(40, Math.round(w / 4)));
  const pts = [];
  for(let i = 0; i <= numSamples; i++){
    const curT = (i / numSamples) * span;
    const curPcs = plannedCumAt(curT);
    pts.push({ t: curT, pcs: curPcs, x: sx(curT), y: sy(curPcs) });
  }

  // Tô dải diện tích dưới đường cong
  const grad = x.createLinearGradient(0, padT, 0, padT + plotH);
  grad.addColorStop(0, "rgba(43, 143, 237, 0.28)");
  grad.addColorStop(1, "rgba(43, 143, 237, 0.02)");
  x.fillStyle = grad;
  x.beginPath();
  x.moveTo(pts[0].x, padT + plotH);
  pts.forEach(p => x.lineTo(p.x, p.y));
  x.lineTo(pts[pts.length - 1].x, padT + plotH);
  x.closePath();
  x.fill();

  // Vẽ nét đường cong sản lượng
  x.strokeStyle = accent; x.lineWidth = 2;
  x.beginPath();
  pts.forEach((p, idx) => {
    if(idx === 0) x.moveTo(p.x, p.y);
    else x.lineTo(p.x, p.y);
  });
  x.stroke();

  // 4. Vạch con trỏ thời gian hiện tại
  const curPlayT = chartHoverT != null ? chartHoverT : sim.t;
  const curPlayPcs = plannedCumAt(curPlayT);
  const px = sx(curPlayT);
  const py = sy(curPlayPcs);

  x.strokeStyle = hot; x.lineWidth = 1.5;
  x.beginPath(); x.moveTo(px, padT); x.lineTo(px, padT + plotH); x.stroke();
  x.fillStyle = hot;
  x.beginPath(); x.arc(px, py, 4, 0, Math.PI * 2); x.fill();
  x.strokeStyle = "#ffffff"; x.lineWidth = 1.5; x.stroke();

  // Gắn sự kiện rê chuột (hover tra cứu sản lượng theo ngày/giờ)
  if(!cv._boundHover){
    cv._boundHover = true;
    cv.addEventListener("mousemove", ev => {
      const rect = cv.getBoundingClientRect();
      const mouseX = ev.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, (mouseX - padL) / plotW));
      chartHoverT = ratio * Math.max(1, schedule.makespan, planRefMakespan());
      const pcsH = plannedCumAt(chartHoverT);
      const pctH = Math.round((pcsH / Math.max(1, totalPcsGoal)) * 100);
      const elT = document.getElementById("chartTime");
      const elP = document.getElementById("chartPcs");
      if(elT) elT.textContent = `${formatCalendarTime(chartHoverT)} (${Math.round(chartHoverT)}p)`;
      if(elP) elP.textContent = `${pcsH.toLocaleString()} / ${totalPcsGoal.toLocaleString()} pcs (${pctH}%)`;
      renderOutChart();
    });
    cv.addEventListener("mouseleave", () => {
      chartHoverT = null;
      renderStats();
    });
  }
}

/* ============================================================
   KẾ HOẠCH SẢN XUẤT ĐỘNG THEO NGÀY (KHSX_Dong) — Hỗ trợ lọc theo từng Phân xưởng (KhuVuc)
   ============================================================ */
let khsxSortCol = "stt";
let khsxSortAsc = true;
let khsxSearchQuery = "";
let khsxZoneFilter = "all";
let khsxPriorityFilter = "all";
let khsxStatusFilter = "all";

function computeKHSXDongData(schedule, model){
  if(!schedule || !model || !model.parts) return null;

  let dateLabels = (model.dateLabels && model.dateLabels.length > 0) ? [...model.dateLabels] : [];
  const maxDay = Math.ceil(schedule.makespan / 1440);
  while(dateLabels.length < Math.max(10, maxDay)){
    dateLabels.push(`Ngày ${dateLabels.length + 1}`);
  }

  // Hỗ trợ lọc theo Phân xưởng (KhuVuc): nếu chọn 1 phân xưởng, tính sản lượng tại công đoạn cuối của Part thuộc phân xưởng đó
  const zoneMapByMachineName = new Map();
  (model.machines || []).forEach((mName, mi) => {
    const zName = (model.machineZones && model.machineZones[mi]) ? model.machineZones[mi] : "Xưởng Hàn Spot";
    zoneMapByMachineName.set(strip(mName), zName);
  });

  const lastOps = new Map();
  model.parts.forEach(p => {
    if(khsxZoneFilter && khsxZoneFilter !== "all"){
      const zoneOps = p.ops.filter(o => (o.choices || []).some(ch => zoneMapByMachineName.get(strip(ch.m)) === khsxZoneFilter));
      if(zoneOps.length > 0){
        lastOps.set(p.id, Math.max(...zoneOps.map(o => o.seq)));
      }
    } else {
      const maxSeq = Math.max(...p.ops.map(o => o.seq));
      lastOps.set(p.id, maxSeq);
    }
  });

  const rows = [];
  const dailyColTotals = {};
  dateLabels.forEach(d => { dailyColTotals[d] = 0; });
  let grandTotalPlan = 0;
  let grandTotalActual = 0;
  let grandTotalRem = 0;
  let grandTotalScheduled = 0;

  model.parts.forEach((p, idx) => {
    // Nếu đang lọc theo Phân xưởng mà Part này không có công đoạn nào ở phân xưởng đó thì bỏ qua
    if(khsxZoneFilter && khsxZoneFilter !== "all" && !lastOps.has(p.id)) return;
    const planQ = (p.planQty != null) ? p.planQty : (p.qty || 0);
    const actQ = p.actualQty || 0;
    const remQ = Math.max(0, planQ - actQ);
    const sStart = formatExcelDateValue(p.startDate || "");
    const sDue = formatExcelDateValue(p.dueDateStr || (p.dueDate ? formatClockTime(p.dueDate) : ""));

    const daily = {};
    dateLabels.forEach(d => { daily[d] = 0; });
    let partScheduledPcs = 0;

    schedule.intervals.forEach(iv => {
      if(iv.part === p.id && iv.seq === lastOps.get(p.id)){
        const q = iv.lotQty || (iv.isBatch ? (iv.totalQty || remQ || 1) : 1);
        const st = iv.start;
        const et = iv.end;
        const dur = Math.max(1, et - st);

        const d_start = Math.floor(st / 1440);
        const d_end = Math.floor(et / 1440);

        if(d_start === d_end){
          if(d_start < dateLabels.length){
            const lbl = dateLabels[d_start];
            daily[lbl] += q;
          }
        } else {
          let assigned = 0;
          for(let d = d_start; d <= d_end; d++){
            if(d < dateLabels.length){
              const day_st = d * 1440;
              const day_et = (d + 1) * 1440;
              const overlap = Math.max(0, Math.min(et, day_et) - Math.max(st, day_st));
              if(overlap > 0){
                const lbl = dateLabels[d];
                let q_d = 0;
                if(d === d_end){
                  q_d = Math.max(0, q - assigned);
                } else {
                  q_d = Math.round(q * (overlap / dur));
                  assigned += q_d;
                }
                daily[lbl] += q_d;
              }
            }
          }
        }
        partScheduledPcs += q;
      }
    });

    dateLabels.forEach(d => { dailyColTotals[d] += daily[d]; });
    grandTotalPlan += planQ;
    grandTotalActual += actQ;
    grandTotalRem += remQ;
    grandTotalScheduled += partScheduledPcs;

    rows.push({
      stt: idx + 1,
      part: p.id,
      planQty: planQ,
      actualQty: actQ,
      remQty: remQ,
      priority: p.priority || 2,
      startDate: sStart,
      dueDate: sDue,
      daily,
      totalScheduled: partScheduledPcs,
      isDone: p.isDone
    });
  });

  return {
    dateLabels,
    rows,
    dailyColTotals,
    grandTotalPlan,
    grandTotalActual,
    grandTotalRem,
    grandTotalScheduled
  };
}

function sortKHSXDong(colKey){
  if(khsxSortCol === colKey){
    khsxSortAsc = !khsxSortAsc;
  } else {
    khsxSortCol = colKey;
    khsxSortAsc = true;
  }
  renderKHSXDong();
}

function renderKHSXDong(){
  const wrap = document.getElementById("khsxDongTableWrap");
  if(!wrap) return;
  if(!schedule || !model){
    wrap.innerHTML = `<div style="padding:30px;text-align:center;color:var(--muted)">Chưa có dữ liệu lịch trình. Hãy bấm nút <b>★ CP-SAT (Tối ưu)</b> hoặc <b>⚡ Heuristic</b> để tự động tính toán và phân bổ Kế hoạch Sản xuất Động theo ngày.</div>`;
    return;
  }
  const data = computeKHSXDongData(schedule, model);
  if(!data) return;

  // Lọc dữ liệu theo từ khoá tìm kiếm, mức ưu tiên & trạng thái
  let rows = data.rows.filter(r => {
    if(khsxSearchQuery && !r.part.toLowerCase().includes(khsxSearchQuery.toLowerCase())){
      return false;
    }
    if(khsxPriorityFilter !== "all" && String(r.priority) !== String(khsxPriorityFilter)){
      return false;
    }
    if(khsxStatusFilter === "active" && (!r.totalScheduled || r.totalScheduled <= 0)){
      return false;
    }
    if(khsxStatusFilter === "pending" && (!r.remQty || r.remQty <= 0)){
      return false;
    }
    return true;
  });

  // Cập nhật số lượng đếm trên thanh công cụ
  const filterCountEl = document.getElementById("khsxFilterCount");
  if(filterCountEl){
    filterCountEl.innerHTML = `Hiển thị <b>${rows.length}</b> / ${data.rows.length} Part`;
  }

  // Sắp xếp dữ liệu theo cột được chọn
  rows.sort((a, b) => {
    let vA = a[khsxSortCol];
    let vB = b[khsxSortCol];
    if(a.daily && khsxSortCol in a.daily){
      vA = a.daily[khsxSortCol] || 0;
      vB = b.daily[khsxSortCol] || 0;
    }
    if(typeof vA === "string" && typeof vB === "string"){
      return khsxSortAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
    }
    vA = Number(vA) || 0;
    vB = Number(vB) || 0;
    return khsxSortAsc ? (vA - vB) : (vB - vA);
  });

  // Hàm render tiêu đề cột có hỗ trợ bấm sắp xếp (sortable header)
  const renderTh = (colKey, title, minWidth, align="center", bg=null) => {
    const isSorted = (khsxSortCol === colKey);
    const arrow = isSorted ? (khsxSortAsc ? " ▲" : " ▼") : " <span style='opacity:0.35'>↕</span>";
    const headerBg = bg || (isSorted ? "#1D4ED8" : "#1E3A8A");
    return `<th onclick="sortKHSXDong('${colKey}')" title="Bấm để sắp xếp theo ${title}" style="padding:6px 8px;border:1px solid #3b82f6;min-width:${minWidth};text-align:${align};background:${headerBg};cursor:pointer;user-select:none;transition:background 0.15s">
      ${title}${arrow}
    </th>`;
  };

  let html = `<table style="width:100%;border-collapse:collapse;font-size:11.5px;font-family:var(--font-sans);text-align:center">`;
  html += `<thead><tr style="background:#1E3A8A;color:#ffffff;height:34px;position:sticky;top:0;z-index:2">`;
  html += renderTh("stt", "STT", "35px");
  html += renderTh("part", "Part", "85px", "left");
  html += renderTh("planQty", "Kế hoạch", "70px", "right");
  html += renderTh("actualQty", "Thực tế", "65px", "right");
  html += renderTh("remQty", "Cần SX", "65px", "right");
  html += renderTh("priority", "Ưu tiên", "55px");
  html += renderTh("startDate", "Bắt đầu", "70px");
  html += renderTh("dueDate", "Hạn giao", "70px");
  data.dateLabels.forEach(d => {
    html += renderTh(d, d, "68px", "center", (khsxSortCol === d ? "#1D4ED8" : "#1E40AF"));
  });
  html += renderTh("totalScheduled", "Tổng Đạt", "75px", "right", (khsxSortCol === "totalScheduled" ? "#0E7490" : "#0F766E"));
  html += `</tr></thead><tbody>`;

  let sumPlan = 0, sumActual = 0, sumRem = 0, sumScheduled = 0;
  const sumDaily = {};
  data.dateLabels.forEach(d => { sumDaily[d] = 0; });

  rows.forEach(r => {
    sumPlan += r.planQty;
    sumActual += r.actualQty;
    sumRem += r.remQty;
    sumScheduled += r.totalScheduled;

    html += `<tr style="border-bottom:1px solid var(--line);height:30px">`;
    html += `<td style="padding:4px 6px;border:1px solid var(--line);color:var(--muted)">${r.stt}</td>`;
    html += `<td style="padding:4px 8px;border:1px solid var(--line);text-align:left;font-weight:600;color:var(--fg)">${r.part}</td>`;
    html += `<td style="padding:4px 6px;border:1px solid var(--line);text-align:right;font-family:var(--font-mono)">${r.planQty.toLocaleString()}</td>`;
    html += `<td style="padding:2px 4px;border:1px solid var(--line);text-align:right">
      <input class="thucteInput" data-part="${String(r.part).replace(/"/g,'&quot;')}" type="number" min="0" step="1" value="${r.actualQty}" title="Sửa số lượng thực tế — tự lưu vào file Excel gốc"
        style="width:60px;text-align:right;font-family:var(--font-mono);font-size:11px;background:var(--panel-2);color:var(--fg);border:1px solid var(--line);border-radius:4px;padding:2px 4px">
    </td>`;
    html += `<td style="padding:4px 6px;border:1px solid var(--line);text-align:right;font-family:var(--font-mono);font-weight:600;color:var(--accent)">${r.remQty.toLocaleString()}</td>`;
    html += `<td style="padding:4px 6px;border:1px solid var(--line)"><span class="ptag" style="padding:1px 5px;font-size:10px">${r.priority===1?'P1':(r.priority===3?'P3':'P2')}</span></td>`;
    html += `<td style="padding:4px 6px;border:1px solid var(--line);color:#3b82f6;font-size:11px">${r.startDate || '-'}</td>`;
    html += `<td style="padding:4px 6px;border:1px solid var(--line);color:var(--warn);font-size:11px">${r.dueDate || '-'}</td>`;
    
    data.dateLabels.forEach(d => {
      const q = r.daily[d] || 0;
      sumDaily[d] += q;
      if(q > 0){
        html += `<td style="padding:4px 6px;border:1px solid var(--line);background:rgba(34,197,94,0.12);font-weight:bold;color:var(--good);font-family:var(--font-mono)">${q.toLocaleString()}</td>`;
      } else {
        html += `<td style="padding:4px 6px;border:1px solid var(--line);color:var(--line)">-</td>`;
      }
    });

    html += `<td style="padding:4px 6px;border:1px solid var(--line);font-weight:700;color:#0F766E;font-family:var(--font-mono);background:rgba(15,118,110,0.08);text-align:right">${r.totalScheduled.toLocaleString()}</td>`;
    html += `</tr>`;
  });

  if(rows.length === 0){
    html += `<tr><td colspan="${9 + data.dateLabels.length}" style="padding:24px;color:var(--muted);text-align:center">Không tìm thấy Part nào phù hợp với bộ lọc hiện tại.</td></tr>`;
  }

  // Dòng Tổng Cộng (tính động theo các dòng đang lọc)
  html += `<tr style="background:var(--panel-2);font-weight:bold;height:32px;border-top:2px solid var(--fg)">`;
  html += `<td colspan="2" style="padding:6px 10px;text-align:left;border:1px solid var(--line);color:var(--fg)">TỔNG CỘNG (${rows.length} PART)</td>`;
  html += `<td style="padding:6px;border:1px solid var(--line);text-align:right;font-family:var(--font-mono)">${sumPlan.toLocaleString()}</td>`;
  html += `<td style="padding:6px;border:1px solid var(--line);text-align:right;font-family:var(--font-mono);color:var(--muted)">${sumActual.toLocaleString()}</td>`;
  html += `<td style="padding:6px;border:1px solid var(--line);text-align:right;font-family:var(--font-mono);color:var(--accent)">${sumRem.toLocaleString()}</td>`;
  html += `<td colspan="3" style="border:1px solid var(--line)"></td>`;
  data.dateLabels.forEach(d => {
    const totD = sumDaily[d] || 0;
    html += `<td style="padding:6px;border:1px solid var(--line);font-family:var(--font-mono);color:var(--good);background:rgba(34,197,94,0.06)">${totD > 0 ? totD.toLocaleString() : '-'}</td>`;
  });
  html += `<td style="padding:6px;border:1px solid var(--line);font-family:var(--font-mono);color:#0F766E;background:rgba(15,118,110,0.15);text-align:right">${sumScheduled.toLocaleString()}</td>`;
  html += `</tr>`;

  html += `</tbody></table>`;
  wrap.innerHTML = html;
}

function exportKHSXDongExcel(){
  if(!schedule || !model){
    alert("Chưa có lịch trình để xuất. Hãy bấm giải lịch trước!");
    return;
  }
  const data = computeKHSXDongData(schedule, model);
  if(!data) return;

  const headers = ["Part", "SoLuong", "ThucTe", "UuTien", "BatDau", "HanGiao", ...data.dateLabels];
  const rows = data.rows.map(r => {
    const row = [r.part, r.planQty, r.actualQty, r.priority, r.startDate, r.dueDate];
    data.dateLabels.forEach(d => {
      row.push(r.daily[d] || 0);
    });
    return row;
  });

  const wb = XLSX.utils.book_new();
  const aoa = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "KHSX_Dong");
  XLSX.writeFile(wb, "KeHoach_HanSpot_KHSX_Dong.xlsx");
}

async function saveKHSXDongToExcel(){
  if(!schedule || !model){
    alert("Chưa có lịch trình để lưu. Hãy bấm giải lịch trước!");
    return;
  }
  const data = computeKHSXDongData(schedule, model);
  if(!data) return;

  const headers = ["Part", "SoLuong", "ThucTe", "UuTien", "BatDau", "HanGiao", ...data.dateLabels];
  const rows = data.rows.map(r => {
    const row = [r.part, r.planQty, r.actualQty, r.priority, r.startDate, r.dueDate];
    data.dateLabels.forEach(d => {
      row.push(r.daily[d] || 0);
    });
    return row;
  });

  const targetFile = activeWatchFile || "KeHoach_HanSpot_Tuan_Thang_Mau.xlsx";
  try {
    const resp = await fetch(`${API_BASE}/api/excel/save-khsx-dong`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: targetFile,
        headers,
        rows
      })
    });
    if(!resp.ok){
      const err = await resp.json();
      throw new Error(err.detail || "Lỗi lưu file");
    }
    const res = await resp.json();
    alert("✅ " + res.message);
  } catch(e) {
    console.warn("Save KHSX_Dong failed, exporting via browser:", e);
    exportKHSXDongExcel();
    alert("⚠ Chưa lưu được vào file kế hoạch" + (IS_WEB ? " trên máy chủ" : "") + ": " + e.message
      + "\n\nĐã tải file Excel KHSX_Dong về máy của bạn để không mất dữ liệu.");
  }
}
/* ===== Sửa trực tiếp "Thực tế" trên web → lưu vào file Excel gốc ===== */
let _thucteSaveTimer = null;
// Chỉ ghi những part NGƯỜI NÀY vừa sửa -> không đè số Thực tế người khác vừa nhập cho part khác
const _dirtyThucTe = new Set();
function setKhsxSaveStatus(msg, kind){
  const el = document.getElementById("khsxSaveStatus");
  if(!el) return;
  const color = kind === "ok" ? "var(--good)" : (kind === "err" ? "var(--bad)" : "var(--accent)");
  el.innerHTML = `<span style="color:${color}">${msg}</span>`;
}
function onEditThucTe(partName, raw){
  if(!model || !model.parts) return;
  const p = model.parts.find(x => x.id === partName);
  if(!p) return;
  let v = Math.max(0, Math.round(Number(raw) || 0));
  p.actualQty = v;
  p.qty = Math.max(0, (p.planQty || 0) - v);     // phần còn lại cần xếp lịch
  p.isDone = (v >= (p.planQty || 0) && v > 0);
  _dirtyThucTe.add(p.id);
  // Cập nhật ngay trên giao diện (Cần SX, % tiến độ, KPI, danh sách part)
  renderKHSXDong();
  if(typeof renderStats === "function") renderStats();
  if(typeof renderData === "function") renderData();
  // Tự lưu xuống Excel (gộp nhiều lần sửa trong 700ms)
  queueThucTeSave();
  // Tự giải lại lịch (Heuristic) nếu bật tuỳ chọn
  queueResolveFromThucTe();
}
let _thucteResolveTimer = null;
function queueResolveFromThucTe(){
  const auto = document.getElementById("khsxAutoSolve");
  if(auto && !auto.checked) return;
  clearTimeout(_thucteResolveTimer);
  _thucteResolveTimer = setTimeout(() => {
    if(!model) return;
    const prev = (document.getElementById("khsxSaveStatus")||{}).textContent || "";
    setKhsxSaveStatus("🔄 Đang giải lại lịch theo Thực tế mới...", "info");
    try{
      runSolve(); // Heuristic client-side (nhanh); bấm ★ CP-SAT nếu cần tối ưu
      // Giữ lại cảnh báo lưu lỗi (nếu có) thay vì khẳng định đã lưu
      if(prev.indexOf("lỗi") >= 0) setKhsxSaveStatus(prev + " · đã giải lại lịch", "err");
      else setKhsxSaveStatus(`✓ Đã lưu & giải lại lịch lúc ${new Date().toLocaleTimeString()}`, "ok");
    }catch(e){
      setKhsxSaveStatus("⚠ Giải lại lỗi: " + e.message, "err");
    }
  }, 950); // chờ lâu hơn save để gộp nhiều lần sửa
}
function queueThucTeSave(){
  setKhsxSaveStatus("⏳ Đang lưu Thực tế vào Excel...", "info");
  clearTimeout(_thucteSaveTimer);
  _thucteSaveTimer = setTimeout(saveActualsToExcel, 700);
}
async function saveActualsToExcel(){
  if(!model || !model.parts) return;
  const sentIds = [..._dirtyThucTe];
  const actuals = model.parts.filter(p => _dirtyThucTe.has(p.id)).map(p => ({ part: p.id, actual: p.actualQty || 0 }));
  if(!actuals.length){ setKhsxSaveStatus("✓ Không có thay đổi cần lưu", "ok"); return; }
  const targetFile = activeWatchFile || "KeHoach_HanSpot_Tuan_Thang_Mau.xlsx";
  try{
    const resp = await fetch(`${API_BASE}/api/excel/save-actual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: targetFile, actuals })
    });
    if(!resp.ok){
      const e = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(e.detail || "Lỗi lưu");
    }
    const res = await resp.json();
    sentIds.forEach(id => _dirtyThucTe.delete(id));   // đã ghi xong; lỗi thì giữ lại để lần sau ghi tiếp
    // Tránh watcher nạp lại file ngay sau khi chính ta vừa ghi
    if(res.mtime) lastWatchMtime = res.mtime;
    setKhsxSaveStatus(`✓ Đã lưu vào ${escHtml(res.filename || targetFile)}${IS_WEB ? " (máy chủ)" : ""} lúc ${new Date().toLocaleTimeString()}`, "ok");
  }catch(e){
    setKhsxSaveStatus("⚠ Lưu lỗi: " + escHtml(e.message) + (IS_WEB ? "" : " — cần chạy app qua run.bat (có server)."), "err");
  }
}

function renderMachList(){
  const host=document.getElementById("machList");
  if(host.childElementCount!==model.machines.length){
    host.innerHTML=""; model.machines.forEach((name,i)=>{
      const d=document.createElement("div"); d.className="mrow"; d.dataset.i=i;
      d.innerHTML=`<div class="mn">${name}</div><div class="mbar"><div class="fill"></div></div><div class="mu"></div>`;
      host.appendChild(d);
    });
  }
  const t=sim.t;
  [...host.children].forEach(d=>{ const i=+d.dataset.i;
    const iv=activeInterval(i,t); const bar=d.querySelector(".mbar"); const fill=d.querySelector(".fill"); const mu=d.querySelector(".mu");
    const machIvs = (schedule.perMachine && schedule.perMachine[i]) ? schedule.perMachine[i] : [];
    const opsDone = machIvs.filter(v=>v.end<=t).length;
    const opsTot = machIvs.length;
    
    // Tính số sản phẩm (Pcs) hoàn thành trên máy này
    let mPcsTot = 0;
    let mPcsDone = 0;
    machIvs.forEach(v => {
      // Số chiếc máy hàn ở mỗi lô = lotQty (cỡ lô con), KHÔNG phải totalQty (cả part)
      const q = (v.lotQty != null) ? v.lotQty : (v.isBatch ? (v.totalQty || 1) : 1);
      mPcsTot += q;
      if(t >= v.end) mPcsDone += q;
      else if(t > v.start) mPcsDone += Math.round(q * (t - v.start) / Math.max(1, v.end - v.start));
    });

    const u=t>0?busyUntil(i,t)/t:0;
    bar.classList.toggle("active",!!iv);
    fill.style.width=Math.round(u*100)+"%";

    if(mPcsTot > opsTot){
      mu.innerHTML=`<b>${mPcsDone.toLocaleString()}</b>/${mPcsTot.toLocaleString()} pcs <span style="font-size:9.5px;color:var(--muted)">(${opsDone}/${opsTot} lô)</span> · ${Math.round(u*100)}%`;
    } else {
      mu.innerHTML=`<b>${opsDone}</b>/${opsTot} · ${Math.round(u*100)}%`;
    }
  });
}

/* ============================================================
   VÒNG LẶP MÔ PHỎNG
   ============================================================ */
let activeTab="three", lastTs=0;
function loop(ts){
  const dt=(ts-lastTs)/1000||0; lastTs=ts;
  if(schedule){
    if(sim.liveMode){
      // Bám sát đồng hồ thật: t = thời điểm hiện tại trên timeline (theo Giờ gốc t=0)
      sim.t = Math.max(0, Math.min(schedule.makespan, nowTimelineMin()));
      syncScrub();
    } else if(sim.playing){
      if(sim.realRatio>0){
        sim.t += dt*(sim.realRatio/60); // playback tỉ lệ thực: 60× = 1 phút/giây
        if(sim.t>=schedule.makespan){ sim.t=schedule.makespan; sim.playing=false; document.getElementById("playBtn").textContent="▶"; }
      } else {
        sim.t += dt*sim.speed*(schedule.makespan/18); // demo ~18s/vòng ở 1x
        if(sim.t>=schedule.makespan){ sim.t=0; } // lặp
      }
      syncScrub();
    }
  }
  // render view đang mở
  if(activeTab==="three"&&THREE_OK) renderThree();
  else if(activeTab==="gantt") renderGantt();
  renderStats();
  document.getElementById("tNow").textContent=Math.round(sim.t);
  const elClock = document.getElementById("tClock");
  if(elClock) elClock.textContent = (sim.liveMode ? "🔴 LIVE " : "") + formatClockTime(sim.t);
  requestAnimationFrame(loop);
}
function syncScrub(){ document.getElementById("scrub").value=Math.round(1000*sim.t/Math.max(1,schedule.makespan)); }

/* ============================================================
   WIRING & SOLVING
   ============================================================ */
function applySchedule(sched, solverName){
  schedule=sched;
  sim.t=Math.round(schedule.makespan*0.35); sim.playing=false;
  loadExec(); // nạp nhật ký thực tế đã lưu cho lịch này (nếu có)
  document.getElementById("playBtn").textContent="▶";
  document.getElementById("tEnd").textContent=Math.round(schedule.makespan);
  document.getElementById("scrub").max=1000; syncScrub();
  if(threeReady) buildMachines();
  document.getElementById("machList").innerHTML="";
  renderStats();
  renderKHSXDong();
  if(activeTab === "wip") renderWipPlan();
  if(activeTab === "workers") renderWorkersPlan();
  const st=document.getElementById("solverStatus");
  if(st){
    let tardyDetails = [];
    let tardyParts = 0;
    if(sched.intervals && model.parts){
      // Hoàn thành của part = thời điểm muộn nhất trong TẤT CẢ lô con của part
      const partEnd = new Map();
      sched.intervals.forEach(iv => { partEnd.set(iv.part, Math.max(partEnd.get(iv.part)||0, iv.end)); });
      model.parts.forEach(p => {
        if(p.dueDate){
          const endT = partEnd.get(p.id) || 0;
          if(endT > p.dueDate){
            tardyParts++;
            const diffMin = Math.round(endT - p.dueDate);
            const diffHours = (diffMin / 60).toFixed(1);
            tardyDetails.push(`• <b>${p.id}</b>: Xong lúc <b>${formatClockTime(endT)}</b> (Hạn: ${formatClockTime(p.dueDate)}) ➔ <span style="color:var(--bad)">Trễ ${diffHours}h (${diffMin}p)</span>`);
          }
        }
      });
    }

    if(tardyParts > 0){
      st.innerHTML = `
        <div style="background:rgba(216,58,58,0.12);border:1px solid var(--bad);border-radius:6px;padding:8px;margin-top:6px">
          <div style="color:var(--bad);font-weight:bold;font-size:12.5px;margin-bottom:4px">
            ⚠ KẾ HOẠCH KHÔNG PHÙ HỢP: Có ${tardyParts} Part vượt quá thời hạn giao!
          </div>
          <div style="font-size:11px;color:var(--fg);line-height:1.6;max-height:85px;overflow-y:auto;background:var(--panel-2);padding:4px 6px;border-radius:4px">
            ${tardyDetails.join("<br>")}
          </div>
          <div style="margin-top:5px;font-size:11px;color:var(--muted)">
            💡 <b>Giải pháp:</b> Mở thêm ca (HC ➔ S1+S2 hoặc 24/7), bổ sung máy hàn phụ hoặc điều chỉnh lại hạn giao.
          </div>
          <button onclick="setTab('khsxDong')" class="btn" style="width:100%;margin-top:7px;padding:5px 8px;font-size:11.5px;background:#1E40AF;border:none;display:flex;align-items:center;justify-content:center;gap:4px">
            📋 Xem Bảng Phân Bổ Ngày (KHSX_Dong)
          </button>
        </div>
      `;
    } else {
      st.innerHTML = `
        <div style="background:rgba(26,158,106,0.12);border:1px solid var(--good);border-radius:6px;padding:8px;margin-top:6px">
          <span style="color:var(--good);font-weight:bold;font-size:12.5px">✓ Kế hoạch hoàn toàn khả thi: 100% Part giao đúng hạn!</span>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">
            Makespan: <b>${sched.makespan}p</b> (${formatClockTime(sched.makespan)}) · Bộ giải: <b>${solverName}</b> (${sched.wallTime||0}s)
          </div>
          <button onclick="setTab('khsxDong')" class="btn" style="width:100%;margin-top:7px;padding:5px 8px;font-size:11.5px;background:#1E40AF;border:none;display:flex;align-items:center;justify-content:center;gap:4px">
            📋 Xem Bảng Phân Bổ Ngày (KHSX_Dong)
          </button>
        </div>
      `;
    }

    // Cảnh báo từ bộ giải (vd: tự giảm cỡ lô con cho vừa khung ca)
    if(Array.isArray(sched.warnings) && sched.warnings.length){
      const items = sched.warnings.map(w => `• ${w}`).join("<br>");
      st.innerHTML += `
        <div style="background:rgba(214,158,46,0.12);border:1px solid #D69E2E;border-radius:6px;padding:8px;margin-top:6px">
          <div style="color:#B7791F;font-weight:bold;font-size:12px;margin-bottom:3px">⚠ Lưu ý điều chỉnh lô sản xuất (${sched.warnings.length})</div>
          <div style="font-size:11px;color:var(--fg);line-height:1.6;max-height:90px;overflow-y:auto;background:var(--panel-2);padding:4px 6px;border-radius:4px">${items}</div>
        </div>
      `;
    }
  }
}

function runSolve(extraOpts = {}){
  const breaks = getActiveBreaks();
  const elSubLot = document.getElementById("subLotSize");
  const sublotSize = elSubLot ? parseInt(elSubLot.value, 10) : 500;
  const opts = {
    objective: document.getElementById("objective").value,
    setup: +document.getElementById("setup").value || 0,
    sublotSize,
    breaks,
    downtimes,
    minStartTime: extraOpts.minStartTime || 0,
    frozenIntervals: extraOpts.frozenIntervals || []
  };
  const sched = solve(model, opts);
  applySchedule(sched, "Heuristic");
}

const API_BASE = window.location.origin.startsWith("http") ? window.location.origin : "http://localhost:8000";
// Bản web (GitHub Pages + SharePoint) có window.APP_CONFIG; bản chạy tại máy (run.bat) thì không.
const IS_WEB = !!window.APP_CONFIG;
if(!IS_WEB){ const _ub = document.getElementById("userBadge"); if(_ub) _ub.style.display = "none"; } // bản tại máy không có đăng nhập
const BACKEND_HINT = IS_WEB
  ? "Máy chủ tính toán có thể đang khởi động lại (~1 phút) — hãy thử lại."
  : "Hãy chạy <b>run.bat</b> để bật server.";
function escHtml(v){
  return String(v === null || v === undefined ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function runSolveCpsat(extraOpts = {}){
  const btn=document.getElementById("solveCpsatBtn");
  const st=document.getElementById("solverStatus");
  if(btn) btn.disabled=true;

  const elLimit = document.getElementById("cpTimeLimit");
  const timeLimit = elLimit ? parseFloat(elLimit.value) : 30.0;
  if(st) st.innerHTML=`<span style="color:var(--accent)">Đang giải tối ưu bằng OR-Tools CP-SAT (Python)... (Thời gian: ${timeLimit}s)</span>`;

  try{
    const breaks = getActiveBreaks();
    const activeShift = getActiveShift();
    const shiftLen = activeShift ? ((activeShift.endH * 60 + activeShift.endM) - (activeShift.startH * 60 + activeShift.startM) + 1440) % 1440 : 540;
    const elSubLot = document.getElementById("subLotSize");
    const sublotSize = elSubLot ? parseInt(elSubLot.value, 10) : 500;

    // Thu thập cấu hình ca làm việc & giờ nghỉ riêng từng máy
    const machineShifts = model.machines.map((m, i) => {
      const sh = getMachineShiftInfo(i);
      return {
        mi: i,
        m: m,
        code: sh.code || (sh.label ? sh.label.split(":")[0] : "HC"),
        shift_length: sh.shiftLength || 540,
        breaks: sh.breaks || []
      };
    });

    const payload = {
      model,
      time_limit: timeLimit,
      sublot_size: sublotSize,
      breaks,
      downtimes,
      min_start_time: extraOpts.minStartTime || 0,
      frozen_intervals: extraOpts.frozenIntervals || [],
      shift_length: shiftLen > 0 ? shiftLen : 540,
      machine_shifts: machineShifts
    };
    const res=await fetch(`${API_BASE}/api/solve`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload)
    });
    if(!res.ok){
      const err=await res.json().catch(()=>({detail:res.statusText}));
      throw new Error(err.detail||"Lỗi từ server CP-SAT");
    }
    const sched=await res.json();
    applySchedule(sched, `CP-SAT (${sched.status})`);
  }catch(err){
    if(st) st.innerHTML=`<span style="color:var(--bad)">⚠ Chưa giải được bằng CP-SAT: ${escHtml(err.message)}<br>${BACKEND_HINT} Trong lúc chờ có thể dùng nút <b>⚡ Heuristic</b>.</span>`;
  }finally{
    if(btn) btn.disabled=false;
  }
}

function addDowntime(){
  const machSelect = document.getElementById("dtMach");
  const sInput = document.getElementById("dtStart");
  const eInput = document.getElementById("dtEnd");
  const rInput = document.getElementById("dtReason");
  const mi = parseInt(machSelect.value);
  const s = parseInt(sInput.value);
  const e = parseInt(eInput.value);
  const reason = rInput.value.trim() || "Sự cố / Bảo trì";
  if(isNaN(mi) || isNaN(s) || isNaN(e) || e <= s){
    alert("Vui lòng nhập Từ phút và Đến phút hợp lệ (Đến phút > Từ phút)!");
    return;
  }
  const machName = model.machines[mi];
  downtimes.push({ id: Date.now(), mi, m: machName, start: s, end: e, reason });
  sInput.value = "";
  eInput.value = "";
  rInput.value = "";
  renderDowntimes();
  runSolve();
}

function removeDowntime(id){
  downtimes = downtimes.filter(d => d.id !== id);
  renderDowntimes();
  runSolve();
}

function renderDowntimes(){
  const host = document.getElementById("dtList");
  if(!host) return;
  if(downtimes.length === 0){
    host.innerHTML = '<span style="color:var(--faint);font-style:italic">Chưa có sự cố nào. Tất cả máy hoạt động bình thường.</span>';
    return;
  }
  host.innerHTML = downtimes.map(d => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:3px 6px;background:var(--panel);border-radius:4px;border:1px solid var(--line);margin-bottom:3px">
      <span><b>${d.m}</b>: ${d.start}p ➔ ${d.end}p (${formatClockTime(d.start)}-${formatClockTime(d.end)}) · <i>${d.reason}</i></span>
      <button style="border:none;background:none;color:var(--bad);cursor:pointer;font-weight:bold" onclick="removeDowntime(${d.id})">✕</button>
    </div>
  `).join("");
}

function runDynamicReschedule(){
  if(!schedule) return;
  const tNow = Math.round(sim.t);
  sim.playing = false;
  document.getElementById("playBtn").textContent = "▶";
  
  const frozen = [];
  schedule.intervals.forEach(iv => {
    // Đóng băng lô đã HÀN XONG thực tế, hoặc theo kế hoạch đã kết thúc trước "bây giờ"
    if(iv.end <= tNow || execGet('ops', opKeyOf(iv))){
      frozen.push(iv);
    }
  });

  const st = document.getElementById("solverStatus");
  if(st){
    st.innerHTML = `<span style="color:var(--hot);font-weight:600">🔄 Đang tái điều độ từ phút ${tNow} (${formatClockTime(tNow)})... Đóng băng ${frozen.length} thao tác đã xong.</span>`;
  }

  runSolveCpsat({ minStartTime: tNow, frozenIntervals: frozen });
}
function populateWorkshopFilterDropdowns(m){
  const zones = [...new Set((m && m.machineZones ? m.machineZones : []).filter(Boolean))];
  const whByZone = new Map();
  (m && m.warehouses ? m.warehouses : []).forEach(w => {
    if(w.zone) whByZone.set(w.zone, w);
  });

  // XƯỞNG SPOT TOÀN DIỆN: 1 Xưởng duy nhất chứa toàn bộ máy Laser, Dập, Spot, MAG.
  // Ẩn hoàn toàn các dropdown phân chia nhiều xưởng rời rạc.
  const khsxZoneSel = document.getElementById("khsxZoneFilter");
  if(khsxZoneSel){
    khsxZoneFilter = "all";
    khsxZoneSel.style.display = "none";
  }

  const wipZoneSel = document.getElementById("wipZoneFilter");
  if(wipZoneSel){
    wipZoneFilter = "all";
    wipZoneSel.style.display = "none";
  }

  const workerZoneSel = document.getElementById("workerZoneFilter");
  if(workerZoneSel){
    workerZoneFilter = "all";
    workerZoneSel.style.display = "none";
  }
}

function loadModel(m){
  model=m;
  // Số Thực tế luôn lấy từ file Excel/SharePoint (nguồn duy nhất). Dọn bản lưu tạm cũ.
  try { localStorage.removeItem("xuong_spot_actuals"); } catch(e) {}
  computeLayout(model); renderData();
  populateWorkshopFilterDropdowns(model);
  const ws=[...(m.warnings||[])];
  if(model._layoutWarn) ws.push("Một số máy chưa đủ toạ độ X,Y — đang tự xếp lưới. Điền X,Y cho TẤT CẢ máy để dùng sơ đồ tùy chỉnh.");
  showWarnings(ws);
  if(!threeReady&&THREE_OK) initThree();
  else if(threeReady) buildMachines();
  runSolve();
}
/* ============================================================
   WIP / VỊ TRÍ CHỜ BÁN THÀNH PHẨM — Kế hoạch gọi hàng
   - Gọi hàng ra khu chờ theo ca (ngày), không vượt sức chứa khu chờ.
   - Mỗi máy giữ buffer hợp lý; hàn hết lô mới gọi lô kế tiếp (kéo/kanban).
   ============================================================ */
function wipDayLabel(d){ return (model && model.dateLabels && model.dateLabels[d]) ? model.dateLabels[d] : ("Ngày " + (d + 1)); }
function wipShiftCode(mi){ const sh = getMachineShiftInfo(mi); return sh.key || "HC"; }
// Giờ bắt đầu ca (phút trong ngày) của máy — ví dụ S6=360 (06:00), HC=480 (08:00), S7=1080 (18:00)
function wipShiftStartMin(mi){ const sh = getMachineShiftInfo(mi); return (sh.startH || 0) * 60 + (sh.startM || 0); }
// Quy đổi phút nội bộ của bộ giải (ca coi như bắt đầu 00:00) → GIỜ ĐỒNG HỒ THẬT theo ca của máy.
// Bộ giải (cả Heuristic lẫn CP-SAT) xếp việc trong [0, shift_length] tính từ nửa đêm và BỎ QUA giờ vào ca,
// nên phải cộng lại giờ vào ca của từng máy để ra giờ thực (S6 → 06:00 thay vì 00:00).
function realClock(mi, m){
  if(m == null) return 0;
  const dayIdx = Math.floor(m / 1440);
  const within = m - dayIdx * 1440;
  return dayIdx * 1440 + wipShiftStartMin(mi) + within;
}

/* ===== Thời gian thực (real-time) cho WIP ===== */
function wipLeadMinutes(){
  const v = parseInt((document.getElementById("wipLead")||{}).value, 10);
  return (isNaN(v) || v < 0) ? 60 : v;
}
function parseLabelDM(lbl){
  if(!lbl) return null;
  const m = String(lbl).match(/(\d{1,2})[-/]([A-Za-z]{3,}|\d{1,2})/);
  if(!m) return null;
  const day = parseInt(m[1], 10);
  const ms = m[2].toLowerCase();
  const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  let month = parseInt(ms, 10);
  if(isNaN(month)) month = months.indexOf(ms.slice(0,3)) + 1;
  if(!month || month < 1) return null;
  return { day, month };
}
// Mốc thời gian thực (ms) ứng với t=0 trên timeline
function timelineAnchorMs(){
  const el = document.getElementById("wipAnchor");
  if(el && el.value){ const d = new Date(el.value); if(!isNaN(d.getTime())) return d.getTime(); }
  const lbl = (model && model.dateLabels && model.dateLabels[0]) ? model.dateLabels[0] : null;
  const dm = parseLabelDM(lbl);
  const now = new Date();
  if(dm) return new Date(now.getFullYear(), dm.month - 1, dm.day, 0, 0, 0, 0).getTime();
  const d0 = new Date(); d0.setHours(0,0,0,0); return d0.getTime();
}
function nowTimelineMin(){ return (Date.now() - timelineAnchorMs()) / 60000; }
function fmtDur(mins){
  mins = Math.max(0, Math.round(mins));
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? (h + "h" + String(m).padStart(2,"0")) : (m + "p");
}
// Trạng thái một đợt gọi so với thời gian thực. need=giờ cần hàng, call=need-lead (giờ gọi muộn nhất)
function wipCallStatus(need, call){
  const now = nowTimelineMin();
  if(now >= need) return { k:"done", label:"✓ đã qua", color:"var(--muted)" };
  if(now >= call) return { k:"due",  label:"🔔 GỌI NGAY", color:"#dc2626" };
  return { k:"up", label:"⏳ còn " + fmtDur(call - now), color:"#b7791f" };
}
// Giờ cần có hàng của một lô = GIỜ THẬT khi máy bắt đầu hàn (đã cộng giờ vào ca)
function wipNeedOf(iv){ return (iv && iv._rs != null) ? iv._rs : realClock(iv.mi, iv.start); }
// Lịch các đợt gọi: trả [{wave, need, call, pcs}] — need=giờ thật cần có hàng, call=need-lead
function wipWaveSchedule(lots, capacity, total, lead){
  const sorted = (lots || []).slice().sort((a,b) => wipNeedOf(a) - wipNeedOf(b));
  const firstNeed = sorted.length ? wipNeedOf(sorted[0]) : 0;
  const cap = (capacity && capacity > 0) ? capacity : Infinity;
  if(cap === Infinity){
    return [{ wave:1, need:firstNeed, call:Math.max(0, firstNeed - lead), pcs: total }];
  }
  const waves = [];
  let cum = 0;
  for(const iv of sorted){
    cum += (iv.lotQty || 0);
    const nw = Math.ceil(cum / cap);
    while(waves.length < nw){
      const need = wipNeedOf(iv);
      waves.push({ wave: waves.length + 1, need, call: Math.max(0, need - lead), pcs: 0 });
    }
  }
  for(let w = 0; w < waves.length; w++){
    waves[w].pcs = Math.min(cap, Math.max(0, total - w * cap));
  }
  return waves.length ? waves : [{ wave:1, need:firstNeed, call:Math.max(0, firstNeed - lead), pcs: total }];
}
function wipWavesText(waveList){
  // "05:00 (1.000) · 09:30 (1.000)" — giờ gọi + sl mỗi đợt
  return waveList.map(w => `${formatClockTime(w.call)}`).join(" · ");
}

/* ===== GHI NHẬN THỰC TẾ (actuals) — nơi cập nhật dữ liệu khi chạy thời gian thực =====
   exec.staging[ S|day|wave ]   = {at,qty,ts}  → đã cấp BTP ra KHU CHỜ
   exec.machine[ M|day|mi|wave ]= {at,qty,ts}  → đã CHUYỂN BTP ra VỊ TRÍ MÁY
   exec.ops[ O|mi|part|unit|seq|start ]= {at,qty,ts} → đã HÀN XONG lô (khoảng đã hoàn thành)
   Lưu vào localStorage theo "chữ ký" của lịch; dùng cho hiển thị, xuất Excel và tái điều độ. */
let exec = { ops:{}, staging:{}, machine:{} };
function execPlanKey(){
  if(!schedule || !model) return "none";
  const tp = (schedule.intervals||[]).reduce((s,iv)=>s+(iv.lotQty||0),0);
  return [ (model.dateLabels&&model.dateLabels[0])||"d", (model.machines||[]).length, Math.round(schedule.makespan||0), (schedule.intervals||[]).length, tp ].join("|");
}
function execStorageKey(){ return "wipExec::" + execPlanKey(); }
function loadExec(){
  exec = { ops:{}, staging:{}, machine:{} };
  try{
    const raw = localStorage.getItem(execStorageKey());
    if(raw){ const o = JSON.parse(raw); exec.ops=o.ops||{}; exec.staging=o.staging||{}; exec.machine=o.machine||{}; }
  }catch(e){}
}
function saveExec(){ try{ localStorage.setItem(execStorageKey(), JSON.stringify(exec)); }catch(e){} }
function execGet(type,key){ return (exec[type]||{})[key] || null; }
function opKeyOf(iv){ return `O|${iv.mi}|${iv.part}|${iv.unit}|${iv.seq}|${Math.round(iv.start)}`; }
function execToggle(type,key,qty){
  if(!exec[type]) exec[type] = {};
  if(exec[type][key]){ delete exec[type][key]; }
  else { exec[type][key] = { at: Math.round(nowTimelineMin()), qty: +qty||0, ts: Date.now() }; }
  saveExec();
  if(activeTab==="wip") renderWipPlan();
}
// Nút xác nhận / hoàn tác cho một mốc thực tế
function execBtn(type,key,qty){
  const g = execGet(type,key);
  if(g){
    return `<span style="color:var(--good);font-weight:700;white-space:nowrap">✓ ${formatClockTime(g.at)}</span> <button class="execBtn" data-type="${type}" data-key="${key}" data-qty="${qty}" title="Hoàn tác" style="border:none;background:none;color:var(--muted);cursor:pointer;font-size:12px;padding:0 2px">↶</button>`;
  }
  return `<button class="execBtn" data-type="${type}" data-key="${key}" data-qty="${qty}" style="border:1px solid var(--line);background:var(--panel-2);color:var(--fg);border-radius:5px;padding:2px 7px;cursor:pointer;font-size:10.5px;white-space:nowrap">✓ Xác nhận</button>`;
}
// Xuất nhật ký thực tế ra Excel
function exportExecExcel(){
  try{
    const wb = XLSX.utils.book_new();
    const rows = [["Loại", "Mốc", "Ngày (ca)", "Máy", "Đợt/Part", "SL (pcs)", "Giờ thực tế (trên lịch)", "Giờ ghi (đồng hồ thật)"]];
    const mName = mi => (model && model.machines && model.machines[mi]) || ("M"+mi);
    Object.entries(exec.staging).forEach(([k,v])=>{ const p=k.split("|"); rows.push(["Cấp ra khu chờ", k, wipDayLabel(+p[1]), "—", "Đợt "+p[2], v.qty, formatClockTime(v.at), new Date(v.ts).toLocaleString("vi-VN")]); });
    Object.entries(exec.machine).forEach(([k,v])=>{ const p=k.split("|"); rows.push(["Chuyển ra máy", k, wipDayLabel(+p[1]), mName(+p[2]), "Đợt "+p[3], v.qty, formatClockTime(v.at), new Date(v.ts).toLocaleString("vi-VN")]); });
    Object.entries(exec.ops).forEach(([k,v])=>{ const p=k.split("|"); rows.push(["Hàn xong", k, "—", mName(+p[1]), p[2]+" #"+p[3]+" (CĐ"+p[4]+")", v.qty, formatClockTime(v.at), new Date(v.ts).toLocaleString("vi-VN")]); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "NhatKy_ThucTe");
    XLSX.writeFile(wb, "NhatKy_ThucTe_WIP.xlsx");
  }catch(err){ alert("Không xuất được nhật ký: " + err.message); }
}
function clearExec(){
  if(!confirm("Xoá toàn bộ nhật ký thực tế của lịch này?")) return;
  exec = { ops:{}, staging:{}, machine:{} }; saveExec();
  if(activeTab==="wip") renderWipPlan();
}
// Cập nhật thanh đồng hồ thời gian thực (gọi mỗi giây)
function updateWipNowBar(){
  const clk = document.getElementById("wipNowClock");
  if(!clk) return;
  const anchorEl = document.getElementById("wipAnchorLbl");
  const leadEl = document.getElementById("wipLeadLbl");
  const nm = nowTimelineMin();
  const real = new Date();
  const hh = String(real.getHours()).padStart(2,"0");
  const mm = String(real.getMinutes()).padStart(2,"0");
  const ss = String(real.getSeconds()).padStart(2,"0");
  let onPlan = "";
  if(nm < 0) onPlan = " · (trước kế hoạch)";
  else if(model && schedule && nm > (schedule.makespan || 0)) onPlan = " · (sau kế hoạch)";
  else onPlan = ` · trên lịch: ${formatClockTime(nm)}`;
  clk.textContent = `${hh}:${mm}:${ss}${onPlan}`;
  if(anchorEl){ const a = new Date(timelineAnchorMs()); anchorEl.textContent = a.toLocaleString("vi-VN", {day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}); }
  if(leadEl) leadEl.textContent = wipLeadMinutes() + "p";
}

let wipZoneFilter = "all";

function getMachineWarehouseInfo(mi){
  const zName = (model && model.machineZones && model.machineZones[mi]) ? model.machineZones[mi] : "Xưởng Hàn Spot";
  const wh = (model && model.warehouses ? model.warehouses : []).find(w => w.zone === zName);
  const whCapMatch = (wh && wh.power) ? String(wh.power).match(/(\d[\d,.]*)/) : null;
  const whCap = whCapMatch ? parseInt(whCapMatch[1].replace(/[,.]/g, ""), 10) : 0;
  return {
    zone: zName,
    whName: wh ? wh.name : ("Kho " + zName),
    whPower: wh ? (wh.power || "") : "",
    whCap: whCap > 0 ? whCap : 0
  };
}

function computeWipPlan(){
  if(!schedule || !model) return null;
  const machines = model.machines;
  let stagingCap = Math.max(0, parseInt((document.getElementById("wipStagingCap")||{}).value, 10) || 0);
  // Nếu lọc riêng 1 Phân xưởng có Kho riêng khai báo sức chứa (CongSuat = 2500 pcs...), ưu tiên hiển thị sức chứa kho của xưởng đó
  let activeWhLabel = "Tất cả Kho BTP";
  if(wipZoneFilter && wipZoneFilter !== "all"){
    const wh = (model.warehouses || []).find(w => w.zone === wipZoneFilter);
    if(wh){
      activeWhLabel = `${wh.name} (${wipZoneFilter})`;
      const mCap = String(wh.power || "").match(/(\d[\d,.]*)/);
      if(mCap){
        const parsedCap = parseInt(mCap[1].replace(/[,.]/g, ""), 10);
        if(parsedCap > 0) stagingCap = parsedCap;
      }
    } else {
      activeWhLabel = wipZoneFilter;
    }
  }
  const machineBuffer = Math.max(0, parseInt((document.getElementById("wipMachineBuffer")||{}).value, 10) || 0);
  const lead = wipLeadMinutes();
  const ivs = (schedule.intervals || []).filter(iv => {
    if(!iv || !(iv.end > iv.start) || iv.mi == null) return false;
    if(wipZoneFilter && wipZoneFilter !== "all"){
      const mZone = (model.machineZones && model.machineZones[iv.mi]) ? model.machineZones[iv.mi] : "Xưởng Hàn Spot";
      if(mZone !== wipZoneFilter) return false;
    }
    return true;
  });
  // Gắn GIỜ THẬT (theo ca của máy) cho mỗi lô: _rs=bắt đầu hàn, _re=hàn xong
  ivs.forEach(iv => { iv._rs = realClock(iv.mi, iv.start); iv._re = realClock(iv.mi, iv.end); });
  const dayOf = t => Math.floor(t / 1440);  // áp dụng cho GIỜ THẬT (_rs)

  // Danh sách hàng chờ tại từng máy (theo thời gian thật)
  const perMachine = machines.map(() => []);
  ivs.forEach(iv => { if(perMachine[iv.mi]) perMachine[iv.mi].push(iv); });
  perMachine.forEach(a => a.sort((x, y) => x._rs - y._rs));

  // (A) Gọi hàng tới từng máy — gộp theo (ngày × máy), kèm lịch giờ gọi từng đợt
  const cellMap = new Map();
  ivs.forEach(iv => {
    const d = dayOf(iv._rs), k = d + "|" + iv.mi;
    if(!cellMap.has(k)) cellMap.set(k, { day: d, mi: iv.mi, pcs: 0, lots: 0, parts: new Set(), ivs: [] });
    const o = cellMap.get(k); o.pcs += (iv.lotQty || 0); o.lots++; o.parts.add(iv.part); o.ivs.push(iv);
  });
  const buf = machineBuffer > 0 ? machineBuffer : Infinity;
  const machineCalls = [...cellMap.values()].map(o => {
    const waveList = wipWaveSchedule(o.ivs, buf, o.pcs, lead);
    const whInfo = getMachineWarehouseInfo(o.mi);
    return {
      day: o.day, mi: o.mi, zone: whInfo.zone, whName: whInfo.whName,
      pcs: o.pcs, lots: o.lots, parts: [...o.parts],
      waves: waveList.length,
      perWave: buf === Infinity ? o.pcs : Math.min(o.pcs, buf),
      waveList, firstCall: waveList[0].call, firstNeed: waveList[0].need
    };
  }).sort((a, b) => a.firstCall - b.firstCall || a.day - b.day || a.mi - b.mi);

  // (B) Gọi ra khu chờ theo ca (ngày) + đỉnh tồn chờ JIT + kiểm tra sức chứa + lịch giờ gọi
  const dayMap = new Map();
  const evByDay = new Map();
  ivs.forEach(iv => {
    const d = dayOf(iv._rs);
    if(!dayMap.has(d)) dayMap.set(d, { day: d, pcs: 0, lots: 0, parts: new Set(), machines: new Set(), zones: new Set(), ivs: [] });
    const o = dayMap.get(d); o.pcs += (iv.lotQty || 0); o.lots++; o.parts.add(iv.part); o.machines.add(iv.mi);
    o.zones.add(getMachineWarehouseInfo(iv.mi).whName);
    o.ivs.push(iv);
    if(!evByDay.has(d)) evByDay.set(d, []);
    evByDay.get(d).push({ t: iv._rs, q: iv.lotQty || 0 });
    evByDay.get(d).push({ t: iv._re, q: -(iv.lotQty || 0) });
  });
  const dayPeak = new Map();
  evByDay.forEach((evs, d) => {
    evs.sort((a, b) => a.t - b.t || a.q - b.q);
    let cur = 0, pk = 0; evs.forEach(e => { cur += e.q; if(cur > pk) pk = cur; });
    dayPeak.set(d, pk);
  });
  const shiftCalls = [...dayMap.values()].map(o => {
    const waveList = wipWaveSchedule(o.ivs, stagingCap, o.pcs, lead);
    return {
      day: o.day, pcs: o.pcs, lots: o.lots, parts: [...o.parts], nMachines: o.machines.size,
      whNames: [...o.zones].join(", "),
      stagingCap, callWaves: waveList.length,
      jitPeak: dayPeak.get(o.day) || 0, overCap: (stagingCap > 0 && o.pcs > stagingCap),
      waveList, firstCall: waveList[0].call, firstNeed: waveList[0].need
    };
  }).sort((a, b) => a.day - b.day);

  return { machineCalls, shiftCalls, perMachine, stagingCap, machineBuffer, lead, machines, activeWhLabel };
}

function renderWipPlan(){
  const host = document.getElementById("wipContent");
  if(!host) return;
  updateWipNowBar();
  const plan = computeWipPlan();
  if(!plan){ host.innerHTML = '<div style="color:var(--muted);font-style:italic;padding:12px">Chưa có lịch. Hãy giải lịch (Heuristic hoặc CP-SAT) trước.</div>'; return; }
  const { machineCalls, shiftCalls, perMachine, stagingCap, machineBuffer, lead, machines, activeWhLabel } = plan;
  const nf = n => Number(n || 0).toLocaleString();

  const th = 'style="padding:6px 8px;text-align:left;font-size:11px;font-weight:700;background:#064e3b;color:#d1fae5;position:sticky;top:0;white-space:nowrap"';
  const td = 'style="padding:5px 8px;font-size:11.5px;border-bottom:1px solid var(--line)"';
  const tdC = 'style="padding:5px 8px;font-size:11.5px;border-bottom:1px solid var(--line);text-align:center"';
  const tdR = 'style="padding:5px 8px;font-size:11.5px;border-bottom:1px solid var(--line);text-align:right"';

  // Thanh tóm tắt
  const totalPcs = shiftCalls.reduce((s, r) => s + r.pcs, 0);
  const anyOver = shiftCalls.some(r => r.overCap);
  let html = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <div style="flex:1;min-width:140px;background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:8px 10px">
        <div style="font-size:10.5px;color:var(--muted)">Kho / Khu vực đang xem</div>
        <div style="font-size:13.5px;font-weight:700;color:#10b981">${activeWhLabel || "Tất cả Kho BTP"}</div>
      </div>
      <div style="flex:1;min-width:120px;background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:8px 10px">
        <div style="font-size:10.5px;color:var(--muted)">Sức chứa khu chờ</div>
        <div style="font-size:15px;font-weight:700;color:#059669">${stagingCap > 0 ? nf(stagingCap) + " pcs" : "Không giới hạn"}</div>
      </div>
      <div style="flex:1;min-width:120px;background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:8px 10px">
        <div style="font-size:10.5px;color:var(--muted)">Buffer mỗi máy</div>
        <div style="font-size:15px;font-weight:700;color:#0ea5e9">${machineBuffer > 0 ? nf(machineBuffer) + " pcs" : "Không giới hạn"}</div>
      </div>
      <div style="flex:1;min-width:120px;background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:8px 10px">
        <div style="font-size:10.5px;color:var(--muted)">Tổng BTP cần gọi</div>
        <div style="font-size:15px;font-weight:700">${nf(totalPcs)} pcs</div>
      </div>
    </div>`;

  // ★ Danh sách GỌI NGAY / SẮP TỚI theo thời gian thực (từng đợt gọi tới máy)
  const callEvents = [];
  machineCalls.forEach(r => (r.waveList || []).forEach(w => {
    callEvents.push({ mi: r.mi, day: r.day, wave: w.wave, nWaves: r.waves, need: w.need, call: w.call, pcs: w.pcs, parts: r.parts });
  }));
  const liveEvents = callEvents
    .map(e => ({ ...e, st: wipCallStatus(e.need, e.call) }))
    .filter(e => e.st.k !== "done")
    .sort((a, b) => a.call - b.call)
    .slice(0, 12);
  const dueNow = liveEvents.filter(e => e.st.k === "due");
  html += `<div style="background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin-bottom:12px">
    <div style="font-size:12px;font-weight:700;color:#dc2626;margin-bottom:6px">🔔 Cần gọi ngay / Sắp tới (theo thời gian thực)${dueNow.length ? ` — <span style="color:#dc2626">${dueNow.length} đợt phải gọi NGAY</span>` : ""}</div>`;
  if(!liveEvents.length){
    html += `<div style="font-size:11.5px;color:var(--muted)">Không có đợt gọi nào đang chờ (mọi đợt đã qua giờ cần hàng, hoặc chưa có lịch trong vùng thời gian hiện tại).</div>`;
  }else{
    html += `<div style="display:flex;flex-direction:column;gap:4px">`;
    liveEvents.forEach(e => {
      const pstr = e.parts.slice(0,3).join(", ") + (e.parts.length > 3 ? ` +${e.parts.length-3}` : "");
      html += `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11.5px;padding:3px 0;border-bottom:1px dashed var(--line)">
        <span style="min-width:92px;font-weight:700;color:${e.st.color}">${e.st.label}</span>
        <span class="mono" style="min-width:110px">Gọi lúc <b>${formatClockTime(e.call)}</b></span>
        <span style="color:var(--muted)">→ máy <b style="color:var(--fg)">${machines[e.mi] || ("M"+e.mi)}</b> cần lúc ${formatClockTime(e.need)}</span>
        <span style="color:var(--muted)">· ${nf(e.pcs)} pcs${e.nWaves>1?` (đợt ${e.wave}/${e.nWaves})`:""}</span>
        <span style="color:var(--muted)" title="${e.parts.join(', ')}">· ${pstr}</span>
        <span style="margin-left:auto">${execBtn('machine', `M|${e.day}|${e.mi}|${e.wave}`, e.pcs)}</span>
      </div>`;
    });
    html += `</div>`;
  }
  html += `</div>`;

  // ★ GHI NHẬN THỰC TẾ — nơi cập nhật dữ liệu khi chạy thời gian thực
  let mwTot=0,mwDone=0,swTot=0,swDone=0,opTot=0,opDone=0,delPcs=0,weldPcs=0;
  machineCalls.forEach(r=>r.waveList.forEach(w=>{ mwTot++; const g=execGet('machine',`M|${r.day}|${r.mi}|${w.wave}`); if(g){mwDone++; delPcs+=g.qty;} }));
  shiftCalls.forEach(r=>r.waveList.forEach(w=>{ swTot++; if(execGet('staging',`S|${r.day}|${w.wave}`)) swDone++; }));
  perMachine.forEach(lots=>lots.forEach(iv=>{ opTot++; if(execGet('ops',opKeyOf(iv))){opDone++; weldPcs+=(iv.lotQty||0);} }));
  html += `<div style="background:var(--panel-2);border:1px solid var(--line);border-left:3px solid #059669;border-radius:8px;padding:8px 10px;margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:5px">
      <div style="font-size:12px;font-weight:700;color:#059669">✅ Ghi nhận thực tế (cập nhật khi chạy thời gian thực)</div>
      <div style="display:flex;gap:6px">
        <button id="btnExportExec" style="font-size:10.5px;padding:3px 9px;background:#059669;color:#fff;border:none;border-radius:6px;cursor:pointer">📥 Nhật ký thực tế</button>
        <button id="btnClearExec" style="font-size:10.5px;padding:3px 9px;background:var(--panel);color:var(--muted);border:1px solid var(--line);border-radius:6px;cursor:pointer">🗑 Xoá</button>
      </div>
    </div>
    <div style="font-size:11.5px;color:var(--fg);display:flex;gap:16px;flex-wrap:wrap">
      <span>Cấp ra khu chờ: <b style="color:#059669">${swDone}/${swTot}</b> đợt</span>
      <span>Chuyển ra máy: <b style="color:#0ea5e9">${mwDone}/${mwTot}</b> đợt · <b>${nf(delPcs)}</b> pcs</span>
      <span>Hàn xong: <b style="color:#b7791f">${opDone}/${opTot}</b> lô · <b>${nf(weldPcs)}</b> pcs</span>
    </div>
    <div style="font-size:10px;color:var(--muted);margin-top:4px;line-height:1.5">Bấm <b>✓ Xác nhận</b> ở các bảng dưới khi: cấp BTP ra khu chờ · chuyển ra vị trí máy · hàn xong một lô. Mốc giờ ghi theo <b>đồng hồ thật</b> và lưu lại (localStorage). Nút <b style="color:var(--hot)">🔄 Tái điều độ</b> ở thanh dưới sẽ đóng băng các lô <b>đã hàn xong</b> và lập lại lịch cho phần còn lại từ "bây giờ".</div>
  </div>`;

  if(anyOver){
    html += `<div style="background:rgba(214,158,46,0.12);border:1px solid #D69E2E;border-radius:6px;padding:8px;margin-bottom:10px;font-size:11.5px;color:var(--fg)">
      ⚠ Một số ca có tổng BTP cần gọi <b>vượt sức chứa khu chờ</b> → phải gọi thành nhiều đợt (JIT), hàn hết đợt trước mới gọi đợt sau. Xem cột "Số đợt gọi".</div>`;
  }

  // Bảng 1: Gọi hàng ra khu chờ theo ca (ngày)
  html += `<h4 style="margin:4px 0 6px 0;font-size:12.5px;color:#059669">① Gọi hàng ra khu chờ — theo từng ca (ngày)</h4>
    <div style="overflow-x:auto;border:1px solid var(--line);border-radius:8px;margin-bottom:14px"><table style="border-collapse:collapse;width:100%;min-width:660px">
    <thead><tr>
      <th ${th}>Ca (Ngày)</th><th ${th}>Kho BTP cấp</th><th ${th}>Tổng BTP cần (pcs)</th><th ${th}>Sức chứa khu chờ</th>
      <th ${th}>Số đợt gọi ra khu chờ</th><th ${th}>Giờ gọi muộn nhất (−${lead}p)</th><th ${th}>Đỉnh tồn chờ JIT</th><th ${th}>Số máy</th><th ${th}>Trạng thái (thực tế)</th><th ${th}>Đã cấp ra khu chờ</th>
    </tr></thead><tbody>`;
  shiftCalls.forEach(r => {
    const st = wipCallStatus(r.firstNeed, r.firstCall);
    const wavesTxt = (r.waveList || []).map(w => `${formatClockTime(w.call)}`).join("<br>");
    const execCellS = (r.waveList || []).map(w => `<div style="margin:1px 0;white-space:nowrap">đợt ${w.wave}: ${execBtn('staging', 'S|' + r.day + '|' + w.wave, w.pcs)}</div>`).join("");
    html += `<tr>
      <td ${td}><b>${wipDayLabel(r.day)}</b></td>
      <td ${td} style="color:#10b981;font-weight:600">${r.whNames || "—"}</td>
      <td ${tdR}><b>${nf(r.pcs)}</b></td>
      <td ${tdC}>${stagingCap > 0 ? nf(stagingCap) : "—"}</td>
      <td ${tdC}>${r.callWaves}${r.overCap ? '' : ''}</td>
      <td ${td} class="mono" style="font-size:10.5px">${wavesTxt}</td>
      <td ${tdR}>${nf(r.jitPeak)} pcs</td>
      <td ${tdC}>${r.nMachines}</td>
      <td ${tdC}><span style="color:${st.color};font-weight:700">${st.label}</span></td>
      <td ${td}>${execCellS}</td>
    </tr>`;
  });
  html += `</tbody></table></div>`;

  // Bảng 2: Gọi hàng tới từng máy (ngày × máy) với buffer + kanban
  html += `<h4 style="margin:4px 0 6px 0;font-size:12.5px;color:#0ea5e9">② Gọi hàng tới từng máy — buffer & kéo lô (hàn hết lấy tiếp)</h4>
    <div style="overflow-x:auto;border:1px solid var(--line);border-radius:8px;margin-bottom:14px"><table style="border-collapse:collapse;width:100%;min-width:680px">
    <thead><tr>
      <th ${th}>Ca (Ngày)</th><th ${th}>Phân xưởng / Kho</th><th ${th}>Máy</th><th ${th}>Ca máy</th><th ${th}>BTP cần (pcs)</th>
      <th ${th}>Buffer máy</th><th ${th}>Số đợt (hàn hết lấy tiếp)</th><th ${th}>Giờ gọi muộn nhất (−${lead}p) · SL</th><th ${th}>Trạng thái</th><th ${th}>Đã cấp ra máy (thực tế)</th><th ${th}>Part</th>
    </tr></thead><tbody>`;
  machineCalls.forEach(r => {
    const partStr = r.parts.slice(0, 4).join(", ") + (r.parts.length > 4 ? ` +${r.parts.length - 4}` : "");
    const st = wipCallStatus(r.firstNeed, r.firstCall);
    const wavesTxt = (r.waveList || []).map(w => `${formatClockTime(w.call)} <span style="color:var(--muted)">(${nf(w.pcs)})</span>`).join("<br>");
    const execCell = (r.waveList || []).map(w => `<div style="margin:1px 0;white-space:nowrap">đợt ${w.wave}: ${execBtn('machine', 'M|' + r.day + '|' + r.mi + '|' + w.wave, w.pcs)}</div>`).join("");
    html += `<tr>
      <td ${td}>${wipDayLabel(r.day)}</td>
      <td ${td}><span style="font-size:10.5px;color:var(--muted)">${r.zone || ""}</span><br><b style="color:#10b981;font-size:10.5px">📦 ${r.whName || ""}</b></td>
      <td ${td}><b>${machines[r.mi] || ("M" + r.mi)}</b></td>
      <td ${tdC}>${wipShiftCode(r.mi)}</td>
      <td ${tdR}>${nf(r.pcs)}</td>
      <td ${tdC}>${machineBuffer > 0 ? nf(machineBuffer) : "—"}</td>
      <td ${tdC}><b>${r.waves}</b></td>
      <td ${td} class="mono" style="font-size:10.5px">${wavesTxt}</td>
      <td ${tdC}><span style="color:${st.color};font-weight:700">${st.label}</span></td>
      <td ${td}>${execCell}</td>
      <td ${td} title="${r.parts.join(', ')}">${partStr}</td>
    </tr>`;
  });
  html += `</tbody></table></div>`;

  // Bảng 3 (thu gọn): Chi tiết hàng chờ tại từng máy theo thời gian
  html += `<details style="margin-bottom:8px"><summary style="cursor:pointer;font-size:12.5px;font-weight:700;color:var(--muted)">③ Chi tiết trình tự hàng chờ tại từng máy (bấm để mở)</summary>
    <div style="overflow-x:auto;border:1px solid var(--line);border-radius:8px;margin-top:8px"><table style="border-collapse:collapse;width:100%;min-width:640px">
    <thead><tr>
      <th ${th}>Máy</th><th ${th}>Ca máy</th><th ${th}>Gọi muộn nhất (−${lead}p)</th><th ${th}>Cần có hàng lúc</th><th ${th}>Part</th>
      <th ${th}>Lô</th><th ${th}>SL (pcs)</th><th ${th}>Công đoạn</th><th ${th}>Hàn xong lúc</th><th ${th}>Hàn xong (thực tế)</th>
    </tr></thead><tbody>`;
  perMachine.forEach((lots, mi) => {
    lots.forEach(iv => {
      const need = (iv._rs != null) ? iv._rs : realClock(mi, iv.start);
      const endR = (iv._re != null) ? iv._re : realClock(mi, iv.end);
      const callT = Math.max(0, need - lead);
      const st = wipCallStatus(need, callT);
      html += `<tr>
        <td ${td}><b>${machines[mi] || ("M" + mi)}</b></td>
        <td ${tdC}>${wipShiftCode(mi)}</td>
        <td ${td} class="mono"><span style="color:${st.color}">${formatClockTime(callT)}</span></td>
        <td ${td}>${formatClockTime(need)}</td>
        <td ${td}>${iv.part}</td>
        <td ${tdC}>#${iv.unit}</td>
        <td ${tdR}>${nf(iv.lotQty)}</td>
        <td ${tdC}>${iv.seq}</td>
        <td ${td}>${formatClockTime(endR)}</td>
        <td ${td}>${execBtn('ops', opKeyOf(iv), iv.lotQty)}</td>
      </tr>`;
    });
  });
  html += `</tbody></table></div></details>`;

  host.innerHTML = html;
}

function exportWipExcel(){
  const plan = computeWipPlan();
  if(!plan){ alert("Chưa có lịch để xuất. Hãy giải lịch trước!"); return; }
  const { machineCalls, shiftCalls, perMachine, stagingCap, machineBuffer, lead, machines } = plan;
  try{
    const wb = XLSX.utils.book_new();
    const waveCallsStr = r => (r.waveList || []).map(w => formatClockTime(w.call)).join(" | ");
    const waveDetailStr = r => (r.waveList || []).map(w => `${formatClockTime(w.call)} (${w.pcs})`).join(" | ");
    const leadHdr = `Giờ gọi muộn nhất (−${lead}p)`;

    const s1 = [["Ca (Ngày)", "Kho BTP cấp", "Tổng BTP cần (pcs)", "Sức chứa khu chờ", "Số đợt gọi ra khu chờ", leadHdr + " - các đợt", "Đỉnh tồn chờ JIT (pcs)", "Số máy", "Số lô", "Trạng thái"]];
    shiftCalls.forEach(r => s1.push([wipDayLabel(r.day), r.whNames || "", r.pcs, stagingCap || "", r.callWaves, waveCallsStr(r), r.jitPeak, r.nMachines, r.lots, r.overCap ? ("Gọi " + r.callWaves + " đợt") : "Gọi 1 lần"]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s1), "GoiHang_TheoCa");

    const s2 = [["Ca (Ngày)", "Phân xưởng", "Kho BTP", "Máy", "Ca máy", "BTP cần (pcs)", "Buffer máy", "Số đợt (hàn hết lấy tiếp)", leadHdr + " · SL từng đợt", "Part"]];
    machineCalls.forEach(r => s2.push([wipDayLabel(r.day), r.zone || "", r.whName || "", machines[r.mi] || ("M" + r.mi), wipShiftCode(r.mi), r.pcs, machineBuffer || "", r.waves, waveDetailStr(r), r.parts.join(", ")]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s2), "GoiHang_TungMay");

    const s3 = [["Máy", "Ca máy", leadHdr, "Cần có hàng lúc", "Part", "Lô", "SL (pcs)", "Công đoạn", "Hàn xong lúc"]];
    perMachine.forEach((lots, mi) => lots.forEach(iv => {
      const need = (iv._rs != null) ? iv._rs : realClock(mi, iv.start);
      const endR = (iv._re != null) ? iv._re : realClock(mi, iv.end);
      s3.push([machines[mi] || ("M" + mi), wipShiftCode(mi), formatClockTime(Math.max(0, need - lead)), formatClockTime(need), iv.part, "#" + iv.unit, iv.lotQty, iv.seq, formatClockTime(endR)]);
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s3), "HangCho_ChiTiet");

    XLSX.writeFile(wb, "GoiHang_WIP.xlsx");
  }catch(err){
    alert("Không xuất được Excel WIP: " + err.message);
  }
}

/* ============================================================
   BẢNG PHÂN CÔNG CÔNG NHÂN & TẢI LAO ĐỘNG (DRC-FJSP)
   ============================================================ */
let workerZoneFilter = "all";
let workerShiftFilter = "all";
let workerSkillFilter = "all";
let workerSearchQuery = "";

function renderWorkersPlan(){
  const host = document.getElementById("workerContent");
  if(!host) return;

  const rawWorkers = (schedule && schedule.workers && schedule.workers.length > 0)
    ? schedule.workers
    : ((model && model.workers && model.workers.length > 0) ? model.workers : []);

  if(!rawWorkers.length){
    host.innerHTML = `<div style="color:var(--muted);font-style:italic;padding:16px;text-align:center">
      Chưa có dữ liệu Công nhân. Vui lòng kiểm tra sheet <b>"CongNhan"</b> trong file Excel hoặc chọn chế độ giải lịch có tài nguyên công nhân!
    </div>`;
    return;
  }

  // Khởi tạo các options cho dropdown Phân xưởng nếu chưa có
  const zSel = document.getElementById("workerZoneFilter");
  if(zSel && zSel.options.length <= 1){
    const uniqueZones = [...new Set(rawWorkers.map(w => w.zone).filter(Boolean))];
    uniqueZones.forEach(zn => {
      const opt = document.createElement("option");
      opt.value = zn;
      opt.textContent = `🏭 ${zn}`;
      zSel.appendChild(opt);
    });
    zSel.addEventListener("change", e => { workerZoneFilter = e.target.value; renderWorkersPlan(); });
    const sSel = document.getElementById("workerShiftFilter");
    if(sSel) sSel.addEventListener("change", e => { workerShiftFilter = e.target.value; renderWorkersPlan(); });
    const skSel = document.getElementById("workerSkillFilter");
    if(skSel) skSel.addEventListener("change", e => { workerSkillFilter = e.target.value; renderWorkersPlan(); });
    const sIn = document.getElementById("workerSearch");
    if(sIn) sIn.addEventListener("input", e => { workerSearchQuery = e.target.value.trim().toLowerCase(); renderWorkersPlan(); });
    const expBtn = document.getElementById("btnExportWorkers");
    if(expBtn) expBtn.addEventListener("click", exportWorkersExcel);
  }

  const ivs = (schedule && schedule.intervals) ? schedule.intervals : [];
  const curT = (sim && sim.t != null) ? sim.t : 0;
  const makespan = (schedule && schedule.makespan) ? schedule.makespan : 1;

  // Lọc danh sách công nhân theo bộ lọc
  const filteredWorkers = rawWorkers.filter(w => {
    if(workerZoneFilter !== "all" && w.zone !== workerZoneFilter) return false;
    if(workerShiftFilter !== "all" && w.shift !== workerShiftFilter) return false;
    if(workerSkillFilter !== "all" && w.skill !== workerSkillFilter) return false;
    if(workerSearchQuery){
      const q = workerSearchQuery;
      const mMatch = (w.prefMachines || []).some(pm => pm.toLowerCase().includes(q));
      if(!w.id.toLowerCase().includes(q) && !w.name.toLowerCase().includes(q) && !(w.zone||"").toLowerCase().includes(q) && !mMatch) return false;
    }
    return true;
  });

  // Tính toán số liệu thống kê từng công nhân
  let totalLaborMin = 0;
  let activeWorkersNow = 0;

  const workerStats = filteredWorkers.map(w => {
    const assigned = ivs.filter(iv => iv.workerId === w.id);
    const jobCount = assigned.length;
    const pcs = assigned.reduce((s, iv) => s + (iv.lotQty || 1), 0);
    const duration = assigned.reduce((s, iv) => s + (iv.end - iv.start), 0);
    totalLaborMin += duration;

    // Kiểm tra trạng thái hiện tại ở sim.t
    const activeIv = assigned.find(iv => iv.start <= curT && curT < iv.end);
    if(activeIv) activeWorkersNow++;

    const utilPct = makespan > 0 ? Math.min(100, (duration / makespan) * 100).toFixed(1) : "0.0";

    return {
      w,
      assigned,
      jobCount,
      pcs,
      duration,
      hours: (duration / 60).toFixed(1),
      utilPct,
      activeIv
    };
  });

  const totalHoursAll = (totalLaborMin / 60).toFixed(1);
  const avgUtilAll = filteredWorkers.length > 0
    ? (workerStats.reduce((s, item) => s + parseFloat(item.utilPct), 0) / filteredWorkers.length).toFixed(1)
    : "0.0";

  const nf = n => Number(n || 0).toLocaleString();
  const th = 'style="padding:7px 9px;text-align:left;font-size:11px;font-weight:700;background:#4c1d95;color:#ede9fe;position:sticky;top:0;white-space:nowrap"';
  const td = 'style="padding:6px 9px;font-size:11.5px;border-bottom:1px solid var(--line)"';
  const tdC = 'style="padding:6px 9px;font-size:11.5px;border-bottom:1px solid var(--line);text-align:center"';
  const tdR = 'style="padding:6px 9px;font-size:11.5px;border-bottom:1px solid var(--line);text-align:right"';

  let html = `
    <!-- KPI SUMMARY CARDS -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      <div style="flex:1;min-width:140px;background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:9px 12px">
        <div style="font-size:11px;color:var(--muted)">👷 Tổng Công nhân (Đang lọc)</div>
        <div style="font-size:17px;font-weight:700;color:#a78bfa">${filteredWorkers.length} <span style="font-size:12px;color:var(--muted);font-weight:normal">/ ${rawWorkers.length} người</span></div>
      </div>
      <div style="flex:1;min-width:140px;background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:9px 12px">
        <div style="font-size:11px;color:var(--muted)">⚡ Đang thao tác tại máy (t=${Math.round(curT)}p)</div>
        <div style="font-size:17px;font-weight:700;color:#10b981">${activeWorkersNow} <span style="font-size:12px;color:var(--muted);font-weight:normal">công nhân</span></div>
      </div>
      <div style="flex:1;min-width:140px;background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:9px 12px">
        <div style="font-size:11px;color:var(--muted)">⏱ Tổng giờ công thực tế</div>
        <div style="font-size:17px;font-weight:700;color:#38bdf8">${totalHoursAll} <span style="font-size:12px;color:var(--muted);font-weight:normal">giờ</span></div>
      </div>
      <div style="flex:1;min-width:140px;background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:9px 12px">
        <div style="font-size:11px;color:var(--muted)">📊 Tỷ lệ huy động trung bình</div>
        <div style="font-size:17px;font-weight:700;color:#f59e0b">${avgUtilAll}%</div>
      </div>
    </div>

    <!-- BẢNG TỔNG HỢP NĂNG SUẤT & TẢI CÔNG NHÂN -->
    <div style="background:var(--panel-2);border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:14px">
      <div style="padding:9px 12px;background:var(--panel);border-bottom:1px solid var(--line);font-weight:700;font-size:12.5px;color:var(--fg);display:flex;justify-content:space-between;align-items:center">
        <span>📋 Bảng Phân công & Tải làm việc từng Công nhân</span>
        <span style="font-size:11px;color:var(--muted)">Theo dõi tiến độ, hiệu suất bậc thợ và khối lượng việc gán cho từng người</span>
      </div>
      <div style="overflow-x:auto;max-height:360px">
        <table style="width:100%;border-collapse:collapse;font-size:11.5px">
          <thead>
            <tr>
              <th ${th}>Mã CN</th>
              <th ${th}>Họ và Tên</th>
              <th ${th}>Phân xưởng</th>
              <th ${th}>Bậc thợ</th>
              <th ${th}>Ca làm việc</th>
              <th ${th}>Hiệu suất</th>
              <th ${th}>Máy ưu tiên</th>
              <th ${th}>Số lô nhận</th>
              <th ${th}>Sản lượng (pcs)</th>
              <th ${th}>Tổng giờ (h)</th>
              <th ${th}>Tỷ lệ tải (%)</th>
              <th ${th}>Trạng thái hiện tại</th>
            </tr>
          </thead>
          <tbody>`;

  workerStats.forEach(item => {
    const w = item.w;
    const isAct = item.activeIv != null;
    const mName = isAct ? (model.machines[item.activeIv.mi] || `M${item.activeIv.mi}`) : "";
    const pId = isAct ? item.activeIv.part : "";
    const statusBadge = isAct
      ? `<span style="background:rgba(16,185,129,0.18);color:#10b981;font-weight:700;padding:2px 7px;border-radius:4px;border:1px solid #10b981;white-space:nowrap">Đang làm: ${mName} (${pId})</span>`
      : `<span style="background:rgba(148,163,184,0.12);color:var(--muted);padding:2px 7px;border-radius:4px;border:1px solid var(--line);white-space:nowrap">Sẵn sàng / Nghỉ ca</span>`;

    const skillColor = w.skill.includes("4") ? "#c084fc" : (w.skill.includes("3") ? "#60a5fa" : (w.skill.includes("2") ? "#34d399" : "#fbbf24"));
    const effPct = Math.round((w.eff || 1.0) * 100);

    html += `
      <tr style="cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='rgba(139,92,246,0.08)'" onmouseout="this.style.background='transparent'">
        <td ${td} class="mono"><b>${w.id}</b></td>
        <td ${td}><b>${w.name}</b></td>
        <td ${td}><span style="background:rgba(139,92,246,0.12);color:#a78bfa;padding:2px 6px;border-radius:4px;font-size:11px">${w.zone || "—"}</span></td>
        <td ${tdC}><b style="color:${skillColor}">${w.skill}</b></td>
        <td ${tdC}><span class="mono" style="font-size:10.5px">${w.shift}</span></td>
        <td ${tdR}><b style="color:${effPct > 100 ? '#10b981' : '#f59e0b'}">${effPct}%</b></td>
        <td ${td} style="font-size:11px;color:var(--muted)">${(w.prefMachines && w.prefMachines.length) ? w.prefMachines.join(", ") : "Tất cả máy hợp lệ"}</td>
        <td ${tdC}><b>${item.jobCount}</b></td>
        <td ${tdR}>${nf(item.pcs)}</td>
        <td ${tdR}><b>${item.hours}h</b></td>
        <td ${td} style="min-width:110px">
          <div style="display:flex;align-items:center;gap:6px">
            <div style="flex:1;height:6px;background:var(--line);border-radius:3px;overflow:hidden">
              <div style="width:${Math.min(100, item.utilPct)}%;height:100%;background:${item.utilPct > 70 ? '#f59e0b' : '#8b5cf6'}"></div>
            </div>
            <span class="mono" style="font-size:10.5px;min-width:35px">${item.utilPct}%</span>
          </div>
        </td>
        <td ${td}>${statusBadge}</td>
      </tr>`;
  });

  html += `</tbody></table></div></div>`;

  // BẢNG CHI TIẾT NHẬT KÝ PHÂN CÔNG THEO THỜI GIAN
  html += `
    <details style="background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:8px 12px" open>
      <summary style="cursor:pointer;font-weight:700;font-size:12.5px;color:var(--fg);margin-bottom:8px">
        📅 Nhật ký Phân công Thao tác Chi tiết (Sắp xếp theo Bắt đầu)
      </summary>
      <div style="overflow-x:auto;max-height:280px">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead>
            <tr>
              <th ${th}>Bắt đầu</th>
              <th ${th}>Kết thúc</th>
              <th ${th}>Công nhân</th>
              <th ${th}>Phân xưởng</th>
              <th ${th}>Part</th>
              <th ${th}>Lô</th>
              <th ${th}>Công đoạn</th>
              <th ${th}>Máy hàn</th>
              <th ${th}>Số lượng (pcs)</th>
              <th ${th}>Thời lượng (phút)</th>
            </tr>
          </thead>
          <tbody>`;

  const sortedIvs = [...ivs].sort((a, b) => a.start - b.start);
  sortedIvs.forEach(iv => {
    if(workerZoneFilter !== "all" && iv.workerZone !== workerZoneFilter) return;
    if(workerSearchQuery){
      const q = workerSearchQuery;
      if(!(iv.workerName||"").toLowerCase().includes(q) && !(iv.workerId||"").toLowerCase().includes(q) && !(iv.part||"").toLowerCase().includes(q)) return;
    }
    const mName = model.machines[iv.mi] || `M${iv.mi}`;
    html += `
      <tr>
        <td ${td} class="mono">${formatClockTime(iv.start)}</td>
        <td ${td} class="mono">${formatClockTime(iv.end)}</td>
        <td ${td}><b>${iv.workerName || "Chưa gán"}</b> <span class="mono" style="font-size:10px;color:var(--muted)">[${iv.workerId || ""}]</span></td>
        <td ${td} style="color:var(--muted)">${iv.workerZone || "—"}</td>
        <td ${td}><b>${iv.part}</b></td>
        <td ${tdC}>#${iv.unit}</td>
        <td ${tdC}>B${iv.seq}</td>
        <td ${td}><b>${mName}</b></td>
        <td ${tdR}>${nf(iv.lotQty)}</td>
        <td ${tdR} class="mono">${Math.round(iv.end - iv.start)}p</td>
      </tr>`;
  });

  html += `</tbody></table></div></details>`;

  host.innerHTML = html;
}

function exportWorkersExcel(){
  const rawWorkers = (schedule && schedule.workers && schedule.workers.length > 0)
    ? schedule.workers
    : ((model && model.workers && model.workers.length > 0) ? model.workers : []);
  if(!rawWorkers.length){
    alert("Chưa có danh sách công nhân để xuất Excel!");
    return;
  }
  const ivs = (schedule && schedule.intervals) ? schedule.intervals : [];
  const makespan = (schedule && schedule.makespan) ? schedule.makespan : 1;

  try {
    const wb = XLSX.utils.book_new();

    // Sheet 1: TongHopCongNhan
    const s1Headers = ["MaCN", "HoTen", "PhanXuong", "BacTho", "Ca", "HieuSuat", "MayUuTien", "SoLoNhan", "TongSanLuong_Pcs", "TongThoiGian_Phut", "TongThoiGian_Gio", "TyLeTyleTaik_Pct", "GhiChu"];
    const s1Rows = rawWorkers.map(w => {
      const assigned = ivs.filter(iv => iv.workerId === w.id);
      const jobCount = assigned.length;
      const pcs = assigned.reduce((s, iv) => s + (iv.lotQty || 1), 0);
      const duration = assigned.reduce((s, iv) => s + (iv.end - iv.start), 0);
      const hours = (duration / 60).toFixed(1);
      const utilPct = makespan > 0 ? ((duration / makespan) * 100).toFixed(1) : 0;
      const prefStr = (w.prefMachines && w.prefMachines.length) ? w.prefMachines.join(", ") : "";
      return [w.id, w.name, w.zone, w.skill, w.shift, Math.round((w.eff || 1.0) * 100) + "%", prefStr, jobCount, pcs, duration, hours, utilPct + "%", w.note || ""];
    });
    const ws1 = XLSX.utils.aoa_to_sheet([s1Headers, ...s1Rows]);
    XLSX.utils.book_append_sheet(wb, ws1, "TongHopCongNhan");

    // Sheet 2: ChiTietPhanCong
    const s2Headers = ["BatDau", "KetThuc", "MaCN", "HoTen", "PhanXuong", "Part", "LoCon", "CongDoan", "May", "SoLuong_Pcs", "ThoiLuong_Phut"];
    const s2Rows = [...ivs].sort((a, b) => a.start - b.start).map(iv => {
      const mName = (model && model.machines && model.machines[iv.mi]) ? model.machines[iv.mi] : `M${iv.mi}`;
      return [
        formatClockTime(iv.start),
        formatClockTime(iv.end),
        iv.workerId || "",
        iv.workerName || "",
        iv.workerZone || "",
        iv.part,
        "#" + iv.unit,
        "B" + iv.seq,
        mName,
        iv.lotQty || 1,
        Math.round(iv.end - iv.start)
      ];
    });
    const ws2 = XLSX.utils.aoa_to_sheet([s2Headers, ...s2Rows]);
    XLSX.utils.book_append_sheet(wb, ws2, "ChiTietPhanCong");

    XLSX.writeFile(wb, "PhanCong_CongNhan.xlsx");
  } catch(err){
    alert("Không xuất được Excel Công nhân: " + err.message);
  }
}

function setTab(name){
  activeTab=name;
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.pane===name));
  document.querySelectorAll(".pane").forEach(p=>p.hidden = p.id!=="pane-"+name);
  if(name==="three") resizeThree();
  if(name==="khsxDong") renderKHSXDong();
  if(name==="wip") renderWipPlan();
  if(name==="workers") renderWorkersPlan();
  if(name==="ai") renderAIBrainTab();
}

/* ============================================================
   AI OPERATIONS COPILOT · GEMINI BRAIN (XƯỞNG HÀN SPOT TOÀN DIỆN)
   ============================================================ */
let aiChatHistory = [];
let aiBrainStatus = null;
let aiInitialized = false;

let _aiStatusRetry = 0;
async function checkBrainStatus(){
  try {
    const res = await fetch(`${API_BASE}/api/ai/status`);
    if(res.ok){
      aiBrainStatus = await res.json();
      updateAIStatusUI();
      // Máy chủ AI đang khởi động -> tự hỏi lại vài lần
      if(aiBrainStatus.mode === "offline" && _aiStatusRetry < 6){
        _aiStatusRetry++;
        setTimeout(checkBrainStatus, 20000);
      } else if(aiBrainStatus.mode !== "offline"){
        _aiStatusRetry = 0;
      }
      return;
    }
  } catch(e){}
  aiBrainStatus = { ok: false, mode: "offline", default_model: "quy tắc tại chỗ",
    status_text: "🟡 Chưa kết nối được máy chủ AI — tạm dùng bộ phân tích quy tắc tại chỗ" };
  updateAIStatusUI();
}

function updateAIStatusUI(){
  const stText = document.getElementById("aiStatusText");
  const badge = document.getElementById("aiModelBadge");
  if(!stText || !badge) return;
  if(!aiBrainStatus){
    stText.textContent = "Chưa kết nối AI Backend";
    return;
  }
  stText.textContent = aiBrainStatus.status_text || "Sẵn sàng";
  if(aiBrainStatus.default_model){
    badge.textContent = aiBrainStatus.default_model;
  }
  // Nút "đăng nhập Google" chỉ có ý nghĩa ở bản chạy tại máy
  const loginBtn = document.getElementById("btnAILogin");
  if(loginBtn && IS_WEB) loginBtn.style.display = "none";
}

async function loginGeminiBrain(){
  const btn = document.getElementById("btnAILogin");
  if(btn) btn.disabled = true;
  appendAIMessage("system", "⏳ Đang mở trình duyệt Chromium để đăng nhập tài khoản Google... Vui lòng đăng nhập trong cửa sổ vừa hiện lên.");
  try {
    const res = await fetch(`${API_BASE}/api/ai/login`, { method: "POST" });
    const data = await res.json();
    if(data.success){
      appendAIMessage("ai", "🎉 **Đăng nhập Gemini thành công!** Cookie đã được lưu an toàn. Bộ não Gemini Web đã sẵn sàng phục vụ Quản đốc!");
      await checkBrainStatus();
    } else {
      appendAIMessage("system", "⚠️ " + escHtml(data.message || "Đăng nhập chưa hoàn tất. Bạn vẫn có thể dùng bộ phân tích quy tắc bình thường."));
    }
  } catch(err){
    appendAIMessage("ai", "❌ Không thể gọi dịch vụ đăng nhập: " + err.message + ". Hãy chắc chắn server Python đang chạy.");
  } finally {
    if(btn) btn.disabled = false;
  }
}

function getFactoryContextSnapshot(){
  if(!model) return {};
  const busyMap = {};
  if(schedule && schedule.busy){
    model.machines.forEach((m, idx) => {
      busyMap[m] = Math.round(schedule.busy[idx] || 0);
    });
  }
  const tardyList = [];
  if(model.parts && schedule && schedule.completions){
    model.parts.forEach(p => {
      const doneMin = schedule.completions[p.id];
      if(p.dueDate && doneMin && doneMin > p.dueDate){
        tardyList.push(`${p.id} (trễ ${Math.round((doneMin - p.dueDate)/60)}h)`);
      }
    });
  }
  return {
    factoryName: "Xưởng Hàn Spot",
    totalMachines: model.machines.length,
    machines: model.machines,
    totalParts: model.parts.length,
    totalPcs: model.parts.reduce((s, p) => s + (p.planQty || p.qty || 0), 0),
    makespan: schedule ? Math.round(schedule.makespan) : 0,
    makespanHours: schedule ? Math.round(schedule.makespan / 60 * 10) / 10 : 0,
    busyTimes: busyMap,
    tardyParts: tardyList,
    machineShifts: model.machineShifts || [],
    workers: (model.workers || []).map(w => ({ name: w.name, skill: w.skill, zone: w.zone })),
    // Danh sách part (để AI biết mã có thật + số liệu hiện tại khi đề xuất ghi file)
    parts: (model.parts || []).map(p => ({
      id: p.id,
      planQty: p.planQty || p.qty || 0,
      actualQty: p.actualQty || 0,
      need: p.qty || 0,
      priority: p.priority || 2,
      due: p.dueDate || null
    }))
  };
}

function appendAIMessage(role, content, sourceLabel){
  const chatLog = document.getElementById("aiChatLog");
  if(!chatLog) return;
  const item = document.createElement("div");
  item.style.display = "flex";
  item.style.gap = "10px";
  item.style.alignItems = "flex-start";
  item.style.maxWidth = "88%";

  let avatar = "🧠", bg = "var(--panel)", border = "#ec4899", color = "var(--fg)", roleName = sourceLabel || "Trợ lý AI";
  if(role === "user"){
    item.style.marginLeft = "auto";
    avatar = "👷";
    bg = "var(--accent-soft)";
    border = "var(--accent)";
    roleName = "Quản đốc";
  } else if(role === "system"){
    bg = "rgba(245, 158, 11, 0.12)";
    border = "#f59e0b";
    avatar = "⚙️";
    roleName = "Hệ thống";
  }

  // Format markdown nhẹ
  // Câu của người dùng và của AI là dữ liệu KHÔNG tin cậy -> escape HTML trước khi dựng markdown.
  // Tin "system" do chính app tạo (có thẻ <b>) nên giữ nguyên.
  const safeText = (role === "system") ? String(content || "") : escHtml(content);
  let htmlContent = safeText
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/^### (.*$)/gim, '<div style="font-weight:700;font-size:13px;color:#f43f5e;margin:4px 0">$1</div>')
    .replace(/^#### (.*$)/gim, '<div style="font-weight:700;font-size:12px;color:#38bdf8;margin:3px 0">$1</div>')
    .replace(/^\s*\*\s(.*$)/gim, '• $1<br>')
    .replace(/\n/g, '<br>');

  item.innerHTML = `
    <div style="font-size:18px;line-height:1;flex-shrink:0;margin-top:2px">${avatar}</div>
    <div style="background:${bg};border:1px solid ${border};border-radius:10px;padding:9px 12px;font-size:12px;line-height:1.55;color:${color};box-shadow:0 2px 6px rgba(0,0,0,0.15)">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted);margin-bottom:3px">${escHtml(roleName)}</div>
      <div>${htmlContent}</div>
    </div>
  `;
  chatLog.appendChild(item);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function clearAIChat(){
  const chatLog = document.getElementById("aiChatLog");
  if(chatLog) chatLog.innerHTML = "";
  initWelcomeAIMessage();
}

function initWelcomeAIMessage(){
  appendAIMessage("ai", `**Xin chào Quản đốc!** Tôi là **Gemini AI Copilot** phụ trách điều hành tại **Xưởng Hàn Spot**.
Tôi đã nạp toàn bộ tham số công nghệ của dây chuyền (Laser, Dập, Spot, MAG Robot, Ca máy và Bậc thợ).
Hãy bấm một trong 4 phân tích nhanh phía trên, hoặc đặt câu hỏi bất kỳ về tiến độ xưởng!`);
}

function generateClientSideAIResponse(prompt, ctx){
  if(!ctx || !ctx.machines){
    ctx = getFactoryContextSnapshot();
  }
  const machines = ctx.machines || [];
  const parts = ctx.parts || [];
  const totalPcs = ctx.totalPcs || 0;
  const makespan = ctx.makespan || 0;
  const makespanHours = ctx.makespanHours || (makespan ? Math.round(makespan / 6) / 10 : 0);
  const busyTimes = ctx.busyTimes || {};
  const tardyParts = ctx.tardyParts || [];
  const qLower = (prompt || "").toLowerCase();

  const isBottleneck = /nghẽn|bottleneck|quá tải|san tải|nút thắt|tắc|tải máy|cổ chai/.test(qLower);
  const isLate = /trễ|tre|due date|hạn giao|chậm tiến độ|đúng hạn/.test(qLower);
  const isMakespan = /makespan|thời gian hoàn thành|rút ngắn|tối ưu|tiến độ|năng suất/.test(qLower);
  const isWorker = /công nhân|cong nhan|thợ|tho|bậc|bac|phân công|tay nghề/.test(qLower);
  const isAction = /thực hiện|thuc hien|đồng ý|dong y|áp dụng|ap dung|kích hoạt|san tải ngay|triển khai|duyệt|duyet|ok|chạy đi/.test(qLower);
  const isGreeting = /^(chào|chao|hi|hello|xin chào|alo|helo)\b/.test(qLower.trim());
  const isGratitude = /cảm ơn|cam on|thank|tốt lắm|tot lam|tuyệt vời|tuyet voi/.test(qLower.trim()) && qLower.trim().split(/\s+/).length <= 6;

  if(isGratitude){
    return "Dạ không có gì ạ! Rất vui được đồng hành cùng Quản đốc. Chúc Quản đốc và toàn xưởng một ca sản xuất an toàn, thuận lợi và đạt năng suất cao nhất! Bất cứ lúc nào cần kiểm tra tiến độ hay san tải máy, Quản đốc cứ gọi tôi nhé! 🚀";
  }

  const sortedM = Object.entries(busyTimes).sort((a,b) => b[1] - a[1]);
  const maxBusyMin = sortedM.length ? sortedM[0][1] : 0;
  const maxBusyPct = makespan > 0 ? (maxBusyMin / makespan) * 100 : 0;
  const topBusy = sortedM.slice(0, 5);
  const idleMachines = sortedM.filter(x => makespan > 0 && x[1] < makespan * 0.15);

  let out = [];

  if(isGreeting){
    out.push("### 👋 Xin chào Quản đốc!");
    out.push("Tôi là **Gemini AI Copilot** phụ trách điều hành tại **Xưởng Hàn Spot**.");
    out.push(`Dây chuyền hiện có **${machines.length} thiết bị** đang vận hành sản xuất cho **${parts.length} mã part** (${totalPcs.toLocaleString()} pcs).`);
    out.push("\nQuản đốc có thể bấm các nút phân tích nhanh phía trên hoặc đặt câu hỏi:");
    out.push("- 🔍 **Quét Điểm Nghẽn**: Đánh giá máy tải cao, trạm nhàn rỗi và phương án san tải.");
    out.push("- ⚠️ **Dự Báo Trễ Hạn**: Kiểm tra các part có rủi ro trễ tiến độ giao hàng.");
    out.push("- ⚡ **Tối Ưu Makespan**: Rút ngắn chu kỳ tổng thể toàn xưởng.");
    out.push("- 👷 **Tư Vấn Công Nhân**: Sắp xếp bậc thợ 2, 3, 4 theo mức độ quan trọng.");
    return out.join("\n");
  }

  out.push("### 🏭 Báo Cáo Phân Tích Điều Hành Xưởng Hàn Spot");
  out.push(`- **Quy mô vận hành**: ${machines.length} máy · ${parts.length} mã part · **${totalPcs.toLocaleString()} sản phẩm**.`);
  if(makespan > 0){
    out.push(`- **Makespan toàn hệ thống**: ${makespan.toLocaleString()} phút (~**${makespanHours} giờ** làm việc liên tục).`);
  }

  // 1. Tư vấn công nhân
  if(isWorker && !isBottleneck && !isAction){
    out.push("\n#### 👷 Tư Vấn Phân Công & Bố Trí Bậc Thợ:");
    out.push("Dựa trên độ phức tạp của đồ gá và yêu cầu kỹ thuật mối hàn:");
    out.push("  1. **Thợ bậc 4 (Tay nghề cao)**: Ưu tiên bố trí tại các trạm Robot hàn MAG (`Robot-MAG-1..4`) và các cụm máy hàn Spot phức tạp (`L3-4`, `L3-5`). Đảm nhiệm thiết lập thông số dòng hàn, lực ép, căn chỉnh dưỡng gá và xử lý biến dạng nhiệt.");
    out.push("  2. **Thợ bậc 3 (Lành nghề)**: Phân công vận hành chính tại các trạm hàn Spot pedestal (`L1-1..L1-6`, `L2-1..L2-6`). Đảm bảo nhịp thao tác ổn định 15–25 giây/mối hàn.");
    out.push("  3. **Thợ bậc 2 (Thao tác cơ bản)**: Bố trí nạp nhả phôi tại máy dập cơ khí (60T–160T), gá phôi phụ và kiểm tra ngoại quan sau hàn.");
    out.push("\n> 💡 *Khuyến nghị: Luôn duy trì ít nhất 1 thợ bậc 4 làm Trưởng ca kỹ thuật để hỗ trợ thay điện cực và hiệu chỉnh đồ gá nhanh chóng.*");
    return out.join("\n");
  }

  // 2. Dự báo trễ hạn
  if(isLate && !isBottleneck && !isAction){
    out.push("\n#### ⚠️ Đánh Giá Tiến Độ & Nguy Cơ Trễ Hạn (Due Date):");
    if(tardyParts.length > 0){
      out.push(`- 🔴 Phát hiện **${tardyParts.length} Part trễ hạn**:`);
      tardyParts.slice(0, 8).forEach(tp => out.push(`  * Mã: **${tp}**`));
      out.push("- **Nguyên nhân cốt lõi**: Khối lượng chi tiết dồn dập vào ca làm việc giới hạn hoặc thời điểm phát hành phôi muộn.");
      out.push("- **Giải pháp**: Tăng độ ưu tiên lên mức 1 và áp dụng Lot Streaming (chia lô gối đầu 300–500 pcs).");
    } else {
      out.push("- 🟢 **100% ĐÚNG HẠN**: Toàn bộ các mã Part đều được xếp lịch hoàn thành trước hạn giao hàng quy định.");
      out.push("- Dây chuyền đáp ứng tiến độ xuất sắc, không có rủi ro trễ hẹn giao hàng cho khách hàng.");
    }
    return out.join("\n");
  }

  // 3. Tối ưu Makespan
  if(isMakespan && !isBottleneck && !isAction){
    out.push("\n#### ⚡ Giải Pháp Rút Ngắn Makespan Toàn Xưởng:");
    out.push(`- Makespan hiện tại: **${makespan.toLocaleString()} phút** (~${makespanHours}h).`);
    out.push("  1. **Áp dụng Lot Streaming (Chia nhỏ lô gối đầu)**: Đặt cỡ lô 300–500 pcs để các khâu Cắt Laser → Dập → Hàn Spot chạy gối đầu liên tục, triệt tiêu thời gian chờ đợi tích lũy.");
    out.push("  2. **Nâng ca làm việc trạm nút thắt**: Kích hoạt ca **24/7** cho máy có tỷ lệ bận cao nhất để giải tỏa công suất.");
    out.push("  3. **Rút ngắn thời gian thay khuôn/đồ gá (SMED)**: Chuẩn bị sẵn gá hàn ngoài tuyến, giảm thời gian chuyển đổi mã hàng xuống dưới 15 phút.");
    return out.join("\n");
  }

  // 4. Quét Điểm Nghẽn / Mặc định / Action
  out.push("\n#### 🔍 Phân Tích Tải Trọng & Điểm Nghẽn (Bottlenecks):");
  if(topBusy.length > 0){
    topBusy.forEach((item, idx) => {
      const pct = makespan > 0 ? (item[1] / makespan) * 100 : 0;
      const icon = pct >= 70 ? "🔴" : (pct >= 50 ? "🟠" : (pct >= 35 ? "🟡" : "🟢"));
      out.push(`  ${idx+1}. ${icon} **${item[0]}**: ${item[1].toLocaleString()} phút bận (${pct.toFixed(1)}% makespan)`);
    });
  }

  if(maxBusyPct < 45 && makespan > 0){
    out.push(`\n> 🟢 **ĐÁNH GIÁ TỔNG QUAN:** Dây chuyền hiện tại **đã được cân bằng tải rất tốt**! Máy bận nhất (${sortedM[0][0]}) chỉ chiếm **${maxBusyPct.toFixed(1)}% Makespan**, các điểm nghẽn trước đây đã được giải tỏa thành công. Hệ thống đang vận hành trong ngưỡng an toàn.`);
  }

  out.push("\n#### ⚡ Đề Xuất Hành Động Ngay Cho Quản Đốc:");
  const overloaded = sortedM.filter(x => (x[1] / Math.max(1, makespan)) >= 0.45).map(x => x[0]);
  const idle = idleMachines.map(x => x[0]);
  const targetShifts = overloaded.length ? overloaded : [sortedM[0] ? sortedM[0][0] : "L3-5"];
  const targetIdle = idle.length ? idle.slice(0, 3) : ["L1-6", "L2-1", "L2-2"];

  out.push(`  1. **San tải hàn Spot**: Điều chuyển các nguyên công dồn tải từ trạm (${targetShifts.join(", ")}) sang các máy phụ trợ (${targetIdle.join(", ")}).`);
  out.push(`  2. **Lot Streaming (Chia nhỏ lô gối đầu)**: Giữ cỡ sublot 300–500 pcs để các khâu Laser - Dập - Spot chạy song song liên tục.`);
  out.push(`  3. **Nâng ca máy trọng điểm**: Duy trì chế độ ca **24/7** cho cụm nút thắt để giải phóng nhanh công suất.`);

  if(isAction || isBottleneck){
    const shiftMap = {};
    targetShifts.forEach(m => shiftMap[m] = "24/7");
    const actionPayload = {
      action: "solve_bottlenecks",
      shifts: shiftMap,
      reroute: { from: targetShifts, to: targetIdle },
      re_solve: true,
      note: `Nâng ca 24/7 cho ${targetShifts.join(", ")} và san tải sang ${targetIdle.join(", ")}`
    };
    out.push("\n> 🚀 **Tôi đã tạo khối lệnh thực thi hệ thống bên dưới.** Quản đốc bấm nút **'🚀 Duyệt & Áp Dụng Ngay'** để tự động đổi ca và tái điều độ tối ưu:");
    out.push(`\n\`\`\`action\n${JSON.stringify(actionPayload, null, 2)}\n\`\`\``);
  } else {
    out.push(`\n> 💡 *Quản đốc có thể nhắn \"Hãy thực hiện\" hoặc bấm \"Quét Điểm Nghẽn\" để tôi kích hoạt khối lệnh tự động tối ưu dây chuyền!*`);
  }

  return out.join("\n");
}

async function sendAIChat(customPrompt = null){
  const input = document.getElementById("aiChatInput");
  const prompt = (customPrompt || (input ? input.value : "")).trim();
  if(!prompt) return;
  if(input && !customPrompt) input.value = "";

  appendAIMessage("user", prompt);

  const context = getFactoryContextSnapshot();
  const loadingId = "aiLoadingMsg_" + Date.now();
  const chatLog = document.getElementById("aiChatLog");
  const loadEl = document.createElement("div");
  loadEl.id = loadingId;
  loadEl.style.display = "flex";
  loadEl.style.gap = "8px";
  loadEl.innerHTML = `<span style="font-size:16px">🧠</span><div style="font-size:11.5px;color:var(--muted);font-style:italic">Trợ lý AI đang phân tích dữ liệu xưởng... (lần đầu có thể mất tới 1 phút)</div>`;
  chatLog.appendChild(loadEl);
  chatLog.scrollTop = chatLog.scrollHeight;

  try {
    const res = await fetch(`${API_BASE}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, context })
    });
    const oldLoad = document.getElementById(loadingId);
    if(oldLoad) oldLoad.remove();

    let raw = "", label = "";
    if(res.ok){
      const data = await res.json();
      raw = (data && data.answer) || "";
      label = aiSourceLabel(data);
    }
    // Máy chủ AI chưa sẵn sàng / không có câu trả lời -> bộ phân tích quy tắc tại chỗ (ghi rõ nguồn)
    if(!raw || raw.trim().length === 0){
      raw = generateClientSideAIResponse(prompt, context);
      label = "Phân tích quy tắc tại chỗ (AI chưa kết nối)";
    }
    const parsed = parseAIAction(raw);
    appendAIMessage("ai", parsed.clean || raw, label);
    if(parsed.action) renderAIActionCard(parsed.action);
  } catch(err){
    const oldLoad = document.getElementById(loadingId);
    if(oldLoad) oldLoad.remove();
    const raw = generateClientSideAIResponse(prompt, context);
    const parsed = parseAIAction(raw);
    appendAIMessage("ai", parsed.clean || raw, "Phân tích quy tắc tại chỗ (AI chưa kết nối)");
    if(parsed.action) renderAIActionCard(parsed.action);
  }
}

// Nhãn nguồn trả lời: cho người dùng biết câu trả lời đến từ AI thật hay bộ quy tắc
function aiSourceLabel(data){
  if(!data) return "";
  const m = data.model ? " · " + data.model : "";
  switch(data.provider){
    case "gemini_api": return "Gemini AI" + m;
    case "gemini_web": return "Gemini AI (web)" + m;
    case "openrouter": return "AI (OpenRouter)" + m;
    case "expert_rule_engine": return "Phân tích quy tắc (AI chưa cấu hình khóa)";
    default: return "";
  }
}

/* ============================================================
   AI HÀNH ĐỘNG GHI EXCEL — đề xuất → Quản đốc Duyệt → ghi file
   AI chỉ ĐỀ XUẤT (khối ```action). Người dùng bấm Duyệt mới ghi.
   ============================================================ */
function parseAIAction(text){
  if(!text) return { clean: text, action: null };
  const m = text.match(/```(?:action|json)\s*([\s\S]*?)```/i);
  if(!m) return { clean: text, action: null };
  let action = null;
  try { action = JSON.parse(m[1].trim()); } catch(e){ action = null; }
  const clean = text.replace(m[0], "").trim();
  // Chỉ coi là action hợp lệ nếu có trường "action" là chuỗi
  if(!action || typeof action.action !== "string") return { clean: clean || text, action: null };
  return { clean, action };
}

function _validateAIAction(action){
  const type = action && action.action;
  if(type === "update_actual"){
    if(!Array.isArray(action.data) || !action.data.length) return "Thiếu dữ liệu cập nhật.";
    const ids = new Set((model && model.parts ? model.parts : []).map(p => p.id));
    const bad = action.data.filter(d => !d || !ids.has(d.part));
    if(bad.length) return "Part không tồn tại trong kế hoạch: " + bad.map(d => (d && d.part) || "?").join(", ");
    return null;
  }
  if(type === "save_khsx_dong") return null;
  if(type === "solve_bottlenecks") return null;
  if(type === "set_machine_shift"){
    if(!action.shifts || typeof action.shifts !== "object") return "Thiếu danh sách máy và ca mới.";
    return null;
  }
  if(type === "reroute_machine"){
    if(!Array.isArray(action.from_machines) || !Array.isArray(action.to_machines)) return "Thiếu danh sách máy nguồn hoặc máy nhận san tải.";
    return null;
  }
  if(type === "re_solve") return null;
  return "Loại lệnh chưa hỗ trợ: " + type;
}

function renderAIActionCard(action){
  const chatLog = document.getElementById("aiChatLog");
  if(!chatLog) return;
  const card = document.createElement("div");
  card.style.cssText = "margin:2px 0 6px 30px;max-width:88%;background:rgba(245,158,11,0.10);border:1px solid #f59e0b;border-radius:10px;padding:10px 12px;font-size:12px;line-height:1.55;color:var(--fg)";

  let title = "⚡ AI đề xuất thao tác hệ thống";
  let btnLabel = "✔ Duyệt & Thực Thi";
  let summary = "";

  if(action.action === "solve_bottlenecks"){
    title = "⚡ AI đề xuất Gói Khắc Phục Điểm Nghẽn Toàn Diện";
    btnLabel = "🚀 Duyệt & Áp Dụng Ngay";
    const shiftsStr = action.shifts ? Object.entries(action.shifts).map(([m, s]) => `<b>${m}</b> ➔ <span style="color:var(--good);font-weight:700">${s}</span>`).join(", ") : "";
    const rerouteStr = action.reroute ? `Từ <b>${(action.reroute.from||[]).join(", ")}</b> sang máy nhàn rỗi <b>${(action.reroute.to||[]).join(", ")}</b>` : "";
    summary = `<b>Hành động tự động khi duyệt:</b><br>` +
      (shiftsStr ? `• <b>Nâng ca làm việc</b>: ${shiftsStr}<br>` : "") +
      (rerouteStr ? `• <b>Mở rộng định tuyến (san tải)</b>: ${rerouteStr}<br>` : "") +
      `• ⚡ <b>Tự động Tái điều độ lại toàn bộ xưởng</b> (co ngắn Makespan và san đều tải trọng).`;
  } else if(action.action === "set_machine_shift"){
    title = "⚡ AI đề xuất Đổi Ca Làm Việc & Tái Điều Độ";
    btnLabel = "✔ Duyệt & Đổi Ca";
    const shiftsStr = Object.entries(action.shifts || {}).map(([m, s]) => `<b>${m}</b> ➔ <b>${s}</b>`).join(", ");
    summary = `Chuyển ca cho máy: ${shiftsStr}<br>• <i>Tự động giải lại lịch điều độ ngay sau khi đổi ca.</i>`;
  } else if(action.action === "reroute_machine"){
    title = "⚡ AI đề xuất San Tải Điểm Nghẽn & Tái Điều Độ";
    btnLabel = "✔ Duyệt & San Tải";
    summary = `San tải từ các máy quá tải <b>${(action.from_machines||[]).join(", ")}</b> sang máy nhàn rỗi <b>${(action.to_machines||[]).join(", ")}</b>.<br>• <i>Tự động giải lại lịch điều độ để san đều tải trọng.</i>`;
  } else if(action.action === "re_solve"){
    title = "⚡ AI đề xuất Tái Điều Độ Lại Dây Chuyền";
    btnLabel = "⚡ Duyệt & Tái Điều Độ";
    summary = `Chạy lại thuật toán điều độ tối ưu` + (action.sublot_size ? ` (Cỡ lô gối đầu: <b>${action.sublot_size}</b>)` : "") + `.`;
  } else if(action.action === "update_actual"){
    title = "⚡ AI đề xuất Cập Nhật Sản Lượng Thực Tế";
    btnLabel = "✔ Duyệt & Ghi";
    const rows = action.data.map(d =>
      `• <b>${d.part}</b> → Thực tế = <b>${Math.max(0, Math.round(Number(d.actual) || 0))}</b>`
    ).join("<br>");
    summary = `AI đề xuất <b>ghi cột Thực tế</b> cho ${action.data.length} part:<br>${rows}`;
  } else if(action.action === "save_khsx_dong"){
    title = "⚡ AI đề xuất Lưu Sheet Kế Hoạch Động";
    btnLabel = "✔ Duyệt & Lưu";
    summary = "AI đề xuất <b>lưu/chốt sheet Kế hoạch Động</b> hiện tại xuống file Excel.";
  }

  if(action.note) summary += `<br><span style="color:var(--muted)">Ghi chú: ${String(action.note).slice(0,250)}</span>`;

  const err = _validateAIAction(action);
  if(err){
    card.innerHTML = `<div style="font-weight:700;color:#f59e0b;margin-bottom:4px">⚠️ Lệnh bị chặn</div>${summary}<br><span style="color:var(--bad)">${err}</span>`;
    chatLog.appendChild(card); chatLog.scrollTop = chatLog.scrollHeight; return;
  }

  const bid = "aiAct_" + Date.now();
  card.innerHTML = `
    <div style="font-weight:700;color:#f59e0b;margin-bottom:5px">${title}</div>
    <div class="aiActBody">${summary}</div>
    <div class="aiActBtns" style="display:flex;gap:8px;margin-top:9px">
      <button id="${bid}_ok" style="background:var(--good);color:#fff;border:none;border-radius:6px;padding:6px 14px;font-weight:700;cursor:pointer">${btnLabel}</button>
      <button id="${bid}_no" style="background:transparent;color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:6px 14px;cursor:pointer">✖ Hủy</button>
    </div>`;
  chatLog.appendChild(card);
  chatLog.scrollTop = chatLog.scrollHeight;

  document.getElementById(bid + "_ok").onclick = async () => {
    const btns = card.querySelector(".aiActBtns");
    if(btns) btns.innerHTML = '<span style="color:var(--accent);font-weight:600">⏳ Đang thực thi trên hệ thống &amp; Tái điều độ...</span>';
    try{
      const res = await executeAIAction(action);
      let ok = "✅ Đã thực thi thành công theo đề xuất của AI.";
      if(res && res.message) ok = `<div style="line-height:1.6">${res.message}</div>`;
      card.innerHTML = `<div style="color:var(--good);font-weight:700">${ok}</div>`;
    }catch(e){
      card.innerHTML = `<div style="color:var(--bad);font-weight:700">❌ Thực thi lỗi: ${e.message}</div>`;
    }
    chatLog.scrollTop = chatLog.scrollHeight;
  };
  document.getElementById(bid + "_no").onclick = () => {
    card.innerHTML = `<div style="color:var(--muted)">✖ Đã hủy — không thay đổi cấu hình.</div>`;
  };
}

async function executeAIAction(action){
  // 1. Gói giải pháp toàn diện cho điểm nghẽn
  if(action.action === "solve_bottlenecks"){
    if(!model || !model.machines) throw new Error("Chưa có mô hình dữ liệu xưởng.");
    const report = [];

    // Nâng ca làm việc cho cụm máy quá tải
    if(action.shifts && typeof action.shifts === "object"){
      let shCount = 0;
      Object.entries(action.shifts).forEach(([mName, shVal]) => {
        const mi = model.machines.findIndex(m => strip(m).toLowerCase() === strip(mName).toLowerCase());
        if(mi >= 0){
          if(!model.machineShifts) model.machineShifts = model.machines.map(() => "HC");
          model.machineShifts[mi] = String(shVal);
          shCount++;
        }
      });
      if(shCount > 0) report.push(`Đã nâng ca ${Object.keys(action.shifts).join(", ")} sang ca <b>${Object.values(action.shifts)[0]}</b>`);
    }

    // San tải định tuyến sang máy nhàn rỗi
    const reroute = action.reroute || {};
    const fromList = (reroute.from || action.from_machines || []).map(m => strip(m).toLowerCase());
    const toList = (reroute.to || action.to_machines || []).map(m => strip(m).toLowerCase());
    const validTo = model.machines.filter(m => toList.includes(strip(m).toLowerCase()));
    if(validTo.length > 0 && fromList.length > 0){
      let expandedOps = 0;
      let touchedParts = 0;
      (model.parts || []).forEach(p => {
        let partHit = false;
        (p.ops || []).forEach(op => {
          const match = (op.choices || []).filter(c => fromList.includes(strip(c.m).toLowerCase()));
          if(match.length > 0){
            const baseTime = match[0].time || 15;
            const currentM = new Set((op.choices || []).map(c => strip(c.m).toLowerCase()));
            validTo.forEach(targetM => {
              if(!currentM.has(strip(targetM).toLowerCase())){
                op.choices.push({ m: targetM, time: baseTime });
                currentM.add(strip(targetM).toLowerCase());
                expandedOps++;
                partHit = true;
              }
            });
          }
        });
        if(partHit) touchedParts++;
      });
      if(expandedOps > 0) report.push(`Đã mở rộng san tải ${expandedOps} công đoạn sang các máy trống <b>[${validTo.join(", ")}]</b>`);
    }

    // Cỡ lô gối đầu (nếu có)
    if(action.sublot_size){
      const elSubLot = document.getElementById("subLotSize");
      if(elSubLot) elSubLot.value = action.sublot_size;
      report.push(`Áp dụng cỡ lô gối đầu ${action.sublot_size}`);
    }

    // Tự động Tái điều độ
    let solveNote = "";
    try {
      if(typeof runSolveCpsat === "function" && typeof API_BASE !== "undefined"){
        await runSolveCpsat();
        solveNote = "Tối ưu OR-Tools CP-SAT";
      } else {
        runSolve();
        solveNote = "Heuristic client";
      }
    } catch(e){
      runSolve();
      solveNote = "Heuristic client";
    }

    // Cập nhật giao diện toàn diện
    if(typeof renderGantt === "function") renderGantt();
    if(typeof renderStats === "function") renderStats();
    if(typeof renderKHSXDong === "function") renderKHSXDong();
    if(typeof updateThreeScene === "function") updateThreeScene();

    const msStr = schedule ? `${schedule.makespan} phút (~${Math.round(schedule.makespan/60*10)/10} giờ)` : "đã tính lại";
    return {
      message: `🎉 <b>Kích hoạt thành công gói giải pháp điều độ:</b><br>• ${report.join("<br>• ")}<br>⚡ <b>Đã Tái điều độ thành công (${solveNote})!</b> Makespan mới: <b style="color:var(--good);font-size:13px">${msStr}</b>.`
    };
  }

  // 2. Đổi ca làm việc cho máy
  if(action.action === "set_machine_shift"){
    if(!model || !model.machines) throw new Error("Chưa có mô hình dữ liệu xưởng.");
    const shiftsObj = action.shifts || {};
    let changedCount = 0;
    const changedNames = [];
    Object.entries(shiftsObj).forEach(([mName, shVal]) => {
      const mi = model.machines.findIndex(m => strip(m).toLowerCase() === strip(mName).toLowerCase());
      if(mi >= 0){
        if(!model.machineShifts) model.machineShifts = model.machines.map(() => "HC");
        model.machineShifts[mi] = String(shVal);
        changedCount++;
        changedNames.push(`<b>${model.machines[mi]}</b> ➔ ${shVal}`);
      }
    });
    if(changedCount === 0) throw new Error("Không tìm thấy máy nào trong danh sách thiết bị xưởng.");

    if(action.re_solve !== false){
      try {
        if(typeof runSolveCpsat === "function" && typeof API_BASE !== "undefined") await runSolveCpsat();
        else runSolve();
      } catch(e){
        runSolve();
      }
    }
    if(typeof renderGantt === "function") renderGantt();
    if(typeof renderStats === "function") renderStats();
    const msStr = schedule ? `${schedule.makespan} phút (~${Math.round(schedule.makespan/60*10)/10}h)` : "đã cập nhật";
    return {
      message: `✅ Đã đổi ca thành công cho: ${changedNames.join(", ")} và tái điều độ lại xưởng! Makespan mới: <b>${msStr}</b>.`
    };
  }

  // 3. San tải định tuyến máy
  if(action.action === "reroute_machine"){
    if(!model || !model.machines || !model.parts) throw new Error("Chưa có mô hình dữ liệu xưởng.");
    const fromList = (action.from_machines || []).map(m => strip(m).toLowerCase());
    const toList = (action.to_machines || []).map(m => strip(m).toLowerCase());
    const validTo = model.machines.filter(m => toList.includes(strip(m).toLowerCase()));
    if(validTo.length === 0) throw new Error("Các máy nhận san tải không tồn tại trong danh sách thiết bị xưởng.");

    let expandedOps = 0;
    let affectedParts = 0;
    (model.parts || []).forEach(p => {
      let partTouched = false;
      (p.ops || []).forEach(op => {
        const matchingChoices = (op.choices || []).filter(c => fromList.includes(strip(c.m).toLowerCase()));
        if(matchingChoices.length > 0){
          const baseTime = matchingChoices[0].time || 15;
          const currentM = new Set((op.choices || []).map(c => strip(c.m).toLowerCase()));
          validTo.forEach(targetM => {
            if(!currentM.has(strip(targetM).toLowerCase())){
              op.choices.push({ m: targetM, time: baseTime });
              currentM.add(strip(targetM).toLowerCase());
              expandedOps++;
              partTouched = true;
            }
          });
        }
      });
      if(partTouched) affectedParts++;
    });

    if(expandedOps === 0) throw new Error("Không tìm thấy công đoạn nào thuộc các máy nguồn để san tải.");

    if(action.re_solve !== false){
      try {
        if(typeof runSolveCpsat === "function" && typeof API_BASE !== "undefined") await runSolveCpsat();
        else runSolve();
      } catch(e){
        runSolve();
      }
    }
    if(typeof renderGantt === "function") renderGantt();
    if(typeof renderStats === "function") renderStats();
    const msStr = schedule ? `${schedule.makespan} phút (~${Math.round(schedule.makespan/60*10)/10}h)` : "đã cập nhật";
    return {
      message: `✅ Đã mở rộng san tải ${expandedOps} công đoạn (${affectedParts} mã part) sang [${validTo.join(", ")}] và tái điều độ thành công! Makespan mới: <b>${msStr}</b>.`
    };
  }

  // 4. Tái điều độ
  if(action.action === "re_solve"){
    if(!model) throw new Error("Chưa có mô hình dữ liệu xưởng.");
    if(action.sublot_size){
      const elSubLot = document.getElementById("subLotSize");
      if(elSubLot) elSubLot.value = action.sublot_size;
    }
    if(action.time_limit){
      const elLimit = document.getElementById("cpTimeLimit");
      if(elLimit) elLimit.value = action.time_limit;
    }
    let solveNote = "";
    try {
      if(typeof runSolveCpsat === "function" && typeof API_BASE !== "undefined"){
        await runSolveCpsat();
        solveNote = "OR-Tools CP-SAT";
      } else {
        runSolve();
        solveNote = "Heuristic";
      }
    } catch(e){
      runSolve();
      solveNote = "Heuristic";
    }
    if(typeof renderGantt === "function") renderGantt();
    if(typeof renderStats === "function") renderStats();
    const msStr = schedule ? `${schedule.makespan} phút (~${Math.round(schedule.makespan/60*10)/10}h)` : "đã cập nhật";
    return {
      message: `✅ Đã tái điều độ thành công (${solveNote})! Makespan mới: <b>${msStr}</b>.`
    };
  }

  // 5. Cập nhật thực tế
  if(action.action === "update_actual"){
    // Áp vào model + cập nhật giao diện + giải lại lịch (giống sửa tay cột Thực tế)
    action.data.forEach(d => {
      if(typeof onEditThucTe === "function") onEditThucTe(d.part, d.actual);
    });
    // Ghi dứt điểm xuống Excel và CHỜ kết quả thật (không chỉ dựa vào auto-save debounce)
    const _ids = new Set(action.data.map(d => d.part));
    const actuals = (model.parts || []).filter(p => _ids.has(p.id)).map(p => ({ part: p.id, actual: p.actualQty || 0 }));
    const targetFile = (typeof activeWatchFile !== "undefined" && activeWatchFile) || "KeHoach_HanSpot_Tuan_Thang_Mau.xlsx";
    const resp = await fetch(`${API_BASE}/api/excel/save-actual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: targetFile, actuals })
    });
    if(!resp.ok){
      const e = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(e.detail || "Lỗi lưu");
    }
    const res = await resp.json();
    _ids.forEach(id => _dirtyThucTe.delete(id));
    if(res.mtime && typeof lastWatchMtime !== "undefined") lastWatchMtime = res.mtime;
    return res;
  }

  // 6. Lưu KHSX Động
  if(action.action === "save_khsx_dong"){
    if(typeof saveKHSXDongToExcel === "function"){ await saveKHSXDongToExcel(); return { message: "Đã xử lý lưu Kế hoạch Động." }; }
    throw new Error("Chức năng lưu Kế hoạch Động chưa sẵn sàng");
  }
  throw new Error("Loại lệnh không hỗ trợ");
}

/* ============================================================
   AI TỰ ĐỘNG KIỂM TRA ĐỊNH KỲ (chỉ chạy khi app đang mở)
   Mỗi chu kỳ: rà soát lịch bằng rule miễn phí; CHỈ khi phát hiện
   vấn đề mới gọi AI (Gemini nếu đã đăng nhập) để phân tích sâu.
   ============================================================ */
let _autoCheckTimer = null;
let _autoCheckBusy = false;

function setAutoCheckInterval(minutesRaw){
  const minutes = parseInt(minutesRaw, 10) || 0;
  if(_autoCheckTimer){ clearInterval(_autoCheckTimer); _autoCheckTimer = null; }
  try { localStorage.setItem('ai_auto_check_min', String(minutes)); } catch(e){}
  const sel = document.getElementById('aiAutoCheck');
  if(sel && sel.value !== String(minutes)) sel.value = String(minutes);
  if(minutes <= 0){
    appendAIMessage('system', '⏹ Đã tắt chế độ AI tự động kiểm tra định kỳ.');
    return;
  }
  appendAIMessage('system', `✅ Đã bật AI tự động rà soát toàn bộ lịch mỗi <b>${minutes} phút</b>. (Chỉ chạy khi app đang mở.)`);
  autoHealthCheck(); // chạy ngay 1 lần cho thấy kết quả
  _autoCheckTimer = setInterval(autoHealthCheck, minutes * 60 * 1000);
}

function _scanScheduleIssues(){
  const warns = [];
  if(!model || !schedule) return warns;
  const ctx = getFactoryContextSnapshot();
  // 1) Part trễ hạn
  if(ctx.tardyParts && ctx.tardyParts.length){
    const list = ctx.tardyParts.slice(0, 6).join(', ');
    warns.push(`🔴 ${ctx.tardyParts.length} part nguy cơ trễ hạn: ${list}${ctx.tardyParts.length > 6 ? '…' : ''}`);
  }
  // 2) Máy quá tải (≥90% makespan)
  const ms = ctx.makespan || 0;
  if(ms > 0 && ctx.busyTimes){
    const over = Object.entries(ctx.busyTimes)
      .filter(([m, b]) => b / ms >= 0.9)
      .map(([m, b]) => `${m} (${Math.round(b / ms * 100)}%)`);
    if(over.length) warns.push(`🟠 Máy tải cao ≥90%: ${over.slice(0, 6).join(', ')}`);
  }
  // 3) Thực tế quá chậm so với kế hoạch
  const behind = (model.parts || []).filter(p =>
    (p.planQty || 0) >= 10 && (p.actualQty || 0) > 0 && p.actualQty < p.planQty * 0.4
  );
  if(behind.length){
    warns.push(`🟡 ${behind.length} part thực tế <40% kế hoạch: ${behind.slice(0, 5).map(p => p.id).join(', ')}${behind.length > 5 ? '…' : ''}`);
  }
  return warns;
}

async function autoHealthCheck(){
  if(_autoCheckBusy) return;
  if(!model || !schedule) return;
  _autoCheckBusy = true;
  try {
    const stamp = new Date().toLocaleTimeString();
    const warns = _scanScheduleIssues();
    if(!warns.length){
      appendAIMessage('system', `⏰ Kiểm tra tự động ${stamp}: 🟢 Lịch ổn định — không phát hiện trễ hạn/quá tải.`);
      return;
    }
    appendAIMessage('system',
      `⏰ Kiểm tra tự động ${stamp} — phát hiện:\n${warns.map(w => '• ' + w).join('\n')}\n\n🧠 Đang nhờ AI phân tích sâu & đề xuất khắc phục...`);
    // Chỉ gọi AI KHI có vấn đề -> tiết kiệm quota Gemini
    const prompt = `Đợt kiểm tra định kỳ phát hiện các vấn đề sau trên lịch điều độ hiện tại:\n${warns.join('\n')}\n\nHãy phân tích nguyên nhân cốt lõi và đề xuất 2-3 hành động khắc phục cụ thể, ngắn gọn, mang tính hành động cho Quản đốc.`;
    const res = await fetch(`${API_BASE}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, context: getFactoryContextSnapshot() })
    });
    if(res.ok){
      const data = await res.json();
      const parsed = parseAIAction(data.answer || '');
      if(parsed.clean) appendAIMessage('ai', parsed.clean, aiSourceLabel(data));
      if(parsed.action) renderAIActionCard(parsed.action);
    }
  } catch(e){
    console.warn('autoHealthCheck lỗi:', e);  // không làm phiền trong vòng lặp nền
  } finally {
    _autoCheckBusy = false;
  }
}

function restoreAutoCheckSetting(){
  let min = 0;
  try { min = parseInt(localStorage.getItem('ai_auto_check_min') || '0', 10) || 0; } catch(e){}
  const sel = document.getElementById('aiAutoCheck');
  if(sel) sel.value = String(min);
  if(min > 0){
    if(_autoCheckTimer) clearInterval(_autoCheckTimer);
    // Không chạy ngay lúc khởi động để tránh ồn; chờ hết chu kỳ đầu.
    _autoCheckTimer = setInterval(autoHealthCheck, min * 60 * 1000);
  }
}

function runAIQuickAction(type){
  if(type === 'bottlenecks'){
    sendAIChat("Hãy phân tích chi tiết các điểm nghẽn (bottlenecks) của xưởng hiện tại: máy nào đang bị quá tải nhất, tỷ lệ bận bao nhiêu %, và đề xuất phương án san tải tối ưu.");
  } else if(type === 'late_risks'){
    sendAIChat("Hãy kiểm tra và dự báo các Part có nguy cơ trễ hạn (Due date), phân tích nguyên nhân tại sao trễ và cần can thiệp ở công đoạn nào.");
  } else if(type === 'optimize_makespan'){
    sendAIChat("Hãy đề xuất các giải pháp kỹ thuật để rút ngắn thời gian hoàn thành (Makespan) toàn xưởng: cỡ lô gối đầu, điều chỉnh ca làm việc hoặc sắp xếp lại thứ tự ưu tiên.");
  } else if(type === 'workers_advisory'){
    sendAIChat("Hãy tư vấn phân bổ công nhân: thợ bậc 2, bậc 3, bậc 4 nên ưu tiên xếp vào máy nào để nâng cao năng suất và chất lượng mối hàn?");
  }
}

function renderAIBrainTab(){
  if(!aiInitialized){
    aiInitialized = true;
    checkBrainStatus();
    initWelcomeAIMessage();
    const inp = document.getElementById("aiChatInput");
    if(inp){
      inp.addEventListener("keydown", e => {
        if(e.key === "Enter" && !e.shiftKey){
          e.preventDefault();
          sendAIChat();
        }
      });
    }
  }
}
window.loginGeminiBrain = loginGeminiBrain;
window.clearAIChat = clearAIChat;
window.sendAIChat = sendAIChat;
window.runAIQuickAction = runAIQuickAction;

document.querySelectorAll(".tab").forEach(t=>t.addEventListener("click",()=>setTab(t.dataset.pane)));
function exitLiveMode(){
  if(!sim.liveMode) return;
  sim.liveMode=false;
  const sel=document.getElementById("speed"); if(sel) sel.value="1"; sim.realRatio=0; sim.speed=1;
}
document.getElementById("playBtn").addEventListener("click",()=>{
  exitLiveMode(); // bấm play = thoát chế độ bám giờ thực, chuyển sang playback thủ công
  sim.playing=!sim.playing; document.getElementById("playBtn").textContent=sim.playing?"❚❚":"▶";
});
document.getElementById("scrub").addEventListener("input",e=>{
  if(!schedule)return; exitLiveMode(); sim.t=schedule.makespan*(e.target.value/1000); sim.playing=false;
  document.getElementById("playBtn").textContent="▶";
  if(activeTab === "workers") renderWorkersPlan();
});
document.getElementById("speed").addEventListener("change",e=>{
  const v=e.target.value;
  if(v==="live"){
    sim.liveMode=true; sim.realRatio=0; sim.playing=false;
    document.getElementById("playBtn").textContent="▶";
  } else {
    sim.liveMode=false; const n=+v;
    if(n>=30){ sim.realRatio=n; sim.speed=1; }  // playback tỉ lệ thực
    else { sim.realRatio=0; sim.speed=n; }      // demo
  }
});
document.getElementById("objective").addEventListener("change",()=>{if(model)runSolve();});
const elSubLotSel = document.getElementById("subLotSize");
if(elSubLotSel) elSubLotSel.addEventListener("change",()=>{if(model)runSolve();});
document.getElementById("solveBtn").addEventListener("click",()=>{if(model)runSolve();});
document.getElementById("solveCpsatBtn").addEventListener("click",()=>{if(model)runSolveCpsat();});
document.getElementById("sampleBtn").addEventListener("click",()=>loadModel(structuredClone(SAMPLE)));
const elShiftSelect = document.getElementById("shiftSelect");
if(elShiftSelect) elShiftSelect.addEventListener("change",()=>{if(model)runSolve();});
document.getElementById("addDtBtn").addEventListener("click",addDowntime);
document.getElementById("rescheduleBtn").addEventListener("click",runDynamicReschedule);

const btnOpenKHSX = document.getElementById("btnOpenKHSXDong");
if(btnOpenKHSX) btnOpenKHSX.addEventListener("click", () => setTab("khsxDong"));

async function exportScheduleExcel(){
  if(!schedule || !model){ alert("Chưa có lịch để xuất. Hãy giải lịch (Heuristic hoặc CP-SAT) trước!"); return; }
  const btn = document.getElementById("btnExportExcel");
  const old = btn ? btn.innerHTML : "";
  if(btn){ btn.disabled = true; btn.innerHTML = "<span>⏳ Đang tạo Excel...</span>"; }
  try{
    const machineShifts = model.machines.map((m,i)=> getMachineShiftInfo(i).name || "HC");
    const payload = {
      filename: "LichSanXuat_HanSpot.xlsx",
      machines: model.machines,
      intervals: schedule.intervals || [],
      parts: model.parts || [],
      busy: schedule.busy || [],
      makespan: schedule.makespan || 0,
      dateLabels: model.dateLabels || [],
      machineShifts,
      workers: schedule.workers || model.workers || [],
      perWorker: schedule.perWorker || []
    };
    const res = await fetch(`${API_BASE}/api/export/schedule`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
    if(!res.ok){
      const err = await res.json().catch(()=>({detail:res.statusText}));
      throw new Error(err.detail || "Lỗi xuất Excel");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "LichSanXuat_HanSpot.xlsx";
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
  }catch(err){
    alert("Không xuất được lịch Excel: " + err.message + "\n" + (IS_WEB ? "Máy chủ có thể đang khởi động lại (~1 phút) — hãy thử lại." : "Hãy chắc chắn Backend Python (run.bat) đang chạy."));
  }finally{
    if(btn){ btn.disabled = false; btn.innerHTML = old; }
  }
}
const btnExport = document.getElementById("btnExportExcel");
if(btnExport) btnExport.addEventListener("click", exportScheduleExcel);

// WIP / Vị trí chờ: nút xuất + cập nhật khi đổi sức chứa / buffer
const btnExportWip = document.getElementById("btnExportWip");
if(btnExportWip) btnExportWip.addEventListener("click", exportWipExcel);
// Uỷ quyền sự kiện cho các nút trong #wipContent (được render lại nhiều lần)
const wipHost = document.getElementById("wipContent");
if(wipHost) wipHost.addEventListener("click", (e) => {
  const b = e.target.closest(".execBtn");
  if(b){ execToggle(b.dataset.type, b.dataset.key, +b.dataset.qty || 0); return; }
  if(e.target.closest("#btnExportExec")){ exportExecExcel(); return; }
  if(e.target.closest("#btnClearExec")){ clearExec(); return; }
});
["wipStagingCap","wipMachineBuffer","wipLead","wipAnchor"].forEach(id => {
  const el = document.getElementById(id);
  if(el) el.addEventListener("input", () => { if(activeTab === "wip") renderWipPlan(); });
});
// Đồng hồ thời gian thực: cập nhật mỗi giây (chỉ chữ), tính lại trạng thái gọi mỗi 30s
setInterval(() => { if(activeTab === "wip") updateWipNowBar(); }, 1000);
setInterval(() => { if(activeTab === "wip") renderWipPlan(); }, 30000);

// Nhịp tim giữ server sống. Khi đóng ứng dụng (trình duyệt), nhịp ngừng và
// server chạy ẩn sẽ tự thoát sau ~25s (watchdog trong server.py).
function sendHeartbeat(){ try{ fetch(`${API_BASE}/api/heartbeat`,{cache:"no-store"}).catch(()=>{}); }catch(e){} }
sendHeartbeat();
setInterval(sendHeartbeat, 5000);

const btnExpKHSX = document.getElementById("btnExportKHSXDong");
if(btnExpKHSX) btnExpKHSX.addEventListener("click", exportKHSXDongExcel);
const btnSaveKHSX = document.getElementById("btnSaveKHSXDongToExcel");
if(btnSaveKHSX) btnSaveKHSX.addEventListener("click", saveKHSXDongToExcel);
// Sửa trực tiếp cột "Thực tế" trong bảng KHSX_Dong (uỷ quyền vì bảng render lại nhiều lần)
const khsxWrapEl = document.getElementById("khsxDongTableWrap");
if(khsxWrapEl) khsxWrapEl.addEventListener("change", (e) => {
  const inp = e.target.closest(".thucteInput");
  if(inp) onEditThucTe(inp.dataset.part, inp.value);
});

// Bộ lọc & Tìm kiếm KHSX_Dong
const elKhsxSearch = document.getElementById("khsxSearchInput");
if(elKhsxSearch){
  elKhsxSearch.addEventListener("input", e => {
    khsxSearchQuery = (e.target.value || "").trim();
    renderKHSXDong();
  });
}
const elKhsxZone = document.getElementById("khsxZoneFilter");
if(elKhsxZone){
  elKhsxZone.addEventListener("change", e => {
    khsxZoneFilter = e.target.value;
    renderKHSXDong();
  });
}
const elWipZone = document.getElementById("wipZoneFilter");
if(elWipZone){
  elWipZone.addEventListener("change", e => {
    wipZoneFilter = e.target.value;
    renderWipPlan();
  });
}
const elKhsxPriority = document.getElementById("khsxPriorityFilter");
if(elKhsxPriority){
  elKhsxPriority.addEventListener("change", e => {
    khsxPriorityFilter = e.target.value;
    renderKHSXDong();
  });
}
const elKhsxStatus = document.getElementById("khsxStatusFilter");
if(elKhsxStatus){
  elKhsxStatus.addEventListener("change", e => {
    khsxStatusFilter = e.target.value;
    renderKHSXDong();
  });
}

// Gắn sự kiện tra cứu Tooltip cho biểu đồ Gantt
const cvGantt = document.getElementById("gantt");
const tipGantt = document.getElementById("ganttTooltip");
if(cvGantt && tipGantt){
  cvGantt.addEventListener("mousemove", ev => {
    if(!schedule || !model) return;
    const rect = cvGantt.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    const N = model.machines.length;
    const labW = 92, padT = 34, padB = 28;
    const h = rect.height;
    const rowH = Math.max(12, Math.min(28, (h - padT - padB) / N));
    const scale = (rect.width - labW - 14) / Math.max(1, schedule.makespan);

    if(mx < labW || my < padT || my > padT + N * rowH){
      tipGantt.style.display = "none";
      if(ganttHoveredIv !== null){ ganttHoveredIv = null; }
      return;
    }

    const mi = Math.floor((my - padT) / rowH);
    if(mi < 0 || mi >= N){
      tipGantt.style.display = "none";
      if(ganttHoveredIv !== null){ ganttHoveredIv = null; }
      return;
    }

    const tMouse = (mx - labW) / scale;
    const mName = model.machines[mi];
    const mSh = getMachineShiftInfo(mi);
    const shiftCode = mSh.code || (mSh.label ? mSh.label.split(":")[0] : "HC");

    // 1. Tìm xem chuột trúng khối việc nào
    const iv = (schedule.perMachine[mi] || []).find(it => tMouse >= it.start && tMouse <= it.end);
    if(iv){
      ganttHoveredIv = iv;
      const durationM = Math.round(iv.end - iv.start);
      const durationS = Math.round((iv.end - iv.start) * 60);
      const partObj = (model && model.parts) ? model.parts.find(x => x.id === iv.part) : null;
      const opObj = (partObj && partObj.ops) ? partObj.ops.find(o => o.seq === iv.seq) : null;
      const descHtml = (opObj && opObj.desc) ? `<div style="margin-top:3px;color:#fcd34d;font-weight:600">⚡ Công nghệ: ${opObj.desc}</div>` : "";
      const ptsHtml  = (opObj && opObj.pts) ? `<div style="margin-top:2px;color:#a3e635;font-size:10.5px">🎯 Số điểm hàn: <b>${opObj.pts}</b></div>` : "";
      const workerHtml = iv.workerName ? `<div style="margin-top:3px;color:#c084fc">👷 Công nhân: <b style="color:#e879f9">${iv.workerName}</b><span style="font-size:10px;color:var(--muted);margin-left:4px">[${iv.workerSkill || ""}]</span></div>` : "";
      let lotHtml = "";
      if(iv.lotQty){
        const unitTag = iv.unit ? ` (Lô con #${iv.unit})` : "";
        const tot = iv.totalQty ? ` / Tổng: <b>${iv.totalQty.toLocaleString()}</b> pcs` : "";
        lotHtml = `<div style="margin-top:3px;color:#93c5fd">📦 Số lượng lô: <b style="color:#fff">${iv.lotQty.toLocaleString()} pcs</b>${unitTag}${tot}</div>`;
      }
      tipGantt.innerHTML = `
        <div style="font-weight:700;font-size:12px;color:#60a5fa;display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span>🔧 ${iv.part} · Thao tác #${iv.seq}</span>
          <span style="font-size:10px;background:#3b82f6;color:#fff;padding:1px 5px;border-radius:3px">P${iv.priority || 2}</span>
        </div>
        ${descHtml}${ptsHtml}
        ${workerHtml}
        <div style="margin-top:4px;color:#cbd5e1">📍 Máy hàn: <b style="color:#fff">${mName}</b> <span style="font-size:10px;color:var(--muted)">[Ca ${shiftCode}]</span></div>
        ${lotHtml}
        <div style="margin-top:4px;color:#cbd5e1">⏱ Thời gian: <b style="color:#38bdf8">${formatClockTime(iv.start)}</b> → <b style="color:#38bdf8">${formatClockTime(iv.end)}</b></div>
        <div style="color:#94a3b8;font-size:10.5px">⏳ Thời lượng: <b style="color:#fff">${durationM} phút</b> (${durationS.toLocaleString()}s) · Mốc: ${Math.round(iv.start)}p - ${Math.round(iv.end)}p</div>
      `;
      tipGantt.style.display = "block";

      const tipW = tipGantt.offsetWidth || 230;
      const tipH = tipGantt.offsetHeight || 110;
      let left = mx + 14;
      let top = my + 10;
      if(left + tipW > rect.width) left = Math.max(10, mx - tipW - 14);
      if(top + tipH > rect.height) top = Math.max(10, my - tipH - 10);
      tipGantt.style.left = left + "px";
      tipGantt.style.top = top + "px";
      return;
    }

    // 2. Kiểm tra xem chuột có trúng sự cố máy (Downtimes) không
    const dt = downtimes.find(d => d.mi === mi && tMouse >= d.start && tMouse <= d.end);
    if(dt){
      ganttHoveredIv = null;
      tipGantt.innerHTML = `
        <div style="font-weight:700;font-size:12px;color:#f87171">⚠ Sự cố / Bảo trì máy</div>
        <div style="margin-top:3px;color:#cbd5e1">📍 Máy: <b style="color:#fff">${mName}</b></div>
        <div style="color:#cbd5e1">Lý do: <b style="color:#fca5a5">${dt.reason}</b></div>
        <div style="margin-top:3px;color:#94a3b8;font-size:10.5px">⏱ ${formatClockTime(dt.start)} → ${formatClockTime(dt.end)} (${Math.round(dt.end - dt.start)}p)</div>
      `;
      tipGantt.style.display = "block";
      tipGantt.style.left = (mx + 14) + "px";
      tipGantt.style.top = (my + 10) + "px";
      return;
    }

    tipGantt.style.display = "none";
    if(ganttHoveredIv !== null){ ganttHoveredIv = null; }
  });

  cvGantt.addEventListener("mouseleave", () => {
    tipGantt.style.display = "none";
    ganttHoveredIv = null;
  });
}

// Excel upload
const drop=document.getElementById("drop"), fileIn=document.getElementById("file");
drop.addEventListener("click",()=>fileIn.click());
drop.addEventListener("dragover",e=>{e.preventDefault();drop.classList.add("drag");});
drop.addEventListener("dragleave",()=>drop.classList.remove("drag"));
drop.addEventListener("drop",e=>{e.preventDefault();drop.classList.remove("drag"); if(e.dataTransfer.files[0])readFile(e.dataTransfer.files[0]);});
fileIn.addEventListener("change",e=>{if(e.target.files[0])readFile(e.target.files[0]);});
let currentWorkbook = null;
let currentPlanSheetName = "";
let currentDsMode = "ALL_INDEPENDENT";

function formatDsSheetLabel(shName){
  const sl = strip(shName);
  if(sl.includes("lasertam")) return `🔦 Khu Cắt Laser Tấm (${shName})`;
  if(sl.includes("laserong")) return `🔦 Khu Cắt Laser Ống (${shName})`;
  if(sl.includes("dap") || sl.includes("press")) return `🔨 Xưởng Dập (${shName})`;
  if(sl.includes("spot")) return `⚡ Xưởng Hàn Spot (${shName})`;
  if(sl.includes("mag") || sl.includes("robot")) return `🤖 Xưởng Hàn MAG Robot (${shName})`;
  return `📋 ${shName}`;
}

function applyWorkbook(wb, preferredSheetName = null, preferredDsMode = null){
  currentWorkbook = wb;
  const m = parseWorkbook(wb, preferredSheetName || currentPlanSheetName, preferredDsMode || currentDsMode);
  currentPlanSheetName = m.currentPlanSheet;
  currentDsMode = m.dsMode || "ALL_INDEPENDENT";

  // Đã chuẩn hóa thành 1 Xưởng Hàn Spot Toàn Diện duy nhất (ẩn hộp chọn đa xưởng)
  const dsBox = document.getElementById("dsSheetBox");
  if(dsBox) dsBox.style.display = "none";

  // Cập nhật dropdown chọn Sheet Kế hoạch (Tuần / Tháng)
  const planBox = document.getElementById("planSheetBox");
  const planSelect = document.getElementById("planSheetSelect");
  const planBadge = document.getElementById("planSheetBadge");
  if(planBox && planSelect){
    if(m.planSheets && m.planSheets.length > 1){
      planBox.style.display = "block";
      if(planBadge) planBadge.textContent = `${m.planSheets.length} sheet`;
      planSelect.innerHTML = m.planSheets.map(s => {
        let label = s;
        const sl = strip(s);
        if(sl.includes("tuan") || sl.includes("week")) label = `📅 Kế hoạch Tuần (${s})`;
        else if(sl.includes("thang") || sl.includes("month")) label = `📆 Kế hoạch Tháng (${s})`;
        return `<option value="${s}" ${s === m.currentPlanSheet ? 'selected' : ''}>${label}</option>`;
      }).join("");

      planSelect.onchange = () => {
        if(currentWorkbook){
          applyWorkbook(currentWorkbook, planSelect.value, currentDsMode);
        }
      };
    } else {
      planBox.style.display = "none";
    }
  }

  loadModel(m);
}

function readFile(f){
  const r=new FileReader();
  r.onload=ev=>{ try{
    const wb=XLSX.read(new Uint8Array(ev.target.result),{type:"array"});
    applyWorkbook(wb);
  }catch(err){ showWarnings(["Không đọc được file: "+err.message+" — kiểm tra đúng định dạng sheet May và sheet Kế hoạch."]); }
  };
  r.readAsArrayBuffer(f);
}

// theme toggle
const themeBtn=document.getElementById("themeBtn");
function applyTheme(mode){ if(mode) document.documentElement.setAttribute("data-theme",mode); else document.documentElement.removeAttribute("data-theme");
  updateSceneTheme(); }
try{ const sv=localStorage.getItem("sw-theme"); if(sv)applyTheme(sv); }catch(e){}
themeBtn.addEventListener("click",()=>{
  const cur=document.documentElement.getAttribute("data-theme");
  const dark=cur==="dark"||(!cur&&matchMedia("(prefers-color-scheme:dark)").matches);
  const next=dark?"light":"dark"; applyTheme(next);
  try{localStorage.setItem("sw-theme",next);}catch(e){}
});

// ============================================================
// TỰ ĐỘNG PHÁT HIỆN KHI FILE EXCEL ĐƯỢC LƯU (LIVE WATCH)
// ============================================================
let activeWatchFile = "";
let lastWatchMtime = 0;
let watchTimer = null;
let isFetchingExcel = false;

async function fetchExcelFromServer(filename, silent=false) {
  if (!filename || isFetchingExcel) return;
  isFetchingExcel = true;
  const statusEl = document.getElementById("watchStatus");
  if (!silent && statusEl) {
    statusEl.innerHTML = `<span style="color:var(--accent)">⏳ Đang tải file <b>${escHtml(filename)}</b>${IS_WEB ? " từ máy chủ" : ""}...</span>`;
  }
  try {
    const res = await fetch(`${API_BASE}/api/excel/data?filename=${encodeURIComponent(filename)}&t=${Date.now()}`);
    if (!res.ok) {
      const ej = await res.json().catch(() => ({}));
      throw new Error(ej.detail || "Không thể tải file từ server");
    }
    const mtimeHeader = res.headers.get("X-File-Mtime");
    if (mtimeHeader) lastWatchMtime = parseFloat(mtimeHeader);
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
    applyWorkbook(wb, currentPlanSheetName);
    activeWatchFile = filename;
    try { localStorage.setItem("xuong_spot_selected_file", filename); } catch(e){}
    if (statusEl) {
      const nowStr = new Date().toLocaleTimeString();
      statusEl.innerHTML = `<span style="color:var(--good);font-weight:600">✓ Đã đồng bộ lúc ${nowStr}</span><br>Đang theo dõi: <b>${escHtml(filename)}</b>${IS_WEB ? " (máy chủ)" : ""}`;
    }
  } catch (err) {
    if (statusEl) {
      statusEl.innerHTML = `<span style="color:var(--bad)">⚠ Lỗi đọc file: ${escHtml(err.message)}</span>`;
    }
  } finally {
    isFetchingExcel = false;
  }
}

async function checkExcelUpdates() {
  const toggle = document.getElementById("autoWatchToggle");
  const statusEl = document.getElementById("watchStatus");
  if (!toggle || !toggle.checked || !activeWatchFile || isFetchingExcel) return;

  try {
    const res = await fetch(`${API_BASE}/api/excel/watch?filename=${encodeURIComponent(activeWatchFile)}&last_mtime=${lastWatchMtime}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.exists && data.modified) {
      if (statusEl) {
        statusEl.innerHTML = `<span style="color:var(--hot);font-weight:600">⚡ Phát hiện file vừa được lưu lúc ${escHtml(data.time_str)}! Đang nạp lại...</span>`;
      }
      lastWatchMtime = data.mtime;
      await fetchExcelFromServer(activeWatchFile, true);
    }
  } catch (e) {
    // server có thể chưa bật
  }
}

async function initExcelAutoWatch() {
  const fileSelect = document.getElementById("autoWatchFile");
  const statusEl = document.getElementById("watchStatus");
  const toggle = document.getElementById("autoWatchToggle");
  const reloadBtn = document.getElementById("reloadExcelBtn");

  try {
    const res = await fetch(`${API_BASE}/api/excel/files`);
    if (!res.ok) {
      const ej = await res.json().catch(() => ({}));
      throw new Error(ej.detail || "Chưa kết nối server");
    }
    const data = await res.json();
    const files = data.files || [];
    fileSelect.innerHTML = "";
    if (files.length === 0) {
      fileSelect.innerHTML = '<option value="">(Không có file .xlsx trong thư mục)</option>';
      if (statusEl) statusEl.textContent = "Không tìm thấy file Excel nào trong thư mục.";
      return;
    }

    files.forEach(f => {
      const opt = document.createElement("option");
      opt.value = f.filename;
      opt.textContent = `${f.filename} (${f.time_str.split(" ")[0]})`;
      fileSelect.appendChild(opt);
    });

    // 1. Kiểm tra file người dùng đã chọn trước đó được lưu trong localStorage
    let savedFile = "";
    try { savedFile = localStorage.getItem("xuong_spot_selected_file"); } catch(e){}

    let defaultFile = "";
    if (savedFile && files.some(f => f.filename === savedFile)) {
      defaultFile = savedFile;
    } else {
      // 2. Ưu tiên cao nhất là file chính thức "KeHoach_HanSpot.xlsx"
      const fSpot = files.find(f => f.filename === "KeHoach_HanSpot.xlsx");
      if (fSpot) {
        defaultFile = fSpot.filename;
      } else {
        // 3. Nếu không có, ưu tiên file có thời gian chỉnh sửa mới nhất
        const sortedByMtime = [...files].sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
        defaultFile = sortedByMtime[0].filename;
      }
    }

    fileSelect.value = defaultFile;
    activeWatchFile = defaultFile;
    try { localStorage.setItem("xuong_spot_selected_file", defaultFile); } catch(e){}

    await fetchExcelFromServer(defaultFile);

    if (watchTimer) clearInterval(watchTimer);
    watchTimer = setInterval(checkExcelUpdates, IS_WEB ? 5000 : 1200);

  } catch (err) {
    if (statusEl) {
      statusEl.innerHTML = IS_WEB
        ? `<span style="color:var(--bad)">⚠ Chưa đọc được file kế hoạch từ máy chủ: ${escHtml(err.message)}</span><br>Đang hiển thị <b>dữ liệu mẫu</b>. Bấm ↻ để thử lại.`
        : `<span style="color:var(--muted)">Server offline. Chạy <b>run.bat</b> để bật tính năng tự đồng bộ khi lưu Excel.</span>`;
    }
  }

  fileSelect.addEventListener("change", () => {
    activeWatchFile = fileSelect.value;
    try { localStorage.setItem("xuong_spot_selected_file", activeWatchFile); } catch(e){}
    lastWatchMtime = 0;
    fetchExcelFromServer(activeWatchFile);
  });

  reloadBtn.addEventListener("click", () => {
    lastWatchMtime = 0;
    fetchExcelFromServer(activeWatchFile);
  });

  toggle.addEventListener("change", () => {
    if (statusEl) {
      if (toggle.checked) {
        statusEl.innerHTML = `<span style="color:var(--good)">🟢 Đang theo dõi file <b>${escHtml(activeWatchFile)}</b></span>`;
      } else {
        statusEl.innerHTML = `<span style="color:var(--muted)">⏸ Đã tạm dừng tự động theo dõi file.</span>`;
      }
    }
  });
}

// khởi động với dữ liệu mẫu
if(!THREE_OK){ document.getElementById("pane-three").innerHTML='<div style="display:grid;place-items:center;height:100%;color:var(--muted);text-align:center;padding:20px">Trình duyệt không tải được 3D.<br>Dùng tab “Sơ đồ máy” và “Gantt”.</div>'; }
loadModel(structuredClone(SAMPLE));
setTab("three");
requestAnimationFrame(loop);
initExcelAutoWatch();
checkBrainStatus(); // Kích hoạt kiểm tra và kết nối Bộ Não AI Gemini ngay khi khởi động
restoreAutoCheckSetting(); // Khôi phục chu kỳ AI tự động kiểm tra (nếu lần trước đã bật)
