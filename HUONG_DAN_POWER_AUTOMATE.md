# Đồng bộ file Excel trên SharePoint qua Power Automate (không cần Admin)

Phương án đã chốt: backend trên Render **không** gọi thẳng Graph/SharePoint (tránh phải xin
quyền admin). Thay vào đó backend gọi **một flow Power Automate**; flow chạy bằng **kết nối
SharePoint của chính tài khoản `@ckthanhdat.vn`** tạo ra nó, nên **không cần admin consent**.

```
Trình duyệt (User.Read)  →  Backend Render  →  Power Automate (HTTP)  →  SharePoint / Excel
                             gửi Bearer token      flow + Office Script       KeHoach_HanSpot.xlsx
```

- **Đọc**: backend gửi `{action:"read"}` → flow trả nội dung file (base64) + thời điểm sửa.
- **Ghi (2 chiều)**: backend gửi dữ liệu có cấu trúc (Thực tế / KHSX_Dong) → flow chạy
  **Office Script** sửa đúng ô → **giữ nguyên công thức, định dạng** các sheet khác.

> Yêu cầu: tài khoản có **Power Automate Premium** (trigger *When an HTTP request is received*,
> action *Response* và *Run script* đều là Premium — bạn đã xác nhận có).

---

## Bước 1 — Tạo Office Script trong Excel Online

1. Mở `KeHoach_HanSpot.xlsx` trên SharePoint bằng **Excel for the web**.
2. Tab **Automate** → **New Script**.
3. Xoá hết mã mẫu, dán **toàn bộ** nội dung file [`power_automate/OfficeScript_GhiKeHoach.ts`](power_automate/OfficeScript_GhiKeHoach.ts).
4. Đổi tên script thành **`GhiKeHoach_HanSpot`** → **Save script**.

## Bước 2 — Tạo flow cầu nối (một flow, một URL)

Power Automate → **Create** → **Instant cloud flow** → trigger **When an HTTP request is received**.
Đặt tên ví dụ **`DieuDo - SharePoint Bridge`**.

**2.1. Trigger** — *When an HTTP request is received*
- *Method*: `POST`
- *Request Body JSON Schema* (bấm "Use sample payload" rồi dán):
  ```json
  { "secret": "x", "action": "read", "file": "KeHoach_HanSpot.xlsx",
    "email": "a@b.vn",
    "actuals": [ { "part": "P1", "actual": 1 } ],
    "headers": [ "STT" ], "rows": [ [ 1 ] ] }
  ```
> 💡 *Lưu ý về bảo mật*: Đường dẫn HTTP URL do Microsoft sinh ra đã chứa sẵn chữ ký mã hóa an toàn (`...?sig=...`) độc quyền của riêng bạn, nên không cần thêm bước Condition kiểm tra mật mã, giúp luồng gọn gàng và chạy nhanh nhất.

**2.2. Switch theo hành động** — thêm action **Switch** nối ngay sau Trigger:
- *On*: `triggerBody()?['action']` (chọn trường `action` từ Trigger).

- **Case `read`**:
  1. SharePoint **Get file content** — chọn *Site*, *File* = `KeHoach_HanSpot.xlsx`.
  2. SharePoint **Get file properties** (hoặc *Get file metadata*) — cùng file (lấy *Modified*, *Modified By*).
  3. **Response** — Status `200`, Header `Content-Type: application/json`, Body:
     ```json
     {
       "ok": true,
       "content": "@{base64(body('Get_file_content'))}",
       "mtime": "@{body('Get_file_properties')?['Modified']}",
       "by": "@{body('Get_file_properties')?['Editor']?['Email']}",
       "exists": true
     }
     ```
     > Nếu backend báo *"không giải mã được file"*, đổi dòng `content` thành
     > `"@{body('Get_file_content')?['$content']}"`. (Backend chịu được cả hai cách.)

- **Case `meta`**:
  1. SharePoint **Get file properties** (hoặc *Get file metadata*).
  2. **Response** `200`:
     ```json
     { "ok": true,
       "mtime": "@{body('Get_file_properties')?['Modified']}",
       "by": "@{body('Get_file_properties')?['Editor']?['Email']}",
       "exists": true }
     ```

