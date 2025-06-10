const fs = require('fs-extra')
const path = require('path')
const GROUP_FILE = path.resolve(__dirname, 'groups.json')

// 取得所有已儲存的群組
function getAllGroups() {
  if (!fs.existsSync(GROUP_FILE)) return []
  return fs.readJsonSync(GROUP_FILE)
}

// 新增或更新一個群組（依 groupId 唯一）
function addGroup(groupId, groupName) {
  let groups = getAllGroups()
  const idx = groups.findIndex(g => g.groupId === groupId)
  if (idx > -1) {
    groups[idx].groupName = groupName
  } else {
    groups.push({ groupId, groupName })
  }
  fs.writeJsonSync(GROUP_FILE, groups, { spaces: 2 })
}

// 依序號取得群組
function getGroupByIndex(index) {
  const groups = getAllGroups()
  if (index < 1 || index > groups.length) return null
  return groups[index - 1]
}

function deleteGroupByIndex(index) {
  const groups = getAllGroups()
  if (index < 1 || index > groups.length) return false
  groups.splice(index - 1, 1)
  fs.writeJsonSync(GROUP_FILE, groups, { spaces: 2 })
  return true
}

module.exports = {
  getAllGroups,
  addGroup,
  getGroupByIndex,
  deleteGroupByIndex
}
