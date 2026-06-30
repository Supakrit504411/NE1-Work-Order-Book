/**
 * ============================================================
 * Config.gs
 * ------------------------------------------------------------
 * ศูนย์กลางการจัดการค่าตั้งค่า (Configuration) ของระบบ
 *
 * หลักการ "ไม่ Hardcode":
 *   - Token / Chat ID / Secret Key / ข้อมูล UI ทั้งหมด ดึงจาก
 *     Google Sheet ชื่อ "ตั้งค่า" เสมอ
 *   - ดึงค่าครั้งเดียวแล้ว Cache (ใช้ CacheService) เพื่อ
 *     ลดการอ่าน Sheet บ่อยเกินไป และเพิ่มความเร็ว
 *
 * โครงสร้าง Sheet "ตั้งค่า" (คอลัมน์ A = Key, คอลัมน์ B = Value):
 *   - appTitle              : ชื่อโปรแกรม
 *   - bannerImage           : URL รูปแบนเนอร์
 *   - developerInfo         : ข้อมูลผู้พัฒนา
 *   - username / password   : บัญชีเข้าสู่ระบบ Admin
 *   - telegramBotToken      : Token ของ Telegram Bot
 *   - telegramChatId        : Chat ID ของ Telegram Group
 *   - lineChannelAccessToken: Token ของ LINE Official Account
 *   - lineChannelSecret     : Channel Secret ของ LINE
 *   - districts_1 .. N      : รายชื่ออำเภอ (array)
 *   - responsiblePersons_1..: รายชื่อผู้รับผิดชอบ (array)
 *   - budgetTypes_1 .. N    : ประเภทงบ (array)
 *   - statusOptions_1 .. N  : ตัวเลือกสถานะ (array)
 *   - externalLinks         : JSON string ของลิงก์ภายนอก
 *
 *   * คีย์ประเภท array รองรับ 2 รูปแบบ: "key_1,key_2" หรือ
 *     หลายบรรทัด key_1, key_2, key_3 ก็ได้ ระบบจะรวบรวมให้
 * ============================================================
 */

/* ---------- รหัสทรัพยากรของระบบ (Resource IDs) ---------- */
// NOTE: เลข ID ของ Spreadsheet และ Drive Folder เป็น "ตัวระบุทรัพยากร"
//       ไม่ใช่ความลับ จึงเก็บเป็นค่าคงที่ของระบบ (เปลี่ยนเฉพาะตอนนำไปใช้หน่วยงานใหม่)
const SHEET_ID = '1Eu-RPvD2tm4iaefnHxdq9_Wg4MMu0FgKeIC7fEgEJ28';
const FOLDER_ID = '1rOauPVMj2gm3PbTr5bWVuq65wRGa5c88';

/* ---------- ชื่อชีตต่าง ๆ ในระบบ ---------- */
const SHEET = {
  DATA: 'Data',
  CONFIG: 'ตั้งค่า',
  USER_STATS: 'UserStats',
  ERROR_LOG: 'ErrorLog'
};

/* ---------- ระบุคีย์ที่เป็นประเภท Array (รวบรวมหลายแถว/หลายค่า) ---------- */
const ARRAY_CONFIG_KEYS = [
  'districts',
  'responsiblePersons',
  'budgetTypes',
  'statusOptions'
];

/* ---------- ค่า Default (ใช้ตอน Sheet "ตั้งค่า" ยังไม่มี/ว่าง) ---------- */
const DEFAULT_CONFIG = {
  appTitle: 'Work Book แผนกบริการและลูกค้าสัมพันธ์ กฟส.เมืองนครพนม',
  bannerImage: '',
  developerInfo: 'พัฒนาโดย นายศุภกฤษ ทะวัง ชผ.บส.กฟส.เมืองนครพนม',
  username: 'admin',
  password: 'password123',
  telegramBotToken: '',
  telegramChatId: '',
  lineChannelAccessToken: '',
  lineChannelSecret: '',
  externalLinks: '[]',
  districts: ['เมืองนครพนม', 'โพนสวรรค์', 'ธาตุพนม', 'ท่าอุเทน', 'นาแก',
              'ศรีสงคราม', 'นาหว้า', 'บ้านแพง', 'ปลาปาก', 'วังยาง', 'นาทม'],
  responsiblePersons: ['นพพร วิเศษแก้ว', 'ศุภกฤษ ทะวัง', 'สนธยา คำจันทร์',
                      'รพีภัทร ชัยสุนทร', 'อาทิตย์ สมบัติ', 'สรายุทธ สุขแซว'],
  budgetTypes: ['C', 'P', 'I', 'C01.1', 'C02.1', 'C02.2', 'C03.1', 'CหลายDot'],
  statusOptions: ['รอดำเนินการ', 'กำลังดำเนินการ', 'เสร็จสิ้น', 'ยกเลิก']
};

