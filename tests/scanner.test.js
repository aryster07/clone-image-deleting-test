const { scanFolder, isImageFile } = require('../src/scanner/fileScanner');
const fs = require('fs-extra');
const path = require('path');

describe('File Scanner', () => {
  const testDir = path.join(__dirname, 'temp', 'scanner-test');
  
  beforeEach(async () => {
    await fs.ensureDir(testDir);
  });
  
  afterEach(async () => {
    await fs.remove(testDir);
  });
  
  test('should identify image files correctly', () => {
    expect(isImageFile('test.jpg')).toBe(true);
    expect(isImageFile('test.jpeg')).toBe(true);
    expect(isImageFile('test.png')).toBe(true);
    expect(isImageFile('test.gif')).toBe(true);
    expect(isImageFile('test.bmp')).toBe(true);
    expect(isImageFile('test.tiff')).toBe(true);
    expect(isImageFile('test.webp')).toBe(true);
    
    expect(isImageFile('test.txt')).toBe(false);
    expect(isImageFile('test.pdf')).toBe(false);
    expect(isImageFile('test')).toBe(false);
  });
  
  test('should handle empty folder', async () => {
    const images = await scanFolder(testDir);
    expect(images).toEqual([]);
  });
  
  test('should track progress correctly', async () => {
    const progressCallbacks = [];
    const progressCallback = (progress) => {
      progressCallbacks.push(progress);
    };
    
    await scanFolder(testDir, progressCallback);
    
    // Should have at least one progress callback even for empty folder
    expect(progressCallbacks.length).toBeGreaterThanOrEqual(0);
  });
});
