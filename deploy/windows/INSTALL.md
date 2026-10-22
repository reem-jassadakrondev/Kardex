# ติดตั้ง Kardex บนเครื่องลูกค้า (Windows 10 / 11 / Server)

ทั้งระบบอยู่บนเครื่องเดียว: **PostgreSQL** (ฐานข้อมูล) + **Kardex server** (web server เล็กๆ: API + หน้าเว็บ) · iPad/มือถือใน WiFi เดียวกันเปิดผ่าน Safari ที่ `http://<IP เครื่อง>:8000` ไม่ต้องลงแอป ไม่ต้องใช้อินเทอร์เน็ต

ไฟล์ทั้งหมดอยู่ใน USB (สร้างบนเครื่อง dev ด้วย `deploy/make-usb.sh <version>` → `release/kardex-<version>/`):

```
kardex-1.0.0/
├── kardex-1.0.0.zip                     ← ตัวโปรแกรม (หน้าเว็บที่ build แล้ว + Python wheels สำหรับ Windows)
├── postgresql-17.11-1-windows-x64.exe   ← ฐานข้อมูล
├── python-3.12.10-amd64.exe             ← Python
├── INSTALL.md                           ← ไฟล์นี้
└── SHA256SUMS.txt                       ← ตรวจว่าไฟล์ไม่เสีย: certutil -hashfile <ไฟล์> SHA256
```

## ต้องมีก่อน

| | หมายเหตุ |
|---|---|
| **Windows 10 / 11 (Pro หรือ Home) 64-bit** หรือ Windows Server 2016+ · สิทธิ์ Administrator | เครื่องลูกค้าปัจจุบัน: Windows 10 Pro 22H2 · ผ่าน AnyDesk / UltraViewer ได้ |
| **PostgreSQL 17** — `postgresql-17.11-1-windows-x64.exe` ใน USB | ซัพพอร์ตถึง พ.ย. 2029 · (ถ้าเป็น Windows Server 2012 ต้องใช้ PostgreSQL 15 แทน: 16+ ต้อง Windows 10 / Server 2016) |
| **Python 3.12** — `python-3.12.10-amd64.exe` ใน USB | 3.12.10 คือ 3.12 ตัวสุดท้ายที่มี installer สำหรับ Windows |
| IP ของเครื่องต้องไม่เปลี่ยน | ตั้ง static IP หรือจอง IP ใน router (DHCP reservation) ไม่งั้น iPad จะหาเครื่องไม่เจอหลังรีสตาร์ท |
| เครื่องต้องเปิดไว้ตลอดเวลาที่ใช้งาน | `install.bat` ตั้งให้ **ไม่ Sleep / Hibernate** เมื่อเสียบไฟให้เอง (หน้าจอดับได้ปกติ) · ไม่ต้อง login ค้างไว้ ระบบเริ่มเองตอนเปิดเครื่อง |

## ติดตั้งครั้งแรก (~15 นาที)