/* ---------- ระยะเวลา Cache (วินาที) ---------- */
const CONFIG_CACHE_TTL = 300; // 5 นาที


/**
 * เปิด/สร้างชีตตามชื่อที่ระบุ (ใช้ทั่วระบบ)
 * @param {string} sheetName - ชื่อชีต
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getOrCreateSheet(sheetName) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    let sheet = spreadsheet.getSheetByName(sheetName);

    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetName);
      // สร้างหัวตาราง/ค่าเริ่มต้นตามชนิดชีต
      switch (sheetName) {
        case SHEET.DATA:
          createDataSheetHeaders(sheet);
          break;
        case SHEET.CONFIG:
          createConfigSheetDefaults(sheet);
          break;
        case SHEET.USER_STATS:
          sheet.getRange(1, 1, 1, 4)
               .setValues([['Timestamp', 'Username', 'Date', 'UserAgent']]);
          break;
        case SHEET.ERROR_LOG:
          sheet.getRange(1, 1, 1, 4)
               .setValues([['Time', 'Function', 'Error', 'Stack']]);
          break;
      }
    }
    return sheet;
  } catch (error) {
    console.error('Config.getOrCreateSheet ERROR:', error);
    throw error;
  }
}


/**
 * สร้างหัวตารางของชีต Data
 */
function createDataSheetHeaders(sheet) {
  const headers = [
    'วันที่', 'รายละเอียด', 'ชื่อผู้ขอขยายเขต', 'อำเภอ', 'ตำบล', 'หมู่บ้าน',
    'เบอร์โทรศัพท์', 'ผู้รับผิดชอบ', 'งบ', 'งบประมาณ', 'สถานะ', 'ไฟล์',
    'หมายเลข WBS', 'Update', 'Last Edit'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}


/**
 * สร้างค่า Default ของชีต "ตั้งค่า" (เรียกครั้งแรกที่ยังไม่มีชีต)
 */
function createConfigSheetDefaults(sheet) {
  const rows = [
    ['Key', 'Value'],
    ['appTitle', DEFAULT_CONFIG.appTitle],
    ['bannerImage', DEFAULT_CONFIG.bannerImage],
    ['developerInfo', DEFAULT_CONFIG.developerInfo],
    ['username', DEFAULT_CONFIG.username],
    ['password', DEFAULT_CONFIG.password],
    ['telegramBotToken', ''],
    ['telegramChatId', ''],
    ['lineChannelAccessToken', ''],
    ['lineChannelSecret', ''],
    ['externalLinks', '[]']
  ];
  // เพิ่มคีย์ array แบบ _N
  DEFAULT_CONFIG.districts.forEach((v, i) => rows.push(['districts_' + (i + 1), v]));
  DEFAULT_CONFIG.responsiblePersons.forEach((v, i) => rows.push(['responsiblePersons_' + (i + 1), v]));
  DEFAULT_CONFIG.budgetTypes.forEach((v, i) => rows.push(['budgetTypes_' + (i + 1), v]));
  DEFAULT_CONFIG.statusOptions.forEach((v, i) => rows.push(['statusOptions_' + (i + 1), v]));

  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
}


/**
 * ดึงค่า Config ทั้งหมด (ใช้ Cache)
 * @return {Object} config object
 */
function getConfigData() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'WORKBOOK_CONFIG_V1';
  const cached = cache.get(cacheKey);

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      console.warn('Config cache parse failed, reloading...', e);
    }
  }

  // อ่านใหม่จาก Sheet
  const config = readConfigFromSheet();
  try {
    cache.put(cacheKey, JSON.stringify(config), CONFIG_CACHE_TTL);
  } catch (e) {
    console.warn('Config cache put failed:', e);
  }
  return config;
}


/**
 * อ่านค่า Config จาก Sheet "ตั้งค่า" จริง
 * @return {Object}
 */
