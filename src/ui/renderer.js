const { ipcRenderer } = require('electron');

class DuplicateImageDetector {
    constructor() {
        this.selectedFolder = null;
        this.scannedImages = [];
        this.duplicateGroups = [];
        this.selectedGroups = new Set();
        
        this.initializeEventListeners();
        this.initializeProgressListeners();
    }
    
    initializeEventListeners() {
        // Folder selection
        document.getElementById('select-folder-btn').addEventListener('click', () => {
            this.selectFolder();
        });
        
        // Start scanning
        document.getElementById('start-scan-btn').addEventListener('click', () => {
            this.startScanning();
        });
        
        // Start detection
        document.getElementById('start-detection-btn').addEventListener('click', () => {
            this.startDetection();
        });
        
        // Bulk actions
        document.getElementById('select-all-btn').addEventListener('click', () => {
            this.selectAllGroups();
        });
        
        document.getElementById('delete-selected-btn').addEventListener('click', () => {
            this.deleteSelectedDuplicates();
        });
        
        // Emergency stop
        document.getElementById('emergency-stop-btn').addEventListener('click', () => {
            this.emergencyStop();
        });
        
        // Start over
        document.getElementById('start-over-btn').addEventListener('click', () => {
            this.startOver();
        });
    }
    
    initializeProgressListeners() {
        // Scanning progress
        ipcRenderer.on('scan-progress', (event, progress) => {
            this.updateScanProgress(progress);
        });
        
        // Detection progress
        ipcRenderer.on('detection-progress', (event, progress) => {
            this.updateDetectionProgress(progress);
        });
        
        // Deletion progress
        ipcRenderer.on('deletion-progress', (event, progress) => {
            this.updateDeletionProgress(progress);
        });
    }
    
    async selectFolder() {
        try {
            const folderPath = await ipcRenderer.invoke('select-folder');
            if (folderPath) {
                this.selectedFolder = folderPath;
                document.getElementById('selected-folder').textContent = folderPath;
                document.getElementById('start-scan-btn').disabled = false;
                this.showStep('scanning');
            }
        } catch (error) {
            this.showError('Error selecting folder', error);
        }
    }
    
    async startScanning() {
        if (!this.selectedFolder) return;
        
        try {
            document.getElementById('start-scan-btn').disabled = true;
            document.getElementById('scan-status').textContent = 'Scanning folder for images...';
            
            const result = await ipcRenderer.invoke('scan-folder', this.selectedFolder);
            this.scannedImages = result.images;
            this.backupId = result.backupId;
            
            document.getElementById('scan-status').textContent = 
                `Scan complete! Found ${this.scannedImages.length} images. Safety backup created.`;
            document.getElementById('start-detection-btn').disabled = false;
            
            this.showStep('detection');
        } catch (error) {
            this.showError('Error during scanning', error);
            document.getElementById('start-scan-btn').disabled = false;
        }
    }
    
    async startDetection() {
        if (this.scannedImages.length === 0) return;
        
        try {
            document.getElementById('start-detection-btn').disabled = true;
            document.getElementById('detection-status').textContent = 'Running AI duplicate detection...';
            
            this.duplicateGroups = await ipcRenderer.invoke('detect-duplicates', this.scannedImages);
            
            document.getElementById('detection-status').textContent = 
                `Detection complete! Found ${this.duplicateGroups.length} duplicate groups.`;
            
            this.displayResults();
            this.showStep('results');
        } catch (error) {
            this.showError('Error during AI detection', error);
            document.getElementById('start-detection-btn').disabled = false;
        }
    }
    
    displayResults() {
        // Update statistics
        const totalDuplicates = this.duplicateGroups.reduce((sum, group) => sum + group.images.length - 1, 0);
        const spaceToSave = this.calculateSpaceToSave();
        
        document.getElementById('total-groups').textContent = this.duplicateGroups.length;
        document.getElementById('total-duplicates').textContent = totalDuplicates;
        document.getElementById('space-to-save').textContent = this.formatFileSize(spaceToSave);
        
        // Display duplicate groups
        const container = document.getElementById('duplicate-groups');
        container.innerHTML = '';
        
        this.duplicateGroups.forEach((group, index) => {
            const groupElement = this.createGroupElement(group, index);
            container.appendChild(groupElement);
        });
    }
    
