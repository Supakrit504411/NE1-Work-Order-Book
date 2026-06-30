/**
 * ============================================================
 * Code.gs  —  แผนก Logic & Routing หลักของระบบ Work Book
 * ------------------------------------------------------------
 * โครงสร้าง (Clean Architecture ผ่าน GAS Include):
 *   - Code.gs       → Logic & Routing  (ไฟล์นี้)
 *   - Config.gs     → การดึงค่า Configuration จาก Sheet "ตั้งค่า"
 *   - Telegram.gs   → Telegram Bot API
 *   - Line.gs       → LINE Messaging API
 *
 * Frontend (ผ่าน HtmlService Include):
 *   - index.html      → โครงสร้างหน้า
 *   - stylesheet.html → CSS ทั้งหมด (Bootstrap 5 Responsive)
 *   - javascript.html → JS logic หน้าบ้าน
 *
 * หลักการ:
 *   1) ทุกฟังก์ชันสำคัญหุ้มด้วย try-catch + Error Logging
 *   2) แยก routing ระหว่าง Web App (doGet/doPost) และ
 *      API แบบส่งกลับ JSON
 *   3) การแจ้งเตือน Telegram/LINE ทำงานแบบ Fail-safe —
 *      ถ้าแจ้งเตือนล้มเหลวจะไม่ทำให้การบันทึกข้อมูลล้มเหลวตาม
 * ============================================================
 */

/* ---------- ค่าคงที่ระบบ ---------- */
const APP_VERSION = '2.0.0';
const SHEET_DATA = 'Data';
const SHEET_CONFIG = 'ตั้งค่า';
const SHEET_USER_STATS = 'UserStats';
const SHEET_ERROR_LOG = 'ErrorLog';


/* ============================================================
 * ENTRY POINTS (Web App)
 * ============================================================ */

/**
 * GET → ใช้สำหรับ:
 *   - เปิดหน้าเว็บ (ไม่มี ?action=)
 *   - เรียก API แบบ JSON (?action=read, getConfig, ...)
 */
function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = params.action;

  try {
    // ถ้าไม่มี action → เสิร์ฟหน้าเว็บ HTML
    if (!action) {
      return HtmlService.createTemplateFromFile('index')
        .evaluate()
        .setTitle('Work Book - สมุดคุมงาน')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    // มี action → ตอบกลับเป็น JSON
    let result;
    switch (action) {
      case 'read':
        result = readData(); break;
      case 'getConfig':
        result = getPublicConfig(); break;
      case 'getExternalLinks':
        result = getExternalLinks(); break;
      case 'getUserStats':
        result = getUserStats(); break;
      default:
        result = { success: false, error: 'Invalid action: ' + action };
    }
    return jsonOutput(result);
  } catch (error) {
    console.error('doGet ERROR:', error);
    logError('doGet', error);
    return jsonOutput({ success: false, error: error.toString() });
  }
}


/**
 * POST → ใช้สำหรับ action ที่เขียน/เปลี่ยนแปลงข้อมูล
 *   - login, recordLogin, create, update, lineWebhook
 */
function doPost(e) {
  var params = (e && e.parameter) || {};

  try {
    // Support both form-encoded (e.parameter) and JSON body (e.postData)
    if (e && e.postData && e.postData.contents) {
      try {
        var jsonBody = JSON.parse(e.postData.contents);
        if (jsonBody && jsonBody.action) {
          params = jsonBody.params || {};
          params.action = jsonBody.action;
        }
      } catch (parseErr) {
        // If not JSON, fall back to e.parameter (already set)
      }
    }

    var action = params.action;

    switch (action) {
      case 'login':
        return jsonOutput(handleLogin(params));

      case 'recordLogin':
        return jsonOutput(recordLogin(params));

      case 'create':
        return jsonOutput(createRecord(params));

      case 'update':
        return jsonOutput(updateRecord(params));

      case 'lineWebhook':
        return handleLineWebhook(e);

      default:
        return jsonOutput({ success: false, error: 'Invalid action: ' + action });
    }
  } catch (error) {
    console.error('doPost ERROR:', error);
    logError('doPost', error);
    return jsonOutput({ success: false, error: error.toString() });
  }
}


