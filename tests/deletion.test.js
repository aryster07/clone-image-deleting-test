const { deleteFiles, bulkDelete } = require('../src/deletion/deletionManager');
const fs = require('fs-extra');
const path = require('path');

describe('Deletion Manager', () => {
  const testDir = path.join(__dirname, 'temp', 'deletion-test');
  
  beforeEach(async () => {
    await fs.ensureDir(testDir);
  });
  
  afterEach(async () => {
    await fs.remove(testDir);
  });
  
  test('should handle empty file list', async () => {
    const result = await deleteFiles([]);
    expect(result.deleted).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.total).toBe(0);
  });
  
  test('should handle non-existent files', async () => {
    const nonExistentFile = path.join(testDir, 'does-not-exist.jpg');
    const result = await deleteFiles([nonExistentFile]);
    
    expect(result.deleted).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].path).toBe(nonExistentFile);
    expect(result.failed[0].error).toBe('File not found');
  });
  
  test('should generate correct bulk delete list', async () => {
    const duplicateGroups = [
      {
        images: [
          { path: '/path/to/image1.jpg' },
          { path: '/path/to/image2.jpg' },
          { path: '/path/to/image3.jpg' }
        ]
      },
      {
        images: [
          { path: '/path/to/image4.jpg' },
          { path: '/path/to/image5.jpg' }
        ]
      }
    ];
    
    const filesToDelete = await bulkDelete(duplicateGroups);
    
    // Should delete all but the first image in each group
    expect(filesToDelete).toEqual([
      '/path/to/image2.jpg',
      '/path/to/image3.jpg',
      '/path/to/image5.jpg'
    ]);
  });
});
