# 📋 Work Book — คู่มือ Migration & วิเคราะห์ระบบ (v2.0)

> เอกสารสำหรับนำโค้ดที่ Refactor แล้วไปใช้งาน พร้อมวิเคราะห์จุดเสี่ยง/Edge Case
> และคำแนะนำแนวทางแก้ไขสำเร็จรูป เพื่อให้ขยายผลไปยังหน่วยงานอื่นได้ง่าย

---

## 📁 1. โครงสร้างไฟล์ใหม่ (Clean Architecture)

### ฝั่ง Google Apps Script (Backend)
| ไฟล์ | หน้าที่ |
|------|---------|
| **`Code.gs`** | Logic & Routing หลัก (`doGet`/`doPost`) + CRUD + Error Logging |
| **`Config.gs`** | ดึงค่า Configuration ทั้งหมดจาก Sheet "ตั้งค่า" (มี Cache) |
| **`Telegram.gs`** | เชื่อมต่อ Telegram Bot API (ส่ง Markdown/HTML แจ้งเตือน Group) |
| **`Line.gs`** | เชื่อมต่อ LINE Messaging API (Quick Reply + Flex Message) |

### ฝั่ง Frontend (ผ่าน HtmlService Include)
| ไฟล์ | หน้าที่ |
|------|---------|
| **`index.html`** | โครงสร้าง HTML ล้วน (Bootstrap 5 CDN) |
| **`stylesheet.html`** | CSS ทั้งหมด — Responsive 100% (Mobile/Tablet/PC) |
| **`javascript.html`** | JS logic หน้าบ้านทั้งหมด |

> 💡 **ไฟล์ต้นฉบับเก็บไว้ใน**: `GAS.txt.bak` และ `index.html.bak`

---

## 🚀 2. ขั้นตอนติดตั้ง (เริ่มต้นใช้งาน)

### ขั้นที่ 1: อัปโหลดไฟล์เข้า GAS
1. เปิด Apps Script Editor (ใน Spreadsheet ของคุณ)
2. สร้างไฟล์ใหม่ตามชื่อ: `Code`, `Config`, `Telegram`, `Line` (.gs)
   และ `index`, `stylesheet`, `javascript` (.html)
3. คัดลอกเนื้อหาจากไฟล์ที่ Refactor แล้วไปวาง
4. **ลบไฟล์ `Code` เดิมออก** (เนื่องจากมีฟังก์ชันซ้ำชื่อ)

### ขั้นที่ 2: เปลี่ยน Resource ID (สำคัญสำหรับหน่วยงานใหม่)
ในไฟล์ **`Config.gs`** บรรทัดบนสุด:
```javascript
const SHEET_ID = '1Eu-RPvD2tm4iaefnHxdq9_Wg4MMu0FgKeIC7fEgEJ28'; // ← เปลี่ยนเป็นของหน่วยงานใหม่
const FOLDER_ID = '1rOauPVMj2gm3PbTr5bWVuq65wRGa5c88';          // ← เปลี่ยนเป็นของหน่วยงานใหม่
```

### ขั้นที่ 3: รัน setup ครั้งแรก
1. ใน GAS Editor เลือกฟังก์ชัน **`setupSystem`** > กด **Run**
2. ระบบจะสร้าง Sheet ต่อไปนี้ให้อัตโนมัติ:
   - `ตั้งค่า` (config)
   - `Data` (ข้อมูล)
   - `UserStats` (สถิติผู้ใช้)
   - `ErrorLog` (บันทึกข้อผิดพลาด)
3. อนุญาตสิทธิ์ (Authorize) เมื่อถูกถาม

### ขั้นที่ 4: ตั้งค่า Sheet "ตั้งค่า"
กรอกข้อมูลใน Sheet "ตั้งค่า" — คอลัมน์ **A = Key**, คอลัมน์ **B = Value**:

| Key | Value (ตัวอย่าง) | หมายเหตุ |
|-----|------------------|----------|
| `appTitle` | Work Book กฟส.เมืองนครพนม | ชื่อโปรแกรม |
| `bannerImage` | https://... | URL รูปแบนเนอร์ |
| `developerInfo` | พัฒนาโดย ... | เครดิตผู้พัฒนา |
| `username` | admin | บัญชี Admin |
| `password` | (รหัสผ่าน) | ⚠️ เปลี่ยนจาก default |
| `telegramBotToken` | 123456:ABC-DEF... | Token จาก @BotFather |
| `telegramChatId` | -1001234567890 | Chat ID ของ Group |
| `lineChannelAccessToken` | (token) | จาก LINE Console |
| `lineChannelSecret` | (secret) | จาก LINE Console |
| `districts_1` ... `districts_N` | เมืองนครพนม / ... | รายชื่ออำเภอ |
| `responsiblePersons_1` ... | ชื่อผู้รับผิดชอบ | |
| `budgetTypes_1` ... | C / P / I | |
| `statusOptions_1` ... | รอดำเนินการ / ... | |
| `externalLinks` | `[{"url":"...","title":"..."}]` | JSON string |

