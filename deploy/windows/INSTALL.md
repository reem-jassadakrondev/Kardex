# ติดตั้ง Kardex บน Windows Server (เครื่องลูกค้า)

ทั้งระบบอยู่บนเครื่องเดียว: **PostgreSQL** (ฐานข้อมูล) + **Kardex server** (API + หน้าเว็บ) · iPad/มือถือใน WiFi เดียวกันเปิดผ่าน `http://<IP เครื่อง>:8000/dragon-tiger`

ไฟล์ติดตั้ง `kardex-<version>.zip` สร้างบนเครื่อง dev ด้วย `deploy/build-package.sh` (มีหน้าเว็บที่ build แล้ว + Python wheels สำหรับ Windows → server ไม่ต้องมี Node และแทบไม่ต้องใช้อินเทอร์เน็ต)

## ต้องมีก่อน

| | หมายเหตุ |
|---|---|
| Windows Server 2016 ขึ้นไป (64-bit) + สิทธิ์ Administrator | ผ่าน Remote Desktop ได้ |
| **PostgreSQL** 13 ขึ้นไป (แนะนำ 16/17) — installer ของ EDB: <https://www.enterprisedb.com/downloads/postgres-postgresql-downloads> | ถ้าเวอร์ชันใหม่ไม่ยอมลงบน Server 2016 ให้ใช้เวอร์ชันต่ำลง |
| **Python 3.12** — `python-3.12.10-amd64.exe` จาก <https://www.python.org/downloads/release/python-31210/> | 3.12.10 คือ 3.12 ตัวสุดท้ายที่มี installer สำหรับ Windows |
| IP ของเครื่องต้องไม่เปลี่ยน | ตั้ง static IP หรือจอง IP ใน router (DHCP reservation) ไม่งั้น iPad จะหา server ไม่เจอหลังรีสตาร์ท |

## ติดตั้งครั้งแรก (~15 นาที)

1. **PostgreSQL**: รัน installer → ตั้งรหัสผ่านของ user `postgres` (**จดไว้ในที่ปลอดภัย**) → port `5432` → ไม่ต้องลง Stack Builder
2. **Python 3.12**: รัน installer → เลือก **Customize installation** → ติ๊ก **py launcher** และ **Install Python 3.12 for all users** (สำคัญ: ระบบรันเป็น SYSTEM ต้องเข้าถึง Python ได้)
3. **แตก zip** ไปที่ `C:\Kardex` ให้ได้ `C:\Kardex\backend`, `C:\Kardex\frontend`, `C:\Kardex\deploy`, … (ถ้า Windows บล็อกไฟล์: คลิกขวา zip → Properties → ติ๊ก **Unblock** ก่อนแตก)
4. คลิกขวา `C:\Kardex\deploy\windows\install.bat` → **Run as administrator** → ใส่รหัสผ่านของ `postgres` เมื่อถาม

สคริปต์จะ: สร้าง Python environment → สร้าง user/database `kardex` พร้อมรหัสผ่านสุ่ม (เก็บใน `C:\Kardex\backend\.env`) → สร้างตาราง → เปิด firewall port 8000 → ตั้ง task ให้ server เริ่มเองตอนเปิดเครื่อง และ backup ทุกวันตี 3 → เปิด server แล้วแสดง URL สำหรับ iPad

5. เปิด URL ที่แสดงบน iPad → กด "แชร์" → **Add to Home Screen** ให้เปิดเหมือนแอป

ตัวเลือกเพิ่ม (พิมพ์ใน PowerShell แบบ admin ที่ `C:\Kardex\deploy\windows`):
```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 -Port 8080 -BackupCopyDir "D:\KardexBackup"
```

## งานประจำ (ดับเบิลคลิกใน `C:\Kardex\deploy\windows`)

| ไฟล์ | ทำอะไร |
|---|---|
| `status.bat` | เช็คว่า server/ฐานข้อมูลทำงาน, backup ล่าสุดเมื่อไหร่, มี error ไหม |
| `backup-now.bat` | backup ทันที (ปกติทำเองทุกวันตี 3 — ถ้าเครื่องปิดอยู่จะทำตอนเปิดเครื่อง) |
| `restore.bat <ไฟล์>` | กู้คืนจาก backup — **แทนที่ข้อมูลทั้งหมด** ต้องพิมพ์ `RESTORE` ยืนยัน |
| `install.bat` | ซ่อม/ติดตั้งซ้ำ (ข้อมูลและรหัสผ่านเดิมอยู่ครบ) |

