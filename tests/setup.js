const fs = require('fs-extra');
const path = require('path');

// Create test directories
const testDir = path.join(__dirname, 'temp');
const sampleImagesDir = path.join(testDir, 'sample-images');

beforeAll(async () => {
  await fs.ensureDir(testDir);
  await fs.ensureDir(sampleImagesDir);
});

afterAll(async () => {
  await fs.remove(testDir);
});

// Mock Electron
global.console = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
};
