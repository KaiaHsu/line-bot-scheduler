// 📁 groupStore.js（Supabase 版）
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // 或 ANON_KEY 視需求而定
)

const TABLE = 'groups'

/**
 * 取得所有群組，依 created_at 遞增
 * @returns {Promise<Array<{ group_id:string, group_name:string }>>}
 */
async function getAllGroups() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('group_id, group_name')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('❌ 取得群組失敗', error.message)
    return []
  }
  return data || []
}

/**
 * 新增或更新群組（以 group_id 為唯一鍵）
 * @param {string} groupId 
 * @param {string} groupName 
 */
async function addGroup(groupId, groupName) {
  // 先檢查是否存在
  const { data: existing, error: selErr } = await supabase
    .from(TABLE)
    .select('id')
    .eq('group_id', groupId)
    .single()

  if (selErr && selErr.code !== 'PGRST116') {
    // PGRST116 = no rows found (單筆查無)
    console.error('❌ 檢查群組失敗', selErr.message)
    return false
  }

  if (existing) {
    // 已存在，更新名稱
    const { error: updErr } = await supabase
      .from(TABLE)
      .update({ group_name: groupName })
      .eq('group_id', groupId)
    if (updErr) {
      console.error('❌ 更新群組失敗', updErr.message)
      return false
    }
    return true
  } else {
    // 建立新群組
    const { error: insErr } = await supabase
      .from(TABLE)
      .insert([{ group_id: groupId, group_name: groupName }])
    if (insErr) {
      console.error('❌ 新增群組失敗', insErr.message)
      return false
    }
    return true
  }
}

/**
 * 依「順序編號」（1-based）取得群組
 * @param {number} index 
 * @returns {Promise<{ group_id:string, group_name:string } | null>}
 */
async function getGroupByIndex(index) {
  const groups = await getAllGroups()
  if (index < 1 || index > groups.length) return null
  return groups[index - 1]
}

/**
 * 依「順序編號」刪除群組
 * @param {number} index 
 * @returns {Promise<boolean>}
 */
async function deleteGroupByIndex(index) {
  const groups = await getAllGroups()
  if (index < 1 || index > groups.length) return false
  const target = groups[index - 1]
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('group_id', target.group_id)

  if (error) {
    console.error('❌ 刪除群組失敗', error.message)
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