/* ============================================================
 * INCLUDE — สำหรับแยก CSS/JS ออกจาก HTML
 * (เรียกจาก index.html ผ่าน <?!= include('stylesheet'); ?>)
 * ============================================================ */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}


/* ============================================================
 * AUTHENTICATION
 * ============================================================ */

/**
 * ตรวจสอบการเข้าสู่ระบบ
 * @param {Object} params { username, password }
 * @return {{success:boolean, error?:string}}
 */
function handleLogin(params) {
  try {
    const config = getConfigData();
    const validUser = config.username;
    const validPass = config.password;

    if (!params.username || !params.password) {
      return { success: false, error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' };
    }

    // เปรียบเทียบแบบคงที่เวลา (ลด timing attack)
    const userOk = safeEqual(params.username, validUser);
    const passOk = safeEqual(params.password, validPass);

    return { success: userOk && passOk };
  } catch (error) {
    console.error('handleLogin ERROR:', error);
    logError('handleLogin', error);
    return { success: false, error: error.toString() };
  }
}


/**
 * เปรียบเทียบ string โดยใช้เวลาคงที่ (constant-time-ish)
 */
function safeEqual(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  if (sa.length !== sb.length) return false;
  let diff = 0;
  for (let i = 0; i < sa.length; i++) {
    diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  }
  return diff === 0;
}


/* ============================================================
 * USER STATISTICS
 * ============================================================ */

/**
 * บันทึกการเข้าสู่ระบบของผู้ใช้ (เพื่อนับสถิติ)
 * @param {Object} data { username, timestamp, userAgent }
 * @return {{success:boolean}}
 */
function recordLogin(data) {
  try {
    const sheet = getOrCreateSheet(SHEET_USER_STATS);

    const now = new Date();
    const thaiDate = Utilities.formatDate(now, 'Asia/Bangkok', 'dd/MM/yyyy');

    sheet.appendRow([
      now.toISOString(),
      data && data.username ? data.username : 'unknown',
      thaiDate,
      data && data.userAgent ? data.userAgent : ''
    ]);

    return { success: true };
  } catch (error) {
    console.error('recordLogin ERROR:', error);
    logError('recordLogin', error);
    return { success: false, error: error.toString() };
  }
}


/**
 * คำนวณสถิติผู้ใช้งาน (ออนไลน์/วันนี้/สะสม)
 * @return {{success:boolean, data?:Object}}
 */
function getUserStats() {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_USER_STATS);
    if (!sheet || sheet.getLastRow() === 0) {
      return { success: true, data: { onlineUsers: 1, todayUsers: 1, totalUsers: 1 } };
    }

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      return { success: true, data: { onlineUsers: 1, todayUsers: 1, totalUsers: 1 } };
    }

    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const todayStr = Utilities.formatDate(now, 'Asia/Bangkok', 'dd/MM/yyyy');

    const todayUsers = new Set();
    const onlineUsers = new Set();
    const totalUsers = new Set();

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const timestampStr = row[0];
      const username = row[1];
      const dateStr = row[2];

      totalUsers.add(username);

      if (dateStr === todayStr) todayUsers.add(username);

      // timestamp เก็บเป็น ISO string → parse ได้
      const ts = new Date(timestampStr);
      if (!isNaN(ts.getTime()) && ts >= fiveMinutesAgo) {
        onlineUsers.add(username);
      }
    }

    return {
      success: true,
      data: {
        onlineUsers: Math.max(onlineUsers.size, 1),
        todayUsers: Math.max(todayUsers.size, 1),
        totalUsers: Math.max(totalUsers.size, 1)
      }
    };
  } catch (error) {
    console.error('getUserStats ERROR:', error);
    logError('getUserStats', error);
    return { success: false, data: { onlineUsers: 1, todayUsers: 1, totalUsers: 1 }, error: error.toString() };
  }
}


/* ============================================================
 * DATA OPERATIONS (CRUD)
 * ============================================================ */

/**
 * อ่านข้อมูลทั้งหมด
 * @return {{success:boolean, data?:Array, error?:string}}
 */
