const supabase = require('./supabase')

async function addGroup(groupId, groupName) {
  const { error } = await supabase
    .from('groups')
    .upsert({ group_id: groupId, group_name: groupName })

  if (error) {
    console.error('❌ 儲存群組失敗：', error)
  } else {
    console.log('✅ 群組儲存成功')
  }
}

async function getAllGroups() {
  const { data, error } = await supabase
    .from('groups')
    .select('group_id, group_name')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('❌ 查詢群組失敗：', error)
    return []
  }

  return data.map((row) => ({
    groupId: row.group_id,
    groupName: row.group_name,
  }))
}

async function getGroupByIndex(index) {
  const groups = await getAllGroups()
  return groups[index - 1] || null
}

async function deleteGroupByIndex(index) {
  const groups = await getAllGroups()
  const target = groups[index - 1]
  if (!target) return false

  const { error } = await supabase
    .from('groups')
    .delete()
    .eq('group_id', target.groupId)

  if (error) {
    console.error('❌ 刪除群組失敗：', error)
    return false
  }

  return true
}

module.exports = {
  addGroup,
  getAllGroups,
  getGroupByIndex,
  deleteGroupByIndex,
}