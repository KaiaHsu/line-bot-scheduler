// index.js
const express = require('express')
const line = require('@line/bot-sdk')
const dotenv = require('dotenv')
const dayjs = require('dayjs')

dotenv.config()

const scheduleManager = require('./scheduleManager')
const sessionStore = require('./sessionStore')
const uploadMediaBuffer = require('./cloudinaryUploader')
const groupStore = require('./groupStore')

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
}

const client = new line.Client(config)
const ADMIN_USER_IDS = (process.env.ADMIN_USER_ID || '')
  .split(',')
  .map(x => x.trim())
  .filter(Boolean)
const SESSION_TIMEOUT = 30 * 60 * 1000 // 30 分鐘

function safeGetSession(userId) {
  let session = sessionStore.get(userId)
  if (!session) session = {}
  if (session.lastActive && Date.now() - session.lastActive > SESSION_TIMEOUT) {
    sessionStore.clear(userId)
    session = {}
  }
  session.lastActive = Date.now()
  sessionStore.set(userId, session)
  return session
}

scheduleManager.restoreTasks(client, ADMIN_USER_IDS)
  .then(() => {
    if (ADMIN_USER_IDS.length) {
      client.pushMessage(ADMIN_USER_IDS[0], {
        type: 'text',
        text: '🚀 LINE Bot 已重新啟動，排程任務已還原完成！'
      }).catch(err => {
        console.error('⚠️ 無法發送開機通知訊息', err.message)
      })
    }
  })
  .catch(err => console.error('❌ 還原任務失敗', err.message))

const app = express()
const port = process.env.PORT || 3000

