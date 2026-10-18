# Kardex

เว็บแอปเก็บสถิติโต๊ะเกมไพ่ ประกอบด้วย **Frontend (React + Vite + TypeScript + Tailwind)** และ **Backend (FastAPI + SQLAlchemy async + Alembic)** ฐานข้อมูลใช้ **PostgreSQL ติดตั้งบนเครื่องเดียวกับ backend** (ทั้งเครื่องพัฒนาและเครื่อง server ของลูกค้า)

> **ตัดสินใจ 2026-10-18:** เลิกใช้ Supabase — ทดสอบจริงแล้ว backend ที่ไทยต่อ DB ที่ Sydney ทำให้จิ้ม 1 ครั้งใช้ 4–10 วินาที ส่วน backend + PostgreSQL เครื่องเดียวกันใช้ ~3 ms จึงติดตั้งทั้งระบบบนเครื่องของลูกค้า (on-premise)

> **งานปัจจุบัน:** เฟส 1 จากทั้งหมด 4 เฟส — สร้างโมดูลเสือมังกรใหม่เป็น "ตารางสี + อัตราการออก" (ดู [แผนเฟส 1](#แผนเฟส-1--ตารางสีเสือมังกร)) ลูกค้าจะตัดสินใจต่อสัญญาเฟส 2–4 จากผลงานเฟสนี้

## โครงสร้าง

| โฟลเดอร์ | บทบาท |
|----------|--------|
| `frontend/` | UI, routing, เรียก REST API — build แล้ว backend เสิร์ฟให้ (`netlify.toml` ยังอยู่เผื่อแยก host frontend) |
| `frontend/src/views/DragonTigerRoom.tsx` + `dragonTiger.css` | หน้าตารางสี (CSS ธรรมดา รองรับเบราว์เซอร์เก่า) |
| `frontend/src/hooks/useDtGrid.ts` | state ของตารางสี: โหลด, polling, เขียนทีละคำสั่ง + จัดการ 409 |
| `frontend/src/components/dtGrid/` | ตาราง, ปุ่มบันทึก, แผงอัตราการออก, ตัวเลือกช่วงรอบ |
| `backend/app/` | API (`api/v1`), models, services |
| `backend/alembic/` | migration ของฐานข้อมูล |
| `backend/tests/` | pytest |

## หน้าและเส้นทาง

| เส้นทาง | หน้า | สถานะ |
|---------|------|--------|
| `/` | Home Lobby — รายการเกมจาก API | ใช้งานได้ |
| `/baccarat` | บาคาร่า — ติดตาม shoe, Big Road / Bead Plate, โต๊ะเดิมพันจำลอง | ใช้งานได้ (ไม่อยู่ในขอบเขตเฟส 1) |
| `/dragon-tiger` | เสือมังกร — ตารางสี 60 คอลัมน์ + อัตราการออก (โต๊ะ `dt-1`) | ใช้งานได้ (เฟส 1) |

## API

| Method | Path | หมายเหตุ |
|--------|------|----------|
| GET | `/api/v1/health` | |
| GET | `/api/v1/games` | รายการเกม |
| POST | `/api/v1/sessions` | สร้างเซสชันบาคาร่า (`game_code` อื่นตอบ 400) |
| GET | `/api/v1/sessions/{id}` | สถานะ shoe |
| POST | `/api/v1/sessions/{id}/rounds` | บันทึกรอบบาคาร่า |
| GET | `/api/v1/sessions/{id}/roadmaps` | roadmap (ยังไม่มีหน้าไหนเรียกใช้) |
| GET | `/api/v1/tables/{code}` | สถานะโต๊ะตารางสี: version, ช่องถัดไป (`cursor`), สถิติ |
| GET | `/api/v1/tables/{code}/grid?before_round=&limit=50` | รอบล่าสุด (เลื่อนดูย้อนหลังด้วย `before_round`) |
| POST | `/api/v1/tables/{code}/plays` | `{"value": "R"\|"B"\|"Y"\|"K"\|"G"\|"-", "version": n}` บันทึกช่องถัดไป (`-` = ข้าม) |
| DELETE | `/api/v1/tables/{code}/plays/last?version=n` | ลบตัวสุดท้าย |
| POST | `/api/v1/tables/{code}/rounds/current/end` | `{"version": n}` จบรอบก่อนครบ |
| DELETE | `/api/v1/tables/{code}/rounds/current?version=n` | ทิ้งรอบปัจจุบัน |

ตารางสี (`/tables/...`):
- ทุก endpoint รับ `?from_round=&to_round=` หรือ `?last_rounds=N` (N รอบล่าสุด คิดที่ server) เพื่อกำหนดช่วงที่ใช้คำนวณสถิติ (ไม่ใส่ = ทั้งหมด)
- คำสั่งเขียนตอบสถานะ + สถิติของช่องถัดไป + รอบที่เปลี่ยน (`round`, หรือ `removed_round_no` ถ้ารอบถูกลบ)
- `version` ไม่ตรงกับ server → **409** พร้อม `current_version` (มีเครื่องอื่นแก้ไปแล้ว ให้โหลดใหม่)
- ส่ง header `X-Device-Id` เพื่อบันทึกว่าเครื่องไหนแก้ (ไม่บังคับ)

## การรัน

### Backend

```bash
cd backend
python3.12 -m venv venv && source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env        # ใส่ DATABASE_URL ของ PostgreSQL (ดู "ติดตั้ง PostgreSQL" ด้านล่าง)
alembic upgrade head        # ต้องรันทุกครั้งที่มี migration ใหม่
uvicorn app.main:app --reload
pytest                      # รันเทสต์ (ใช้ SQLite ชั่วคราว ไม่แตะฐานข้อมูลจริง)
python -m scripts.bench_dt --rounds 1000000   # วัดความเร็วสถิติบนข้อมูลจำลอง (SQLite ชั่วคราว)
```

- backend โหลด `backend/.env` อัตโนมัติ (env var ของเครื่อง/โฮสต์มีลำดับสูงกว่า)
- ไม่ตั้ง `DATABASE_URL` → ใช้ SQLite ที่ `backend/kardex.db` (ไว้สำหรับเทสต์/ลองเร็วๆ เท่านั้น ใช้งานจริงต้องเป็น PostgreSQL)
- `SQL_ECHO=true` เพื่อ log SQL ทุกคำสั่ง
- เพิ่ม/แก้ model แล้วต้องสร้าง migration: `alembic revision --autogenerate -m "..."` แล้วตรวจไฟล์ก่อน commit (`tests/test_migrations.py` จะ fail ถ้า model กับ migration ไม่ตรงกัน)
- ใช้ **Python 3.12** (macOS: `brew install python@3.12`, Windows: `install_prereqs.bat`)

### Frontend

```bash
cd frontend
npm install
npm run dev                 # proxy /api → localhost:8000 (เปลี่ยนได้ด้วย KARDEX_API_PROXY)
npm run lint && npm run build
npm run check:legacy        # ตรวจว่า JS ที่ build ออกมาเป็น ES5 ทั้งหมด (ต้องผ่านก่อนส่งงาน)
```

**Build สำหรับเครื่องเก่า (M3):** เป้าหมายเบราว์เซอร์อยู่ที่ `"browserslist"` ใน `package.json` ที่เดียว (Babel / plugin-legacy / postcss-preset-env ใช้ร่วมกัน)
- build เฉพาะ legacy chunk (ES5 + core-js polyfill ผ่าน SystemJS) ให้ทุกเบราว์เซอร์ — iOS 11–13 รองรับ `type="module"` แต่ไม่รองรับ syntax ใหม่ ถ้ามี modern bundle เครื่องกลุ่มนี้จะพัง
- minify ด้วย terser (oxc ของ Vite 8 เปลี่ยน output เป็น ES2015) + plugin `kardex:es5-polyfill-chunk` แปลง polyfill chunk เป็น ES5 อีกรอบ (rolldown ใส่ arrow function)
- `whatwg-fetch` สำหรับ iOS < 10.3 · Tailwind ปิด opacity plugins ให้สีเป็น hex · หน้าเสือมังกรใช้ CSS ธรรมดา (`dragonTiger.css`) · Lobby ไม่ใช้ `gap`/grid
- CSS ถูกฝังใน JS (โหมด legacy อย่างเดียว) · backend เปิด gzip: bundle ~530 KB → ~170 KB

- หน้าเว็บเรียก `/api/v1` บน origin เดียวกันเป็นค่าเริ่มต้น — ตั้ง `VITE_API_BASE_URL` เฉพาะตอนที่ API อยู่คนละที่ **ห้ามตั้งเป็น `localhost` ตอน build ไปใช้จริง** (iPad จะยิงไปที่ตัวเอง)

### ติดตั้ง PostgreSQL

1. ติดตั้ง PostgreSQL (เครื่องพัฒนาใช้ 18 ของ EDB, เครื่องลูกค้าใช้ 15 ขึ้นไป)
2. ในฐานะ user `postgres` (pgAdmin → Query Tool หรือ `psql`) สร้าง user/database สำหรับแอป:
   ```sql
   CREATE ROLE kardex LOGIN PASSWORD '<รหัส>';
   CREATE DATABASE kardex OWNER kardex;   -- ถ้ามี database อยู่แล้ว: ALTER DATABASE kardex OWNER TO kardex;
   ```
3. `backend/.env`: `DATABASE_URL="postgresql+asyncpg://kardex:<รหัส>@localhost:5432/kardex"` แล้ว `alembic upgrade head`

เครื่องพัฒนาตอนนี้ใช้ `kardex` / `kardex-local` (รหัสสำหรับทดสอบเท่านั้น — เครื่องลูกค้าต้องตั้งรหัสใหม่)

### ติดตั้งแบบเครื่องเดียว (on-premise — แนะนำ)

backend เสิร์ฟหน้าเว็บที่ build แล้ว (`frontend/dist`) เอง → backend + PostgreSQL บนเครื่องเดียว, ไม่ต้องใช้ cloud

```bash
cd frontend && npm install && npm run build
cd ../backend
# backend/.env: DATABASE_URL="postgresql+asyncpg://kardex:<รหัส>@localhost:5432/kardex"
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- iPad/มือถือใน WiFi เดียวกันเปิด `http://<IP ของเครื่อง server>:8000/dragon-tiger` — ใช้ `http://` ใน LAN ได้ จึงไม่ติดปัญหาใบรับรอง HTTPS ของอุปกรณ์รุ่นเก่า
- `FRONTEND_DIST` เปลี่ยนตำแหน่งโฟลเดอร์ build ได้ (ไม่มี `index.html` → ไม่เสิร์ฟหน้าเว็บ)
- ต้องตั้ง backup อัตโนมัติ (`pg_dump`) ไปเครื่อง/ที่เก็บอื่น — ยังไม่ได้ทำ

### Windows demo

`install_prereqs.bat` → `setup_demo.bat` → `start_demo.bat` (รัน `alembic upgrade head` ให้อัตโนมัติ) → `stop_demo.bat`

ต้องติดตั้ง PostgreSQL และสร้าง user `kardex` / `kardex-local` ตามหัวข้อด้านบนก่อน (`backend/.env.demo` ชี้ไปที่นั่น) — สคริปต์ยังไม่ติดตั้ง PostgreSQL ให้ จะทำเป็นชุดติดตั้งเครื่องลูกค้าเมื่อรู้ OS ของ server

### บทเรียนเรื่อง latency (จากการทดสอบ Supabase ก่อนเลิกใช้)

- ทุก query เสีย 1–3 network round-trip → backend **ต้อง** อยู่ใกล้ DB (เครื่องเดียวกันดีที่สุด) · ไทย → Sydney RTT ~0.28 วิ ทำให้จิ้ม 1 ครั้ง 4–10 วิ
- connection pooler แบบ transaction (pgbouncer) ทำให้ใช้ prepared statement cache ไม่ได้ → query ละ ~3 round-trip · ต่อ PostgreSQL ตรงๆ ใช้ cache ได้

## ฐานข้อมูล (ปัจจุบัน)

| ตาราง | ใช้ทำอะไร |
|-------|-----------|
| `games` | รายการเกม (seed: `baccarat`, `dragon_tiger`, `pokdeng`, `sic_bo`) |
| `game_sessions`, `rounds` | เซสชันและรอบของบาคาร่า |
| `game_tables` | โต๊ะที่บันทึกตารางสี (seed: `dt-1` เสือมังกร 60 ตา/รอบ) + `version` |
| `dt_rounds`, `dt_block_counts`, `dt_play_events` | ตารางสี (ดูรายละเอียดด้านล่าง) |

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
game_tables      id, code, name, game_code, plays_per_round=60,
                 version (optimistic lock ระดับโต๊ะ — เพิ่มทุกครั้งที่เขียน), created_at

dt_rounds        PK(table_id, round_no)   round_no = 1..N ต่อเนื่องต่อโต๊ะ
                 results VARCHAR(60)   'RBB-YKG…'  1 ตัวอักษร = 1 ตา, '-' = ข้าม
                 status (open | complete | ended_early), created_at, updated_at

dt_block_counts  PK(table_id, position, block_no, color), count
                 บล็อกละ 1,000 รอบ — อัปเดต ±1 ใน transaction เดียวกับการบันทึก

dt_play_events   log ทุกการกด (add / skip / delete / end_round / discard_round, device_id, เวลา)
```

- `version` อยู่ระดับโต๊ะ (ไม่ใช่ต่อรอบ) เพราะ "ลบตัวสุดท้าย" ย้อนข้ามรอบได้ · UPDATE แบบมีเงื่อนไขล็อกแถวโต๊ะไว้จน commit จึงเขียนพร้อมกันไม่ได้
- ตัวนับเพี้ยน → `dt_grid.verify_counts()` ตรวจ, `dt_grid.rebuild_counts()` คำนวณใหม่จาก `dt_rounds`
- เก็บผลทั้งรอบเป็นสตริง: 1 ล้านรอบ ≈ 134 MB บน SQLite (วัดจริง) / 193 MB บน PostgreSQL (ถ้าแยก 1 แถวต่อตาจะเป็น 60 ล้านแถว ≈ 3 GB+)
- **คำนวณช่วงรอบ** = รวม `dt_block_counts` ของบล็อกที่อยู่ในช่วงเต็มๆ + สแกนเศษหัว/ท้ายไม่เกิน 1,998 รอบ → ช่วง 500,000–999,999 อ่านแค่ 500 บล็อก ไม่ต้องดึงข้อมูลดิบ
- "ทิ้งรอบ" ทำได้เฉพาะรอบปัจจุบัน (รอบสุดท้าย) จึงลบจริงได้โดย `round_no` ยังต่อเนื่อง
- "ลบตัวสุดท้าย" เมื่อรอบปัจจุบันว่าง → ย้อนไปเปิดรอบก่อนหน้า (มีหน้ายืนยัน)
- ถ้าข้อมูลโตถึงระดับ 100 ล้านรอบ เพิ่ม prefix sum อีกชั้นได้โดยไม่ต้องรื้อ

### API

ดูตาราง [API](#api) ด้านบน · คำสั่งเขียนตอบสถิติกลับมาด้วย (1 จิ้ม = 1 request) · เครื่องอื่น polling `GET /tables/{code}` ทุก 3–5 วินาที แล้วโหลด grid ใหม่เมื่อ `version` เปลี่ยน

### ผลวัดความเร็ว (`scripts/bench_dt.py`, 1 ล้านรอบ, บน Mac)

| คำสั่ง | SQLite | PostgreSQL 18 ในเครื่อง |
|---|---|---|
| สถิติจากทุกรอบ | 2.6 ms | 1.5 ms |
| สถิติรอบ 500,000–999,999 | 1.8 ms | 1.2 ms |
| สถิติ 1,000 รอบล่าสุด | 0.4 ms | 0.4 ms |
| บันทึก 1 ช่อง / ลบตัวสุดท้าย | ~2 ms | ~2 ms |
| ขนาดข้อมูล | 134 MB | 193 MB |

ผ่าน HTTP จริง (backend + PostgreSQL เครื่องเดียวกัน): จิ้ม 1 ครั้ง median 3.1 ms (เทียบ Supabase Sydney จากไทย: 4–10 วินาที)

```bash
python -m scripts.bench_dt --rounds 1000000 --database-url "postgresql+asyncpg://kardex:<รหัส>@localhost:5432/kardex"
```
(PostgreSQL: สร้างโต๊ะชั่วคราว `bench-…` แล้วลบทิ้งหลังวัด ไม่แตะข้อมูลอื่น)

### หน้าจอ (ทำแล้วใน M2)

ตัวเลือกช่วงรอบ (ทุกรอบ / 100 / 1,000 / 10,000 รอบล่าสุด / กำหนดช่วง — จำไว้ต่อเครื่อง) → ตาราง 60 คอลัมน์ (หัวคอลัมน์/เลขรอบติดขอบ, เลื่อนไปช่องปัจจุบันอัตโนมัติ, แสดง 50 รอบล่าสุด + ปุ่มโหลดรอบก่อนหน้า) → ปุ่มสีใหญ่ 5 ปุ่ม + ลบตัวสุดท้าย / ข้ามช่อง / จบรอบ / ทิ้งรอบ → แผงอัตราการออก (โหมด + n + ช่วงรอบ)

- **จิ้มต่อเนื่องได้ไม่ต้องรอ**: แต่ละจิ้มเข้าคิว แสดงเป็นสีจางทันที แล้วส่งไป server ทีละรายการตามลำดับ → เป็นสีเต็มเมื่อบันทึกแล้ว (สถานะมุมขวาบนบอกจำนวนที่ค้าง)
- ลบตัวสุดท้ายระหว่างที่ยังค้างในคิว → ดึงออกจากคิวเลย ไม่ส่งไป server · จบรอบ/ทิ้งรอบกดได้เมื่อคิวว่าง
- ถ้าบันทึกรายการใดไม่สำเร็จ → ยกเลิกรายการที่เหลือในคิวและแจ้งจำนวน ให้ผู้ใช้ตรวจสอบแล้วบันทึกใหม่
- จิ้ม 1 ครั้ง = 6 query (ล็อกไว้ด้วยเทสต์ `test_tap_uses_few_queries`)
- ต้องยืนยันก่อน: จบรอบ, ทิ้งรอบ, ลบตัวสุดท้ายที่ย้อนเข้าไปในรอบที่จบแล้ว
- เครื่องอื่นแก้ข้อมูล → หน้าอัปเดตเองภายใน ~4 วินาที · ถ้าบันทึกชนกัน (409) โหลดข้อมูลล่าสุดและแจ้งให้ตรวจสอบ
- แป้นพิมพ์: R B Y K G = บันทึกสี · `-` = ข้ามช่อง · Backspace = ลบตัวสุดท้าย · Esc = ยกเลิกการยืนยัน

### อุปกรณ์ที่รองรับ (ต้องยืนยันด้วยการทดสอบใน M3)

ติดตั้งใน LAN แล้วเปิดผ่าน `http://` → **ไม่มีปัญหาใบรับรอง HTTPS ของเครื่องเก่าอีกต่อไป** เหลือแค่เรื่อง JavaScript/CSS

| ระดับ | อุปกรณ์ | หมายเหตุ |
|---|---|---|
| เป้าหมาย build | iOS 9+ (iPad 2 ขึ้นไป) · Safari 9+ · Android 4.4+ · Chrome 49+ · Firefox 52+ | JS ผ่าน `es-check es5` · polyfill `fetch` + core-js |
| ทดสอบแล้ว | Chrome (ใช้ bundle ES5 ชุดเดียวกัน) โดยลบ `fetch`, `Promise.finally`, `Array.includes/find`, `Object.entries/assign` ฯลฯ ออกก่อนโหลด → ใช้งานครบทุกฟังก์ชัน | จำลองเครื่องเก่าเท่านั้น |
| **ยังต้องทดสอบ** | **iPad / Android รุ่นเก่าเครื่องจริง** | เปิด `http://<IP เครื่อง server>:8000/dragon-tiger` ใน WiFi เดียวกัน |

ข้อห้ามใน CSS: ห้ามใช้ `flex gap`, `aspect-ratio`, `inset` · ตั้ง Tailwind ให้สีออกเป็น hex (iOS 10–12.0 ไม่รองรับ `rgb(r g b / a)`)

### ความเสี่ยงอื่น

| ความเสี่ยง | ทางแก้ |
|---|---|
| ไม่มีล็อกอิน ใครมี URL ก็เขียนได้ | PIN ของโต๊ะ |
| เครื่อง server เสีย / disk พัง → ข้อมูลหาย (ไม่มี cloud แล้ว) | backup อัตโนมัติ (`pg_dump`) ไปที่เก็บอื่นทุกวัน + ทดสอบกู้คืน |
| server ปิด/รีสตาร์ท ระหว่างเล่น | ตั้ง PostgreSQL + backend ให้เริ่มเองตอนเปิดเครื่อง |
| ต้องอัปเดต/แก้ปัญหาที่เครื่องลูกค้า | ตกลงช่องทาง remote (remote desktop / VPN) หรือชุดอัปเดตที่ลูกค้ากดเอง |
| เน็ตหลุดระหว่างบันทึก | retry + แจ้งเตือนชัดเจน |
| ตัวนับสรุปเพี้ยนจากข้อมูลจริง | endpoint คำนวณใหม่จากข้อมูลดิบ + เทสต์ |
| เฟส 2–4 ยังไม่ชัด | ออกแบบให้ต่อยอดได้ (`game_tables`, log) แต่ไม่ทำฟีเจอร์เผื่อ |

### ลำดับงาน

- [x] **M0 เตรียมฐาน** — Alembic + migration baseline, โหลด `.env`, แก้ URL Supabase สำหรับ asyncpg, ตาราง `game_tables`, ลบโค้ดเสือมังกร/เดิมพันเดิม, แก้ lint, ลบ Supabase SDK ที่ไม่ได้ใช้, pytest, ย้ายไป Python 3.12, migrate Supabase ถึง `0002` แล้ว (2026-10-18)
- [x] **M1 Backend** — `dt_rounds` / `dt_block_counts` / `dt_play_events`, stats engine, API, pytest 26 ข้อ (รวมเทสต์สุ่ม 400 คำสั่งเทียบกับการนับตรง), benchmark 1 ล้านรอบ, migrate Supabase ถึง `0003` แล้ว (2026-10-18)
- [x] **M2 Frontend** — ตาราง, ปุ่มสี, แผงสถิติ, ตัวเลือกช่วงรอบ, polling, `last_rounds` ที่ backend · ทดสอบใน Chrome (iPad landscape/portrait, มือถือ, 2 เครื่องพร้อมกัน, 409) (2026-10-18)
- [ ] **M3 Legacy** — build ES5 + polyfills เสร็จ, ผ่าน `check:legacy`, ทดสอบจำลองใน Chrome ผ่าน (2026-10-18) · **เหลือ: ทดสอบบน iPad/Android เครื่องจริง**
- [x] **เปลี่ยนเป็น PostgreSQL บนเครื่องเดียวกัน** — เลิกใช้ Supabase, backend เสิร์ฟหน้าเว็บเอง, จิ้มต่อเนื่องได้ (คิว), จิ้ม 1 ครั้ง = 6 query, benchmark 1 ล้านรอบบน PostgreSQL (2026-10-18)
- [ ] **M4 ติดตั้งเครื่องลูกค้า** — ชุดติดตั้งตาม OS ของ server, เริ่มเองตอนเปิดเครื่อง, backup อัตโนมัติ, PIN, คู่มือผู้ใช้

### ปัญหาที่รู้แล้วนอกขอบเขตเฟส 1 (บาคาร่า)

- ความน่าจะเป็นใน `card_tracker.calculate_probability` เป็นสูตรประมาณที่ไม่มีหลักคณิตศาสตร์
- ไม่เลือกไพ่ → backend ใส่ไพ่ปลอม `H9 H8 D7 D6` และหักออกจาก shoe · ไม่รองรับไพ่ใบที่ 3
- อัตราจ่ายในโต๊ะจำลอง: ผู้เล่นได้ 0.95 (ควร 1:1), เสมอได้สุทธิ 7 เท่า (ควร 8)
- ข้อมูลอยู่แค่ใน state ของหน้า รีเฟรชแล้วหาย
