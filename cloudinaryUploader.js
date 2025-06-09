// 📁 cloudinaryUploader.js
const cloudinary = require('cloudinary').v2
const streamifier = require('streamifier')

// Cloudinary 帳號設定，請務必 .env 完整
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/**
 * 根據 buffer 前幾位元組判斷 MIME 類型（圖片/影片）
 */
function detectMediaType(buffer) {
  const header = buffer.slice(0, 16)
  // 常見影片檔頭判斷 (mp4/mov/webm)
  if (
    // MP4
    header.slice(4, 8).toString() === 'ftyp' ||
    // MOV
    header.slice(4, 8).toString() === 'moov' ||
    // WebM
    header.slice(0, 4).toString() === '\x1A\x45\xDF\xA3'
  ) return 'video'
  // 常見圖片檔頭 (JPG, PNG, GIF, WEBP)
  if (header.slice(0, 3).toString('hex') === 'ffd8ff') return 'image' // JPEG
  if (header.slice(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image' // PNG
  if (header.slice(0, 6).toString('ascii') === 'GIF87a' || header.slice(0, 6).toString('ascii') === 'GIF89a') return 'image'
  if (header.slice(0, 4).toString('ascii') === 'RIFF' && header.slice(8, 12).toString('ascii') === 'WEBP') return 'image'
  return 'image' // 預設圖片
}

/**
 * 上傳 buffer 至 Cloudinary，並回傳 { url, type }
 * @param {Buffer} buffer
 * @returns {Promise<{ url: string, type: 'image' | 'video' }>}
 */
async function uploadMediaBuffer(buffer) {
  const resource_type = detectMediaType(buffer)
  return new Promise((resolve, reject) => {
    const upload_stream = cloudinary.uploader.upload_stream(
      { resource_type },
      (error, result) => {
        if (error) reject(error)
        else resolve({ url: result.secure_url, type: resource_type })
      }
    )
    streamifier.createReadStream(buffer).pipe(upload_stream)
  })
}

module.exports = uploadMediaBuffer
