// 📁 scheduleManager.js
const schedule = require('node-schedule')
const { v4: uuidv4 } = require('uuid')

const tasks = {}

function addTask({ groupId, date, time, image, text, client }) {
  const [hour, minute] = time.split(':').map(Number)
  const [year, month, day] = date.split('-').map(Number)

  const jobTime = new Date(year, month - 1, day, hour, minute, 0)

  const taskCode = `${date.replace(/-/g, '')}-${hour}${minute}-${uuidv4().slice(0, 6)}`

  const job = schedule.scheduleJob(jobTime, async () => {
    try {
      const messages = []

      if (image) {
        messages.push({
          type: 'image',
          originalContentUrl: image,
          previewImageUrl: image
        })
      }

      if (text) {
        messages.push({
          type: 'text',
          text: text
        })
      }

      await client.pushMessage(groupId, messages)

      console.log(`✅ 已推播至群組 ${groupId}：${text?.slice(0, 20)}...`)

      // ✅ 推播完成後自動清除排程
      delete tasks[taskCode]

    } catch (error) {
      console.error(`❌ 推播失敗 [${taskCode}]：`, error)
    }
  })

  tasks[taskCode] = job
  return taskCode
}

function deleteTask(taskCode) {
  const job = tasks[taskCode]
  if (job) {
    job.cancel()
    delete tasks[taskCode]
    return true
  }
  return false
}

module.exports = {
  addTask,
  deleteTask
}