function readData() {
  try {
    const sheet = getOrCreateSheet(SHEET_DATA);
    const data = sheet.getDataRange().getValues();

    if (data.length <= 1) {
      return { success: true, data: [] };
    }

    data.shift(); // ตัด header row
    return { success: true, data: data };
  } catch (error) {
    console.error('readData ERROR:', error);
    logError('readData', error);
    return { success: false, error: error.toString() };
  }
}


/**
 * สร้างรายการงานใหม่
 * @param {Object} params
 * @return {{success:boolean, error?:string}}
 */
function createRecord(params) {
  try {
    const sheet = getOrCreateSheet(SHEET_DATA);

    // --- ตรวจสอบข้อมูลจำเป็น ---
    const required = ['details', 'requesterName', 'district', 'responsible', 'budget', 'status'];
    const missing = required.filter(function (f) {
      return !params[f] || String(params[f]).trim() === '';
    });
    if (missing.length > 0) {
      return { success: false, error: 'ข้อมูลไม่ครบถ้วน: ' + missing.join(', ') };
    }

    // --- จัดการไฟล์แนบ ---
    let fileUrl = '';
    if (params.fileData && params.fileName) {
      fileUrl = uploadFile(params.fileData, params.fileName, params.fileType, params.responsible);
    }

    // --- เตรียมแถวใหม่ ---
    const nowStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    const newRow = [
      params.timestamp || nowStr,                                    // วันที่
      params.details,                                                // รายละเอียด
      params.requesterName,                                          // ชื่อผู้ขอขยายเขต
      params.district,                                               // อำเภอ
      params.subdistrict || '',                                      // ตำบล
      params.village || '',                                          // หมู่บ้าน
      params.phone || '',                                            // เบอร์โทร
      params.responsible,                                            // ผู้รับผิดชอบ
      params.budget,                                                 // งบ
      params.budgetAmount || '',                                     // งบประมาณ
      params.status,                                                 // สถานะ
      fileUrl,                                                       // ไฟล์
      params.wbs || '',                                              // WBS
      nowStr,                                                        // Update
      nowStr                                                         // Last Edit
    ];

    sheet.appendRow(newRow);

    // --- แจ้งเตือนผ่าน Telegram/LINE (Fail-safe) ---
    try {
      notifyNewRecord({
        details: params.details,
        requesterName: params.requesterName,
        district: params.district,
        subdistrict: params.subdistrict,
        village: params.village,
        phone: params.phone,
        responsible: params.responsible,
        budget: params.budget,
        budgetAmount: params.budgetAmount,
        status: params.status,
        wbs: params.wbs
      });
    } catch (notifyErr) {
      console.warn('Notification after create failed (non-fatal):', notifyErr);
    }

    return { success: true };
  } catch (error) {
    console.error('createRecord ERROR:', error);
    logError('createRecord', error);
    return { success: false, error: error.toString() };
  }
}


/**
 * อัปเดตสถานะ/ไฟล์ของรายการงาน
 * @param {Object} params { rowIndex, status, fileData?, ... }
 * @return {{success:boolean, error?:string}}
 */
function updateRecord(params) {
  try {
    const sheet = getOrCreateSheet(SHEET_DATA);
    const rowIndex = parseInt(params.rowIndex, 10);

    if (isNaN(rowIndex) || rowIndex < 2) {
      return { success: false, error: 'rowIndex ไม่ถูกต้อง' };
    }

    // อ่านข้อมูลเดิม
    const currentRow = sheet.getRange(rowIndex, 1, 1, 15).getValues()[0];
    const oldData = {
      details: currentRow[1],
      requesterName: currentRow[2],
      district: currentRow[3],
      responsible: currentRow[7],
      budget: currentRow[8],
      status: currentRow[10]
    };

    // อัปเดตไฟล์ (ถ้ามีไฟล์ใหม่)
    let fileUrl = currentRow[11];
    if (params.fileData && params.fileName) {
      fileUrl = uploadFile(params.fileData, params.fileName, params.fileType,
                           currentRow[7] || 'ทั่วไป');
      sheet.getRange(rowIndex, 12).setValue(fileUrl);
    }

    // อัปเดตสถานะ
    sheet.getRange(rowIndex, 11).setValue(params.status);

    // อัปเดต last edit timestamp
    const nowStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    sheet.getRange(rowIndex, 15).setValue(nowStr);

    // --- แจ้งเตือนการอัปเดต (Fail-safe) ---
    try {
      notifyUpdateRecord(oldData, { status: params.status, details: oldData.details });
    } catch (notifyErr) {
      console.warn('Notification after update failed (non-fatal):', notifyErr);
    }

    return { success: true };
  } catch (error) {
    console.error('updateRecord ERROR:', error);
    logError('updateRecord', error);
    return { success: false, error: error.toString() };
  }
}


