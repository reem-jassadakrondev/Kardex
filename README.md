# Kardex

เว็บแอปเก็บสถิติโต๊ะเกมไพ่ ประกอบด้วย **Frontend (React + Vite + TypeScript + Tailwind)** และ **Backend (FastAPI + SQLAlchemy async + Alembic)** ฐานข้อมูลใช้ **Supabase Postgres** (production) หรือ **SQLite** (local)

> **งานปัจจุบัน:** เฟส 1 จากทั้งหมด 4 เฟส — สร้างโมดูลเสือมังกรใหม่เป็น "ตารางสี + อัตราการออก" (ดู [แผนเฟส 1](#แผนเฟส-1--ตารางสีเสือมังกร)) ลูกค้าจะตัดสินใจต่อสัญญาเฟส 2–4 จากผลงานเฟสนี้

## โครงสร้าง

| โฟลเดอร์ | บทบาท |
|----------|--------|
| `frontend/` | UI, routing, เรียก REST API (deploy บน Netlify ผ่าน `netlify.toml`) |
| `backend/app/` | API (`api/v1`), models, services |
| `backend/alembic/` | migration ของฐานข้อมูล |
| `backend/tests/` | pytest |

## หน้าและเส้นทาง

| เส้นทาง | หน้า | สถานะ |
|---------|------|--------|
| `/` | Home Lobby — รายการเกมจาก API | ใช้งานได้ |
| `/baccarat` | บาคาร่า — ติดตาม shoe, Big Road / Bead Plate, โต๊ะเดิมพันจำลอง | ใช้งานได้ (ไม่อยู่ในขอบเขตเฟส 1) |
| `/dragon-tiger` | เสือมังกร — ตารางสี 60 คอลัมน์ | กำลังพัฒนา (ตอนนี้เป็นหน้า placeholder) |

## API

| Method | Path | หมายเหตุ |
|--------|------|----------|
| GET | `/api/v1/health` | |
| GET | `/api/v1/games` | รายการเกม |
| POST | `/api/v1/sessions` | สร้างเซสชันบาคาร่า (`game_code` อื่นตอบ 400) |
| GET | `/api/v1/sessions/{id}` | สถานะ shoe |
| POST | `/api/v1/sessions/{id}/rounds` | บันทึกรอบบาคาร่า |
| GET | `/api/v1/sessions/{id}/roadmaps` | roadmap (ยังไม่มีหน้าไหนเรียกใช้) |

## การรัน

### Backend

```bash
cd backend
python3.12 -m venv venv && source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env        # ใส่รหัสผ่าน Supabase หรือลบ DATABASE_URL/DIRECT_URL เพื่อใช้ SQLite
alembic upgrade head        # ต้องรันทุกครั้งที่มี migration ใหม่
uvicorn app.main:app --reload
pytest                      # รันเทสต์ (ใช้ SQLite ชั่วคราว ไม่แตะฐานข้อมูลจริง)
```

- backend โหลด `backend/.env` อัตโนมัติ (env var ของเครื่อง/โฮสต์มีลำดับสูงกว่า)
- ไม่ตั้ง `DATABASE_URL` → ใช้ SQLite ที่ `backend/kardex.db`
- `SQL_ECHO=true` เพื่อ log SQL ทุกคำสั่ง
- เพิ่ม/แก้ model แล้วต้องสร้าง migration: `alembic revision --autogenerate -m "..."` แล้วตรวจไฟล์ก่อน commit (`tests/test_migrations.py` จะ fail ถ้า model กับ migration ไม่ตรงกัน)
- ใช้ **Python 3.12** (macOS: `brew install python@3.12`, Windows: `install_prereqs.bat`)

### Frontend

```bash
cd frontend
cp .env.example .env        # VITE_API_BASE_URL
npm install
npm run dev
npm run lint && npm run build
```

### Windows demo

`install_prereqs.bat` → `setup_demo.bat` → `start_demo.bat` (รัน `alembic upgrade head` ให้อัตโนมัติ) → `stop_demo.bat`

### Supabase

- **Runtime** ใช้ transaction pooler (port 6543) ใน `DATABASE_URL`, **migration** ใช้ session pooler (port 5432) ใน `DIRECT_URL` — วาง connection string จาก dashboard ได้เลย backend แปลง `pgbouncer`/`sslmode` ให้ asyncpg เอง
- แพ็กเกจ Free จะ **pause อัตโนมัติเมื่อไม่มีการใช้งาน 7 วัน** → กด *Resume project* ใน dashboard ก่อนใช้งาน (production ควรใช้ Pro)
- ฐานข้อมูลที่เคยสร้างตารางด้วย `create_all` ก่อนมี Alembic: รัน `alembic stamp 0001` ครั้งเดียว แล้วค่อย `alembic upgrade head`

## ฐานข้อมูล (ปัจจุบัน)

| ตาราง | ใช้ทำอะไร |
|-------|-----------|
| `games` | รายการเกม (seed: `baccarat`, `dragon_tiger`, `pokdeng`, `sic_bo`) |
| `game_sessions`, `rounds` | เซสชันและรอบของบาคาร่า |
| `game_tables` | โต๊ะที่บันทึกตารางสี (seed: `dt-1` เสือมังกร 60 ตา/รอบ) |

---

## แผนเฟส 1 — ตารางสีเสือมังกร

### ข้อกำหนดจากลูกค้า

1. **ตารางสี:** 1 แถว = 1 รอบ = 60 ตา (60 คอลัมน์) แต่ละตาออก 1 ใน 5 สี ใช้ตัวย่อเท่านั้น ไม่ผูกความหมายกับเกม: **R** แดง · **B** น้ำเงิน · **Y** เหลือง · **K** ดำ · **G** เขียว
2. **อัตราการออก** ของช่องถัดไปที่ตำแหน่ง p (คิดในช่วงรอบที่เลือก)
   - คอลัมน์ p มีข้อมูล (n > 0) → **โหมดคอลัมน์**: ความถี่ของแต่ละสีในคอลัมน์ p
   - คอลัมน์ p ยังไม่มีข้อมูล → **โหมดแถว**: สัดส่วนสีที่ออกไปแล้วในรอบปัจจุบัน
   - รอบปัจจุบันก็ยังว่าง → "ยังไม่มีข้อมูล"
   - แสดงโหมดที่ใช้และจำนวนตัวอย่าง n เสมอ ตัวเลขทศนิยม 1 ตำแหน่ง
   - เป็นสถิติความถี่ในอดีต ไม่ใช่การทำนาย — ใช้คำว่า "อัตราการออก"
3. **ใช้ได้หลายอุปกรณ์** รวม iPad/Android รุ่นเก่าที่อัปเดต OS ไม่ได้ (รองรับเวอร์ชันต่ำสุดที่ทำได้จริง)
4. **บันทึก:** จิ้มสีแล้วลงช่องปัจจุบันทันที (ไฮไลต์ช่องที่กำลังบันทึก) · **ลบได้เฉพาะตัวสุดท้าย** ไล่ย้อนไปเรื่อยๆ · ไม่มีการแก้กลางตาราง
5. **ข้อมูลจำนวนมาก (N รอบ)** ต้องคำนวณเร็ว และ **เลือกช่วงรอบ** ที่ใช้คำนวณได้ (เช่น 500,000–999,999)
6. ตัดส่วนเดิมพันออกทั้งหมด

### ความเสี่ยง: ลูกค้าไม่ได้อยู่หน้าจอ ทำให้บันทึกไม่ครบ

ถ้าตาหายไปกลางรอบ ตาหลังจากนั้นจะเลื่อนไปอยู่ผิดคอลัมน์ทั้งแถว จึงมี:

| ปุ่ม | ทำอะไร | ผลต่อสถิติ |
|---|---|---|
| ข้ามช่อง | เก็บ `-` แทนตาที่ไม่ได้บันทึก | ไม่นับช่องนี้ แต่คอลัมน์ถัดไปยังตรง |
| จบรอบ | ปิดรอบก่อนครบ 60 (`ended_early`) | นับเฉพาะช่องที่มีข้อมูล |
| ทิ้งรอบนี้ | ลบรอบปัจจุบันทั้งรอบ (มีหน้ายืนยัน) | ไม่นับเลย |

### การออกแบบฐานข้อมูล

```
game_tables      (มีแล้ว) id, code, name, game_code, plays_per_round=60, created_at

dt_rounds        id, table_id, round_no (1..N ต่อเนื่องต่อโต๊ะ),
                 results VARCHAR(60)   'RBB-YKG…'  1 ตัวอักษร = 1 ตา, '-' = ข้าม
                 play_count, status (open | complete | ended_early),
                 version (optimistic lock), created_at, updated_at
                 UNIQUE(table_id, round_no)

dt_block_counts  table_id, block_no (บล็อกละ 1,000 รอบ), position (1..60), color, count
                 PK(table_id, block_no, position, color) — อัปเดต ±1 ใน transaction เดียวกับการบันทึก

dt_play_events   log ทุกการกด (add / skip / delete / end / discard, device_id, เวลา)
                 ใช้ตรวจย้อนหลังและคำนวณ dt_block_counts ใหม่ได้
```

- เก็บผลทั้งรอบเป็นสตริง: 1 ล้านรอบ ≈ 100 MB (ถ้าแยก 1 แถวต่อตาจะเป็น 60 ล้านแถว ≈ 3 GB+ เกินโควตา Supabase Free 500 MB)
- **คำนวณช่วงรอบ** = รวม `dt_block_counts` ของบล็อกที่อยู่ในช่วงเต็มๆ + สแกนเศษหัว/ท้ายไม่เกิน 1,998 รอบ → ช่วง 500,000–999,999 อ่านแค่ 500 บล็อก ไม่ต้องดึงข้อมูลดิบ
- "ทิ้งรอบ" ทำได้เฉพาะรอบปัจจุบัน (รอบสุดท้าย) จึงลบจริงได้โดย `round_no` ยังต่อเนื่อง
- "ลบตัวสุดท้าย" เมื่อรอบปัจจุบันว่าง → ย้อนไปเปิดรอบก่อนหน้า (มีหน้ายืนยัน)
- ถ้าข้อมูลโตถึงระดับ 100 ล้านรอบ เพิ่ม prefix sum อีกชั้นได้โดยไม่ต้องรื้อ

### API (วางแผน)

```
GET    /api/v1/tables/{id}/grid?before_round=&limit=50
POST   /api/v1/tables/{id}/plays          {color | "skip", version}
DELETE /api/v1/tables/{id}/plays/last     {version}
POST   /api/v1/tables/{id}/rounds/current/end
DELETE /api/v1/tables/{id}/rounds/current
GET    /api/v1/tables/{id}/stats?from_round=&to_round=
```

- คำสั่งเขียนทุกตัวตอบสถิติของช่องถัดไปกลับมาด้วย (1 จิ้ม = 1 request)
- `version` ไม่ตรง → 409 ให้ client โหลดใหม่ (กันหลายเครื่องเขียนชนกัน)
- เครื่องอื่น polling ทุก 3–5 วินาที

### หน้าจอ

ตัวเลือกช่วงรอบ → ตาราง 60 คอลัมน์ (เลื่อนแนวนอน, เลื่อนไปช่องปัจจุบันอัตโนมัติ, แสดง 50 รอบล่าสุด) → แผงอัตราการออก → ปุ่มสีใหญ่ 5 ปุ่ม + ลบตัวสุดท้าย / ข้ามช่อง / จบรอบ / ทิ้งรอบ
จิ้มแล้วแสดงสีจางทันที → server ยืนยันแล้วเป็นสีเต็ม → ถ้าล้มเหลวคืนค่าเดิม + แจ้งเตือน · ล็อกปุ่มระหว่างรอผลกันจิ้มซ้ำ

### อุปกรณ์ที่รองรับ (ต้องยืนยันด้วยการทดสอบใน M3)

| ระดับ | อุปกรณ์ | หมายเหตุ |
|---|---|---|
| ✅ รองรับ | iOS 10.3+ (iPad 4, Air 1, mini 2 ขึ้นไป) · Android 7.1.1+ | build ES5 ด้วย `@vitejs/plugin-legacy` |
| ⚠️ มีเงื่อนไข | Android 5.0–7.0 | ไม่มี root cert ของ Let's Encrypt (Netlify) → ใช้ Firefox หรือย้ายไปใช้ cert จาก CA ที่ root เก่ากว่า |
| ❌ ไม่รองรับ | iOS 9 (iPad 2/3, mini 1) · Android 4.x | ต่อ HTTPS ไม่ได้, ไม่มี `fetch` |

ข้อห้ามใน CSS: ห้ามใช้ `flex gap`, `aspect-ratio`, `inset` · ตั้ง Tailwind ให้สีออกเป็น hex (iOS 10–12.0 ไม่รองรับ `rgb(r g b / a)`)

### ความเสี่ยงอื่น

| ความเสี่ยง | ทางแก้ |
|---|---|
| ไม่มีล็อกอิน ใครมี URL ก็เขียนได้ | PIN ของโต๊ะ |
| Supabase Free pause เมื่อไม่มีการใช้งาน 7 วัน / Render Free cold start 30–60 วิ | production ใช้แพ็กเกจเสียเงิน |
| เน็ตหลุดระหว่างบันทึก | retry + แจ้งเตือนชัดเจน |
| ตัวนับสรุปเพี้ยนจากข้อมูลจริง | endpoint คำนวณใหม่จากข้อมูลดิบ + เทสต์ |
| เฟส 2–4 ยังไม่ชัด | ออกแบบให้ต่อยอดได้ (`game_tables`, log) แต่ไม่ทำฟีเจอร์เผื่อ |

### ลำดับงาน

- [x] **M0 เตรียมฐาน** — Alembic + migration baseline, โหลด `.env`, แก้ URL Supabase สำหรับ asyncpg, ตาราง `game_tables`, ลบโค้ดเสือมังกร/เดิมพันเดิม, แก้ lint, ลบ Supabase SDK ที่ไม่ได้ใช้, pytest, ย้ายไป Python 3.12, migrate Supabase ถึง `0002` แล้ว (2026-10-18)
- [ ] **M1 Backend** — `dt_rounds` / `dt_block_counts` / `dt_play_events`, stats engine, API, pytest (fallback, ข้ามช่อง, ลบข้ามรอบ, ขอบบล็อก, ช่วงรอบ), seed 1 ล้านรอบวัดความเร็ว
- [ ] **M2 Frontend** — ตาราง, ปุ่มสี, แผงสถิติ, ตัวเลือกช่วงรอบ, polling
- [ ] **M3 Legacy** — plugin-legacy + ทดสอบบนเครื่องจริง/BrowserStack
- [ ] **M4 Deploy** — PIN, hosting, คู่มือผู้ใช้

### ปัญหาที่รู้แล้วนอกขอบเขตเฟส 1 (บาคาร่า)

- ความน่าจะเป็นใน `card_tracker.calculate_probability` เป็นสูตรประมาณที่ไม่มีหลักคณิตศาสตร์
- ไม่เลือกไพ่ → backend ใส่ไพ่ปลอม `H9 H8 D7 D6` และหักออกจาก shoe · ไม่รองรับไพ่ใบที่ 3
- อัตราจ่ายในโต๊ะจำลอง: ผู้เล่นได้ 0.95 (ควร 1:1), เสมอได้สุทธิ 7 เท่า (ควร 8)
- ข้อมูลอยู่แค่ใน state ของหน้า รีเฟรชแล้วหาย
