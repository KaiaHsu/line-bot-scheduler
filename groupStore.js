// 📁 groupStore.js（使用 Supabase 儲存群組資料）
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

const TABLE_NAME = 'groups'

// 取得所有群組
async function getAllGroups() {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .order('created_at', { ascending: true })
  if (error) {
    console.error('❌ 取得群組失敗', error)
    return []
  }
  return data || []
}

// 新增或更新群組（依 groupId 唯一）
async function addGroup(groupId, groupName) {
  const { data: existing, error: searchError } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('groupId', groupId)
    .maybeSingle()

  if (searchError) {
    console.error('❌ 查詢群組失敗', searchError)
    return
  }

  if (existing) {
    // 更新群組名稱
    await supabase
      .from(TABLE_NAME)
      .update({ groupName })
      .eq('groupId', groupId)
  } else {
    await supabase.from(TABLE_NAME).insert([{ groupId, groupName }])
  }
}

// 依編號取得群組（以查詢結果的順序）
async function getGroupByIndex(index) {
  const groups = await getAllGroups()
  if (index < 1 || index > groups.length) return null
  return groups[index - 1]
}

// 刪除指定群組（以查詢順序為準）
async function deleteGroupByIndex(index) {
  const groups = await getAllGroups()
  if (index < 1 || index > groups.length) return false
  const group = groups[index - 1]
  const { error } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq('groupId', group.groupId)
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