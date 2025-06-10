// index.js

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
setInterval(() => {
  sessionStore.cleanupExpiredSessions()
  console.log('🧹 已清理過期 Session')
}, SESSION_TIMEOUT)

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
    if (event.type === 'join' && event.source.type === 'group') {
      const groupId = event.source.groupId
      console.log(`📥 Bot 被加入群組，Group ID：${groupId}`)
      return
    }

    if (event.type !== 'message') return

    try {
      const userId = event.source.userId
      const replyToken = event.replyToken
      const message = event.message
      const text = message.type === 'text' ? message.text.trim() : ''
      if (!ADMIN_USER_IDS.includes(userId)) return
      if (message.type === 'sticker') return

      const session = safeGetSession(userId)

      // 1. 快速指令
      if (text === '嗨小編') return await client.replyMessage(replyToken, { type: 'text', text: '小編已抵達目的地！' })
      if (text === '取消') {
        sessionStore.clear(userId)
        return await client.replyMessage(replyToken, { type: 'text', text: '流程已取消，歡迎隨時重新開始。' })
      }

      // 2. 指令判斷區（若無流程狀態）
      if (!session.step) {
        if (text === '查詢推播') {
          const list = scheduleManager.listTasks()
          if (!list.length) return await client.replyMessage(replyToken, { type: 'text', text: '目前沒有任何推播排程。' })
          const chunk = (arr, size) => arr.length ? [arr.slice(0, size), ...chunk(arr.slice(size), size)] : []
          const msgLines = list.map((task, i) => `#${i+1}\n群組：${task.groupName}（${task.groupId}）\n時間：${task.date} ${task.time}\n內容：「${task.text}」\n代碼：${task.code}`)
          const msgChunks = chunk(msgLines, 4)
          for (const msgs of msgChunks) await client.replyMessage(replyToken, { type: 'text', text: msgs.join('\n\n') })
          return
        }

        if (text === '刪除群組') {
          const groups = groupStore.getAllGroups()
          if (!groups.length) return await client.replyMessage(replyToken, { type: 'text', text: '⚠️ 目前沒有任何已儲存群組可刪除。' })
          const list = groups.map((g, i) => `#${i + 1} ${g.groupName}（${g.groupId}）`).join('\n')
          session.step = 'deleteGroup'
          session.groupList = groups
          sessionStore.set(userId, session)
          return await client.replyMessage(replyToken, { type: 'text', text: `📛 以下是已儲存的群組：\n${list}\n\n請輸入數字 1～${groups.length} 以刪除對應群組，或輸入「取消」退出。` })
        }

        if (text === '排程推播') {
          const groups = groupStore.getAllGroups()
          session.step = 'group'
          sessionStore.set(userId, session)
          if (groups.length) {
            const list = groups.map((g, i) => `#${i + 1} ${g.groupName}\n（${g.groupId}）`).join('\n')
            return await client.replyMessage(replyToken, { type: 'text', text: `🔔 請輸入：群組編號 或群組 ID\n\n已儲存群組：\n${list}` })
          } else {
            return await client.replyMessage(replyToken, { type: 'text', text: '🔔 要推播的群組 ID：' })
          }
        }
      }

      // 3. 群組刪除流程
      if (session.step === 'deleteGroup') {
        if (text === '取消') {
          sessionStore.clear(userId)
          return await client.replyMessage(replyToken, { type: 'text', text: '❎ 已取消刪除群組操作。' })
        }
        const idx = parseInt(text)
        const groups = session.groupList || []
        if (!Number.isInteger(idx) || idx < 1 || idx > groups.length) {
          return await client.replyMessage(replyToken, { type: 'text', text: `⚠️ 請輸入有效編號（1～${groups.length}），或輸入「取消」退出。` })
        }
        const group = groups[idx - 1]
        const ok = groupStore.deleteGroupByIndex(idx)
        sessionStore.clear(userId)
        return await client.replyMessage(replyToken, { type: 'text', text: ok ? `✅ 已刪除群組：${group.groupName}\n（${group.groupId}）` : '⚠️ 群組刪除失敗。' })
      }

      // 4. 群組排程流程：group > groupName > date > time > media > text
      if (session.step === 'group') {
        if (/^\d+$/.test(text)) {
          const group = groupStore.getGroupByIndex(Number(text))
          if (group) {
            session.groupId = group.groupId
            session.groupName = group.groupName
            session.step = 'date'
            sessionStore.set(userId, session)
            return await client.replyMessage(replyToken, { type: 'text', text: `選擇群組：${group.groupName}\n推播日期（YYYY-MM-DD）` })
          }
          const all = groupStore.getAllGroups()
          if (all.length) {
            const msg = all.map((g, i) => `#${i + 1} ${g.groupName}（${g.groupId}）`).join('\n')
            return await client.replyMessage(replyToken, { type: 'text', text: `⚠️ 無效編號，請重新輸入：\n${msg}` })
          } else {
            return await client.replyMessage(replyToken, { type: 'text', text: '⚠️ 尚未有任何已儲存群組。' })
          }
        }
        session.groupId = text
        session.step = 'groupName'
        sessionStore.set(userId, session)
        return await client.replyMessage(replyToken, { type: 'text', text: '🏷️ 群組名稱（自訂顯示用）' })
      }

      if (session.step === 'groupName') {
        session.groupName = text
        groupStore.addGroup(session.groupId, session.groupName)
        session.step = 'date'
        sessionStore.set(userId, session)
        return await client.replyMessage(replyToken, { type: 'text', text: '📅 請輸入推播日期（YYYY-MM-DD）' })
      }

      if (session.step === 'date') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return await client.replyMessage(replyToken, { type: 'text', text: '⚠️ 格式錯誤，請輸入 YYYY-MM-DD' })
        session.date = text
        session.step = 'time'
        sessionStore.set(userId, session)
        return await client.replyMessage(replyToken, { type: 'text', text: '⏰ 時間（格式：10:00）' })
      }

      if (session.step === 'time') {
        if (!/^\d{2}:\d{2}$/.test(text)) return await client.replyMessage(replyToken, { type: 'text', text: '⚠️ 格式錯誤，請參考：10:00' })
        session.time = text
        session.mediaList = []
        session.step = 'media'
        sessionStore.set(userId, session)
        return await client.replyMessage(replyToken, { type: 'text', text: '🖼️ 請上傳圖片/影片（最多4則），完成請輸入「完成」，略過請輸入「無」' })
      }

      if (session.step === 'media') {
        if (text === '完成' || text === '無') {
          if (text === '無') session.mediaList = []
          session.step = 'text'
          sessionStore.set(userId, session)
          return await client.replyMessage(replyToken, { type: 'text', text: '💬 推播文字內容' })
        }
        return await client.replyMessage(replyToken, { type: 'text', text: '📥 請繼續上傳媒體，完成請輸入「完成」或「無」略過' })
      }

      if (session.step === 'text') {
        session.text = text
        const mediaMessages = []
        if (session.mediaList && session.mediaList.length) {
          for (const item of session.mediaList.slice(0, 4)) {
            let uploadResult = null
            try {
              uploadResult = await uploadMediaBuffer(item.buffer, item.type)
              if (uploadResult?.url) {
                mediaMessages.push({
                  type: item.type,
                  originalContentUrl: uploadResult.url,
                  previewImageUrl: item.type === 'video' ? uploadResult.previewUrl || uploadResult.url : uploadResult.url
                })
              }
            } catch {}
          }
        }
        mediaMessages.push({ type: 'text', text: session.text })
        const code = scheduleManager.addTask({
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
        return await client.replyMessage(replyToken, {
          type: 'text',
          text: `✅ 推播已排程成功！\n代碼：${code}\n\n🔕 若想直接刪除請輸入：\n刪除推播 ${code}`
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
