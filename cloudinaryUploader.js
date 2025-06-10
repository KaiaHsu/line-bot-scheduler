// 📁 cloudinaryUploader.js
const cloudinary = require('cloudinary').v2
const streamifier = require('streamifier')

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/**
 * 上傳圖片或影片 Buffer，並返回可公開存取的 URL
 * @param {Buffer} buffer 
 * @param {'image'|'video'} [type='image'] 
 * @returns {Promise<string>} URL
 */
async function uploadMediaBuffer(buffer, type = 'image') {
  return new Promise((resolve, reject) => {
    // 簡單判斷 Buffer 是否影片格式（可依需求更完善）
    let resource_type = 'image'
    if (type === 'video') resource_type = 'video'

    const upload_stream = cloudinary.uploader.upload_stream(
      { resource_type },
      (error, result) => {
        if (error) return reject(error)
        resolve(result.secure_url)
      }
    )

    streamifier.createReadStream(buffer).pipe(upload_stream)
  })
}

module.exports = uploadMediaBuffer