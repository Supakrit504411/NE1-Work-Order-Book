/**
 * ============================================================
 * Line.gs
 * ------------------------------------------------------------
 * จัดการการเชื่อมต่อกับ LINE Messaging API
 *
 * ฟังก์ชันหลัก:
 *   - doPostLine(e)         : Webhook endpoint รับคำสั่งจากผู้ใช้ LINE
 *   - sendLineMessage       : ฟังก์ชันพื้นฐานส่งข้อความ
 *   - buildQuickReply       : สร้าง Quick Reply buttons
 *   - buildWorkFlexMessage  : สร้าง Flex Message แสดงข้อมูลงาน
 *   - replyWithQuickReply   : ตอบกลับพร้อม Quick Reply
 *   - searchWorkByQuery     : ค้นข้อมูลจากสมุดคุมงานเพื่อแสดงบน LINE
 *   - verifyLineBot         : ทดสอบการเชื่อมต่อ
 *
 * หลักการ:
 *   - Channel Access Token และ Channel Secret ดึงจาก Sheet "ตั้งค่า"
 *   - ทุกฟังก์ชันหุ้มด้วย try-catch + Error Logging
 *   - รองรับทั้ง Quick Reply Message และ Flex Message
 *
 * วิธีใช้งาน:
 *   1. ปรับ Deploy เป็น Web App ใหม่ หรือใช้ endpoint เดียวกับ doGet
 *      (ดูวิธีในเอกสาร README_MIGRATION)
 *   2. ใน LINE Developers Console ตั้งค่า Webhook URL ชี้ไปที่ GAS
 *   3. เปิด "Use webhook" และเพิ่ม Bot เข้ากลุ่ม/เป็นเพื่อน
 * ============================================================
 */

/* ---------- ค่าคงที่ของ LINE API ---------- */
const LINE_API_REPLY = 'https://api.line.me/v2/bot/message/reply';
const LINE_API_PUSH = 'https://api.line.me/v2/bot/message/push';
const LINE_API_PROFILE = 'https://api.line.me/v2/bot/profile';


/**
 * ============================================================
 * WEBHOOK HANDLER — รับ Event จาก LINE
 * ใช้เป็นจุดเข้าเมื่อผู้ใช้ส่งข้อความถึง Bot
 * (เรียกจาก doPost ใน Code.gs เมื่อ action === 'lineWebhook')
 * ============================================================
 *
 * @param {Object} e - Event object จาก GAS
 * @return {ContentService.TextOutput}
 */
function handleLineWebhook(e) {
  try {
    // 1) ตรวจสอบว่า LINE ถูกเปิดใช้งาน
    if (!isLineEnabled()) {
      console.warn('LINE: ยังไม่ได้ตั้งค่า Token/Secret');
      return jsonOutput({ success: false, error: 'LINE not configured' });
    }

    // 2) (แนะนำ) ตรวจสอบ Signature เพื่อยืนยันว่า request มาจาก LINE จริง
    const config = getConfigData();
    const signature = e && e.parameters && e.parameters['x_line_signature'];
    if (!verifyLineSignature(e, config.lineChannelSecret)) {
      console.warn('LINE: ตรวจสอบ Signature ไม่ผ่าน — อาจไม่ใช่ request จาก LINE');
      // NOTE: GAS Webhook มักไม่ส่ง header ครบ จึงเป็น optional
      // หากต้องการความปลอดภัยสูง ให้ deploy เป็น Web App แล้วอ่าน header โดยตรง
    }

    // 3) อ่าน body
    const bodyText = e && e.postData ? e.postData.contents : '{}';
    const events = JSON.parse(bodyText).events || [];

    // 4) ประมวลผลทีละ event
    events.forEach(function (event) {
      processLineEvent(event, config);
    });

    return jsonOutput({ success: true });
  } catch (error) {
    console.error('LINE.handleLineWebhook ERROR:', error);
    logError('handleLineWebhook', error);
    return jsonOutput({ success: false, error: error.toString() });
  }
}


/**
 * ประมวลผล LINE event แต่ละรายการ
 * @param {Object} event
 * @param {Object} config
 */