### ขั้นที่ 5: Deploy เป็น Web App
1. **Deploy → New deployment**
2. Type: **Web app**
3. Execute as: **Me**
4. Who has access: **Anyone** (หรือ Anyone with Google Account)
5. คัดลอก **Web App URL** ไปวางใน `javascript.html`:
   ```javascript
   const SCRIPT_URL = 'https://script.google.com/macros/s/XXXXX/exec';
   ```

### ขั้นที่ 6: ทดสอบระบบแจ้งเตือน
รันใน GAS Editor:
- **`testTelegramNotification()`** → ทดสอบส่งข้อความ Telegram
- **`verifyTelegramBot()`** → ตรวจสอบ Token ถูกต้อง
- **`verifyLineBot()`** → ตรวจสอบ LINE Token
- **`systemHealthCheck()`** → ตรวจสอบสถานะระบบทั้งหมด

### ขั้นที่ 7: เชื่อมต่อ LINE Webhook (ถ้าใช้)
1. ใน LINE Developers Console → Messaging API → Webhook URL
2. ใส่: `https://script.google.com/macros/s/XXXXX/exec` (URL เดียวกับ Web App)
3. ใน `Code.gs` → `doPost` จะตรวจจับ `action=lineWebhook` อัตโนมัติ
4. (ถ้าแยก endpoint) สร้างไฟล์แยกที่เรียก `handleLineWebhook(e)`

---

## ⚠️ 3. การวิเคราะห์ Bug ที่พบและแก้ไขแล้ว

### Bug #1: `doPost` เรียก `recordLogin(data)` โดย `data` ไม่ได้ถูก define
- **ปัญหา (เดิม)**: บรรทัดที่ 28-30 ของ `GAS.txt` เดิม เรียกใช้ `recordLogin(data)` ทันทีก่อน try-catch โดย `data` ไม่ได้ประกาศ → `ReferenceError`
- **แก้ไข**: ใน `Code.gs` ใหม่ `recordLogin` ถูกเรียกจาก switch case ปกติ รับ `params` ที่ถูกต้อง

### Bug #2: `getActiveSpreadsheet()` ผิด context
- **ปัญหา (เดิม)**: `recordLogin`/`getUserStats` ใช้ `SpreadsheetApp.getActiveSpreadsheet()` ซึ่งจะคืน `null` เมื่อรันจาก Web App (ไม่มี active sheet)
- **แก้ไช**: เปลี่ยนเป็น `SpreadsheetApp.openById(SHEET_ID)` ตลอด

### Bug #3: `event.target` ใช้ไม่ได้กับ nav button
- **ปัญหา (เดิม)**: `showSection` ใช้ `event.target` ซึ่งอาจชี้ผิด (เช่นชี้ `<i>` icon ข้างใน)
- **แก้ไข**: ส่ง `this` เข้าไปจาก `onclick` ตรง ๆ

### Bug #4: Tracking script ของ Cloudflare ติดมา
- **ปัญหา (เดิม)**: บรรทัดสุดท้ายของ `index.html` มี script สร้าง iframe ของ Cloudflare ติดมา
- **แก้ไข**: ลบทิ้งไปแล้วใน `index.html` ใหม่

### Bug #5: การตรวจสอบการเข้าสู่ระบบไม่ปลอดภัย
- **ปัญหา (เดิม)**: เปรียบเทียบ string ปกติ (timing attack ได้)
- **แก้ไข**: เพิ่ม `safeEqual()` แบบ constant-time comparison

### Bug #6: Token/Secret ฝังใน Config ส่งกลับ Frontend
- **ปัญหา (เดิม)**: `getConfig` ส่งคืน config object เต็ม ๆ อาจรั่ว Token
- **แก้ไข**: แยก `getPublicConfig()` ที่ส่งกลับเฉพาะค่าที่ frontend ต้องการ ซ่อน Token/Secret/Password

---

## 🛡️ 4. จุดเสี่ยง / Edge Case และแนวทางแก้ไข

### 🔴 ระดับสูง (ต้องแก้ก่อนใช้งานจริง)

| # | จุดเสี่ยง | แนวทางแก้ไข |
|---|----------|-------------|
| 1 | **รหัสผ่านเก็บเป็น plain text** ใน Sheet "ตั้งค่า" | เข้ารหัสด้วย `Utilities.computeDigest` (SHA-256) + salt แล้วเปรียบเทียบ hash แทน |
| 2 | **ไม่มี rate limiting** สำหรับ login → brute force ได้ | บันทึก login fail ลง `UserStats` + ล็อกชั่วคราวหลังพยายาม 5 ครั้ง |
| 3 | **ไฟล์แนบเปิดเป็น public** (`ANYONE_WITH_LINK`) | หากข้อมูลละเอียดอ่อน ให้ใช้ Google Sign-in + ตรวจสิทธิ์ก่อนให้ URL |
| 4 | **Web App URL ใน `javascript.html` เป็นค่าคงที่** | สร้าง template variable: ใน `index.html` ใช้ `const SCRIPT_URL = '<?!= SCRIPT_URL ?>';` แล้วส่งจาก `doGet` |

### 🟡 ระดับกลาง (ควรปรับปรุง)

