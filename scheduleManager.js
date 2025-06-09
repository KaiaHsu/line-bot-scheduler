// 📁 scheduleManager.js
const nodeSchedule = require('node-schedule')

const tasks = {}

function addTask({ groupId, groupName, date, time, imageUrl, text, client, adminUserIds = [] }) {
  const code = `${groupId}_${date}_${time}_${Date.now()}`
  const [hour, minute] = time.split(':')
  const [year, month, day] = date.split('-')
  const jobDate = new Date(year, month - 1, day, hour, minute)

  tasks[code] = nodeSchedule.scheduleJob(jobDate, async function () {
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
      // 推播失敗時所有管理員都通知
      for (const adminId of adminUserIds) {
        await client.pushMessage(adminId, {
          type: 'text',
          text: `❌ 推播失敗\n群組：${groupName}（${groupId}）\n錯誤：${err.message || err}`
        })
      }
    }
    delete tasks[code]
  })
  return code
}

function deleteTask(code) {
  if (tasks[code]) {
    tasks[code].cancel()
    delete tasks[code]
    return true
  }
  return false
}

module.exports = { addTask, deleteTask }