### Backup
- เก็บที่ `C:\Kardex\backups\kardex-YYYYMMDD-HHMMSS.dump` ย้อนหลัง 30 วัน
- สำเนาที่สอง (cloud / USB): เพิ่มบรรทัดใน `C:\Kardex\backend\.env`
  ```
  KARDEX_BACKUP_COPY_DIR="D:\KardexBackup"
  ```
  ชี้ไปโฟลเดอร์ที่ sync ขึ้น cloud (เช่น Google Drive for desktop / OneDrive) หรือ USB — ถ้าโฟลเดอร์ไม่พร้อม (ถอด USB) backup ในเครื่องยังทำปกติ แค่บันทึกเตือนใน `logs\backup.log`
- **ทดสอบกู้คืนอย่างน้อยครั้งแรกหลังติดตั้ง** (backup ที่กู้ไม่ได้ = ไม่มี backup)

### อัปเดตเวอร์ชัน
1. สร้าง zip ใหม่บนเครื่อง dev: `deploy/build-package.sh` → ได้ `release/kardex-<version>.zip`
2. copy ไปที่ server แล้วแตกไว้ที่อื่น (เช่น `C:\Temp\kardex-1.1.0`) — **ห้ามแตกทับ `C:\Kardex`**
3. คลิกขวา `C:\Temp\kardex-1.1.0\deploy\windows\update.bat` → **Run as administrator**

ระบบจะ backup ก่อน → หยุด server → เปลี่ยนไฟล์โปรแกรม → อัปเดตตาราง → เปิด server ใหม่ · `backend\.env`, ข้อมูล, `logs`, `backups` อยู่ครบ

## ไฟล์สำคัญ

| ที่อยู่ | |
|---|---|
| `C:\Kardex\backend\.env` | รหัสผ่านฐานข้อมูลของแอป — **อย่าแชร์/อย่าลบ** (ถ้าหาย: รัน `install.bat` จะตั้งรหัสใหม่ให้ ต้องใช้รหัส `postgres`) |
| `C:\Kardex\logs\supervisor.log` | server เริ่ม/หยุดเมื่อไหร่ |
| `C:\Kardex\logs\server-*.log`, `*.err.log` | log ของ server (เก็บ 30 วัน) |
| `C:\Kardex\logs\backup.log` | ผล backup แต่ละครั้ง |

## แก้ปัญหา

| อาการ | ตรวจ |
|---|---|
| iPad เปิดไม่ได้ | `status.bat` บน server ผ่านไหม → iPad อยู่ WiFi เดียวกันไหม → IP เครื่องเปลี่ยนหรือเปล่า (`ipconfig`) → firewall rule "Kardex (TCP 8000)" ยังอยู่ไหม |
| `status.bat` บอก server ไม่ตอบ | ดู `logs\server-*.err.log` ล่าสุด · Task Scheduler → "Kardex Server" ต้องเป็น Running · PostgreSQL service ต้อง Running |
| port 8000 ถูกโปรแกรมอื่นใช้ | ติดตั้งใหม่ด้วย `-Port 8080` |
| install บอกหา Python ไม่เจอ | ลง Python 3.12 แบบ "for all users" + py launcher หรือส่ง `-Python "C:\Program Files\Python312\python.exe"` |
| install บอกหา PostgreSQL ไม่เจอ | ส่ง `-PgBin "C:\Program Files\PostgreSQL\16\bin"` |

## ใช้งานนอกสถานที่ (ยังไม่ได้ทำ — ต้องตัดสินใจ)

ตอนนี้ใช้ได้เฉพาะเครื่องใน network เดียวกับ server ถ้าต้องเปิดจากที่อื่น ทางเลือก:
- **Cloudflare Tunnel** (แนะนำ): ลง `cloudflared` บน server → ได้ `https://kardex.<โดเมน>` เข้าได้จากทุกที่ ไม่ต้องเปิด port ที่ router · ต้องมีโดเมนบน Cloudflare (ฟรี) · ควรเพิ่ม PIN/รหัสผ่านก่อนเปิดสู่อินเทอร์เน็ต
- **นำ notebook ที่ติดตั้งระบบทั้งชุดไปด้วย**: ใช้ได้แม้ไม่มีอินเทอร์เน็ต แต่ข้อมูลแยกจาก server ต้อง backup/restore รวมเอง
- VPN: แอป VPN ส่วนใหญ่ไม่รองรับ iPad รุ่นเก่า (iPad Gen 4 = iOS 10)