/**
 * ดึงรายการลิงก์ภายนอก (สำหรับหน้า "อื่นๆ")
 * @return {{success:boolean, data?:Array}}
 */
function getExternalLinks() {
  try {
    return { success: true, data: getExternalLinksData() };
  } catch (error) {
    console.error('getExternalLinks ERROR:', error);
    logError('getExternalLinks', error);
    return { success: false, error: error.toString() };
  }
}


/* ============================================================
 * FILE UPLOAD (Google Drive)
 * ============================================================ */

/**
 * อัปโหลดไฟล์ไปยัง Google Drive แยกตามโฟลเดอร์ผู้รับผิดชอบ
 * @param {string} base64Data
 * @param {string} fileName
 * @param {string} fileType (MIME type)
 * @param {string} responsible
 * @return {string} URL สำหรับดูไฟล์ (คืน '' ถ้าล้มเหลว)
 */
function uploadFile(base64Data, fileName, fileType, responsible) {
  try {
    if (!base64Data || !fileName) return '';

    const parentFolder = DriveApp.getFolderById(FOLDER_ID);
    const folderName = responsible ? String(responsible).trim() : 'ทั่วไป';

    // หา/สร้างโฟลเดอร์ตามผู้รับผิดชอบ
    let responsibleFolder;
    const folders = parentFolder.getFoldersByName(folderName);
    if (folders.hasNext()) {
      responsibleFolder = folders.next();
    } else {
      responsibleFolder = parentFolder.createFolder(folderName);
    }

    // ถอดรหัส base64 และสร้างไฟล์
    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      fileType || 'application/octet-stream',
      fileName
    );
    const file = responsibleFolder.createFile(blob);

    // ตั้งค่าให้ผู้มีลิงก์เปิดดูได้
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // คืนลิงก์ดูตรง (preview)
    return 'https://lh3.googleusercontent.com/d/' + file.getId();
  } catch (error) {
    console.error('uploadFile ERROR:', error);
    logError('uploadFile', error);
    return '';
  }
}


/* ============================================================
 * ERROR LOGGING (บันทึกข้อผิดพลาดลง Sheet "ErrorLog")
 * ============================================================ */

/**
 * บันทึก error ลง Sheet "ErrorLog"
 * @param {string} functionName
 * @param {Error|string} error
 */
