// cloudinaryUploader.js
const cloudinary = require('cloudinary').v2

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

/**
 * 上傳 Buffer 到 Cloudinary
 * @param {Buffer} buffer - 檔案 buffer
 * @param {'image'|'video'} type - 媒體類型
 * @returns {Promise<{ url: string, previewUrl?: string }>}
 */
async function uploadMediaBuffer(buffer, type = 'image') {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { resource_type: type },
      (error, result) => {
        if (error) return reject(error)
        resolve({
          url: result.secure_url,
          previewUrl: result.secure_url // 圖片/影片都可用這欄位
        })
      }
    ).end(buffer)
  })
}

module.exports = uploadMediaBuffer