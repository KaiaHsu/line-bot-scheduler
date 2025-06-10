const cloudinary = require('cloudinary').v2
const streamifier = require('streamifier')

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/**
 * 上傳圖片或影片 Buffer，並返回可公開存取的 URL
 * @param {Buffer} buffer - 多媒體檔案的 Buffer
 * @param {'image'|'video'} [type='image'] - 媒體類型，預設為圖片
 * @returns {Promise<string>} - 成功返回雲端 URL
 */
async function uploadMediaBuffer(buffer, type = 'image') {
  return new Promise((resolve, reject) => {
    const resource_type = (type === 'video') ? 'video' : 'image'

    const upload_stream = cloudinary.uploader.upload_stream(
      { resource_type },
      (error, result) => {
        if (error) {
          console.error('Cloudinary Upload Error:', error)
          return reject(error)
        }
        resolve(result.secure_url)
      }
    )

    streamifier.createReadStream(buffer).pipe(upload_stream)
  })
}

module.exports = uploadMediaBuffer
