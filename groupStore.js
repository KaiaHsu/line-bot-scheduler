// groupStore.js（Supabase 版）
const supabase = require('./supabase')
const TABLE = 'groups'

async function getAllGroups() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('group_id, group_name')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('❌ 取得群組失敗', error)
    return []
  }
  return data || []
}

async function addGroup(groupId, groupName) {
  const { data: existing, error: selErr } = await supabase
    .from(TABLE)
    .select('id')
    .eq('group_id', groupId)
    .maybeSingle()

  if (selErr && selErr.code !== 'PGRST116') {
    console.error('❌ 檢查群組失敗', selErr)
    return false
  }
  if (existing) {
    const { error: updErr } = await supabase
      .from(TABLE)
      .update({ group_name: groupName })
      .eq('group_id', groupId)
    if (updErr) {
      console.error('❌ 更新群組失敗', updErr)
      return false
    }
    return true
  } else {
    const { error: insErr } = await supabase
      .from(TABLE)
      .insert([{ group_id: groupId, group_name: groupName }])
    if (insErr) {
      console.error('❌ 新增群組失敗', insErr)
      return false
    }
    return true
  }
}

async function getGroupByIndex(index) {
  const groups = await getAllGroups()
  if (index < 1 || index > groups.length) return null
  return groups[index - 1]
}

async function deleteGroupByIndex(index) {
  const groups = await getAllGroups()
  if (index < 1 || index > groups.length) return false
  const target = groups[index - 1]
  const { error } = await supabase
    .from(TABLE)
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
  deleteGroupByIndex,
}