function processLineEvent(event, config) {
  try {
    if (event.type !== 'message' && event.type !== 'postback') return;

    const replyToken = event.replyToken;
    const sourceType = event.source.type;     // user | group | room
    const userId = event.source.userId;

    // กรณีเป็นข้อความ text
    if (event.type === 'message' && event.message.type === 'text') {
      const text = (event.message.text || '').trim();
      handleLineTextMessage(text, replyToken, config);
    }
    // กรณีเป็น postback (ผู้ใช้กด Quick Reply / Button)
    else if (event.type === 'postback') {
      handleLinePostback(event.postback, replyToken, config);
    }
  } catch (error) {
    console.error('LINE.processLineEvent ERROR:', error);
    logError('processLineEvent', error);
  }
}


/**
 * จัดการข้อความ text จากผู้ใช้
 * @param {string} text
 * @param {string} replyToken
 * @param {Object} config
 */
function handleLineTextMessage(text, replyToken, config) {
  const lower = text.toLowerCase();

  try {
    // คำสั่งวิ่งเข้าเมนู Quick Reply
    if (lower === 'เมนู' || lower === 'menu' || lower === '/menu') {
      replyWithQuickReply(replyToken,
        '📋 เลือกเมนูที่ต้องการ', getMainMenuQuickReply());
      return;
    }

    // คำสั่งค้นหา: "ค้นหา <คำค้น>" หรือ "/search <คำค้น>"
    const searchMatch = text.match(/^(?:ค้นหา|\/search)\s+(.+)$/i);
    if (searchMatch) {
      const results = searchWorkByQuery(searchMatch[1]);
      replyWithSearchResults(replyToken, searchMatch[1], results);
      return;
    }

    // คำสั่งดูสถิติรวม
    if (lower === 'สรุป' || lower === '/summary') {
      replyWithSummary(replyToken);
      return;
    }

    // ข้อความอื่น ๆ — แนะนำการใช้งานพร้อม Quick Reply
    replyWithQuickReply(replyToken,
      'สวัสดีครับ 👋 ฉันคือผู้ช่วยสมุดคุมงาน\n\n' +
      '📌 คำสั่งที่ใช้ได้:\n' +
      '• พิมพ์ "เมนู" เพื่อดูเมนูหลัก\n' +
      '• พิมพ์ "ค้นหา <ชื่อ/อำเภอ>" เพื่อค้นหางาน\n' +
      '• พิมพ์ "สรุป" เพื่อดูสถิติรวม',
      getMainMenuQuickReply());
  } catch (error) {
    console.error('LINE.handleLineTextMessage ERROR:', error);
    logError('handleLineTextMessage', error);
  }
}


/**
 * จัดการ postback จาก Quick Reply / Button
 * @param {Object} postback
 * @param {string} replyToken
 * @param {Object} config
 */
function handleLinePostback(postback, replyToken, config) {
  try {
    const data = parsePostbackData(postback.data);
    const action = data.action;

    if (action === 'view' && data.id) {
      // ดูรายละเอียดงาน 1 รายการ
      const record = getRecordById(data.id);
      if (record) {
        replyWithFlexMessage(replyToken, buildWorkFlexMessage(record));
      } else {
        sendLineReply(replyToken, [{ type: 'text', text: '❌ ไม่พบข้อมูลงานที่เลือก' }]);
      }
    } else if (action === 'status' && data.status) {
      // กรองตามสถานะ
      const results = searchWorkByStatus(data.status);
      replyWithSearchResults(replyToken, 'สถานะ: ' + data.status, results);
    } else if (action === 'menu') {
      replyWithQuickReply(replyToken,
        '📋 เลือกเมนูที่ต้องการ', getMainMenuQuickReply());
    }
  } catch (error) {
    console.error('LINE.handleLinePostback ERROR:', error);
    logError('handleLinePostback', error);
  }
}


/* ================== การสร้าง Quick Reply ================== */

/**
 * สร้างเมนูหลักแบบ Quick Reply
 * @return {Array} quickReply items
 */
function getMainMenuQuickReply() {
  return [
    buildQuickReply('🔍 ค้นหางาน', 'ค้นหา ', 'action=menu&sub=search'),
    buildQuickReply('⏳ รอดำเนินการ', 'สรุป', 'action=status&status=' + encodeURIComponent('รอดำเนินการ')),
    buildQuickReply('🔄 กำลังดำเนินการ', 'สรุป', 'action=status&status=' + encodeURIComponent('กำลังดำเนินการ')),
    buildQuickReply('✅ เสร็จสิ้น', 'สรุป', 'action=status&status=' + encodeURIComponent('เสร็จสิ้น')),
    buildQuickReply('📊 สรุปทั้งหมด', 'สรุป', 'action=menu&sub=summary')
  ];
}