function readConfigFromSheet() {
  // เริ่มจากค่า default เสมอ เพื่อรับประกันว่ามีครบทุกคีย์
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  try {
    const sheet = getOrCreateSheet(SHEET.CONFIG);
    const values = sheet.getDataRange().getValues();

    // ตัวแปรชั่วคราวสำหรับคีย์ array
    const arrayBucket = {};
    ARRAY_CONFIG_KEYS.forEach(k => arrayBucket[k] = []);

    for (let i = 1; i < values.length; i++) {
      const rawKey = String(values[i][0] || '').trim();
      const rawVal = values[i][1];
      if (!rawKey) continue;

      // ตรวจว่าเป็นคีย์ array ในรูปแบบ "key_N" หรือไม่
      const arrayKeyMatch = rawKey.match(/^(districts|responsiblePersons|budgetTypes|statusOptions)_\d+$/i);

      if (arrayKeyMatch) {
        const baseKey = arrayKeyMatch[1];
        if (rawVal !== '' && rawVal !== null && rawVal !== undefined) {
          arrayBucket[baseKey].push(String(rawVal).trim());
        }
      } else if (ARRAY_CONFIG_KEYS.indexOf(rawKey) !== -1) {
        // รูปแบบ "districts" แบบค่าเดียวที่คั่นด้วยจุลภาค
        const parts = String(rawVal).split(',').map(s => s.trim()).filter(Boolean);
        if (parts.length > 0) {
          arrayBucket[rawKey] = arrayBucket[rawKey].concat(parts);
        }
      } else {
        // คีย์ปกติ (สเกลาร์)
        if (rawVal !== '' && rawVal !== null && rawVal !== undefined) {
          config[rawKey] = rawVal;
        }
      }
    }

    // นำค่า array ที่รวบรวมได้มาทับค่า default (หากมีอย่างน้อย 1 ค่า)
    ARRAY_CONFIG_KEYS.forEach(k => {
      if (arrayBucket[k].length > 0) {
        config[k] = arrayBucket[k];
      }
    });

    return config;
  } catch (error) {
    console.error('Config.readConfigFromSheet ERROR:', error);
    logError('readConfigFromSheet', error);
    return config; // คืนค่า default หากอ่าน Sheet ไม่ได้
  }
}


/**
 * บังคับล้าง Cache ของ Config (เรียกหลังแก้ไข Sheet "ตั้งค่า")
 */
function clearConfigCache() {
  try {
    const cache = CacheService.getScriptCache();
    cache.remove('WORKBOOK_CONFIG_V1');
    console.log('Config cache cleared.');
  } catch (error) {
    console.error('Config.clearConfigCache ERROR:', error);
  }
}


/**
 * ดึงค่ารายการ External Links (parse JSON จากคีย์ externalLinks)
 * @return {Array} array ของ {url, title, description}
 */
function getExternalLinksData() {
  const config = getConfigData();
  try {
    const parsed = JSON.parse(config.externalLinks || '[]');
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (e) {
    console.warn('External links JSON parse failed:', e);
  }
  // Fallback
  return [{
    url: 'https://youtu.be/bPUxCbQeq8w?si=RxwZ_cU11AV5uxX6',
    title: 'PEA SmartPlus App',
    description: 'วิดีโอแนะนำการใช้งาน PEA Smart Plus'
  }];
}


/**
 * ดึงข้อมูลสำหรับ Frontend (getConfig action)
 * ซ่อนค่าความลับ (Token/Secret/Password) ไม่ส่งกลับไปหน้าบ้าน
 * @return {{success:boolean, data?:Object, error?:string}}
 */
function getPublicConfig() {
  try {
    const config = getConfigData();
    return {
      success: true,
      data: {
        appTitle: config.appTitle,
        bannerImage: config.bannerImage,
        developerInfo: config.developerInfo,
        districts: config.districts,
        responsiblePersons: config.responsiblePersons,
        budgetTypes: config.budgetTypes,
        statusOptions: config.statusOptions,
        externalLinks: getExternalLinksData()
      }
    };
  } catch (error) {
    console.error('Config.getPublicConfig ERROR:', error);
    logError('getPublicConfig', error);
    return { success: false, error: error.toString() };
  }
}


/**
 * ตรวจสอบว่า Telegram พร้อมใช้งานหรือไม่
 * @return {boolean}
 */
function isTelegramEnabled() {
  const config = getConfigData();
  return !!(config.telegramBotToken && config.telegramChatId);
}


/**
 * ตรวจสอบว่า LINE พร้อมใช้งานหรือไม่
 * @return {boolean}
 */
function isLineEnabled() {
  const config = getConfigData();
  return !!(config.lineChannelAccessToken && config.lineChannelSecret);
}
