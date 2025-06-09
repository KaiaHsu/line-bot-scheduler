// 📁 cloudinaryUploader.js
const cloudinary = require('cloudinary').v2;
const dotenv = require('dotenv');
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadImageBuffer(buffer) {
  // 將 buffer 轉為 base64 data URI
  const dataUri = "data:image/jpeg;base64," + buffer.toString('base64');
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(dataUri, { folder: 'line-bot' }, (error, result) => {
      if (error) return reject(error);
      resolve(result.secure_url);
    });
  });
}

module.exports = uploadImageBuffer;