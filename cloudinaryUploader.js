const cloudinary = require('cloudinary').v2
const streamifier = require('streamifier')

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

function uploadMediaBuffer(buffer, type = 'image') {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: type === 'video' ? 'video' : 'image',
        folder: 'line-bot-media',
      },
      (error, result) => {
        if (error) {
          console.error('❌ Cloudinary 上傳失敗:', error)
          return reject(error)
        }
        console.log('✅ Cloudinary 上傳成功:', result.secure_url)
        resolve({
          url: result.secure_url,
          previewUrl: result.secure_url, // Cloudinary 預設圖片即可當預覽圖
        })
      }
    )

    streamifier.createReadStream(buffer).pipe(uploadStream)
  })
}

module.exports = uploadMediaBuffer