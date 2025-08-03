const fs = require('fs-extra');
const path = require('path');

async function deleteFiles(filesToDelete, progressCallback) {
  const results = {
    deleted: [],
    failed: [],
    total: filesToDelete.length
  };
  
  let processed = 0;
  
  for (const filePath of filesToDelete) {
    try {
      // Verify file exists before attempting deletion
      if (await fs.pathExists(filePath)) {
        // Create a backup before deletion for safety
        const backupDir = path.join(path.dirname(filePath), '.backup');
        await fs.ensureDir(backupDir);
        const backupPath = path.join(backupDir, path.basename(filePath));
        
        // Move file to backup instead of deleting
        await fs.move(filePath, backupPath, { overwrite: true });
        
        results.deleted.push({
          original: filePath,
          backup: backupPath,
          size: (await fs.stat(backupPath)).size
        });
        
        console.log(`Moved to backup: ${filePath} -> ${backupPath}`);
      } else {
        results.failed.push({
          path: filePath,
          error: 'File does not exist'
        });
      }
    } catch (error) {
      console.error(`Failed to process ${filePath}:`, error);
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
        lastProcessed: filePath
      });
    }
  }
  
  return results;
}

async function restoreBackup(backupPath, originalPath) {
  try {
    if (await fs.pathExists(backupPath)) {
      await fs.move(backupPath, originalPath, { overwrite: true });
      console.log(`Restored: ${backupPath} -> ${originalPath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Failed to restore ${backupPath}:`, error);
    throw error;
  }
}

async function permanentlyDelete(backupPath) {
  try {
    if (await fs.pathExists(backupPath)) {
      await fs.remove(backupPath);
      console.log(`Permanently deleted: ${backupPath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Failed to permanently delete ${backupPath}:`, error);
    throw error;
  }
}

module.exports = {
  deleteFiles,
  restoreBackup,
  permanentlyDelete
};
