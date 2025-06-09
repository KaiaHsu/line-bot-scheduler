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

    // 確認 ID
    console.log('📨 收到事件：', event)
    
    if (event.type === 'message') {
      const userId = event.source.userId
      const replyToken = event.replyToken

      if (userId !== ADMIN_USER_ID) return

      const session = sessionStore.get(userId)

      // 儲存圖片訊息
      if (session.step === 'image' && event.message.type === 'image') {
        const messageId = event.message.id
        const buffer = await client.getMessageContent(messageId)
        const chunks = []
        for await (let chunk of buffer) {
          chunks.push(chunk)
        }
        session.imageBuffer = Buffer.concat(chunks)
        session.step = 'text'
        sessionStore.set(userId, session)
        return client.replyMessage(replyToken, { type: 'text', text: '💬 請輸入文字內容' })
      }

      if (event.message.type !== 'text') return

      const userMessage = event.message.text.trim()

      // 🔑 僅接受『排程推播』和『刪除推播』開頭的指令
      if (!session.step && !userMessage.startsWith('排程推播') && !userMessage.startsWith('刪除推播')) {
        
        // ❌ 不提示任何訊息
        return
      }

      // ✂️ 刪除推播
      if (userMessage.startsWith('刪除推播')) {
        const code = userMessage.split(' ')[1]
        const success = scheduleManager.deleteTask(code)
        const msg = success ? `✅ 已刪除排程 ${code}` : `⚠️ 找不到代碼 ${code}`
        return client.replyMessage(replyToken, { type: 'text', text: msg })
      }

      // 🚀 開始排程流程
      if (userMessage === '排程推播' && !session.step) {
        session.step = 'group'
        sessionStore.set(userId, session)
        return client.replyMessage(replyToken, { type: 'text', text: '🔔 要推播的群組 ID' })
      }

      if (session.step === 'group') {
        session.groupId = userMessage
        session.step = 'date'
        sessionStore.set(userId, session)
        return client.replyMessage(replyToken, { type: 'text', text: '📅 推播日期（格式：YYYY-MM-DD）' })
      }

      if (session.step === 'date') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(userMessage)) {
          return client.replyMessage(replyToken, { type: 'text', text: '⚠️ 日期格式錯誤，請輸入格式：YYYY-MM-DD' })
        }
        session.date = userMessage
        session.step = 'time'
        sessionStore.set(userId, session)
        return client.replyMessage(replyToken, { type: 'text', text: '⏰ 時間（格式：10:00）' })
      }

      if (session.step === 'time') {
        if (!/^\d{2}:\d{2}$/.test(userMessage)) {
          return client.replyMessage(replyToken, { type: 'text', text: '⚠️ 時間格式錯誤，請參考格式：10:00' })
        }
        session.time = userMessage
        session.step = 'image'
        sessionStore.set(userId, session)
        return client.replyMessage(replyToken, { type: 'text', text: '🖼️ 請直接上傳一張圖片（或輸入「無」）' })
      }

      if (session.step === 'image') {
        if (userMessage === '無') {
          session.imageBuffer = null
          session.step = 'text'
          sessionStore.set(userId, session)
          return client.replyMessage(replyToken, { type: 'text', text: '💬 請輸入文字內容' })
        } else {
          return client.replyMessage(replyToken, { type: 'text', text: '⚠️ 請直接上傳圖片檔案，或輸入「無」' })
        }
      }

      if (session.step === 'text') {
        session.text = userMessage
        const taskCode = scheduleManager.addTask({
          groupId: session.groupId,
          date: session.date,
          time: session.time,
          imageBuffer: session.imageBuffer,
          text: session.text,
          client: client
        })

        sessionStore.clear(userId)
        return client.replyMessage(replyToken, {
          type: 'text',
          text: `✅ 推播已排程成功！代碼：${taskCode}\n🔕 若想刪除請輸入：刪除推播 ${taskCode}`
        })
      }
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
