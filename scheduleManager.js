// 📁 scheduleManager.js
const nodeSchedule = require('node-schedule')
const { createClient } = require('@supabase/supabase-js')
const { v4: uuidv4 } = require('uuid')
require('dotenv').config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

const TASK_TABLE = 'tasks'
const TIMEZONE = 'Asia/Taipei'
const tasks = {}

function parseDateTimeToUtc(dateStr, timeStr) {
  // 不用 date-fns-tz，直接 ISO 8601 並 +08:00 轉 UTC
  return new Date(`${dateStr}T${timeStr}:00+08:00`)
}

// 新增推播排程
async function addTask({ groupId, groupName, date, time, mediaMessages = [], text, client, adminUserIds = [] }, manualCode) {
  const code = manualCode || uuidv4()
  const jobDate = parseDateTimeToUtc(date, time)
  if (jobDate <= new Date()) {
    console.warn(`⚠️ 無法新增過去時間的排程：${groupName} ${date} ${time}`)
    return null
  }

  const meta = { code, groupId, groupName, date, time, mediaMessages, text }
  // 存入 Supabase
  await supabase.from(TASK_TABLE).upsert([{ ...meta }], { onConflict: 'code' })

  const job = nodeSchedule.scheduleJob(jobDate, async function () {
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
          text: `✅ 推播已完成\n群組：${groupName}（${groupId}）\n日期：${date} ${time}\n` +
            messages.map((m, i) => {
              if (m.type === 'text') return `${i + 1} | 文字：「${m.text}」`
              if (m.type === 'image') return `${i + 1} | 圖片`
              if (m.type === 'video') return `${i + 1} | 影片`
              return `${i + 1} | 其他`
            }).join('\n')
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
    await supabase.from(TASK_TABLE).delete().eq('code', code)
    delete tasks[code]
  })

  job.meta = meta
  tasks[code] = job
  return code
}

// 還原所有未執行排程
async function restoreTasks(client, adminUserIds = []) {
  const { data, error } = await supabase
    .from(TASK_TABLE)
    .select('*')
  if (error) {
    console.error('❌ 還原排程失敗', error)
    return
  }
  for (const task of data) {
    const { code, groupId, groupName, date, time, mediaMessages, text } = task
    await addTask({ groupId, groupName, date, time, mediaMessages, text, client, adminUserIds }, code)
  }
  console.log(`🌀 已還原 ${data.length} 筆排程任務`)
}

// 刪除指定排程
async function deleteTask(code) {
  if (tasks[code]) {
    tasks[code].cancel()
    delete tasks[code]
  }
  const { error } = await supabase.from(TASK_TABLE).delete().eq('code', code)
  if (error) {
    console.error('❌ 刪除排程失敗', error)
    return false
  }
  return true
}

// 查詢所有尚未執行的推播任務
async function listTasks() {
  const { data, error } = await supabase
    .from(TASK_TABLE)
    .select('*')
    .order('date', { ascending: true })
    .order('time', { ascending: true })
  if (error) {
    console.error('❌ 查詢排程失敗', error)
    return []
  }
  return data || []
}

module.exports = { addTask, deleteTask, listTasks, restoreTasks }