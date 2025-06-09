// 📁 index.js
const express = require('express')
const line = require('@line/bot-sdk')
const dotenv = require('dotenv')
const scheduleManager = require('./scheduleManager')
const sessionStore = require('./sessionStore')
const uploadImageBuffer = require('./cloudinaryUploader')
dotenv.config()

const app = express()
const port = process.env.PORT || 3000

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
}

const client = new line.Client(config)
// ⬇️ 多管理員支援：以 , 分割，組成陣列
const ADMIN_USER_IDS = (process.env.ADMIN_USER_ID || '').split(',').map(x => x.trim()).filter(Boolean)

app.use('/webhook', line.middleware(config), async (req, res) => {
  const events = req.body.events
  await Promise.all(events.map(async (event) => {
    if (event.type !== 'message') return

    const userId = event.source.userId
    const replyToken = event.replyToken

    // ⬇️ 僅限管理員可操作
    if (!ADMIN_USER_IDS.includes(userId)) return

    const session = sessionStore.get(userId)

    // ⬇️ 儲存圖片
    if (session.step === 'image' && event.message.type === 'image') {
      const messageId = event.message.id
      const buffer = await client.getMessageContent(messageId)
      const chunks = []
      for await (let chunk of buffer) { chunks.push(chunk) }
      session.imageBuffer = Buffer.concat(chunks)
      session.step = 'text'
      sessionStore.set(userId, session)
      return client.replyMessage(replyToken, { type: 'text', text: '💬 請輸入文字內容' })
    }

    if (event.message.type !== 'text') return
    const userMessage = event.message.text.trim()

    // ⬇️ 僅接受「排程推播」「刪除推播」開頭指令
    if (!session.step && !userMessage.startsWith('排程推播') && !userMessage.startsWith('刪除推播')) return

    // ⬇️ 刪除推播
    if (userMessage.startsWith('刪除推播')) {
      const code = userMessage.split(' ')[1]
      const success = scheduleManager.deleteTask(code)
      const msg = success ? `✅ 已刪除排程 ${code}` : `⚠️ 找不到代碼 ${code}`
      return client.replyMessage(replyToken, { type: 'text', text: msg })
    }

    // ⬇️ 新增：多一步「輸入群組名稱」
    if (userMessage === '排程推播' && !session.step) {
      session.step = 'group'
      sessionStore.set(userId, session)
      return client.replyMessage(replyToken, { type: 'text', text: '🔔 要推播的群組 ID' })
    }
    if (session.step === 'group') {
      session.groupId = userMessage
      session.step = 'groupName'
      sessionStore.set(userId, session)
      return client.replyMessage(replyToken, { type: 'text', text: '🏷️ 群組名稱（自訂顯示用）' })
    }
    if (session.step === 'groupName') {
      session.groupName = userMessage
      session.step = 'date'
      sessionStore.set(userId, session)
      return client.replyMessage(replyToken, { type: 'text', text: '📅 推播日期（YYYY-MM-DD）' })
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
      }
      return client.replyMessage(replyToken, { type: 'text', text: '⚠️ 請直接上傳圖片檔案，或輸入「無」' })
    }
    if (session.step === 'text') {
      session.text = userMessage
      let imageUrl = null
      if (session.imageBuffer) {
        try {
          imageUrl = await uploadImageBuffer(session.imageBuffer)
        } catch (err) {
          return client.replyMessage(replyToken, { type: 'text', text: '❌ 圖片上傳失敗，請重新嘗試，或輸入「無」略過' })
        }
      }
      const taskCode = scheduleManager.addTask({
        groupId: session.groupId,
        groupName: session.groupName,
        date: session.date,
        time: session.time,
        imageUrl,
        text: session.text,
        client,
        adminUserIds: ADMIN_USER_IDS
      })
      sessionStore.clear(userId)
      return client.replyMessage(replyToken, {
        type: 'text',
        text: `✅ 推播已排程成功！代碼：${taskCode}\n🔕 若想刪除請輸入：刪除推播 ${taskCode}`
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