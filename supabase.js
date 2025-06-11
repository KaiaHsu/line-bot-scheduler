// supabase.js
const { createClient } = require('@supabase/supabase-js')

// ✅ 使用 .env 中的環境變數
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY // ⚠️ 請確保是 service_role key

// ✅ 建立 Supabase client 實例
const supabase = createClient(supabaseUrl, supabaseKey)

module.exports = supabase