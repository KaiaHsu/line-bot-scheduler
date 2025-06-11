// scheduleManager.js（Supabase 版，圖片訊息正確，推播正確，欄位正確）
const supabase = require('./supabase')
const { v4: uuidv4 } = require('uuid')

const TABLE = 'tasks'
let scheduledJobs = {} // 代碼: timeout物件

// --- 還原所有任務 ---
async function restoreTasks(client, adminUserIds) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .gte('date', new Date().toISOString().slice(0, 10)) // 只還原今天以後
    .order('date', { ascending: true })

  if (error) {
    console.error('❌ 還原推播任務失敗', error)
    return
  }
  for (const task of data || []) {
    scheduleJob(task, client)
  }
}

// --- 排程單一任務 ---
function scheduleJob(task, client) {
  // 刪除原有
  if (scheduledJobs[task.id]) {
    clearTimeout(scheduledJobs[task.id])
  }
  // 計算 UTC 排程時間
  const dateTime = new Date(`${task.date}T${task.time}:00+08:00`)
  const now = new Date()
  const delay = dateTime - now
  if (delay <= 0) return

  scheduledJobs[task.id] = setTimeout(async () => {
    try {
      // 解析 media_json，回推
      let messages = []
      if (Array.isArray(task.media_json) && task.media_json.length > 0) {
        messages = task.media_json
      }
      messages.push({ type: 'text', text: task.text })
      await client.pushMessage(task.group_id, messages)
      await supabase.from(TABLE).delete().eq('id', task.id)
      delete scheduledJobs[task.id]
    } catch (e) {
      console.error('❌ 定時推播發送失敗', e)
    }
  }, delay)
}

// --- 新增推播任務 ---
async function addTask({ groupId, groupName, date, time, mediaMessages, text, client }) {
  const taskId = uuidv4()
  const { data, error } = await supabase
    .from(TABLE)
    .insert([{
      id: taskId,
      group_id: groupId,
      group_name: groupName,
      date,
      time,
      text,
      media_json: mediaMessages
    }])
    .select()
    .maybeSingle()
  if (error) {
    console.error('❌ 新增推播失敗', error)
    return null
  }
  scheduleJob({ ...data }, client)
  return taskId
}

// --- 刪除推播任務 ---
async function deleteTask(taskCode) {
  // 查詢是否有該任務
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', taskCode).maybeSingle()
  if (error || !data) return false
  if (scheduledJobs[taskCode]) clearTimeout(scheduledJobs[taskCode])
  await supabase.from(TABLE).delete().eq('id', taskCode)
  return true
}

// --- 列出所有推播任務 ---
async function listTasks() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, group_id, group_name, date, time, text, media_json')
    .order('date', { ascending: true })
    .order('time', { ascending: true })
  if (error) {
    console.error('❌ 查詢推播任務失敗', error)
    return []
  }
  // 回傳 taskList: 要用 id 作為 code
  return (data || []).map(t => ({
    code: t.id,
    groupId: t.group_id,
    groupName: t.group_name,
    date: t.date,
    time: t.time,
    text: t.text,
    media_json: t.media_json
  }))
}

module.exports = {
  restoreTasks,
  addTask,
  deleteTask,
  listTasks,
}