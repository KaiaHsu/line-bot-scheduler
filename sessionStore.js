// 全域暫存物件，儲存每位使用者的 session
const store = {}

// 預設過期時間，單位：毫秒（30分鐘）
const SESSION_TIMEOUT = 30 * 60 * 1000

/**
 * 取得指定使用者的 session，若不存在或已過期自動初始化
 * @param {string} userId - LINE User ID
 * @returns {object} session 物件
 */
function get(userId) {
  const session = store[userId]
  if (!session || typeof session !== 'object' || Array.isArray(session) || isExpired(session.lastActive)) {
    store[userId] = createNewSession()
  }
  // 更新最後存取時間
  store[userId].lastActive = Date.now()
  return store[userId]
}

/**
 * 設定指定使用者的 session 狀態，僅接受物件
 * @param {string} userId 
 * @param {object} session 
 */
function set(userId, session) {
  if (typeof session !== 'object' || session === null || Array.isArray(session)) return
  session.lastActive = Date.now()
  store[userId] = { ...session }
}

/**
 * 清除指定使用者的 session
 * @param {string} userId 
 */
function clear(userId) {
  delete store[userId]
}

/**
 * 批次清除所有 session
 */
function clearAll() {
  Object.keys(store).forEach(userId => delete store[userId])
}

/**
 * 建立新的空 session 物件，帶有 lastActive 時間戳
 * @returns {object}
 */
function createNewSession() {
  return {
    lastActive: Date.now()
  }
}

/**
 * 判斷 session 是否過期
 * @param {number} lastActiveTime - 最後活躍時間戳
 * @returns {boolean} 是否過期
 */
function isExpired(lastActiveTime) {
  if (!lastActiveTime) return true
  return (Date.now() - lastActiveTime) > SESSION_TIMEOUT
}

/**
 * 定期清理過期 session
 * - 建議用 setInterval 定期調用
 */
function cleanupExpiredSessions() {
  for (const userId in store) {
    if (isExpired(store[userId].lastActive)) {
      delete store[userId]
    }
  }
}

module.exports = {
  get,
  set,
  clear,
  clearAll,
  cleanupExpiredSessions
}