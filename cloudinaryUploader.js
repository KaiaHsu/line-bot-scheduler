const cloudinary = require('cloudinary').v2
const streamifier = require('streamifier')

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/**
 * 上傳圖片或影片 Buffer，返回 { url, previewUrl? }
 * @param {Buffer} buffer 
 * @param {'image'|'video'} [type='image'] 
 * @returns {Promise<{url: string, previewUrl?: string}>}
 */
async function uploadMediaBuffer(buffer, type = 'image') {
  return new Promise((resolve, reject) => {
    const resource_type = type === 'video' ? 'video' : 'image'

    const upload_stream = cloudinary.uploader.upload_stream(
      { resource_type },
      (error, result) => {
        if (error) return reject(error)
        if (resource_type === 'video') {
          // Cloudinary 標準影片縮圖網址
          const previewUrl = cloudinary.url(result.public_id + '.jpg', { resource_type: 'video' })
          resolve({ url: result.secure_url, previewUrl })
        } else {
          resolve({ url: result.secure_url })
        }
      }
    )

    streamifier.createReadStream(buffer).pipe(upload_stream)
  })
}

module.exports = uploadMediaBuffer
