// scheduleManager.js
const { v4: uuidv4 } = require('uuid')
const supabase = require('./supabase')
const dayjs = require('dayjs')

const taskStore = new Map()

function scheduleTaskExecution(task) {
  const dateTimeStr = `${task.date} ${task.time}`
  const delay = dayjs(dateTimeStr).diff(dayjs())
  if (delay <= 0) {
    console.log(`⚠️ 排程時間已過：${dateTimeStr}`)
    return
  }

  const timer = setTimeout(async () => {
    try {
      console.log(`📤 開始推播任務 ${task.code} 至群組 ${task.groupName}`)
      for (const msg of task.mediaMessages) {
        await task.client.pushMessage(task.groupId, msg)
      }
      console.log(`✅ 已完成推播任務 ${task.code}`)
    } catch (err) {
      console.error(`❌ 推播任務 ${task.code} 發生錯誤：`, err)
    }
    taskStore.delete(task.code)
  }, delay)

  taskStore.set(task.code, { ...task, timer })
}

async function addTask({
  groupId,
  groupName,
  date,
  time,
  mediaMessages,
  text,
  client,
}) {
  const code = uuidv4()

  try {
    const { error } = await supabase.from('tasks').insert({
      id: code,
      group_id: groupId,
      group_name: groupName,
      date,
      time,
      text,
      media_json: mediaMessages,
    })
    if (error) {
      console.error('❌ 儲存排程至 Supabase 失敗：', error)
    } else {
      console.log('✅ 任務儲存至 Supabase 成功')
    }
  } catch (err) {
    console.error('❌ 插入 Supabase 時出錯：', err)
  }

  const task = {
    code,
    groupId,
    groupName,
    date,
    time,
    mediaMessages,
    text,
    client,
  }

  scheduleTaskExecution(task)
  return code
}

function listTasks() {
  return Array.from(taskStore.values())
}

async function deleteTask(code) {
  const task = taskStore.get(code)
  if (task) {
    clearTimeout(task.timer)
    taskStore.delete(code)
  }

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', code)

  if (error) {
    console.error('❌ 刪除任務時發生錯誤：', error)
  } else {
    console.log(`🗑️ 已刪除任務 ${code} from Supabase`)
  }
}

async function restoreTasks(client) {
  const now = dayjs().format('YYYY-MM-DD HH:mm')

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .gte('date', dayjs().format('YYYY-MM-DD'))

  if (error) {
    console.error('❌ 讀取任務錯誤：', error)
    return
  }

  for (const task of data) {
    const fullTask = {
      code: task.id,
      groupId: task.group_id,
      groupName: task.group_name,
      date: task.date,
      time: task.time,
      mediaMessages: task.media_json || [],
      text: task.text,
      client,
    }
    scheduleTaskExecution(fullTask)
  }

  console.log(`🔁 已還原 ${data.length} 筆任務`)
}

module.exports = {
  addTask,
  listTasks,
  deleteTask,
  restoreTasks,
}