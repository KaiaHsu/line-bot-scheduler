// 📁 sessionStore.js

// 全域暫存（記錄每個 userId 對應的 session 狀態）
const store = {}

/**
 * 取得指定使用者的 session 狀態
 * - 若不存在自動初始化為空物件
 * @param {string} userId - LINE userId
 * @returns {object} session 狀態物件
 */
function get(userId) {
  if (!store[userId] || typeof store[userId] !== 'object') {
    store[userId] = {}
  }
  return store[userId]
}

/**
 * 設定指定使用者的 session 狀態
 * @param {string} userId 
 * @param {object} session 
 */
function set(userId, session) {
  // 強制只允許物件類型
  if (typeof session !== 'object') return
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
 * 批次清除全部 session
 */
function clearAll() {
  Object.keys(store).forEach(userId => delete store[userId])
}

module.exports = {
  get,
  set,
  clear,
  clearAll
}