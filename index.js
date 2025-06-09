// 📁 index.js
const express = require('express')
const line = require('@line/bot-sdk')
const dotenv = require('dotenv')
const scheduleManager = require('./scheduleManager')
const sessionStore = require('./sessionStore')
dotenv.config()

const app = express()
const port = process.env.PORT || 3000

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
}

const client = new line.Client(config)

// 🧠 限定只有你可以控制這隻 Bot
const ADMIN_USER_ID = process.env.ADMIN_USER_ID

app.use('/webhook', line.middleware(config), async (req, res) => {
  const events = req.body.events
  await Promise.all(events.map(async (event) => {
    // 只回應文字訊息
    if (event.type !== 'message' || event.message.type !== 'text') return

    const userId = event.source.userId
    if (userId !== ADMIN_USER_ID) return // ❗ 僅允許管理員操作

    const replyToken = event.replyToken
    const userMessage = event.message.text.trim()
    const session = sessionStore.get(userId)

    if (userMessage.toLowerCase().startsWith('刪除')) {
      const code = userMessage.yjsplit(' ')[1]
      const success = scheduleManager.deleteTask(code)
      const msg = success ? `✅ 已刪除排程 ${code}` : `⚠️ 找不到代碼 ${code}`
      return client.replyMessage(replyToken, { type: 'text', text: msg })
    }

    // 建立推播流程
    if (!session.step) {
      session.step = 'group'
      sessionStore.set(userId, session)
      return client.replyMessage(replyToken, { type: 'text', text: '📌 請輸入要推播的群組 ID（例如：C1234567890）' })
    }

    if (session.step === 'group') {
      session.groupId = userMessage
      session.step = 'date'
      return client.replyMessage(replyToken, { type: 'text', text: '📅 請輸入推播日期（格式：2025-06-11）' })
    }

    if (session.step === 'date') {
      session.date = userMessage
      session.step = 'time'
      return client.replyMessage(replyToken, { type: 'text', text: '⏰ 請輸入時間（格式：10:00）' })
    }

    if (session.step === 'time') {
      session.time = userMessage
      session.step = 'image'
      return client.replyMessage(replyToken, { type: 'text', text: '🖼️ 請貼上圖片網址（或輸入無）' })
    }

    if (session.step === 'image') {
      session.image = userMessage === '無' ? null : userMessage
      session.step = 'text'
      return client.replyMessage(replyToken, { type: 'text', text: '💬 請輸入文字內容（多行可一次貼上）' })
    }

    if (session.step === 'text') {
      session.text = userMessage
      const taskCode = scheduleManager.addTask({
        groupId: session.groupId,
        date: session.date,
        time: session.time,
        image: session.image,
        text: session.text,
        client: client
      })

      sessionStore.clear(userId)
      return client.replyMessage(replyToken, {
        type: 'text',
        text: `✅ 推播已排程成功！代碼：${taskCode}\n若想刪除請輸入：刪除 ${taskCode}`
      })
    }
  }))
  res.status(200).end()
})

app.get('/', (req, res) => {
  res.send('🤖 LINE Bot Scheduler is running')
})

app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`)
})