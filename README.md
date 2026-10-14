# Kardex — สารบัญโปรเจกต์

Kardex เป็นเว็บแอปวิเคราะห์ไพ่และติดตาม **roadmap (สถิติโต๊ะ)** สำหรับเกมไพ่ในคาสิโน ประกอบด้วย **Frontend (React + Vite + TypeScript)** และ **Backend (FastAPI + SQLAlchemy)**

## ผู้ใช้ (Users)

- **ไม่มีระบบล็อกอิน / บัญชีผู้ใช้** — แอปใช้แบบโต๊ะเดียว (operator หรือ demo) ต่อเบราว์เซอร์
- **ไม่จำกัดจำนวนผู้ใช้พร้อมกันที่ระดับแอป** — แต่ละเซสชันเกมแยกตาม `session_id` ที่สร้างจาก API
- เกมที่เปิดใช้งานใน lobby: **บาคาร่า**, **เสือมังกร** (เกมอื่นแสดงเป็น “เร็วๆ นี้”)

## โครงสร้างโฟลเดอร์หลัก

| โฟลเดอร์ | บทบาท |
|----------|--------|
| `frontend/` | UI, routing, เรียก REST API |
| `backend/` | API, engine เกม, ฐานข้อมูลเซสชัน/รอบ |

## หน้าและเส้นทาง (Routes)

| เส้นทาง | หน้า | ฟีเจอหลัก |
|---------|------|-----------|
| `/` | **Home Lobby** | รายการเกมจาก API (fallback ใน dev), เข้าโต๊ะที่เปิดใช้ |
| `/baccarat` | **บาคาร่า** | ติดตาม shoe, ความน่าจะเป็น, เลือกไพ่ 4 ใบ / บันทึกเร็ว, Big Road & Bead Plate (P/B/T), โต๊ะเดิมพันจำลอง |
| `/dragon-tiger` | **เสือมังกร** | สกอร์การ์ดแบบโต๊ะจริง (Table/Shoe, Big Road วงกลม D/T, Bead Plate, สถิติ Dragon/Tiger/Tie/Natural/Pair), บันทึกรอบไพ่ 1:1 มังกร–เสือ |

## API หลัก (Backend)

- `GET /api/v1/games` — รายการเกม
- `POST /api/v1/sessions` — สร้างเซสชัน (`game_code`: `baccarat` \| `dragon_tiger`)
- `GET /api/v1/sessions/{id}` — สถานะ shoe / ความน่าจะเป็น
- `POST /api/v1/sessions/{id}/rounds` — บันทึกรอบ
- `GET /api/v1/sessions/{id}/roadmaps` — ข้อมูล roadmap (บาคาร่า)

## การรัน (สรุป)

- Backend: ตั้งค่า `backend/.env` จาก `.env.example`, ติดตั้ง `requirements.txt`, รัน uvicorn
- Frontend: ตั้ง `VITE_API_BASE_URL`, `npm install`, `npm run dev`
- Windows demo: สครipt `setup_demo.bat`, `start_demo.bat`, `stop_demo.bat`

## เกมในระบบ (ฐานข้อมูล seed)

| รหัส | ชื่อ | สถานะ |
|------|------|--------|
| `baccarat` | Baccarat | เปิด |
| `dragon_tiger` | เสือมังกร | เปิด |
| `pokdeng` | โพกเด้ง | ปิด |
| `sic_bo` | Sic Bo | ปิด |
