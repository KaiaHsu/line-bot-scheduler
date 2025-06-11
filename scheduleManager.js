// 📁 scheduleManager.js (Supabase + dayjs-tz 版)
const { createClient } = require('@supabase/supabase-js')
const { v4: uuidv4 } = require('uuid')
const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
const timezone = require('dayjs/plugin/timezone')
const cron = require('node-cron')
require('dotenv').config()

dayjs.extend(utc)
dayjs.extend(timezone)

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // service_role Key
)

const taskMap = new Map()
const TZ = 'Asia/Taipei'

/**
 * 新增推播排程
 * 回傳  { code }
 */
async function addTask({ groupId, groupName, date, time, mediaMessages, text, client, adminUserIds }) {
  // 1. 產生唯一 code
  const code = uuidv4()

  // 2. 解析指定時區的日期時間
  const dt = dayjs.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm', TZ)
  if (!dt.isValid() || dt.isBefore(dayjs())) {
    throw new Error('Invalid schedule time')
  }
  // Cron 表達式： 分 時 日 月 *
  const cronExp = `${dt.minute()} ${dt.hour()} ${dt.date()} ${dt.month() + 1} *`

  // 3. 建置排程
  const job = cron.schedule(cronExp, async () => {
    try {
      // 發送推播
      if (Array.isArray(mediaMessages) && mediaMessages.length) {
        await client.pushMessage(groupId, mediaMessages)
      }
      // 通知管理員
      for (let adminId of adminUserIds) {
        await client.pushMessage(adminId, {
          type: 'text',
          text: `✅ 推播完成：${groupName} (${groupId})\n時間：${date} ${time}\n文字：${text}`
        })
      }
      // 刪除 Supabase 紀錄 + Map
      await supabase.from('tasks').delete().eq('code', code)
      job.stop()
      taskMap.delete(code)
    } catch (err) {
      console.error('❌ 推播錯誤', err.message || err)
    }
  })

  // 4. Map & DB 寫入
  job.taskMeta = { code, groupId, groupName, date, time, text, mediaMessages }
  taskMap.set(code, job)

  const { error } = await supabase.from('tasks').insert([{
    code,
    group_id: groupId,
    group_name: groupName,
    date,
    time,
    text,
    media_json: JSON.stringify(mediaMessages),
    created_at: dayjs().toISOString()
  }])

  if (error) {
    // 若 DB 寫失敗，先清掉排程
    job.stop()
    taskMap.delete(code)
    throw error
  }

  return code
}

/**
 * 刪除指定排程
 * 回傳是否成功 boolean
 */
async function deleteTask(code) {
  // 1. Map 裡關閉 job
  if (taskMap.has(code)) {
    const job = taskMap.get(code)
    job.stop()
    taskMap.delete(code)
  }
  // 2. DB 刪除
  const { error } = await supabase.from('tasks').delete().eq('code', code)
  return !error
}

/**
 * 列出所有尚未執行的任務
 * 直接回傳 DB 中資料
 */
async function listTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) {
    console.error('❌ 查詢 tasks 失敗', error.message)
    return []
  }
  // 組成 index.js 需要的格式
  return data.map(r => ({
    code: r.code,
    groupId: r.group_id,
    groupName: r.group_name,
    date: r.date,
    time: r.time,
    text: r.text,
    mediaMessages: JSON.parse(r.media_json || '[]')
  }))
}

/**
 * 應用啟動時，重建所有尚未過期任務
 */
async function restoreTasks(client, adminUserIds) {
  const rows = await listTasks()
  for (let row of rows) {
    const { code, groupId, groupName, date, time, text, mediaMessages } = row
    // 重新 schedule
    try {
      await addTask({
        groupId, groupName, date, time,
        mediaMessages, text,
        client, adminUserIds
      })
      console.log(`🔄 恢復排程：${groupName} (${code})`)
    } catch (err) {
      console.warn(`⚠️ 恢復失敗 (${code})`, err.message)
    }
  }
  console.log(`✅ 已恢復 ${taskMap.size} 筆排程`)
}

module.exports = { addTask, deleteTask, listTasks, restoreTasks }