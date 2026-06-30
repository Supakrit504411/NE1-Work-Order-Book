/**
 * ============================================================
 * Telegram.gs
 * ------------------------------------------------------------
 * จัดการการเชื่อมต่อกับ Telegram Bot API
 *
 * ฟังก์ชันหลัก:
 *   - sendTelegramNotification : ส่งข้อความแจ้งเตือนแบบ Markdown
 *                                เข้า Telegram Group อัตโนมัติ
 *   - sendTelegramMessage      : ฟังก์ชันพื้นฐานส่งข้อความดิบ
 *   - sendTelegramMarkdown     : ส่งข้อความรูปแบบ MarkdownV2/HTML
 *   - verifyTelegramBot        : ทดสอบการเชื่อมต่อ Bot
 *
 * หลักการ:
 *   - Token และ Chat ID ดึงจาก Sheet "ตั้งค่า" (ผ่าน Config.gs) เท่านั้น
 *   - ทุกฟังก์ชันหุ้มด้วย try-catch และบันทึก Error Log
 *   - ถ้าการแจ้งเตือนล้มเหลว จะไม่ทำให้กระบวนการหลัก (บันทึกข้อมูล)
 *     ล้มเหลวตามไปด้วย (Fail-safe)
 * ============================================================
 */

/* ---------- ค่าคงที่ของ Telegram API ---------- */
const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';


/**
 * ส่งข้อความแจ้งเตือนเมื่อมีการ "บันทึกงานใหม่"
 * @param {Object} recordData - ข้อมูลที่บันทึก
 * @return {boolean} ส่งสำเร็จหรือไม่
 */
function notifyNewRecord(recordData) {
  try {
    if (!isTelegramEnabled()) {
      console.log('Telegram: ยังไม่ได้ตั้งค่า Token/ChatID — ข้ามการแจ้งเตือน');
      return false;
    }

    const statusIcon = getStatusEmoji(recordData.status);
    const budgetDisplay = recordData.budgetAmount
      ? `${recordData.budget} (${recordData.budgetAmount})`
      : recordData.budget;

    // ใช้ parse_mode = HTML เพราะ MarkdownV2 ต้อง escape อักขระพิเศษเยอะ
    // HTML ปลอดภัยกว่ากับข้อความที่มีเครื่องหมายหลากหลาย
    const message =
      '<b>🔔 แจ้งเตือนงานใหม่</b>\n' +
      '<b>━━━━━━━━━━━━━━━</b>\n' +
      `<b>📋 รายละเอียด:</b> ${escapeHtml(recordData.details || '-')}\n` +
      `<b>👤 ผู้ขอขยายเขต:</b> ${escapeHtml(recordData.requesterName || '-')}\n` +
      `<b>📍 อำเภอ:</b> ${escapeHtml(recordData.district || '-')}` +
        (recordData.subdistrict ? ` / ${escapeHtml(recordData.subdistrict)}` : '') +
        (recordData.village ? ` / ${escapeHtml(recordData.village)}` : '') + '\n' +
      (recordData.phone ? `<b>📞 เบอร์โทร:</b> ${escapeHtml(recordData.phone)}\n` : '') +
      `<b>👷 ผู้รับผิดชอบ:</b> ${escapeHtml(recordData.responsible || '-')}\n` +
      `<b>💰 งบ:</b> ${escapeHtml(budgetDisplay || '-')}\n` +
      `${statusIcon} <b>สถานะ:</b> ${escapeHtml(recordData.status || '-')}\n` +
      (recordData.wbs ? `<b>🔢 WBS:</b> <code>${escapeHtml(recordData.wbs)}</code>\n` : '') +
      '<b>━━━━━━━━━━━━━━━</b>\n' +
      `<i>🕒 ${formatThaiDateTime(new Date())}</i>\n` +
      `<i>บันทึกโดยระบบ Work Book</i>`;

    return sendTelegramMessage(message, { parseMode: 'HTML' });
  } catch (error) {
    console.error('Telegram.notifyNewRecord ERROR:', error);
    logError('notifyNewRecord', error);
    return false;
  }
}


/**
 * ส่งข้อความแจ้งเตือนเมื่อมีการ "อัปเดตสถานะงาน"
 * @param {Object} oldData - ข้อมูลเดิม
 * @param {Object} newData - ข้อมูลที่อัปเดต
 * @return {boolean}
 */
function notifyUpdateRecord(oldData, newData) {
  try {
    if (!isTelegramEnabled()) {
      console.log('Telegram: ยังไม่ได้ตั้งค่า Token/ChatID — ข้ามการแจ้งเตือน');
      return false;
    }

    const oldStatusIcon = getStatusEmoji(oldData.status);
    const newStatusIcon = getStatusEmoji(newData.status);

    const message =
      '<b>🔄 แจ้งเตือนอัปเดตงาน</b>\n' +
      '<b>━━━━━━━━━━━━━━━</b>\n' +
      `<b>📋 รายละเอียด:</b> ${escapeHtml(oldData.details || '-')}\n` +
      `<b>👤 ผู้ขอขยายเขต:</b> ${escapeHtml(oldData.requesterName || '-')}\n` +
      `<b>📍 อำเภอ:</b> ${escapeHtml(oldData.district || '-')}\n` +
      `<b>👷 ผู้รับผิดชอบ:</b> ${escapeHtml(oldData.responsible || '-')}\n` +
      '<b>━━━━━━━━━━━━━━━</b>\n' +
      `<b>สถานะเดิม:</b> ${oldStatusIcon} ${escapeHtml(oldData.status || '-')}\n` +
      `<b>สถานะใหม่:</b> ${newStatusIcon} <b>${escapeHtml(newData.status || '-')}</b>\n` +
      '<b>━━━━━━━━━━━━━━━</b>\n' +
      `<i>🕒 ${formatThaiDateTime(new Date())}</i>\n` +
      `<i>อัปเดตโดยระบบ Work Book</i>`;

    return sendTelegramMessage(message, { parseMode: 'HTML' });
  } catch (error) {
    console.error('Telegram.notifyUpdateRecord ERROR:', error);
    logError('notifyUpdateRecord', error);
    return false;
  }
}


