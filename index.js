// index.js
const express = require('express')
const line = require('@line/bot-sdk')
const dotenv = require('dotenv')

dotenv.config()

const scheduleManager = require('./scheduleManager')
const sessionStore = require('./sessionStore')
const uploadMediaBuffer = require('./cloudinaryUploader')

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
}

const client = new line.Client(config)
const ADMIN_USER_IDS = (process.env.ADMIN_USER_ID || '').split(',').map(x => x.trim()).filter(Boolean)
const SESSION_TIMEOUT = 30 * 60 * 1000 // 30分鐘

// 啟動時還原排程任務
scheduleManager.restoreTasks(client, ADMIN_USER_IDS)

// 定期清理過期 session
setInterval(() => {
  sessionStore.cleanupExpiredSessions()
  console.log('🧹 已清理過期 Session')
}, 30 * 60 * 1000)

function safeGetSession(userId) {
  const session = sessionStore.get(userId)
  if (session.lastActive && Date.now() - session.lastActive > SESSION_TIMEOUT) {
    sessionStore.clear(userId)
    return {}
  }
  session.lastActive = Date.now()
  sessionStore.set(userId, session)
  return session
}

const app = express()
const port = process.env.PORT || 3000

app.use('/webhook', line.middleware(config), async (req, res) => {
  const events = req.body.events
  await Promise.all(events.map(async (event) => {
    try {
      if (event.type !== 'message') return

      const userId = event.source.userId
      const replyToken = event.replyToken

      // 非管理員不回應任何訊息
      if (!ADMIN_USER_IDS.includes(userId)) return

      // 貼圖訊息直接忽略
      if (event.message.type === 'sticker') return

      const session = safeGetSession(userId)

      // 快捷指令 - 嗨小編
      if (event.message.type === 'text' && event.message.text.trim() === '嗨小編') {
        return client.replyMessage(replyToken, { type: 'text', text: '小編已抵達目的地！' })
      }

      // 快捷指令 - 查詢推播
      if (event.message.type === 'text' && event.message.text.trim() === '查詢推播') {
        const list = scheduleManager.listTasks()
        if (!list.length) {
          return client.replyMessage(replyToken, { type: 'text', text: '目前沒有任何推播排程。' })
        }
        const chunk = (arr, size) => arr.length ? [arr.slice(0, size), ...chunk(arr.slice(size), size)] : []
        const msgLines = list.map((task, i) =>
          `#${i + 1}\n群組：${task.groupName}（${task.groupId}）\n時間：${task.date} ${task.time}\n內容：「${task.text}」\n代碼：${task.code}`
        )
        const msgChunks = chunk(msgLines, 4)
        for (const msgs of msgChunks) {
          await client.replyMessage(replyToken, { type: 'text', text: msgs.join('\n\n') })
        }
        return
      }

      // 取消流程
      if (event.message.type === 'text' && event.message.text.trim() === '取消') {
        sessionStore.clear(userId)
        return client.replyMessage(replyToken, { type: 'text', text: '流程已取消，歡迎隨時重新開始。' })
      }

      // 多媒體收集階段：圖片或影片
      if (session.step === 'media' && (event.message.type === 'image' || event.message.type === 'video')) {
        const messageId = event.message.id
        const buffer = await client.getMessageContent(messageId)
        const chunks = []
        for await (let chunk of buffer) { chunks.push(chunk) }

        session.mediaList = session.mediaList || []

        if (session.mediaList.length >= 4) {
          return client.replyMessage(replyToken, {
            type: 'text',
            text: '⚠️ 已達上傳上限（4則），請輸入「完成」繼續下一步'
          })
        }

        session.mediaList.push({ type: event.message.type, buffer: Buffer.concat(chunks) })
        sessionStore.set(userId, session)
        return client.replyMessage(replyToken, {
          type: 'text',
          text: `✅ 已收到${event.message.type === 'image' ? '圖片' : '影片'}，可繼續上傳（最多4則），完成請輸入「完成」`
        })
      }

      // 非文字訊息直接忽略，不回應任何訊息
      if (event.message.type !== 'text') return

      const userMessage = event.message.text.trim()

      // 只接受指定指令開頭或流程中，其他不回應
      if (
        !session.step &&
        !userMessage.startsWith('排程推播') &&
        !userMessage.startsWith('刪除推播') &&
        userMessage !== '查詢推播' &&
        userMessage !== '嗨小編' &&
        userMessage !== '取消'
      ) {
        return
      }

      // 刪除推播指令
      if (userMessage.startsWith('刪除推播')) {
        const code = userMessage.split(' ')[1]
        const success = scheduleManager.deleteTask(code)
        const msg = success ? `✅ 已刪除排程 ${code}` : `⚠️ 找不到代碼 ${code}`
        return client.replyMessage(replyToken, { type: 'text', text: msg })
      }

      // 排程推播流程
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
        session.step = 'media'
        session.mediaList = []
        sessionStore.set(userId, session)
        return client.replyMessage(replyToken, {
          type: 'text',
          text: '🖼️ 請連續上傳圖片/影片（最多4則），完成請輸入「完成」，不需要請輸入「無」'
        })
      }
      if (session.step === 'media') {
        if (userMessage === '完成') {
          session.step = 'text'
          sessionStore.set(userId, session)
          return client.replyMessage(replyToken, { type: 'text', text: '💬 請輸入推播文字內容' })
        }
        if (userMessage === '無') {
          session.mediaList = []
          session.step = 'text'
          sessionStore.set(userId, session)
          return client.replyMessage(replyToken, { type: 'text', text: '💬 請輸入推播文字內容' })
        }
        return client.replyMessage(replyToken, { type: 'text', text: '請繼續上傳圖片/影片，完成請輸入「完成」或「無」略過' })
      }
      if (session.step === 'text') {
        session.text = userMessage
        let mediaMessages = []
        if (session.mediaList && session.mediaList.length) {
          for (const item of session.mediaList.slice(0, 4)) {
            let url = null
            try {
              url = await uploadMediaBuffer(item.buffer, item.type)
            } catch (e) {
              continue
            }
            if (url) {
              if (item.type === 'image') {
                mediaMessages.push({ type: 'image', originalContentUrl: url, previewImageUrl: url })
              } else if (item.type === 'video') {
                mediaMessages.push({ type: 'video', originalContentUrl: url, previewImageUrl: url })
              }
            }
          }
        }
        mediaMessages.push({ type: 'text', text: session.text })
        const taskCode = scheduleManager.addTask({
          groupId: session.groupId,
          groupName: session.groupName,
          date: session.date,
          time: session.time,
          mediaMessages,
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
    } catch (err) {
      console.error('❌ 處理事件錯誤', err)
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
