// 📁 scheduleManager.js
const nodeSchedule = require('node-schedule')

const tasks = {}

/**
 * 新增推播排程
 */
function addTask({ groupId, groupName, date, time, imageUrl, text, client, adminUserIds = [] }) {
  const code = `${groupId}_${date}_${time}_${Date.now()}`
  const [hour, minute] = time.split(':')
  const [year, month, day] = date.split('-')
  const jobDate = new Date(year, month - 1, day, hour, minute)

  // 保存 meta 資訊供查詢
  const meta = { groupId, groupName, date, time, imageUrl, text }

  const job = nodeSchedule.scheduleJob(jobDate, async function () {
    const messages = []
    if (imageUrl) messages.push({ type: 'image', originalContentUrl: imageUrl, previewImageUrl: imageUrl })
    if (text) messages.push({ type: 'text', text })
    try {
      if (messages.length) await client.pushMessage(groupId, messages)
      // 通知每一位管理員
      for (const adminId of adminUserIds) {
        await client.pushMessage(adminId, {
          type: 'text',
          text: `✅ 推播已完成\n群組：${groupName}（${groupId}）\n日期：${date} ${time}\n內容：「${text}」`
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
 * 回傳 [{ code, groupName, groupId, date, time, text }]
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
      text: meta.text
    }
  })
}

module.exports = { addTask, deleteTask, listTasks }