| # | จุดเสี่ยง | แนวทางแก้ไข |
|---|----------|-------------|
| 5 | **ไฟล์ใหญ่ base64** → GAS มี limit ~50MB/request | จำกัดขนาดไฟล์ฝั่ง JS (`file.size < 20MB`) ก่อนส่ง |
| 6 | **Concurrent write** หลายคนบันทึกพร้อมกัน → บางครั้ง appendRow ชนกัน | ใช้ `SpreadsheetApp.flush()` หลังเขียน หรือใช้ LockService |
| 7 | **Cache config 5 นาที** → แก้ค่าใน Sheet แล้วไม่รีเฟรชทันที | หลังแก้ Sheet ให้รัน `clearConfigCache()` หรือสร้าง trigger onEdit |
| 8 | **ไฟล์ `.bak` มีข้อมูลเก่า** | หลังยืนยันระบบทำงานแล้ว ลบ `GAS.txt.bak` และ `index.html.bak` |

### 🟢 ระดับต่ำ (เฝ้าสังเกต)

| # | จุดเสี่ยง | แนวทางแก้ไข |
|---|----------|-------------|
| 9 | **ชื่อผู้รับผิดชอบเป็นชื่อโฟลเดอร์ Drive** → มีอักขระพิเศษอาจมีปัญหา | sanitize ชื่อก่อน createFolder (ลบ `/ \ : * ? " < > \|`) |
| 10 | **Telegram ส่ง HTML escape ไม่ครบ** | มี `escapeHtml()` คลุมแล้ว แต่ถ้ามี emoji ประหลาดให้ทดสอบเพิ่ม |
| 11 | **LINE signature verification เป็น optional** | หากต้องการความปลอดภัยสูง deploy แบบอ่าน header ตรง |
| 12 | **Sheet ขยายใหญ่** (>100,000 แถว) → อ่านช้า | ใช้ `getRange` แบบจำกัดแถว หรือย้ายไป BigQuery |

---

## 🔧 5. ฟังก์ชันสำหรับดูแลระบบ (รันจาก GAS Editor)

| ฟังก์ชัน | สิ่งที่ทำ |
|----------|---------|
| `setupSystem()` | ติดตั้งครั้งแรก — สร้างทุก Sheet |
| `systemHealthCheck()` | ตรวจสอบสถานะระบบทั้งหมด |
| `clearConfigCache()` | ล้าง cache หลังแก้ Sheet "ตั้งค่า" |
| `verifyTelegramBot()` | ตรวจ Token Telegram |
| `verifyLineBot()` | ตรวจ Token LINE |
| `testTelegramNotification()` | ส่งข้อความทดสอบ Telegram |
| `testLineFlex()` | พรีวิว Flex Message LINE |

---

## 📊 6. สรุปการเปลี่ยนแปลง (Before → After)

| ด้าน | เดิม | ใหม่ |
|------|------|------|
| **โครงสร้าง Backend** | ไฟล์เดียว (`GAS.txt`) | แยก 4 ไฟล์ (Code/Config/Telegram/Line) |
| **โครงสร้าง Frontend** | ไฟล์เดียว 2610 บรรทัด | แยก 3 ไฟล์ (HTML/CSS/JS) |
| **CSS Framework** | Tailwind CDN | **Bootstrap 5 CDN** + Custom CSS |
| **Responsive** | มีบางส่วน | Mobile-First 100% (มี card view บนมือถือ) |
| **Configuration** | ฝังในโค้ด + Sheet "Config" | ดึงจาก Sheet **"ตั้งค่า"** + Cache |
| **Telegram** | ❌ ไม่มี | ✅ Markdown/HTML + auto-notify |
| **LINE** | ❌ ไม่มี | ✅ Quick Reply + Flex Message |
| **Error Handling** | บางฟังก์ชัน | try-catch ครบ + Sheet `ErrorLog` |
| **Bug** | 6 จุด (ระบุด้านบน) | ✅ แก้ครบ |
| **Security** | plain password | + constant-time compare, hide secrets |

---

## 📞 7. ตรวจสอบเบื้องต้นหลัง Deploy

ทดสอบ checklist:
- [ ] เปิด Web App URL → หน้า Login ขึ้น
- [ ] ล็อกอินด้วย username/password → เข้าสู่ระบบได้
- [ ] บันทึกข้อมูลใหม่ → ขึ้นใน Sheet `Data`
- [ ] Telegram ได้รับแจ้งเตือนอัตโนมัติ
- [ ] ดูข้อมูลทั้งหมด → ตารางแสดง (PC) + card แสดง (มือถือ)
- [ ] ค้นหา → กรองได้
- [ ] สรุปข้อมูล → กราฟแสดง
- [ ] ลองเปิดบน **มือถือ** → UI สวย ใช้งานได้
- [ ] ลองเปิดบน **แท็บเล็ต** → UI สวย ใช้งานได้
- [ ] ลองเปิดบน **PC** → UI สวย ใช้งานได้

หากข้อใดไม่ผ่าน → ดู `Sheet "ErrorLog"` เพื่อหาสาเหตุ
