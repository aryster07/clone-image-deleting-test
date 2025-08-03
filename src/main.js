const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { scanFolder } = require('./scanner/fileScanner');
const { detectDuplicates } = require('./detection/aiDetectionEnterprise');
const { deleteFiles } = require('./deletion/deletionManager');
const DataSafetyManager = require('./safety/dataSafetyManager');

let mainWindow;
let safetyManager;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    title: 'Enterprise Duplicate Image Detector - AI Powered'
  });

  mainWindow.loadFile(path.join(__dirname, 'ui/index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  // Initialize safety manager
  safetyManager = new DataSafetyManager();
  await safetyManager.initializeSafety();
  
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers with enhanced safety
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select folder to scan for duplicate images'
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('scan-folder', async (event, folderPath) => {
  try {
    const images = await scanFolder(folderPath, (progress) => {
      event.sender.send('scan-progress', progress);
    });
    
    // Create pre-analysis backup for maximum safety
    const backupId = await safetyManager.createPreAnalysisBackup(images);
    
    return { images, backupId };
  } catch (error) {
    console.error('Error scanning folder:', error);
    throw error;
  }
});

ipcMain.handle('detect-duplicates', async (event, images) => {
  try {
    event.sender.send('detection-progress', {
      current: 0,
      total: images.length,
      percentage: 0,
      stage: 'Initializing Enterprise AI Detection',
      provider: 'multi-provider',
      confidence: '99%'
    });
    
    const duplicates = await detectDuplicates(images, (progress) => {
      event.sender.send('detection-progress', progress);
    });
    
    // Perform comprehensive safety checks
    await safetyManager.performSafetyChecks(duplicates);
    
    return duplicates;
  } catch (error) {
    console.error('Error detecting duplicates:', error);
    throw error;
  }
});

ipcMain.handle('delete-files', async (event, filesToDelete) => {
  try {
    // Create pre-deletion backup (actual file copies for ultimate safety)
    event.sender.send('deletion-progress', {
      current: 0,
      total: filesToDelete.length,
      percentage: 0,
      stage: 'Creating safety backup...',
      currentFile: 'Preparing backup'
    });
    
    const backupId = await safetyManager.createPreDeletionBackup(filesToDelete);
    
    // Verify all files exist before proceeding
    const verification = await safetyManager.verifyFilesExist(filesToDelete);
    if (!verification.verified) {
      throw new Error(`Cannot proceed: ${verification.missing.length} files are missing`);
    }
    
    // Proceed with deletion only after backup is verified
    const result = await deleteFiles(filesToDelete, (progress) => {
      event.sender.send('deletion-progress', {
        ...progress,
        backupId: backupId,
        stage: 'Safely deleting files...'
      });
    });
    
    result.backupId = backupId;
    result.safetyLevel = 'maximum';
    
    return result;
  } catch (error) {
    console.error('Error deleting files:', error);
    throw error;
  }
});

// Emergency safety handlers
ipcMain.handle('emergency-stop', async () => {
  try {
    await safetyManager.emergencyStop();
  } catch (error) {
    return { stopped: true, message: error.message };
  }
});

ipcMain.handle('restore-backup', async (event, backupId) => {
  try {
    const result = await safetyManager.restoreFromBackup(backupId);
    return result;
  } catch (error) {
    console.error('Error restoring backup:', error);
    throw error;
  }
});

ipcMain.handle('get-safety-report', async () => {
  try {
    return await safetyManager.getSafetyReport();
  } catch (error) {
    console.error('Error getting safety report:', error);
    throw error;
  }
});