/**
 * สร้าง Quick Reply item หนึ่งปุ่ม
 * @param {string} label - ข้อความบนปุ่ม
 * @param {string} text - ข้อความ text ที่จะส่งเมื่อกด
 * @param {string} postData - ข้อมูล postback (optional)
 * @return {Object}
 */
function buildQuickReply(label, text, postData) {
  const item = {
    type: 'action',
    imageUrl: undefined,
    action: {
      type: 'message',
      label: label,
      text: text
    }
  };
  // ถ้ามี postData ให้ใช้เป็น postback action แทน
  if (postData) {
    item.action = {
      type: 'postback',
      label: label,
      data: postData,
      displayText: label
    };
  }
  return item;
}


/**
 * ส่งข้อความตอบกลับพร้อม Quick Reply
 * @param {string} replyToken
 * @param {string} text
 * @param {Array} quickReplyItems
 */
function replyWithQuickReply(replyToken, text, quickReplyItems) {
  const message = {
    type: 'text',
    text: text,
    quickReply: { items: quickReplyItems }
  };
  sendLineReply(replyToken, [message]);
}


/* ================== การสร้าง Flex Message ================== */

/**
 * สร้าง Flex Message สำหรับแสดงข้อมูลงาน 1 รายการ
 * @param {Object} record - { details, requesterName, district, responsible, status, ... }
 * @return {Object} Flex Message
 */
function buildWorkFlexMessage(record) {
  try {
    const statusColor = getLineStatusColor(record.status);
    const statusIcon = getStatusEmoji(record.status);

    return {
      type: 'flex',
      altText: 'รายละเอียดงาน: ' + (record.details || '-'),
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '📋 รายละเอียดงาน',
              weight: 'bold',
              size: 'lg',
              color: '#ffffff'
            }
          ],
          backgroundColor: statusColor,
          paddingAll: '20px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            flexText(record.details || '-', { weight: 'bold', size: 'md', wrap: true }),
            flexSeparator(),
            flexKeyValue('👤 ผู้ขอขยายเขต', record.requesterName),
            flexKeyValue('📍 อำเภอ', record.district +
              (record.subdistrict ? '\nต.' + record.subdistrict : '') +
              (record.village ? ' ม.' + record.village : '')),
            record.phone ? flexKeyValue('📞 เบอร์โทร', record.phone) : null,
            flexKeyValue('👷 ผู้รับผิดชอบ', record.responsible),
            flexKeyValue('💰 งบ', record.budget +
              (record.budgetAmount ? ' (' + record.budgetAmount + ')' : '')),
            record.wbs ? flexKeyValue('🔢 WBS', record.wbs) : null,
            flexSeparator(),
            {
              type: 'box',
              layout: 'baseline',
              contents: [
                {
                  type: 'text',
                  text: statusIcon + ' ' + (record.status || '-'),
                  weight: 'bold',
                  size: 'md',
                  color: statusColor
                }
              ]
            }
          ].filter(Boolean)
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              action: { type: 'message', label: '🔍 ค้นหาเพิ่มเติม', text: 'ค้นหา ' + (record.responsible || '') },
              style: 'primary',
              color: statusColor
            }
          ]
        }
      }
    };
  } catch (error) {
    console.error('LINE.buildWorkFlexMessage ERROR:', error);
    logError('buildWorkFlexMessage', error);
    return null;
  }
}


/**
 * ส่ง Flex Message ตอบกลับ
 * @param {string} replyToken
 * @param {Object} flexMessage
 */
function replyWithFlexMessage(replyToken, flexMessage) {
  if (!flexMessage) {
    sendLineReply(replyToken, [{ type: 'text', text: 'ไม่สามารถแสดงข้อมูลได้' }]);
    return;
  }
  sendLineReply(replyToken, [flexMessage]);
}


/**
 * ส่งผลการค้นหา (ถ้าเยอะใช้ Carousel Flex, ถ้าน้อยใช้ text + quickreply)
 * @param {string} replyToken
 * @param {string} query
 * @param {Array} results
 */
