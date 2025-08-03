const fs = require('fs-extra');
const path = require('path');

// Dynamic import for ES module
let trashModule = null;

async function getTrashModule() {
  if (!trashModule) {
    trashModule = await import('trash');
  }
  return trashModule.default;
}

async function deleteFiles(filesToDelete, progressCallback) {
  const results = {
    deleted: [],
    failed: [],
    total: filesToDelete.length
  };
  
  let processed = 0;
  
  // Get the trash module dynamically
  const trash = await getTrashModule();
  
  for (const filePath of filesToDelete) {
    try {
      // Verify file exists before attempting deletion
      if (await fs.pathExists(filePath)) {
        // Move to trash instead of permanent deletion for safety
        await trash([filePath]);
        
        results.deleted.push(filePath);
        
        // Log deletion for audit trail
        await logDeletion(filePath);
      } else {
        results.failed.push({
          path: filePath,
          error: 'File not found'
        });
      }
    } catch (error) {
      console.error(`Error deleting file ${filePath}:`, error);
      results.failed.push({
        path: filePath,
        error: error.message
      });
    }
    
    processed++;
    if (progressCallback) {
      progressCallback({
        current: processed,
        total: results.total,
        percentage: Math.round((processed / results.total) * 100),
        currentFile: filePath
      });
    }
  }
  
  return results;
}

async function logDeletion(filePath) {
  const logDir = path.join(__dirname, '../logs');
  await fs.ensureDir(logDir);
  
  const logFile = path.join(logDir, 'deletion-log.txt');
  const timestamp = new Date().toISOString();
  const logEntry = `${timestamp} - DELETED: ${filePath}\n`;
  
  await fs.appendFile(logFile, logEntry);
}

async function bulkDelete(duplicateGroups, keepRecommended = true) {
  const filesToDelete = [];
  
  duplicateGroups.forEach(group => {
    if (keepRecommended) {
      // Skip the recommended image (usually the first one)
      const imagesToDelete = group.images.slice(1);
      filesToDelete.push(...imagesToDelete.map(img => img.path));
    } else {
      // Delete all but the first image
      const imagesToDelete = group.images.slice(1);
      filesToDelete.push(...imagesToDelete.map(img => img.path));
    }
  });
  
  return filesToDelete;
}

async function createBackup(filesToDelete) {
  const backupDir = path.join(__dirname, '../backup', Date.now().toString());
  await fs.ensureDir(backupDir);
  
  const backupPromises = filesToDelete.map(async (filePath) => {
    try {
      const fileName = path.basename(filePath);
      const backupPath = path.join(backupDir, fileName);
      await fs.copy(filePath, backupPath);
      return { original: filePath, backup: backupPath };
    } catch (error) {
      console.error(`Error creating backup for ${filePath}:`, error);
      return null;
    }
  });
  
  const backupResults = await Promise.all(backupPromises);
  return backupResults.filter(result => result !== null);
}

async function restoreFromBackup(backupPath) {
  try {
    const backupFiles = await fs.readdir(backupPath);
    const restored = [];
    
    for (const fileName of backupFiles) {
      const backupFilePath = path.join(backupPath, fileName);
      const originalPath = path.join(path.dirname(backupPath), '../../original', fileName);
      
      await fs.copy(backupFilePath, originalPath);
      restored.push(originalPath);
    }
    
    return restored;
  } catch (error) {
    console.error('Error restoring from backup:', error);
    throw error;
  }
}

async function cleanupTempFiles() {
  const tempDir = path.join(__dirname, '../temp');
  try {
    if (await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  } catch (error) {
    console.error('Error cleaning up temp files:', error);
  }
}

module.exports = {
  deleteFiles,
  bulkDelete,
  createBackup,
  restoreFromBackup,
  cleanupTempFiles,
  logDeletion
};