app.use('/webhook', line.middleware(config), async (req, res) => {
  const events = req.body.events || []

  await Promise.all(
    events.map(async (event) => {
      try {
        // 你的事件處理邏輯寫在這裡
        if (event.type === 'join' && event.source.type === 'group') {
          console.log('📥 Bot 被加入群組，Group ID：', event.source.groupId)
          return
        }

        if (event.type !== 'message') return
        if (!event.source.userId || !event.replyToken) return
        if (!ADMIN_USER_IDS.includes(event.source.userId)) return

        const session = await safeGetSession(event.source.userId)
        const replyToken = event.replyToken

      if (!ADMIN_USER_IDS.includes(userId)) return
      if (event.message.type === 'sticker') return

      const userMessage = event.message.text?.trim()

      if (event.message.type === 'text' && userMessage) {
        if (userMessage === '嗨小編') {
          return client.replyMessage(replyToken, {
            type: 'text',
            text: '小編已抵達目的地！'
          })
        }

        if (userMessage === '取消') {
          sessionStore.clear(userId)
          return client.replyMessage(replyToken, {
            type: 'text',
            text: '❎ 已取消當前操作'
          })
        }

        if (userMessage === '查詢推播') {
          const list = scheduleManager.listTasks()
          if (!list.length) {
            return client.replyMessage(replyToken, {
              type: 'text',
              text: '目前沒有任何推播排程。'
            })
          }
          const chunk = (arr, size) =>
            arr.length ? [arr.slice(0, size), ...chunk(arr.slice(size), size)] : []
          const msgLines = list.map((task, i) =>
            `#${i + 1}\n群組：${task.groupName}（${task.groupId}）\n時間：${task.date} ${task.time}\n內容：「${task.text}」\n代碼：${task.code}`
          )
          const msgChunks = chunk(msgLines, 4)
          for (const msgs of msgChunks) {
            await client.replyMessage(replyToken, {
              type: 'text',
              text: msgs.join('\n\n')
            })
          }
          return
        }

        if (userMessage === '刪除推播' && !session.step) {
          const list = scheduleManager.listTasks()
          if (!list.length) {
            return client.replyMessage(replyToken, {
              type: 'text',
              text: '目前沒有任何推播可刪除。'
            })
          }
          session.step = 'deleteTask'
          session.taskList = list
          sessionStore.set(userId, session)

          const msgLines = list.map((task, i) =>
            `#${i + 1}\n群組：${task.groupName}（${task.groupId}）\n時間：${task.date} ${task.time}\n內容：「${task.text}」`
          )
          msgLines.push('\n請輸入數字 1～' + list.length + ' 以刪除對應排程，或輸入「取消」退出。')
          return client.replyMessage(replyToken, {
            type: 'text',
            text: msgLines.join('\n\n')
          })
        }

        if (session.step === 'deleteTask') {
          if (userMessage === '取消') {
            sessionStore.clear(userId)
            return client.replyMessage(replyToken, {
              type: 'text',
              text: '❎ 已取消刪除操作。'
            })
          }
          const choice = parseInt(userMessage, 10)
          const taskList = session.taskList || []
          if (!Number.isInteger(choice) || choice < 1 || choice > taskList.length) {
            return client.replyMessage(replyToken, {
              type: 'text',
              text: '⚠️ 請輸入有效的數字編號，或輸入「取消」退出。'
            })
          }
          const task = taskList[choice - 1]
          const success = await scheduleManager.deleteTask(task.code)
          sessionStore.clear(userId)
          const msg = success
            ? `✅ 已刪除排程：${task.groupName}（${task.groupId}）\n時間：${task.date} ${task.time}`
            : `⚠️ 排程刪除失敗，請稍後再試。`
          return client.replyMessage(replyToken, {
            type: 'text',
            text: msg
          })
        }

        if (userMessage === '查詢推播') {
          const list = scheduleManager.listTasks()
          if (!list.length) {
            return client.replyMessage(replyToken, {
              type: 'text',
              text: '目前沒有任何推播排程。'
            })
          }
          const chunk = (arr, size) =>
            arr.length ? [arr.slice(0, size), ...chunk(arr.slice(size), size)] : []
          const msgLines = list.map((task, i) =>
            `#${i + 1}\n群組：${task.groupName}（${task.groupId}）\n時間：${task.date} ${task.time}\n內容：「${task.text}」\n代碼：${task.code}`
          )
          const msgChunks = chunk(msgLines, 4)
          for (const msgs of msgChunks) {
            await client.replyMessage(replyToken, {
              type: 'text',
              text: msgs.join('\n\n')
            })
          }
          return
        }

        if (userMessage === '刪除推播' && !session.step) {
          const list = scheduleManager.listTasks()
          if (!list.length) {
            return client.replyMessage(replyToken, {
              type: 'text',
              text: '目前沒有任何推播可刪除。'
            })
          }
          session.step = 'deleteTask'
          session.taskList = list
          sessionStore.set(userId, session)

          const msgLines = list.map((task, i) =>
            `#${i + 1}\n群組：${task.groupName}（${task.groupId}）\n時間：${task.date} ${task.time}\n內容：「${task.text}」`
          )
          msgLines.push('\n請輸入數字 1～' + list.length + ' 以刪除對應排程，或輸入「取消」退出。')
          return client.replyMessage(replyToken, {
            type: 'text',
            text: msgLines.join('\n\n')
          })
        }

        if (session.step === 'deleteTask') {
          if (userMessage === '取消') {
            sessionStore.clear(userId)
            return client.replyMessage(replyToken, {
              type: 'text',
              text: '❎ 已取消刪除操作。'
            })
          }
          const choice = parseInt(userMessage, 10)
          const taskList = session.taskList || []
          if (!Number.isInteger(choice) || choice < 1 || choice > taskList.length) {
            return client.replyMessage(replyToken, {
              type: 'text',
              text: '⚠️ 請輸入有效的數字編號，或輸入「取消」退出。'
            })
          }
          const task = taskList[choice - 1]
          const success = await scheduleManager.deleteTask(task.code)
          sessionStore.clear(userId)
          const msg = success
            ? `✅ 已刪除排程：${task.groupName}（${task.groupId}）\n時間：${task.date} ${task.time}`
            : `⚠️ 排程刪除失敗，請稍後再試。`
          return client.replyMessage(replyToken, {
            type: 'text',
            text: msg
          })
        }

        if (session.step === 'date') {
          const datePattern = /^\d{4}-\d{2}-\d{2}$/
          if (!datePattern.test(userMessage)) {
            return client.replyMessage(replyToken, {
              type: 'text',
              text: '⚠️ 日期格式錯誤，請輸入 YYYY-MM-DD，例如 2025-06-15'
            })
          }
          session.date = userMessage
          session.step = 'time'
          sessionStore.set(userId, session)
          return client.replyMessage(replyToken, {
            type: 'text',
            text: '⏰ 請輸入推播時間（HH:mm），例如 10:00'
          })
        }

        if (session.step === 'time') {
          const timePattern = /^\d{2}:\d{2}$/
          if (!timePattern.test(userMessage)) {
            return client.replyMessage(replyToken, {
              type: 'text',
              text: '⚠️ 時間格式錯誤，請輸入 HH:mm，例如 14:30'
            })
          }
          session.time = userMessage
          session.step = 'media'
          session.mediaList = []
          sessionStore.set(userId, session)
          return client.replyMessage(replyToken, {
            type: 'text',
            text: '📎 請上傳圖片或影片（最多 4 則），完成請輸入「完成」，若無請輸入「無」'
          })
        }

        // 收集多媒體訊息
        if (session.step === 'media' && (event.message.type === 'image' || event.message.type === 'video')) {
          const buffer = await client.getMessageContent(event.message.id)
          const chunks = []
          for await (const chunk of buffer) {
            chunks.push(chunk)
          }
          const finalBuffer = Buffer.concat(chunks)

          session.mediaList.push({
            type: event.message.type,
            buffer: finalBuffer
          })

          sessionStore.set(userId, session)
          return client.replyMessage(replyToken, {
            type: 'text',
            text: `✅ 已收到 ${event.message.type === 'image' ? '圖片' : '影片'}（共 ${session.mediaList.length} 則）`
          })
        }

        if (session.step === 'media' && (userMessage === '完成' || userMessage === '無')) {
          session.step = 'text'
          sessionStore.set(userId, session)
          return client.replyMessage(replyToken, {
            type: 'text',
            text: '💬 請輸入推播的文字內容'
          })
        }

        // 最後步驟：文字內容與建立排程
        if (session.step === 'text') {
          session.text = userMessage
          const mediaMessages = []

          for (const media of session.mediaList || []) {
            const result = await uploadMediaBuffer(media.buffer, media.type)
            if (!result || !result.url) continue

            if (media.type === 'image') {
              mediaMessages.push({
                type: 'image',
                originalContentUrl: result.url,
                previewImageUrl: result.url
              })
            } else if (media.type === 'video') {
              mediaMessages.push({
                type: 'video',
                originalContentUrl: result.url,
                previewImageUrl: result.previewUrl || result.url
              })
            }
          }

          mediaMessages.push({ type: 'text', text: session.text })

          const code = await scheduleManager.addTask({
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
            text: `✅ 已成功排程推播！任務代碼：${code}`
          })
        }

        } // end if message.type === 'text'

        } catch (err) {
        console.error('❌ 單一事件處理錯誤：', err)
      }
    })
  ).catch((err) => {
    console.error('❌ webhook 主體處理錯誤：', err)
  })

  res.status(200).end()
})

// 全域錯誤處理
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 未捕捉的拒絕：', reason)
})

process.on('uncaughtException', (err) => {
  console.error('💥 未捕捉的例外：', err)
})

// 啟動伺服器
app.listen(port, () => {
  console.log(`🚀 LINE Bot Scheduler 已啟動，運行於 http://localhost:${port}`)
})