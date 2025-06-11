const express = require('express')
const line = require('@line/bot-sdk')
const dotenv = require('dotenv')
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
const ADMIN_USER_IDS = (process.env.ADMIN_USER_ID || '').split(',').map(x => x.trim()).filter(Boolean)
const SESSION_TIMEOUT = 30 * 60 * 1000

scheduleManager.restoreTasks(client, ADMIN_USER_IDS)
if (ADMIN_USER_IDS.length) {
  client.pushMessage(ADMIN_USER_IDS[0], {
    type: 'text',
    text: '🚀 LINE Bot 已重新啟動，排程任務已還原完成！'
  }).catch(err => {
    console.error('⚠️ 無法發送開機通知訊息', err.message)
  })
}

setInterval(() => {
  sessionStore.cleanupExpiredSessions()
  console.log('🧹 已清理過期 Session')
}, SESSION_TIMEOUT)

async function safeGetSession(userId) {
  let session = sessionStore.get(userId)
  if (session.lastActive && Date.now() - session.lastActive > SESSION_TIMEOUT) {
    sessionStore.clear(userId)
    session = {}
  }
  session.lastActive = Date.now()
  sessionStore.set(userId, session)
  return session
}

const app = express()
const port = process.env.PORT || 3000

app.use(express.json())

