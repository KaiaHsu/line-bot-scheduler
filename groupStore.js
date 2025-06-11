// groupStore.js（Supabase 版本）
const supabase = require('./supabase')

async function getAllGroups() {
  const { data, error } = await supabase.from('groups').select('*').order('id', { ascending: true })
  if (error) {
    console.error('❌ 查詢群組失敗', error)
    return []
  }
  return data
}

async function addGroup(groupId, groupName) {
  // 先檢查是否存在
  const { data, error: selectError } = await supabase
    .from('groups')
    .select('*')
    .eq('group_id', groupId)

  if (selectError) {
    console.error('❌ 檢查群組失敗', selectError)
    return
  }

  if (data.length > 0) {
    // 已存在，更新 group_name
    const { error: updateError } = await supabase
      .from('groups')
      .update({ group_name: groupName })
      .eq('group_id', groupId)
    if (updateError) {
      console.error('❌ 更新群組失敗', updateError)
    }
  } else {
    // 不存在，新增群組
    const { error: insertError } = await supabase
      .from('groups')
      .insert([{ group_id: groupId, group_name: groupName }])
    if (insertError) {
      console.error('❌ 新增群組失敗', insertError)
    }
  }
}

async function getGroupByIndex(index) {
  const groups = await getAllGroups()
  if (index < 1 || index > groups.length) return null
  return {
    groupId: groups[index - 1].group_id,
    groupName: groups[index - 1].group_name
  }
}

async function deleteGroupByIndex(index) {
  const groups = await getAllGroups()
  if (index < 1 || index > groups.length) return false
  const target = groups[index - 1]
  const { error } = await supabase
    .from('groups')
    .delete()
    .eq('group_id', target.group_id)
  if (error) {
    console.error('❌ 刪除群組失敗', error)
    return false
  }
  return true
}

module.exports = {
  getAllGroups,
  addGroup,
  getGroupByIndex,
  deleteGroupByIndex
}
