// 📁 sessionStore.js
const store = {}

function get(userId) {
  if (!store[userId]) {
    store[userId] = {}
  }
  return store[userId]
}

function set(userId, session) {
  store[userId] = session
}

function clear(userId) {
  delete store[userId]
}

module.exports = {
  get,
  set,
  clear
}