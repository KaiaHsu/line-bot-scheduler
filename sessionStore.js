const store = {}

// 預設過期時間（毫秒）：30分鐘
const SESSION_TIMEOUT = 30 * 60 * 1000

/**
 * 取得指定使用者的 session 狀態
 * - 若不存在或已過期，自動初始化為空物件
 * @param {string} userId - LINE userId
 * @returns {object} session 狀態物件
 */
function get(userId) {
  const session = store[userId]
  if (!session || typeof session !== 'object' || Array.isArray(session)) {
    store[userId] = createNewSession()
    return store[userId]
  }
  if (isExpired(session.lastActive)) {
    delete store[userId]
    store[userId] = createNewSession()
    return store[userId]
  }
  // 更新最後存取時間
  session.lastActive = Date.now()
  return session
}

/**
 * 設定指定使用者的 session 狀態
 * - 只允許設定物件類型
 * @param {string} userId 
 * @param {object} session 
 */
function set(userId, session) {
  if (typeof session !== 'object' || session === null || Array.isArray(session)) return
  session.lastActive = Date.now()
  store[userId] = { ...session }
}

/**
 * 清除指定使用者的 session 狀態
 * @param {string} userId 
 */
function clear(userId) {
  delete store[userId]
}

/**
 * 批次清除全部 session 狀態
 */
function clearAll() {
  for (const userId in store) {
    if (Object.prototype.hasOwnProperty.call(store, userId)) {
      delete store[userId]
    }
  }
}

/**
 * 建立一個新的空 session 物件，並設置 lastActive
 * @returns {object}
 */
function createNewSession() {
  return {
    lastActive: Date.now()
  }
}

/**
 * 判斷時間是否過期
 * @param {number} lastActiveTime - 上一次活躍時間 timestamp
 * @returns {boolean} 是否過期
 */
function isExpired(lastActiveTime) {
  if (!lastActiveTime) return true
  return (Date.now() - lastActiveTime) > SESSION_TIMEOUT
}

/**
 * 批次清理過期的 session
 * - 可定時呼叫，避免快取堆積
 */
function cleanupExpiredSessions() {
  for (const userId in store) {
    if (Object.prototype.hasOwnProperty.call(store, userId)) {
      if (isExpired(store[userId].lastActive)) {
        delete store[userId]
      }
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