// scheduleManager.js (Supabase 版本)
const { createClient } = require('@supabase/supabase-js')
const { v4: uuidv4 } = require('uuid')
const dayjs = require('dayjs')
const cron = require('node-cron')
const dotenv = require('dotenv')

dotenv.config()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
const taskMap = new Map()

function addTask({ groupId, groupName, date, time, mediaMessages, text, client, adminUserIds }) {
  const code = uuidv4()
  const dateTime = dayjs(`${date} ${time}`, 'YYYY-MM-DD HH:mm')
  const cronExp = `${dateTime.minute()} ${dateTime.hour()} ${dateTime.date()} ${dateTime.month() + 1} *`

  const task = {
    code,
    groupId,
    groupName,
    date,
    time,
    text,
    mediaMessages,
    cronExp,
  }

  const job = cron.schedule(cronExp, async () => {
    try {
      if (mediaMessages?.length) {
        await client.pushMessage(groupId, mediaMessages)
      }
      taskMap.delete(code)
      await supabase.from('tasks').delete().eq('code', code)
    } catch (err) {
      console.error('❌ 排程推播失敗', err.message)
    }
  })

  taskMap.set(code, job)

  // 將任務儲存至 Supabase
  supabase.from('tasks').insert([{
    code,
    groupId,
    groupName,
    date,
    time,
    text,
    mediaMessages: JSON.stringify(mediaMessages),
    cronExp
  }]).then(({ error }) => {
    if (error) console.error('❌ 無法儲存任務到 Supabase', error.message)
  })

  return code
}

function deleteTask(code) {
  const job = taskMap.get(code)
  if (job) {
    job.stop()
    taskMap.delete(code)
  }
  return supabase.from('tasks').delete().eq('code', code)
    .then(({ error }) => !error)
}

function listTasks() {
  return Array.from(taskMap.entries()).map(([code, job]) => {
    return {
      code,
      ...job.taskData
    }
  })
}

async function restoreTasks(client, adminUserIds) {
  const { data, error } = await supabase.from('tasks').select('*')
  if (error) {
    console.error('❌ 無法從 Supabase 還原任務', error.message)
    return
  }

  data.forEach(task => {
    const dateTime = dayjs(`${task.date} ${task.time}`, 'YYYY-MM-DD HH:mm')
    if (dateTime.isBefore(dayjs())) return

    const cronExp = `${dateTime.minute()} ${dateTime.hour()} ${dateTime.date()} ${dateTime.month() + 1} *`
    const mediaMessages = JSON.parse(task.mediaMessages || '[]')

    const job = cron.schedule(cronExp, async () => {
      try {
        if (mediaMessages?.length) {
          await client.pushMessage(task.groupId, mediaMessages)
        }
        taskMap.delete(task.code)
        await supabase.from('tasks').delete().eq('code', task.code)
      } catch (err) {
        console.error('❌ 排程推播失敗', err.message)
      }
    })

    job.taskData = {
      code: task.code,
      groupId: task.groupId,
      groupName: task.groupName,
      date: task.date,
      time: task.time,
      text: task.text,
      mediaMessages
    }

    taskMap.set(task.code, job)
  })

  console.log(`✅ 已還原 ${taskMap.size} 筆排程任務`)
}

module.exports = { addTask, deleteTask, listTasks, restoreTasks }