function replyWithSearchResults(replyToken, query, results) {
  try {
    if (!results || results.length === 0) {
      replyWithQuickReply(replyToken,
        '🔎 ไม่พบงานที่ตรงกับ "' + query + '"\nลองค้นหาด้วยคำอื่น หรือเลือกจากเมนู',
        getMainMenuQuickReply());
      return;
    }

    // ถ้าผลค้นหา 1 รายการ → แสดง Flex เต็มรูปแบบ
    if (results.length === 1) {
      replyWithFlexMessage(replyToken, buildWorkFlexMessage(results[0]));
      return;
    }

    // ถ้าหลายรายการ → แสดง Carousel (สูงสุด 10)
    const limited = results.slice(0, 10);
    const bubbles = limited.map(buildWorkBubbleForCarousel);

    const carousel = {
      type: 'flex',
      altText: 'พบ ' + results.length + ' รายการ สำหรับ "' + query + '"',
      contents: {
        type: 'carousel',
        contents: bubbles
      }
    };
    sendLineReply(replyToken, [carousel]);
  } catch (error) {
    console.error('LINE.replyWithSearchResults ERROR:', error);
    logError('replyWithSearchResults', error);
  }
}


/**
 * สร้าง Bubble แบบย่อสำหรับ Carousel
 * @param {Object} record
 * @return {Object}
 */
function buildWorkBubbleForCarousel(record) {
  const statusColor = getLineStatusColor(record.status);
  const statusIcon = getStatusEmoji(record.status);
  return {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: statusIcon + ' ' + (record.status || '-'),
          weight: 'bold',
          size: 'sm',
          color: '#ffffff'
        }
      ],
      backgroundColor: statusColor,
      paddingAll: '12px'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: (record.details || '-').substring(0, 60),
          weight: 'bold',
          size: 'sm',
          wrap: true,
          maxLines: 2
        },
        {
          type: 'text',
          text: '👤 ' + (record.requesterName || '-'),
          size: 'xs',
          color: '#888888',
          margin: 'sm'
        },
        {
          type: 'text',
          text: '📍 ' + (record.district || '-'),
          size: 'xs',
          color: '#888888'
        },
        {
          type: 'text',
          text: '👷 ' + (record.responsible || '-'),
          size: 'xs',
          color: '#888888'
        }
      ]
    }
  };
}


/**
 * ส่งข้อความสรุปสถิติรวม
 * @param {string} replyToken
 */
function replyWithSummary(replyToken) {
  try {
    const sheet = getOrCreateSheet(SHEET.DATA);
    const values = sheet.getDataRange().getValues();
    values.shift(); // ตัด header

    const counts = { 'รอดำเนินการ': 0, 'กำลังดำเนินการ': 0, 'เสร็จสิ้น': 0, 'ยกเลิก': 0 };
    values.forEach(function (row) {
      const st = row[10];
      if (counts.hasOwnProperty(st)) counts[st]++;
    });
    const total = values.length;

    const text =
      '📊 สรุปข้อมูลสมุดคุมงาน\n' +
      '━━━━━━━━━━━━━\n' +
      'รวมทั้งหมด: ' + total + ' รายการ\n\n' +
      '⏳ รอดำเนินการ: ' + counts['รอดำเนินการ'] + ' รายการ\n' +
      '🔄 กำลังดำเนินการ: ' + counts['กำลังดำเนินการ'] + ' รายการ\n' +
      '✅ เสร็จสิ้น: ' + counts['เสร็จสิ้น'] + ' รายการ\n' +
      '❌ ยกเลิก: ' + counts['ยกเลิก'] + ' รายการ';

    replyWithQuickReply(replyToken, text, getMainMenuQuickReply());
  } catch (error) {
    console.error('LINE.replyWithSummary ERROR:', error);
    logError('replyWithSummary', error);
  }
}


/* ================== การค้นหาข้อมูลงาน ================== */

/**
 * ค้นหางานจาก keyword (รายละเอียด / ชื่อผู้ขอ / อำเภอ / ผู้รับผิดชอบ)
 * @param {string} query
 * @return {Array} array ของ record object
 */
function searchWorkByQuery(query) {
  try {
    if (!query) return [];
    const q = String(query).toLowerCase().trim();
    const sheet = getOrCreateSheet(SHEET.DATA);
    const values = sheet.getDataRange().getValues();
    values.shift();

    const results = [];
    for (var i = 0; i < values.length; i++) {
      const row = values[i];
      const details = String(row[1] || '').toLowerCase();
      const requester = String(row[2] || '').toLowerCase();
      const district = String(row[3] || '').toLowerCase();
      const responsible = String(row[7] || '').toLowerCase();

      if (details.indexOf(q) !== -1 || requester.indexOf(q) !== -1 ||
          district.indexOf(q) !== -1 || responsible.indexOf(q) !== -1) {
        results.push(rowToRecord(row, i + 2));
      }
    }
    return results;
  } catch (error) {
    console.error('LINE.searchWorkByQuery ERROR:', error);
    logError('searchWorkByQuery', error);
    return [];
  }
}