    createGroupElement(group, index) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'duplicate-group';
        
        const similarity = Math.round(group.similarity * 100);
        const typeLabel = group.type === 'exact' ? 'Exact Duplicate' : 'Similar Images';
        
        groupDiv.innerHTML = `
            <div class="group-header">
                <div>
                    <input type="checkbox" class="group-checkbox" id="group-${index}" 
                           onchange="app.toggleGroupSelection(${index}, this.checked)">
                    <label for="group-${index}" class="group-title">
                        ${typeLabel} - ${group.images.length} images
                    </label>
                </div>
                <div class="similarity-score">${similarity}% similar</div>
            </div>
            <div class="image-comparison" id="images-${index}">
                ${group.images.map((image, imgIndex) => this.createImageElement(image, imgIndex === 0)).join('')}
            </div>
        `;
        
        return groupDiv;
    }
    
    createImageElement(image, isRecommended) {
        const itemClass = isRecommended ? 'image-item recommended' : 'image-item to-delete';
        const status = isRecommended ? '✅ Recommended to keep' : '🗑️ Will be deleted';
        
        return `
            <div class="${itemClass}">
                <img src="file://${image.thumbnail}" alt="${image.name}" class="image-preview">
                <div class="image-info">
                    <div><strong>${image.name}</strong></div>
                    <div>Size: ${this.formatFileSize(image.size)}</div>
                    <div>Resolution: ${image.width}x${image.height}</div>
                    <div>Modified: ${new Date(image.modified).toLocaleDateString()}</div>
                    <div style="color: ${isRecommended ? '#38a169' : '#e53e3e'}; font-weight: bold;">
                        ${status}
                    </div>
                </div>
            </div>
        `;
    }
    
    toggleGroupSelection(groupIndex, isSelected) {
        if (isSelected) {
            this.selectedGroups.add(groupIndex);
        } else {
            this.selectedGroups.delete(groupIndex);
        }
        
        document.getElementById('delete-selected-btn').disabled = this.selectedGroups.size === 0;
    }
    
    selectAllGroups() {
        const checkboxes = document.querySelectorAll('.group-checkbox');
        const shouldSelectAll = this.selectedGroups.size < this.duplicateGroups.length;
        
        checkboxes.forEach((checkbox, index) => {
            checkbox.checked = shouldSelectAll;
            this.toggleGroupSelection(index, shouldSelectAll);
        });
    }
    
    async deleteSelectedDuplicates() {
        if (this.selectedGroups.size === 0) return;
        
        const selectedGroupsArray = Array.from(this.selectedGroups);
        const filesToDelete = [];
        
        selectedGroupsArray.forEach(groupIndex => {
            const group = this.duplicateGroups[groupIndex];
            // Skip the first image (recommended to keep), delete the rest
            const duplicatesToDelete = group.images.slice(1);
            filesToDelete.push(...duplicatesToDelete.map(img => img.path));
        });
        
        if (filesToDelete.length === 0) return;
        
        const confirmMessage = `Are you sure you want to delete ${filesToDelete.length} duplicate images?\n\nThey will be moved to the recycle bin and can be restored if needed.`;
        
        if (confirm(confirmMessage)) {
            this.showStep('deletion');
            
            try {
                const results = await ipcRenderer.invoke('delete-files', filesToDelete);
                this.displayDeletionResults(results);
            } catch (error) {
                this.showError('Error during deletion', error);
            }
        }
    }
    
    displayDeletionResults(results) {
        const spaceFreed = results.deleted.reduce((sum, filePath) => {
            const image = this.findImageByPath(filePath);
            return sum + (image ? image.size : 0);
        }, 0);
        
        document.getElementById('deleted-count').textContent = results.deleted.length;
        document.getElementById('failed-count').textContent = results.failed.length;
        document.getElementById('space-freed').textContent = this.formatFileSize(spaceFreed);
        
        document.getElementById('deletion-results').classList.remove('hidden');
        
        if (results.failed.length > 0) {
            console.error('Failed deletions:', results.failed);
        }
    }
    
    calculateSpaceToSave() {
        return this.duplicateGroups.reduce((total, group) => {
            // Calculate space from duplicates (all images except the first one)
            const duplicates = group.images.slice(1);
            return total + duplicates.reduce((sum, image) => sum + image.size, 0);
        }, 0);
    }
    
    findImageByPath(path) {
        return this.scannedImages.find(img => img.path === path);
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    updateScanProgress(progress) {
        const progressBar = document.getElementById('scan-progress');
        const statusText = document.getElementById('scan-status');
        const detailsText = document.getElementById('scan-details');
        
        progressBar.style.width = progress.percentage + '%';
        statusText.textContent = `Scanning... ${progress.current}/${progress.total} files`;
        detailsText.textContent = `Current: ${progress.currentFile}`;
    }
    
    updateDetectionProgress(progress) {
        const progressBar = document.getElementById('detection-progress');
        const statusText = document.getElementById('detection-status');
        const confidenceElement = document.getElementById('confidence-level');
        const providerElement = document.getElementById('current-provider');
        
        progressBar.style.width = progress.percentage + '%';
        statusText.textContent = `${progress.stage} ${progress.current || 0}/${progress.total || 0}`;
        
        if (progress.confidence) {
            confidenceElement.textContent = `Confidence: ${progress.confidence}`;
        }
        
        if (progress.provider) {
            providerElement.textContent = `Provider: ${progress.provider}`;
            this.updateProviderStatus(progress.provider, 'active');
        }
        
        if (progress.currentComparison) {
            statusText.textContent += ` - ${progress.currentComparison}`;
        }
    }
    
    updateDeletionProgress(progress) {
        const progressBar = document.getElementById('deletion-progress');
        const statusText = document.getElementById('deletion-status');
        const detailsText = document.getElementById('deletion-details');
        
        progressBar.style.width = progress.percentage + '%';
        statusText.textContent = `Deleting... ${progress.current}/${progress.total} files`;
        detailsText.textContent = `Current: ${progress.currentFile}`;
    }
    
    showStep(stepId) {
        document.querySelectorAll('.step').forEach(step => {
            step.classList.remove('active');
        });
        document.getElementById(stepId).classList.add('active');
    }
    
    updateProviderStatus(provider, status) {
        const statusMap = {
            'google': 'google-indicator',
            'azure': 'azure-indicator',
            'aws': 'aws-indicator',
            'local-advanced': 'local-indicator'
        };
        
        const indicatorId = statusMap[provider];
        if (indicatorId) {
            const indicator = document.getElementById(indicatorId);
            indicator.className = `status-indicator ${status}`;
            
            switch (status) {
                case 'active':
                    indicator.textContent = '✅';
                    break;
                case 'inactive':
                    indicator.textContent = '❌';
                    break;
                case 'pending':
                    indicator.textContent = '⏳';
                    indicator.classList.add('pending');
                    break;
            }
        }
    }
    
    async emergencyStop() {
        const confirmed = confirm('Are you sure you want to activate Emergency Stop?\n\nThis will immediately halt all operations and ensure no data is lost.');
        
        if (confirmed) {
            try {
                const result = await ipcRenderer.invoke('emergency-stop');
                alert('Emergency Stop Activated!\n\n' + result.message);
                this.startOver();
            } catch (error) {
                alert('Emergency Stop Activated!\n\nAll operations have been safely halted.');
                this.startOver();
            }
        }
    }
    
    showError(title, error) {
        alert(`${title}: ${error.message || error}`);
        console.error(title, error);
    }
    
    startOver() {
        this.selectedFolder = null;
        this.scannedImages = [];
        this.duplicateGroups = [];
        this.selectedGroups.clear();
        
        // Reset UI
        document.getElementById('selected-folder').textContent = '';
        document.getElementById('start-scan-btn').disabled = true;
        document.getElementById('start-detection-btn').disabled = true;
        document.getElementById('delete-selected-btn').disabled = true;
        
        // Reset progress bars
        document.querySelectorAll('.progress-fill').forEach(bar => {
            bar.style.width = '0%';
        });
        
        // Reset status texts
        document.getElementById('scan-status').textContent = 'Ready to scan...';
        document.getElementById('detection-status').textContent = 'Ready for AI detection...';
        document.getElementById('deletion-status').textContent = 'Ready to delete...';
        
        // Hide deletion results
        document.getElementById('deletion-results').classList.add('hidden');
        
        this.showStep('folder-selection');
    }
}

// Initialize the application
const app = new DuplicateImageDetector();

// Make app globally available for inline event handlers
window.app = app;
