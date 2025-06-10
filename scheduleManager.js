// scheduleManager.js
const nodeSchedule = require('node-schedule')
const fs = require('fs-extra')
const path = require('path')
const { zonedTimeToUtc } = require('date-fns-tz')
const { v4: uuidv4 } = require('uuid')

const TASK_FILE = path.resolve(__dirname, 'tasks.json')
const TIMEZONE = 'Asia/Taipei'
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

function parseDateTimeToUtc(dateStr, timeStr) {
  const dateTimeStr = `${dateStr}T${timeStr}:00`
  return zonedTimeToUtc(dateTimeStr, TIMEZONE)
}

function addTask({ groupId, groupName, date, time, mediaMessages = [], text, client, adminUserIds = [], restore = false }, manualCode) {
  const code = manualCode || uuidv4()
  const jobDate = parseDateTimeToUtc(date, time)
  if (jobDate <= new Date()) {
    console.warn(`⚠️ 無法新增過去時間的排程：${groupName} ${date} ${time}`)
    return null
  }

  const meta = { groupId, groupName, date, time, mediaMessages, text }
  const job = nodeSchedule.scheduleJob(jobDate, async function () {
    console.log(`📤 [推播觸發] ${groupName}（${groupId}） at ${date} ${time} | UTC: ${jobDate}`)
    let messages = Array.isArray(mediaMessages) ? [...mediaMessages] : []
    if (!messages.length && text) messages = [{ type: 'text', text }]
    if (text && (messages.length === 0 || messages[messages.length - 1].type !== 'text')) {
      messages.push({ type: 'text', text })
    }
    if (messages.length > 5) {
      messages = messages.slice(0, 4)
      messages.push({ type: 'text', text: '⚠️ 已達 LINE 推播上限（僅推送前5則）' })
    }
    try {
      if (messages.length) await client.pushMessage(groupId, messages)
      for (const adminId of adminUserIds) {
        await client.pushMessage(adminId, {
          type: 'text',
          text:
            `✅ 推播已完成\n群組：${groupName}（${groupId}）\n日期：${date} ${time}\n` +
            messages
              .map((m, i) => {
                if (m.type === 'text') return `${i + 1} | 文字：「${m.text}」`
                if (m.type === 'image') return `${i + 1} | 圖片`
                if (m.type === 'video') return `${i + 1} | 影片`
                return `${i + 1} | 其他`
              })
              .join('\n')
        })
      }
    } catch (err) {
      console.error('❌ 推播發送失敗', JSON.stringify(err, null, 2))
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

function deleteTask(code) {
  if (tasks[code]) {
    tasks[code].cancel()
    delete tasks[code]
    persistTasks()
    return true
  }
  return false
}

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