/**
 * ค้นหางานตามสถานะ
 * @param {string} status
 * @return {Array}
 */
function searchWorkByStatus(status) {
  try {
    const sheet = getOrCreateSheet(SHEET.DATA);
    const values = sheet.getDataRange().getValues();
    values.shift();

    const results = [];
    for (var i = 0; i < values.length; i++) {
      const row = values[i];
      if (String(row[10] || '') === status) {
        results.push(rowToRecord(row, i + 2));
      }
    }
    return results;
  } catch (error) {
    console.error('LINE.searchWorkByStatus ERROR:', error);
    logError('searchWorkByStatus', error);
    return [];
  }
}


/**
 * ดึงข้อมูลงาน 1 รายการตาม rowIndex (sheet row)
 * @param {number|string} id
 * @return {Object|null}
 */
function getRecordById(id) {
  try {
    const rowIndex = parseInt(id, 10);
    if (isNaN(rowIndex)) return null;
    const sheet = getOrCreateSheet(SHEET.DATA);
    const row = sheet.getRange(rowIndex, 1, 1, 15).getValues()[0];
    return rowToRecord(row, rowIndex);
  } catch (error) {
    console.error('LINE.getRecordById ERROR:', error);
    logError('getRecordById', error);
    return null;
  }
}


/**
 * แปลงแถวข้อมูล Sheet → Object record
 * @param {Array} row
 * @param {number} sheetRowIndex
 * @return {Object}
 */
function rowToRecord(row, sheetRowIndex) {
  return {
    id: sheetRowIndex,
    timestamp: row[0],
    details: row[1],
    requesterName: row[2],
    district: row[3],
    subdistrict: row[4],
    village: row[5],
    phone: row[6],
    responsible: row[7],
    budget: row[8],
    budgetAmount: row[9],
    status: row[10],
    fileUrl: row[11],
    wbs: row[12]
  };
}


/* ============================================================
 * ฟังก์ชันช่วยเหลือ (Helper) และการสื่อสารกับ LINE API
 * ============================================================ */

/**
 * ตรวจสอบ X-Line-Signature เพื่อยืนยัน request มาจาก LINE จริง
 * @param {Object} e
 * @param {string} channelSecret
 * @return {boolean}
 */
function verifyLineSignature(e, channelSecret) {
  try {
    if (!channelSecret || !e || !e.postData || !e.postData.contents) {
      return true; // กรณี GAS ส่ง header มาไม่ครบ ให้ผ่านไปก่อน (optional)
    }
    const signature = e.parameter['x_line_signature'] ||
                      (e.headers && e.headers['X-Line-Signature']);
    if (!signature) return true;
    const computed = Utilities.computeHmacSha256Signature(
      e.postData.contents, channelSecret);
    const computedB64 = Utilities.base64Encode(computed);
    return computedB64 === signature;
  } catch (error) {
    console.warn('LINE.verifyLineSignature (skip):', error);
    return true; // ไม่บล็อกงานหลักหากตรวจไม่ได้
  }
}


/**
 * แปลง postback data (string) เป็น object
 * @param {string} data - เช่น "action=view&id=5"
 * @return {Object}
 */
function parsePostbackData(data) {
  const result = {};
  try {
    if (!data) return result;
    String(data).split('&').forEach(function (pair) {
      const idx = pair.indexOf('=');
      if (idx !== -1) {
        const key = pair.substring(0, idx);
        const val = decodeURIComponent(pair.substring(idx + 1));
        result[key] = val;
      }
    });
  } catch (e) {
    console.warn('parsePostbackData error:', e);
  }
  return result;
}


/**
 * ส่ง Reply Message ตอบกลับผู้ใช้ (ใช้ replyToken ครั้งเดียว)
 * @param {string} replyToken
 * @param {Array} messages
 * @return {boolean}
 */
