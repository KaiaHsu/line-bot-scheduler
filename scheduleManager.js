// 📁 scheduleManager.js
const nodeSchedule = require('node-schedule')

const tasks = {}

/**
 * 新增推播排程
 * @param {Object} param0 - 推播參數
 * @param {Array} param0.mediaMessages - [{ type: 'image'|'video', originalContentUrl, previewImageUrl }]
 */
function addTask({ groupId, groupName, date, time, mediaMessages = [], text, client, adminUserIds = [] }) {
  const code = `${groupId}_${date}_${time}_${Date.now()}`
  const [hour, minute] = time.split(':')
  const [year, month, day] = date.split('-')
  const jobDate = new Date(year, month - 1, day, hour, minute)

  // 保存 meta 資訊供查詢
  const meta = { groupId, groupName, date, time, mediaMessages, text }

  const job = nodeSchedule.scheduleJob(jobDate, async function () {
    // 可推播 1~5 則訊息（LINE 限制最多5則）
    let messages = Array.isArray(mediaMessages) ? [...mediaMessages] : []
    // 若未附多媒體，至少有文字訊息
    if (!messages.length && text) messages = [{ type: 'text', text }]
    // 若最後一則不是文字，補上
    if (text && (messages.length === 0 || messages[messages.length - 1].type !== 'text')) {
      messages.push({ type: 'text', text })
    }
    try {
      if (messages.length) await client.pushMessage(groupId, messages)
      // 通知每一位管理員
      for (const adminId of adminUserIds) {
        await client.pushMessage(adminId, {
          type: 'text',
          text:
            `✅ 推播已完成\n群組：${groupName}（${groupId}）\n日期：${date} ${time}\n` +
            `內容：\n` +
            (messages
              .map((m, i) => {
                if (m.type === 'text') return `(${i + 1}) 文字：「${m.text}」`
                if (m.type === 'image') return `(${i + 1}) 圖片`
                if (m.type === 'video') return `(${i + 1}) 影片`
                return ''
              })
              .filter(Boolean)
              .join('\n'))
        })
      }
    } catch (err) {
      for (const adminId of adminUserIds) {
        await client.pushMessage(adminId, {
          type: 'text',
          text: `❌ 推播失敗\n群組：${groupName}（${groupId}）\n錯誤：${err.message || err}`
        })
      }
    }
    delete tasks[code]
  })
  // 讓 meta 可以查詢
  job.meta = meta
  tasks[code] = job
  return code
}

/**
 * 刪除指定排程
 */
function deleteTask(code) {
  if (tasks[code]) {
    tasks[code].cancel()
    delete tasks[code]
    return true
  }
  return false
}

/**
 * 查詢所有尚未執行的推播任務
 * 回傳 [{ code, groupName, groupId, date, time, text, mediaMessages }]
 */
function listTasks() {
  return Object.entries(tasks).map(([code, job]) => {
    const meta = job.meta || {}
    return {
      code,
      groupName: meta.groupName,
      groupId: meta.groupId,
      date: meta.date,
      time: meta.time,
      text: meta.text,
      mediaMessages: meta.mediaMessages
    }
  })
}

module.exports = { addTask, deleteTask, listTasks }