/**
 * ฟังก์ชันพื้นฐานสำหรับส่งข้อความเข้า Telegram
 * @param {string} text - ข้อความที่จะส่ง
 * @param {Object} options
 *   - parseMode: 'HTML' | 'MarkdownV2' | '' (default: 'HTML')
 *   - disablePreview: boolean (default: true)
 * @return {boolean} ส่งสำเร็จหรือไม่
 */
function sendTelegramMessage(text, options) {
  options = options || {};
  try {
    const config = getConfigData();
    const token = config.telegramBotToken;
    const chatId = config.telegramChatId;

    if (!token || !chatId) {
      console.warn('Telegram: ขาด Token หรือ ChatID');
      return false;
    }

    const url = TELEGRAM_API_BASE + token + '/sendMessage';
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: options.parseMode || 'HTML',
      disable_web_page_preview: options.disablePreview !== false
    };

    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    const body = response.getContentText();

    if (code === 200) {
      const result = JSON.parse(body);
      if (result.ok) {
        console.log('Telegram: ส่งข้อความสำเร็จ');
        return true;
      } else {
        console.error('Telegram API error:', result.description);
        logError('sendTelegramMessage', new Error(result.description));
        return false;
      }
    } else {
      console.error('Telegram HTTP error:', code, body);
      logError('sendTelegramMessage', new Error('HTTP ' + code + ': ' + body));
      return false;
    }
  } catch (error) {
    console.error('Telegram.sendTelegramMessage ERROR:', error);
    logError('sendTelegramMessage', error);
    return false;
  }
}


/**
 * ทดสอบการเชื่อมต่อ Telegram Bot
 * (เรียกได้จากเมนู GAS เพื่อตรวจสอบว่า Token ใช้งานได้)
 * @return {{success:boolean, message:string}}
 */
function verifyTelegramBot() {
  try {
    const config = getConfigData();
    const token = config.telegramBotToken;

    if (!token) {
      return { success: false, message: 'ยังไม่ได้ตั้งค่า telegramBotToken ใน Sheet "ตั้งค่า"' };
    }

    const url = TELEGRAM_API_BASE + token + '/getMe';
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const code = response.getResponseCode();
    const body = JSON.parse(response.getContentText());

    if (code === 200 && body.ok) {
      return {
        success: true,
        message: 'เชื่อมต่อสำเร็จ: @' + body.result.username + ' (' + body.result.first_name + ')'
      };
    }
    return { success: false, message: 'ไม่สำเร็จ: ' + (body.description || code) };
  } catch (error) {
    console.error('Telegram.verifyTelegramBot ERROR:', error);
    logError('verifyTelegramBot', error);
    return { success: false, message: error.toString() };
  }
}


/**
 * ทดสอบส่งข้อความ (ใช้สำหรับตรวจสอบตอนตั้งค่า)
 * สามารถรันจาก GAS Editor เพื่อทดสอบได้
 */
function testTelegramNotification() {
  const ok = notifyNewRecord({
    details: '[ทดสอบ] รายละเอียดทดสอบการแจ้งเตือน',
    requesterName: 'ผู้ทดสอบระบบ',
    district: 'เมืองนครพนม',
    subdistrict: '',
    village: '',
    phone: '0812345678',
    responsible: 'นายทดสอบ ระบบ',
    budget: 'C',
    budgetAmount: '50000',
    status: 'รอดำเนินการ',
    wbs: 'WBS-TEST-001'
  });
  Logger.log('Telegram test result:', ok);
  return ok;
}


/* ================== ฟังก์ชันช่วยเหลือ (Helper) ================== */

/**
 * แปลง HTML special characters (ป้องกันโค้ด HTML พัง)
 * @param {string} text
 * @return {string}
 */
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}


/**
 * ดึง Emoji ตามสถานะงาน
 * @param {string} status
 * @return {string}
 */
function getStatusEmoji(status) {
  const emojis = {
    'รอดำเนินการ': '⏳',
    'กำลังดำเนินการ': '🔄',
    'เสร็จสิ้น': '✅',
    'ยกเลิก': '❌'
  };
  return emojis[status] || '📌';
}


/**
 * จัดรูปแบบวันที่เวลาแบบไทย
 * @param {Date} date
 * @return {string}
 */
function formatThaiDateTime(date) {
  try {
    return Utilities.formatDate(date, 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss') + ' น.';
  } catch (e) {
    return date.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  }
}