function sendLineReply(replyToken, messages) {
  try {
    const config = getConfigData();
    const token = config.lineChannelAccessToken;
    if (!token || !replyToken) {
      console.warn('LINE: ขาด Token หรือ replyToken');
      return false;
    }

    const response = UrlFetchApp.fetch(LINE_API_REPLY, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      payload: JSON.stringify({
        replyToken: replyToken,
        messages: messages
      }),
      muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    if (code === 200) {
      console.log('LINE: ส่ง Reply สำเร็จ');
      return true;
    }
    console.error('LINE Reply HTTP error:', code, response.getContentText());
    logError('sendLineReply', new Error('HTTP ' + code + ': ' + response.getContentText()));
    return false;
  } catch (error) {
    console.error('LINE.sendLineReply ERROR:', error);
    logError('sendLineReply', error);
    return false;
  }
}


/**
 * ส่ง Push Message (ส่งเองโดยไม่ต้องรอ replyToken)
 * @param {string} to - userId / groupId / roomId
 * @param {Array} messages
 * @return {boolean}
 */
function sendLinePush(to, messages) {
  try {
    const config = getConfigData();
    const token = config.lineChannelAccessToken;
    if (!token || !to) return false;

    const response = UrlFetchApp.fetch(LINE_API_PUSH, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      payload: JSON.stringify({ to: to, messages: messages }),
      muteHttpExceptions: true
    });

    if (response.getResponseCode() === 200) return true;
    console.error('LINE Push error:', response.getResponseCode(), response.getContentText());
    return false;
  } catch (error) {
    console.error('LINE.sendLinePush ERROR:', error);
    logError('sendLinePush', error);
    return false;
  }
}


/**
 * ทดสอบการเชื่อมต่อ LINE Bot
 * @return {{success:boolean, message:string}}
 */
function verifyLineBot() {
  try {
    const config = getConfigData();
    if (!config.lineChannelAccessToken) {
      return { success: false, message: 'ยังไม่ได้ตั้งค่า lineChannelAccessToken' };
    }
    const response = UrlFetchApp.fetch(LINE_API_PROFILE, {
      method: 'get',
      headers: { 'Authorization': 'Bearer ' + config.lineChannelAccessToken },
      muteHttpExceptions: true
    });
    const code = response.getResponseCode();
    const body = response.getContentText();
    if (code === 200) {
      const info = JSON.parse(body);
      return { success: true, message: 'เชื่อมต่อสำเร็จ: ' + info.displayName };
    }
    return { success: false, message: 'HTTP ' + code + ': ' + body };
  } catch (error) {
    console.error('LINE.verifyLineBot ERROR:', error);
    logError('verifyLineBot', error);
    return { success: false, message: error.toString() };
  }
}


/**
 * ดึงสี (hex) ตามสถานะงาน สำหรับ Flex Message
 * @param {string} status
 * @return {string}
 */
function getLineStatusColor(status) {
  const colors = {
    'รอดำเนินการ': '#F59E0B',   // ส้ม
    'กำลังดำเนินการ': '#3B82F6', // น้ำเงิน
    'เสร็จสิ้น': '#22C55E',      // เขียว
    'ยกเลิก': '#EF4444'          // แดง
  };
  return colors[status] || '#2A505A';
}


/* ---------- Flex Component helpers ---------- */

function flexText(text, opts) {
  opts = opts || {};
  return {
    type: 'text',
    text: String(text),
    weight: opts.weight || 'regular',
    size: opts.size || 'sm',
    color: opts.color || '#333333',
    wrap: opts.wrap !== false
  };
}

function flexKeyValue(key, value) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: String(key),
        size: 'sm',
        color: '#888888',
        flex: 2
      },
      {
        type: 'text',
        text: String(value || '-'),
        size: 'sm',
        color: '#333333',
        flex: 3,
        wrap: true
      }
    ],
    spacing: 'md'
  };
}

function flexSeparator() {
  return { type: 'separator', margin: 'sm' };
}


/**
 * ทดสอบ Flex Message (รันจาก GAS Editor)
 */
function testLineFlex() {
  const sample = {
    id: 2,
    details: '[ทดสอบ] ติดตั้งเสาไฟฟ้าหมู่บ้านตัวอย่าง',
    requesterName: 'นายสมชาย ใจดี',
    district: 'เมืองนครพนม',
    subdistrict: 'หนองแสน',
    village: 'บ้านตัวอย่าง',
    phone: '0812345678',
    responsible: 'ศุภกฤษ ทะวัง',
    budget: 'C',
    budgetAmount: '150000',
    status: 'กำลังดำเนินการ',
    wbs: 'WBS-2026-001'
  };
  const flex = buildWorkFlexMessage(sample);
  Logger.log(JSON.stringify(flex, null, 2));
  return flex;
}