- **Default** (gồm `save_actual` và `save_khsx`):
  1. Excel Online (Business) **Run script** — *Location* = SharePoint, *Document Library*/*File* = file kế hoạch,
     *Script* = `GhiKeHoach_HanSpot`, tham số **payload** = `@{string(triggerBody())}`.
  2. **Response** `200`, Header `Content-Type: application/json`, Body = `@{outputs('Run_script')?['body/result']}`.
     > `result` đã là chuỗi JSON (vd `{"ok":true,"updated":4,"parts":4,"missing":0}`) nên đặt
     > thẳng vào Body là hợp lệ. Muốn kèm thời điểm sửa thì thêm *Get file properties* rồi tự ghép.

Lưu flow. Mở lại trigger để **copy HTTP POST URL** (chuỗi dài có `...?sig=...`). Đây là `PA_FLOW_URL`.

> ⚠️ URL này chứa chữ ký bí mật — coi như mật khẩu. Chỉ đặt vào Environment của Render, **không**
> commit, không đưa lên repo công khai.

## Bước 3 — Khai báo biến trên Render

Render → dịch vụ backend → **Environment**:

| Biến | Giá trị |
|---|---|
| `PA_FLOW_URL` | *URL HTTP của trigger ở Bước 2* |
| `PA_SECRET` | *(tùy chọn, có thể điền `han_spot_2026` hoặc để trống)* |
| `PLAN_FILE` | `KeHoach_HanSpot.xlsx` |
| `ALLOWED_EMAIL_DOMAIN` | `ckthanhdat.vn` |
| `ENTRA_TENANT_ID` | `2a19d75e-f60b-4a77-913c-5b28b27bef09` |
| `ENTRA_CLIENT_ID` | `3a219e32-7e6f-40df-84a8-b25a1f8f5ded` |
| `GEMINI_API_KEY` | *(đã đặt)* |
| `GEMINI_API_MODEL` | `gemini-3.5-flash-lite` *(tuỳ chọn, ép model)* |

- **Thứ tự ưu tiên kho dữ liệu của backend: Power Automate → GitHub → đĩa.** Khi có `PA_FLOW_URL`,
  backend dùng SharePoint qua flow và **bỏ qua** GitHub. Có thể để lại `PLAN_REPO`/`GITHUB_TOKEN`
  làm dự phòng, hoặc xoá đi.
- Deploy lại backend (bản mới có adapter Power Automate).

## Bước 4 — Nghiệm thu

- [ ] Mở web, đăng nhập `@ckthanhdat.vn` → thấy **đúng dữ liệu** từ file trên SharePoint.
- [ ] Sửa vài ô **Thực tế** rồi lưu → mở `KeHoach_HanSpot.xlsx` trên SharePoint thấy số đã cập nhật,
      cột **Modified By** là người vừa sửa; **các công thức sheet khác còn nguyên**.
- [ ] Lưu/chốt **Kế hoạch Động** → sheet `KHSX_Dong` trong file được ghi lại.
- [ ] Trong Power Automate → **Run history**: các lần gọi trả **202/200**, không lỗi.
- [ ] Gọi thẳng `…onrender.com/api/excel/data?...` **không token** → vẫn **401** (bảo mật giữ nguyên).

## Xử lý sự cố

- **Backend báo "Khong doc duoc file ke hoach" / 502** → xem *Run history* của flow: kiểm tra sai *Site/File*
  trong *Get file content*, hoặc link `PA_FLOW_URL` trên Render chưa được cập nhật đúng.
- **Ghi Thực tế không vào** → kiểm tra *Run script* đã trỏ đúng file và script `GhiKeHoach_HanSpot`;
  tên cột tiêu đề trong file phải có **Part** (và tuỳ chọn **ThucTe**).
- **File tải về hỏng** → đổi biểu thức `content` sang `?['$content']` như ghi chú ở Case `read`.
- **Chậm lần đầu trong ngày** → Render gói free ngủ khi rảnh (~1 phút để thức).

---

### Ghi chú kỹ thuật

- Backend gửi dữ liệu **có cấu trúc** (không upload lại cả file) nên Office Script chỉ chạm đúng ô
  Thực tế và dựng lại sheet `KHSX_Dong` — **không phá công thức** các sheet khác.
- Hàm chuẩn hoá tên part trong `OfficeScript_GhiKeHoach.ts` (`norm()`) khớp chính xác với `_norm()`
  ở `server.py` (bỏ dấu, hạ thường, bỏ ký tự đặc biệt) để so khớp part đáng tin cậy.
- Hiện tại áp dụng **last-write-wins**: nếu hai người lưu cùng lúc, lần sau ghi đè lần trước trên
  các ô liên quan. Với quy mô một xưởng, chấp nhận được.
