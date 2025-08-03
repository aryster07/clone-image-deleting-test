const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');
const crypto = require('crypto');

const supportedFormats = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'];

async function scanFolder(folderPath, progressCallback) {
  const images = [];
  let processedFiles = 0;
  let totalFiles = 0;

  // First pass: count total files
  async function countFiles(dir) {
    const items = await fs.readdir(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = await fs.stat(fullPath);
      
      if (stat.isDirectory()) {
        await countFiles(fullPath);
      } else if (isImageFile(item)) {
        totalFiles++;
      }
    }
  }

  // Second pass: process files
  async function processFiles(dir) {
    const items = await fs.readdir(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = await fs.stat(fullPath);
      
      if (stat.isDirectory()) {
        await processFiles(fullPath);
      } else if (isImageFile(item)) {
        try {
          const imageInfo = await processImage(fullPath, stat);
          images.push(imageInfo);
          
          processedFiles++;
          if (progressCallback) {
            progressCallback({
              current: processedFiles,
              total: totalFiles,
              percentage: Math.round((processedFiles / totalFiles) * 100),
              currentFile: fullPath
            });
          }
        } catch (error) {
          console.error(`Error processing image ${fullPath}:`, error);
        }
      }
    }
  }

  await countFiles(folderPath);
  await processFiles(folderPath);
  
  return images;
}

function isImageFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return supportedFormats.includes(ext);
}

async function processImage(filePath, stat) {
  try {
    // Get image metadata
    const metadata = await sharp(filePath).metadata();
    
    // Generate thumbnail
    const thumbnailPath = await generateThumbnail(filePath);
    
    // Calculate file hash for quick duplicate detection
    const fileHash = await calculateFileHash(filePath);
    
    return {
      path: filePath,
      name: path.basename(filePath),
      size: stat.size,
      modified: stat.mtime,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      thumbnail: thumbnailPath,
      hash: fileHash,
      resolution: metadata.width * metadata.height
    };
  } catch (error) {
    console.error(`Error processing image metadata for ${filePath}:`, error);
    throw error;
  }
}

async function generateThumbnail(imagePath) {
  const thumbnailDir = path.join(__dirname, '../temp/thumbnails');
  await fs.ensureDir(thumbnailDir);
  
  const filename = path.basename(imagePath, path.extname(imagePath));
  const thumbnailPath = path.join(thumbnailDir, `${filename}_thumb.jpg`);
  
  await sharp(imagePath)
    .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(thumbnailPath);
    
  return thumbnailPath;
}

async function calculateFileHash(filePath) {
  const data = await fs.readFile(filePath);
  return crypto.createHash('md5').update(data).digest('hex');
}

module.exports = {
  scanFolder,
  isImageFile,
  processImage
};