function logError(functionName, error) {
  try {
    const sheet = getOrCreateSheet(SHEET_ERROR_LOG);
    const now = new Date();
    const errMsg = error && error.message ? error.message : String(error);
    const stack = error && error.stack ? error.stack : '';

    sheet.appendRow([
      Utilities.formatDate(now, 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss'),
      functionName || 'unknown',
      errMsg,
      String(stack).substring(0, 1000) // จำกัดความยาว
    ]);
  } catch (e) {
    // ถ้า log error เองก็ error อีก ให้ console เท่านั้น
    console.error('logError FAILED:', e);
  }
}


/* ============================================================
 * HELPER
 * ============================================================ */

/**
 * สร้าง JSON response สำหรับ ContentService
 * @param {Object} obj
 * @return {GoogleAppsScript.Content.TextOutput}
 */
function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


/* ============================================================
 * SETUP & MENU (รันครั้งแรกจาก GAS Editor)
 * ============================================================ */

/**
 * ติดตั้งระบบครั้งแรก — สร้างชีตที่จำเป็นทั้งหมด
 * (เรียกจาก GAS Editor > เลือก setupSystem > Run)
 */
function setupSystem() {
  try {
    console.log('=== เริ่มติดตั้งระบบ Work Book v' + APP_VERSION + ' ===');

    getOrCreateSheet(SHEET_CONFIG);
    console.log('✓ สร้าง/ตรวจสอบ Sheet: ' + SHEET_CONFIG);

    getOrCreateSheet(SHEET_DATA);
    console.log('✓ สร้าง/ตรวจสอบ Sheet: ' + SHEET_DATA);

    getOrCreateSheet(SHEET_USER_STATS);
    console.log('✓ สร้าง/ตรวจสอบ Sheet: ' + SHEET_USER_STATS);

    getOrCreateSheet(SHEET_ERROR_LOG);
    console.log('✓ สร้าง/ตรวจสอบ Sheet: ' + SHEET_ERROR_LOG);

    // ล้าง cache เพื่อโหลด config ใหม่
    clearConfigCache();
    console.log('✓ ล้าง Config cache');

    console.log('=== ติดตั้งระบบเสร็จสิ้น ===');
    console.log('ขั้นตอนถัดไป:');
    console.log('1) ไปที่ Sheet "ตั้งค่า" แล้วกรอก Token/Chat ID ของ Telegram/LINE');
    console.log('2) Deploy > New deployment > Web app');
    console.log('3) ทดสอบ verifyTelegramBot() / verifyLineBot()');
  } catch (error) {
    console.error('setupSystem ERROR:', error);
  }
}


/**
 * ตรวจสอบสถานะระบบทั้งหมด (รันเพื่อตรวจสอบ)
 */
function systemHealthCheck() {
  console.log('=== System Health Check ===');
  console.log('Version:', APP_VERSION);

  // ตรวจชีต
  [SHEET_CONFIG, SHEET_DATA, SHEET_USER_STATS, SHEET_ERROR_LOG].forEach(function (name) {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const exists = !!ss.getSheetByName(name);
    console.log('Sheet "' + name + '":', exists ? '✓ มี' : '✗ ไม่มี');
  });

  // ตรวจ Telegram
  console.log('Telegram:', isTelegramEnabled() ? '✓ ตั้งค่าแล้ว' : '✗ ยังไม่ตั้งค่า');
  if (isTelegramEnabled()) {
    console.log('  → verifyTelegramBot():', verifyTelegramBot().message);
  }

  // ตรวจ LINE
  console.log('LINE:', isLineEnabled() ? '✓ ตั้งค่าแล้ว' : '� ยังไม่ตั้งค่า');
  if (isLineEnabled()) {
    console.log('  → verifyLineBot():', verifyLineBot().message);
  }
}


/* ============================================================
 * GOOGLE.SCRIPT.RUN WRAPPERS
 * (สำหรับเรียกจาก JavaScript �่าน google.script.run �ดยไม่ต้อง fetch)
 * ============================================================ */

/**
 * Web App Entry Point - รับ request จาก browser ่่าน google.script.run
 * @param {Object} request { action, params, method }
 * @return {Object} JSON-serializable response
 */
function doGet(request) {
  const action = (request && request.action) || '';
  const params = (request && request.params) || {};

  try {
    switch (action) {
      case 'read': return readData();
      case 'getConfig': return getPublicConfig();
      case 'getExternalLinks': return getExternalLinks();
      case 'getUserStats': return getUserStats();
      default: return { success: false, error: 'Invalid action: ' + action };
    }
  } catch (error) {
    console.error('serverGet ERROR:', error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Web App Entry Point - รับ request จาก browser ่่าน google.script.run
 * @param {Object} request { action, params }
 * @return {Object} JSON-serializable response
 */
function doPost(request) {
  const action = (request && request.action) || '';
  const params = (request && request.params) || {};

  try {
    switch (action) {
      case 'login': return handleLogin(params);
      case 'recordLogin': return recordLogin(params);
      case 'create': return createRecord(params);
      case 'update': return updateRecord(params);
      default: return { success: false, error: 'Invalid action: ' + action };
    }
  } catch (error) {
    console.error('serverPost ERROR:', error);
    return { success: false, error: error.toString() };
  }
}