1. **PostgreSQL**: รัน installer → ตั้งรหัสผ่านของ user `postgres` (**จดไว้ในที่ปลอดภัย**) → port `5432` → เอาติ๊ก Stack Builder ออก
2. **Python 3.12**: รัน installer → ติ๊ก **Use admin privileges when installing py.exe** → **Customize installation** → Next → ติ๊ก **Install Python 3.12 for all users** → Install (สำคัญ: ระบบรันเป็น SYSTEM ต้องเข้าถึง Python ได้)
3. **แตก `kardex-1.0.0.zip`** (คลิกขวา → Extract All → ปลายทาง `C:\`) → เปลี่ยนชื่อ `C:\kardex-1.0.0` เป็น `C:\Kardex` ให้ได้ `C:\Kardex\backend`, `C:\Kardex\frontend`, `C:\Kardex\deploy`, … (ถ้า Windows บล็อกไฟล์: คลิกขวา zip → Properties → ติ๊ก **Unblock** ก่อนแตก)
4. คลิกขวา `C:\Kardex\deploy\windows\install.bat` → **Run as administrator** → ใส่รหัสผ่านของ `postgres` เมื่อถาม (ถ้าขึ้น "Windows protected your PC" → More info → Run anyway)

สคริปต์จะ: สร้าง Python environment → สร้าง user/database `kardex` พร้อมรหัสผ่านสุ่ม (เก็บใน `C:\Kardex\backend\.env`) → สร้างตาราง → เปิด firewall port 8000 → ตั้งไม่ให้เครื่อง Sleep → ตั้ง task ให้ server เริ่มเองตอนเปิดเครื่อง และ backup ทุกวันตี 3 → เปิด server แล้วแสดง URL สำหรับ iPad

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
| `import-rounds.bat` | นำเข้าข้อมูลจาก Excel (.xlsx / .csv) ลงโต๊ะ — **แทนที่ข้อมูลของโต๊ะนั้น** ต้องพิมพ์ `IMPORT` ยืนยัน (ดูด้านล่าง) |
| `install.bat` | ซ่อม/ติดตั้งซ้ำ (ข้อมูลและรหัสผ่านเดิมอยู่ครบ) |

### Backup
- เก็บที่ `C:\Kardex\backups\kardex-YYYYMMDD-HHMMSS.dump` ย้อนหลัง 30 วัน
- สำเนาที่สอง (cloud / USB): เพิ่มบรรทัดใน `C:\Kardex\backend\.env`
  ```
  KARDEX_BACKUP_COPY_DIR="D:\KardexBackup"
  ```
  ชี้ไปโฟลเดอร์ที่ sync ขึ้น cloud (เช่น Google Drive for desktop / OneDrive) หรือ USB — ถ้าโฟลเดอร์ไม่พร้อม (ถอด USB) backup ในเครื่องยังทำปกติ แค่บันทึกเตือนใน `logs\backup.log`
- **ทดสอบกู้คืนอย่างน้อยครั้งแรกหลังติดตั้ง** (backup ที่กู้ไม่ได้ = ไม่มี backup)

### นำเข้าข้อมูลจาก Excel

รูปแบบไฟล์ (เหมือน sheet "DAI LY" ของลูกค้า): แถวละ 1 รอบ · **คอลัมน์ A = เลข Game** · คอลัมน์ถัดไป S1…S60 = ผล **1 แดง · 2 น้ำเงิน · 3 เหลือง · 4 ดำ · 5 เขียว** (ใช้ R B Y K G หรือ `-` = ข้าม ก็ได้) · แถวหัวตาราง / แถวที่ยังไม่มีผลจะถูกข้าม · ช่องว่างกลางแถว = ข้าม · ช่องว่างท้ายแถว = รอบจบก่อนครบ

1. **ลากไฟล์ .xlsx (หรือ .csv) ไปวางบน `C:\Kardex\deploy\windows\import-rounds.bat`** (ใช้ sheet แรกของไฟล์ และโต๊ะ `dt-1` = โต๊ะ 1)
2. ระบบตรวจไฟล์ก่อน แล้วแสดงจำนวนรอบ / จำนวนแต่ละสี / รอบแรก-รอบสุดท้าย — ถ้ามีค่าผิด (เช่น `23`) จะบอกเซลล์ที่ต้องแก้ เช่น `AO138` และ **ไม่เปลี่ยนข้อมูลใดๆ**
3. ตรวจตัวเลขให้ถูก แล้วพิมพ์ `IMPORT` → ระบบ backup ก่อน → **ลบข้อมูลเดิมของโต๊ะนั้นทั้งหมด** แล้วใส่ข้อมูลจากไฟล์เป็นรอบ 1…N → iPad โหลดข้อมูลใหม่เองในไม่กี่วินาที
4. ถ้านำเข้าผิด: `restore.bat` ด้วยไฟล์ backup ล่าสุดใน `C:\Kardex\backups`

โต๊ะอื่น / sheet อื่น (PowerShell แบบ admin ที่ `C:\Kardex\deploy\windows`):
```powershell
powershell -ExecutionPolicy Bypass -File import-rounds.ps1 -File "D:\data\012022.xlsx" -Table "โต๊ะ 2" -Sheet "DAI LY"
```

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
| iPad ใช้ไม่ได้หลังเครื่องรีสตาร์ทเพราะ Windows Update | ปกติ server เริ่มเองภายใน ~1 นาทีหลังบูต · ตั้ง Active hours ใน Settings → Update & Security ให้ตรงเวลาที่ใช้งาน เพื่อไม่ให้รีสตาร์ทระหว่างเล่น |
| ไม่อยากให้ install เปลี่ยนการตั้งค่า Sleep | ติดตั้งด้วย `-KeepSleep` |
| install บอกหา PostgreSQL ไม่เจอ | ส่ง `-PgBin "C:\Program Files\PostgreSQL\16\bin"` |

## ใช้งานนอกสถานที่ (ยังไม่ได้ทำ — ต้องตัดสินใจ)

ตอนนี้ใช้ได้เฉพาะเครื่องใน network เดียวกับ server ถ้าต้องเปิดจากที่อื่น ทางเลือก:
- **Cloudflare Tunnel** (แนะนำ): ลง `cloudflared` บน server → ได้ `https://kardex.<โดเมน>` เข้าได้จากทุกที่ ไม่ต้องเปิด port ที่ router · ต้องมีโดเมนบน Cloudflare (ฟรี) · ควรเพิ่ม PIN/รหัสผ่านก่อนเปิดสู่อินเทอร์เน็ต
- **นำ notebook ที่ติดตั้งระบบทั้งชุดไปด้วย**: ใช้ได้แม้ไม่มีอินเทอร์เน็ต แต่ข้อมูลแยกจาก server ต้อง backup/restore รวมเอง
- VPN: แอป VPN ส่วนใหญ่ไม่รองรับ iPad รุ่นเก่า (iPad Gen 4 = iOS 10)