app.post('/webhook', line.middleware(config), async (req, res) => {
  const events = req.body.events || []

  await Promise.all(events.map(async (event) => {
    try {
      // 機器人被加入群組時僅 log
      if (event.type === 'join' && event.source.type === 'group') {
        console.log('📥 Bot 被加入群組，Group ID：', event.source.groupId)
        return
      }

      if (event.type !== 'message') return
      const userId = event.source.userId
      const replyToken = event.replyToken

      // 僅限管理員操作
      if (!ADMIN_USER_IDS.includes(userId)) return

      const session = await safeGetSession(userId)

      if (event.message.type === 'text') {
        const msg = event.message.text.trim()

        // === 快速指令 ===
        if (msg === '嗨小編') {
          return client.replyMessage(replyToken, { type: 'text', text: '小編已抵達目的地！' })
        }

        if (msg === '取消') {
          sessionStore.clear(userId)
          return client.replyMessage(replyToken, { type: 'text', text: '流程已取消。' })
        }

        // === 查詢推播任務 ===
        if (msg === '查詢推播') {
          const list = scheduleManager.listTasks()
          if (!list.length) {
            return client.replyMessage(replyToken, { type: 'text', text: '目前沒有任何推播排程。' })
          }

          const lines = list.map((t, i) => `#${i + 1}\n群組：${t.groupName}（${t.groupId}）\n時間：${t.date} ${t.time}\n內容：「${t.text}」\n代碼：${t.code}`)
          const chunk = (arr, n) => arr.length ? [arr.slice(0, n), ...chunk(arr.slice(n), n)] : []
          for (const part of chunk(lines, 4)) {
            await client.replyMessage(replyToken, { type: 'text', text: part.join('\n\n') })
          }
          return
        }

        // 以下為流程啟動與執行...
        // === 刪除推播流程 ===
        if (msg === '刪除推播' && !session.step) {
          const list = scheduleManager.listTasks()
          if (!list.length) {
            return client.replyMessage(replyToken, { type: 'text', text: '目前沒有任何推播可刪除。' })
          }
          session.step = 'deleteTask'
          session.taskList = list
          sessionStore.set(userId, session)

          const lines = list.map((t, i) =>
            `#${i + 1}\n群組：${t.groupName}（${t.groupId}）\n時間：${t.date} ${t.time}\n內容：「${t.text}」`)
          lines.push(`\n請輸入數字 1～${list.length} 以刪除對應排程，或輸入「取消」退出。`)

          return client.replyMessage(replyToken, { type: 'text', text: lines.join('\n\n') })
        }

        if (session.step === 'deleteTask') {
          const idx = parseInt(msg, 10)
          const list = session.taskList || []
          if (isNaN(idx) || idx < 1 || idx > list.length) {
            return client.replyMessage(replyToken, {
              type: 'text',
              text: '輸入錯誤，請重試。或輸入「取消」退出。'
            })
          }
          const task = list[idx - 1]
          await scheduleManager.deleteTask(task.code)
          sessionStore.clear(userId)
          return client.replyMessage(replyToken, {
            type: 'text',
            text: `✅ 已刪除排程：${task.groupName}（${task.groupId}） ${task.date} ${task.time}`
          })
        }

        // === 刪除群組流程 ===
        if (msg === '刪除群組' && !session.step) {
          const groups = await groupStore.getAllGroups()
          if (!groups.length) {
            return client.replyMessage(replyToken, { type: 'text', text: '目前沒有群組可刪除。' })
          }
          session.step = 'deleteGroup'
          session.groupList = groups
          sessionStore.set(userId, session)

          const list = groups.map((g, i) => `#${i + 1} ${g.groupName}（${g.groupId}）`).join('\n')
          return client.replyMessage(replyToken, {
            type: 'text',
            text: `📛 請輸入編號以刪除群組：\n${list}\n\n或輸入「取消」退出。`
          })
        }

        if (session.step === 'deleteGroup') {
          const idx = parseInt(msg, 10)
          const arr = session.groupList || []
          if (isNaN(idx) || idx < 1 || idx > arr.length) {
            return client.replyMessage(replyToken, {
              type: 'text',
              text: `輸入錯誤，請重新輸入(1～${arr.length})或「取消」。`,
            })
          }
          const grp = arr[idx - 1]
          await groupStore.deleteGroupByIndex(idx)
          sessionStore.clear(userId)
          return client.replyMessage(replyToken, {
            type: 'text',
            text: `✅ 已刪除群組：${grp.groupName}（${grp.groupId}）`,
          })
        }

        // === 啟動排程推播流程 ===
        if (msg === '排程推播' && !session.step) {
          const saved = await groupStore.getAllGroups()
          session.step = 'group'
          sessionStore.set(userId, session)

          if (saved.length) {
            const list = saved
              .map((g, i) => `#${i + 1} ${g.groupName}（${g.groupId}）`)
              .join('\n')
            return client.replyMessage(replyToken, {
              type: 'text',
              text: `🔔 請輸入群組編號或 ID：\n\n已儲存：\n${list}`,
            })
          }
          return client.replyMessage(replyToken, {
            type: 'text',
            text: '🔔 請輸入要推播的群組 ID：',
          })
        }

        // === 群組名稱輸入 ===
        if (session.step === 'group') {
          if (/^\d+$/.test(msg)) {
            const grp = await groupStore.getGroupByIndex(Number(msg))
            if (!grp) {
              return client.replyMessage(replyToken, {
                type: 'text',
                text: '編號錯誤，請重試。',
              })
            }
            session.groupId = grp.groupId
            session.groupName = grp.groupName
          } else {
            session.groupId = msg
            session.groupName = null
          }
          session.step = 'groupName'
          sessionStore.set(userId, session)
          return client.replyMessage(replyToken, {
            type: 'text',
            text: '🏷️ 請輸入群組自訂名稱：',
          })
        }

        if (session.step === 'groupName') {
          session.groupName = msg
          await groupStore.addGroup(session.groupId, session.groupName)
          session.step = 'date'
          sessionStore.set(userId, session)
          return client.replyMessage(replyToken, {
            type: 'text',
            text: '📅 請輸入推播日期（YYYY-MM-DD）：',
          })
        }

        // === 日期 ===
        if (session.step === 'date') {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(msg)) {
            return client.replyMessage(replyToken, {
              type: 'text',
              text: '⚠️ 請輸入 YYYY-MM-DD',
            })
          }
          session.date = msg
          session.step = 'time'
          sessionStore.set(userId, session)
          return client.replyMessage(replyToken, {
            type: 'text',
            text: '⏰ 請輸入時間（HH:mm）：',
          })
        }

        // === 時間 ===
        if (session.step === 'time') {
          if (!/^\d{2}:\d{2}$/.test(msg)) {
            return client.replyMessage(replyToken, {
              type: 'text',
              text: '⚠️ 請輸入 HH:mm',
            })
          }
          session.time = msg
          session.step = 'media'
          session.mediaList = []
          sessionStore.set(userId, session)
          return client.replyMessage(replyToken, {
            type: 'text',
            text: '🖼️ 請上傳圖片或影片（最多 4 則），完成請輸入「完成」，無請輸入「無」',
          })
        }

        // === 上傳圖片 / 影片 ===
        if (
          session.step === 'media' &&
          (event.message.type === 'image' || event.message.type === 'video')
        ) {
          const buf = await client.getMessageContent(event.message.id)
          const arr = []
          for await (const c of buf) arr.push(c)
          session.mediaList.push({
            type: event.message.type,
            buffer: Buffer.concat(arr),
          })
          sessionStore.set(userId, session)

          return client.replyMessage(replyToken, {
            type: 'text',
            text: `✅ 已收到 ${
              event.message.type === 'image' ? '圖片' : '影片'
            }（第 ${session.mediaList.length} 則），完成請輸入「完成」`,
          })
        }

        if (session.step === 'media' && msg === '完成') {
          session.step = 'text'
          sessionStore.set(userId, session)
          return client.replyMessage(replyToken, {
            type: 'text',
            text: '💬 請輸入推播文字內容：',
          })
        }

        if (session.step === 'media' && msg === '無') {
          session.step = 'text'
          session.mediaList = []
          sessionStore.set(userId, session)
          return client.replyMessage(replyToken, {
            type: 'text',
            text: '💬 請輸入推播文字內容：',
          })
        }

        // === 最後步驟：推播文字 + 上傳至 Cloudinary + 建立任務 ===
        if (session.step === 'text') {
          session.text = msg
          const mediaMessages = []

          for (const item of session.mediaList) {
            const result = await uploadMediaBuffer(item.buffer, item.type)
            if (item.type === 'image') {
              mediaMessages.push({
                type: 'image',
                originalContentUrl: result.url,
                previewImageUrl: result.url,
              })
            } else if (item.type === 'video') {
              mediaMessages.push({
                type: 'video',
                originalContentUrl: result.url,
                previewImageUrl: result.previewUrl || result.url,
              })
            }
          }

          mediaMessages.push({ type: 'text', text: session.text })

          const taskCode = await scheduleManager.addTask({
            groupId: session.groupId,
            groupName: session.groupName,
            date: session.date,
            time: session.time,
            mediaMessages,
            text: session.text,
          })

          sessionStore.clear(userId)

          return client.replyMessage(replyToken, {
            type: 'text',
            text: `✅ 推播已排程成功！代碼：${taskCode}`,
          })
        }
      }
    } catch (e) {
      console.error('❌ 處理事件錯誤', e)
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