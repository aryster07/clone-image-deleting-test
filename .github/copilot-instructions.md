# Copilot Instructions

## Project Overview
This is an AI-powered duplicate image detection and deletion tool. Users can select a folder from their device, and the application scans all images to find duplicates using AI image detection algorithms. It provides a preview interface to review duplicates and offers deletion options including bulk deletion while keeping one copy of each duplicate set.

## Core Features
- **Folder Selection**: Browse and select folders containing images
- **AI-Powered Detection**: Use web-based AI image detection algorithms to find visually similar images
- **Preview Interface**: Side-by-side comparison of duplicate images
- **Smart Deletion**: Keep one original, delete duplicates with user confirmation
- **Bulk Operations**: Select and delete multiple duplicate sets at once
- **Progress Tracking**: Real-time progress during scanning and processing

## Architecture Components

### File Scanner Module (`src/scanner/`)
- Recursive folder traversal for image files
- Support for common formats: JPEG, PNG, GIF, BMP, TIFF, WebP
- Progress callbacks for UI updates
- File metadata extraction (size, date, resolution)

### AI Detection Service (`src/detection/`)
- Integration with web-based AI image similarity APIs
- Perceptual hashing for initial filtering
- Visual feature extraction and comparison
- Similarity scoring and threshold management
- Rate limiting and API error handling

### Preview UI (`src/ui/`)
- Image thumbnail generation and caching
- Side-by-side comparison viewer
- Batch selection interface with checkboxes
- Deletion confirmation dialogs
- Progress bars and status indicators

### Deletion Manager (`src/deletion/`)
- Safe file deletion with recycle bin integration
- Undo functionality (temporary backup)
- Batch deletion processing
- File system permission handling
- Deletion history logging

## Development Patterns

### API Integration
```javascript
// Example pattern for AI detection service
const detectDuplicates = async (imagePaths) => {
  const results = await Promise.allSettled(
    imagePaths.map(path => aiService.compareSimilarity(path))
  );
  return filterValidResults(results);
};
```

### Progress Tracking
- Implement progress callbacks throughout scanning pipeline
- Use event emitters for real-time UI updates
- Track progress by file count and processing stages

### Error Handling
- Graceful degradation when AI services are unavailable
- File access permission error recovery
- Network timeout handling for web API calls
- User-friendly error messages with retry options

## Key Workflows

### 1. Folder Scanning
1. User selects folder via file dialog
2. Recursive scan for supported image formats
3. Generate thumbnails and extract metadata
4. Display initial file count and estimated processing time

### 2. Duplicate Detection
1. Initial fast filtering using file size and basic hashing
2. AI-powered visual similarity detection for remaining candidates
3. Group similar images by similarity threshold
4. Rank images within groups (prefer higher resolution, newer date)

### 3. Review and Deletion
1. Present duplicate groups in preview interface
2. Highlight recommended image to keep (highest quality)
3. Allow manual selection override
4. Batch selection for multiple groups
5. Confirm deletion with summary
6. Execute deletion with progress feedback

## Technology Recommendations
- **Desktop**: Electron with Node.js backend for cross-platform file access
- **Web APIs**: Integration with services like Google Vision API, AWS Rekognition, or Azure Computer Vision
- **UI Framework**: React or Vue.js for responsive preview interface
- **Image Processing**: Sharp.js for thumbnails, jimp for client-side operations
- **File Handling**: Node.js fs-extra for safe file operations

## Performance Considerations
- Implement image thumbnail caching to avoid regeneration
- Use worker threads for CPU-intensive operations
- Batch API calls to respect rate limits
- Lazy load images in preview interface
- Implement cancellation for long-running operations

## Safety Features
- Always move files to recycle bin instead of permanent deletion
- Maintain deletion log for audit trail
- Implement undo functionality with temporary backup
- Require explicit confirmation for bulk deletions
- Validate file permissions before attempting deletion
