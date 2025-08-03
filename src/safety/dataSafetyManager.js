const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

class DataSafetyManager {
  constructor() {
    this.backupDir = path.join(__dirname, '../backup');
    this.safetyChecks = [];
    this.operationLog = [];
  }

  async initializeSafety() {
    // Ensure backup directories exist
    await fs.ensureDir(this.backupDir);
    await fs.ensureDir(path.join(this.backupDir, 'pre-analysis'));
    await fs.ensureDir(path.join(this.backupDir, 'pre-deletion'));
    await fs.ensureDir(path.join(this.backupDir, 'verification'));
    
    console.log('Data Safety Manager initialized');
  }

  async createPreAnalysisBackup(images) {
    const timestamp = Date.now();
    const backupId = `analysis_${timestamp}`;
    const backupPath = path.join(this.backupDir, 'pre-analysis', backupId);
    
    await fs.ensureDir(backupPath);
    
    // Create comprehensive manifest
    const manifest = {
      backupId,
      timestamp: new Date().toISOString(),
      operation: 'pre-analysis',
      totalImages: images.length,
      totalSize: images.reduce((sum, img) => sum + img.size, 0),
      images: images.map(img => ({
        path: img.path,
        name: img.name,
        size: img.size,
        hash: img.hash,
        lastModified: img.modified,
        verified: true
      })),
      checksums: await this.calculateBatchChecksums(images),
      safetyLevel: 'maximum'
    };
    
    // Save manifest
    await fs.writeFile(
      path.join(backupPath, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    
    // Create verification checksums
    await this.createVerificationFile(backupPath, manifest);
    
    this.operationLog.push({
      operation: 'pre-analysis-backup',
      timestamp: new Date().toISOString(),
      backupId,
      status: 'completed',
      itemCount: images.length
    });
    
    console.log(`Pre-analysis backup created: ${backupId}`);
    return backupId;
  }

  async createPreDeletionBackup(filesToDelete) {
    const timestamp = Date.now();
    const backupId = `deletion_${timestamp}`;
    const backupPath = path.join(this.backupDir, 'pre-deletion', backupId);
    
    await fs.ensureDir(backupPath);
    
    // Actually copy files before deletion (ultimate safety)
    const copiedFiles = [];
    for (const filePath of filesToDelete) {
      try {
        if (await fs.pathExists(filePath)) {
          const fileName = path.basename(filePath);
          const safeName = `${copiedFiles.length}_${fileName}`;
          const copyPath = path.join(backupPath, safeName);
          
          await fs.copy(filePath, copyPath);
          
          // Verify copy integrity
          const originalHash = await this.calculateFileHash(filePath);
          const copyHash = await this.calculateFileHash(copyPath);
          
          if (originalHash !== copyHash) {
            throw new Error(`Backup verification failed for ${filePath}`);
          }
          
          copiedFiles.push({
            originalPath: filePath,
            backupPath: copyPath,
            verified: true,
            hash: originalHash
          });
        }
      } catch (error) {
        console.error(`Failed to backup file ${filePath}:`, error);
        throw error; // Stop deletion if backup fails
      }
    }
    
    // Create manifest
    const manifest = {
      backupId,
      timestamp: new Date().toISOString(),
      operation: 'pre-deletion',
      totalFiles: copiedFiles.length,
      files: copiedFiles,
      safetyLevel: 'maximum',
      verificationPassed: true
    };
    
    await fs.writeFile(
      path.join(backupPath, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    
    this.operationLog.push({
      operation: 'pre-deletion-backup',
      timestamp: new Date().toISOString(),
      backupId,
      status: 'completed',
      itemCount: copiedFiles.length
    });
    
    console.log(`Pre-deletion backup created: ${backupId} (${copiedFiles.length} files backed up)`);
    return backupId;
  }

  async verifyFilesExist(filePaths) {
    const verification = {
      total: filePaths.length,
      existing: 0,
      missing: [],
      verified: true
    };
    
    for (const filePath of filePaths) {
      if (await fs.pathExists(filePath)) {
        verification.existing++;
      } else {
        verification.missing.push(filePath);
        verification.verified = false;
      }
    }
    
    if (!verification.verified) {
      console.warn(`File verification failed: ${verification.missing.length} files missing`);
    }
    
    return verification;
  }

  async performSafetyChecks(duplicateGroups) {
    const checks = [];
    
    // Check 1: Ensure at least one file is kept in each group
    for (const group of duplicateGroups) {
      const recommendedCount = group.images.filter(img => img.recommended).length;
      
      checks.push({
        check: 'recommended-file-exists',
        groupId: group.images[0]?.hash || 'unknown',
        passed: recommendedCount >= 1,
        details: `Group has ${recommendedCount} recommended files`
      });
      
      // Check 2: Verify we're not deleting all files
      const totalFiles = group.images.length;
      const filesToDelete = group.images.filter(img => !img.recommended).length;
      
      checks.push({
        check: 'not-deleting-all',
        groupId: group.images[0]?.hash || 'unknown',
        passed: filesToDelete < totalFiles,
        details: `Deleting ${filesToDelete} of ${totalFiles} files`
      });
    }
    
    // Check 3: Verify all files still exist
    const allFiles = duplicateGroups.flatMap(group => group.images.map(img => img.path));
    const fileVerification = await this.verifyFilesExist(allFiles);
    
    checks.push({
      check: 'files-exist',
      passed: fileVerification.verified,
      details: `${fileVerification.existing}/${fileVerification.total} files exist`
    });
    
    const allPassed = checks.every(check => check.passed);
    
    this.safetyChecks.push({
      timestamp: new Date().toISOString(),
      operation: 'duplicate-deletion',
      allPassed,
      checks
    });
    
    if (!allPassed) {
      const failedChecks = checks.filter(check => !check.passed);
      throw new Error(`Safety checks failed: ${failedChecks.map(c => c.check).join(', ')}`);
    }
    
    console.log(`Safety checks passed: ${checks.length} checks completed`);
    return { passed: true, checks };
  }

  async calculateFileHash(filePath) {
    const data = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  async calculateBatchChecksums(images) {
    const checksums = {};
    
    for (const image of images) {
      try {
        checksums[image.path] = await this.calculateFileHash(image.path);
      } catch (error) {
        console.warn(`Failed to calculate checksum for ${image.path}:`, error.message);
        checksums[image.path] = 'error';
      }
    }
    
    return checksums;
  }

  async createVerificationFile(backupPath, manifest) {
    const verification = {
      created: new Date().toISOString(),
      manifestHash: crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
      itemCount: manifest.images?.length || manifest.files?.length || 0,
      totalSize: manifest.totalSize || 0,
      verificationLevel: 'enterprise'
    };
    
    await fs.writeFile(
      path.join(backupPath, 'verification.json'),
      JSON.stringify(verification, null, 2)
    );
  }

  async restoreFromBackup(backupId) {
    const backupPath = path.join(this.backupDir, 'pre-deletion', backupId);
    
    if (!await fs.pathExists(backupPath)) {
      throw new Error(`Backup not found: ${backupId}`);
    }
    
    const manifestPath = path.join(backupPath, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    
    const restored = [];
    const failed = [];
    
    for (const file of manifest.files) {
      try {
        // Check if original still exists (might have been restored already)
        if (!await fs.pathExists(file.originalPath)) {
          await fs.copy(file.backupPath, file.originalPath);
          
          // Verify restoration
          const restoredHash = await this.calculateFileHash(file.originalPath);
          if (restoredHash === file.hash) {
            restored.push(file.originalPath);
          } else {
            failed.push({ path: file.originalPath, reason: 'Hash mismatch after restore' });
          }
        } else {
          restored.push(file.originalPath); // Already exists
        }
      } catch (error) {
        failed.push({ path: file.originalPath, reason: error.message });
      }
    }
    
    this.operationLog.push({
      operation: 'restore-from-backup',
      timestamp: new Date().toISOString(),
      backupId,
      status: failed.length > 0 ? 'partial' : 'completed',
      restored: restored.length,
      failed: failed.length
    });
    
    console.log(`Restoration completed: ${restored.length} files restored, ${failed.length} failed`);
    
    return {
      backupId,
      restored,
      failed,
      success: failed.length === 0
    };
  }

  async getSafetyReport() {
    return {
      operationLog: this.operationLog,
      safetyChecks: this.safetyChecks,
      backupDirectories: {
        preAnalysis: await this.listBackups('pre-analysis'),
        preDeletion: await this.listBackups('pre-deletion')
      },
      systemStatus: 'operational'
    };
  }

  async listBackups(type) {
    const backupPath = path.join(this.backupDir, type);
    
    if (!await fs.pathExists(backupPath)) {
      return [];
    }
    
    const backups = [];
    const items = await fs.readdir(backupPath);
    
    for (const item of items) {
      const itemPath = path.join(backupPath, item);
      const stat = await fs.stat(itemPath);
      
      if (stat.isDirectory()) {
        const manifestPath = path.join(itemPath, 'manifest.json');
        
        if (await fs.pathExists(manifestPath)) {
          try {
            const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
            backups.push({
              id: item,
              timestamp: manifest.timestamp,
              operation: manifest.operation,
              itemCount: manifest.totalImages || manifest.totalFiles || 0,
              size: stat.size
            });
          } catch (error) {
            console.warn(`Failed to read backup manifest: ${item}`);
          }
        }
      }
    }
    
    return backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  async emergencyStop() {
    console.log('EMERGENCY STOP ACTIVATED - All operations halted');
    
    this.operationLog.push({
      operation: 'emergency-stop',
      timestamp: new Date().toISOString(),
      status: 'activated',
      reason: 'User initiated emergency stop'
    });
    
    // In a real implementation, this would stop all ongoing operations
    throw new Error('Emergency stop activated - all operations cancelled');
  }
}

module.exports = DataSafetyManager;
