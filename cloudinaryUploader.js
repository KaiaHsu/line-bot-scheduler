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
 * @returns {Promise<Object>} { url, previewUrl } 或 { videoUrl, previewUrl }
 */
async function uploadMediaBuffer(buffer, type = 'image') {
  return new Promise((resolve, reject) => {
    let resource_type = type === 'video' ? 'video' : 'image'

    const upload_stream = cloudinary.uploader.upload_stream(
      {
        resource_type,
        // 影片上傳時，同時生成縮圖（eager）
        eager: resource_type === 'video' ? [{ width: 300, height: 200, crop: 'pad', format: 'jpg' }] : undefined,
        eager_async: false,
      },
      (error, result) => {
        if (error) return reject(error)
        if (resource_type === 'video') {
          // 影片：返回影片 URL 和縮圖 URL
          const videoUrl = result.secure_url
          const previewUrl = result.eager && result.eager[0] ? result.eager[0].secure_url : null
          resolve({ videoUrl, previewUrl })
        } else {
          // 圖片：返回圖片 URL (previewUrl 同 url)
          resolve({ url: result.secure_url, previewUrl: result.secure_url })
        }
      }
    )
    streamifier.createReadStream(buffer).pipe(upload_stream)
  })
}

module.exports = uploadMediaBuffer
