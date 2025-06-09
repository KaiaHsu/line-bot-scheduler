// 📁 cloudinaryUploader.js
const cloudinary = require('cloudinary').v2
const streamifier = require('streamifier')

// 請先將 Cloudinary 帳戶設定到 .env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// 自動判斷格式，支援圖片與影片
async function uploadMediaBuffer(buffer) {
  return new Promise((resolve, reject) => {
    // 判斷 MIME 類型（根據 buffer 的開頭幾個位元組，簡易判斷）
    let resource_type = 'image'
    if (buffer.slice(0, 8).toString('hex').startsWith('00000018') || buffer.slice(4, 8).toString() === 'ftyp') {
      resource_type = 'video'
    }
    // 上傳到 Cloudinary
    const upload_stream = cloudinary.uploader.upload_stream(
      { resource_type },
      (error, result) => {
        if (error) reject(error)
        else resolve(result.secure_url)
      }
    )
    streamifier.createReadStream(buffer).pipe(upload_stream)
  })
}

module.exports = uploadMediaBuffer
