// 📁 scheduleManager.js
const nodeSchedule = require('node-schedule')
const fs = require('fs-extra')
const path = require('path')
const zonedTimeToUtc = require('date-fns-tz').zonedTimeToUtc// 引入時區轉換函式
const { v4: uuidv4 } = require('uuid')

const TASK_FILE = path.resolve(__dirname, 'tasks.json')
const TIMEZONE = 'Asia/Taipei' // 台灣時區
const tasks = {}

function persistTasks() {
  const persistData = Object.entries(tasks).map(([code, job]) => {
    const meta = job.meta
    return { code, ...meta }
  })
  fs.writeJsonSync(TASK_FILE, persistData, { spaces: 2 })
}

function restoreTasks(client, adminUserIds = []) {
  if (!fs.existsSync(TASK_FILE)) return

  const taskList = fs.readJsonSync(TASK_FILE)
  for (const task of taskList) {
    const { code, groupId, groupName, date, time, mediaMessages, text } = task
    addTask({ groupId, groupName, date, time, mediaMessages, text, client, adminUserIds, restore: true }, code)
  }

  console.log(`🌀 已還原 ${taskList.length} 筆排程任務`)
}

/**
 * 解析日期與時間（台灣時間）成 UTC Date 物件給 node-schedule 使用
 */
function parseDateTimeToUtc(dateStr, timeStr) {
  const dateTimeStr = `${dateStr}T${timeStr}:00`
  return zonedTimeToUtc(dateTimeStr, TIMEZONE)
}

/**
 * 新增推播排程
 * @param {Object} param0 - 推播參數
 * @param {Array} param0.mediaMessages - [{ type: 'image'|'video'|'text', originalContentUrl, previewImageUrl, text }]
 * @param {string} [manualCode] - 復原時使用既有 code
 */
function addTask({ groupId, groupName, date, time, mediaMessages = [], text, client, adminUserIds = [], restore = false }, manualCode) {
  const code = manualCode || uuidv4()

  // 使用台灣時區轉換成 UTC 時間
  const jobDate = parseDateTimeToUtc(date, time)

  // 防止設定過去時間的任務
  if (jobDate <= new Date()) {
    console.warn(`⚠️ 無法新增過去時間的排程：${groupName} ${date} ${time}`)
    return null
  }

  const meta = { groupId, groupName, date, time, mediaMessages, text }

  const job = nodeSchedule.scheduleJob(jobDate, async function () {
    console.log(`📤 [推播觸發] ${groupName}（${groupId}） at ${date} ${time}`)

    let messages = Array.isArray(mediaMessages) ? [...mediaMessages] : []

    // 若無訊息，至少推播文字訊息
    if (!messages.length && text) messages = [{ type: 'text', text }]
    // 確保最後一則是文字訊息
    if (text && (messages.length === 0 || messages[messages.length - 1].type !== 'text')) {
      messages.push({ type: 'text', text })
    }

    // 限制最多 5 則訊息（LINE 限制）
    if (messages.length > 5) {
      messages = messages.slice(0, 4)
      messages.push({ type: 'text', text: '⚠️ 已達 LINE 推播上限（僅推送前5則）' })
    }

    try {
      if (messages.length) await client.pushMessage(groupId, messages)
      // 通知所有管理員
      for (const adminId of adminUserIds) {
        await client.pushMessage(adminId, {
          type: 'text',
          text:
            `✅ 推播已完成\n群組：${groupName}（${groupId}）\n日期：${date} ${time}\n` +
            messages
              .map((m, i) => {
                if (m.type === 'text') return `${i + 1} | 文字：「${m.text}」`
                if (m.type === 'image') return `${i + 1} | 圖片`
                if (m.type === 'video') return `${i + 1}) | 影片`
                return `${i + 1} | 其他`
              })
              .join('\n')
        })
      }
    } catch (err) {
      console.error('❌ 推播發送失敗', err)
      for (const adminId of adminUserIds) {
        await client.pushMessage(adminId, {
          type: 'text',
          text: `❌ 推播失敗\n群組：${groupName}（${groupId}）\n錯誤：${err.message || err}`
        })
      }
    }

    delete tasks[code]
    persistTasks()
  })

  job.meta = meta
  tasks[code] = job
  if (!restore) persistTasks()
  return code
}

/**
 * 刪除指定排程
 */
function deleteTask(code) {
  if (tasks[code]) {
    tasks[code].cancel()
    delete tasks[code]
    persistTasks()
    return true
  }
  return false
}

/**
 * 查詢所有尚未執行的推播任務
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

module.exports = { addTask, deleteTask, listTasks, restoreTasks }
