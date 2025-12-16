# Detailed Flow Analysis: My Lists Tab - File Selection and Processing

## Overview
This document describes the complete flow that runs when a user opens the My Lists tab and selects a file for processing. The Lists feature extracts structured data (like Clinical Notes and Medication Records) from PDF files using the Private AI agent.

---

## Phase 1: Component Initialization (onMounted)

When the My Lists tab opens, the `Lists.vue` component mounts and automatically executes three initialization functions:

### 1. `loadUserFiles()` (line 886)
- **Endpoint**: `GET /api/user-files?userId={userId}`
- **Purpose**: Loads all available PDF files for the user
- **Process**:
  - Fetches user files from backend
  - Filters for PDF files only (checks `.pdf` extension or `fileType === 'pdf'`)
  - Populates `userFiles` ref with `{fileName, bucketKey, fileType}` objects
- **Result**: Dropdown populated with available PDF files

### 2. `loadClinicalNotes()` (line 887)
- **Endpoint**: `GET /api/files/clinical-notes`
- **Purpose**: Loads existing clinical notes (if any) for display
- **Process**: Fetches all clinical notes from OpenSearch index
- **Result**: Clinical notes displayed in the component (if any exist)

### 3. `loadSavedResults()` (line 888)
- **Endpoint**: `GET /api/files/lists/results`
- **Purpose**: Checks if there are previously saved processing results
- **Backend Process**:
  - Lists all files in `{userId}/Lists/` folder in S3
  - Finds the most recent `*_results.json` file
  - If found, loads and returns the processing results
- **Result**: 
  - If results exist: Sets `hasSavedResults = true` and displays saved results
  - If no results: Shows file selection dialog

---

## Phase 2: File Selection

The user can select a file in two ways:

### Option A: Upload New File (via `handleFileSelected`)
1. User selects a file from the file input element
2. Calls `processPdfFile(file: File)` (line 511-520)

### Option B: Select Existing File (via `handleBucketFileSelected`)
1. User selects a file from the dropdown (populated by `loadUserFiles()`)
2. Checks if file is in `/Lists/` folder (special handling for already-processed files)
3. Calls `processPdfFromBucket(bucketKey: string)` (line 523-561)

Both paths converge at the PDF processing step.

---

## Phase 3: PDF Processing (Backend)

Both `processPdfFile` and `processPdfFromBucket` call the same backend flow:

### Endpoint: `POST /api/files/pdf-to-markdown` (with file) or `POST /api/files/pdf-to-markdown/:bucketKey` (with bucket key)

#### Step 3.1: PDF Extraction
- Uses `extractPdfWithPages()` utility from `pdf-parser.js`
- Extracts text from PDF with page boundaries preserved
- Creates `fullMarkdown` by combining pages: `## Page {n}\n\n{markdown}\n\n---\n\n`

#### Step 3.2: Category Extraction (if `extractCategories=true`)
- Calls `extractMarkdownCategories(fullMarkdown, userId, cloudant, doClient)` (line 449)
- **Process**:
  1. Gets user document from Cloudant to access agent info
  2. Creates `DigitalOceanProvider` with agent API key
  3. Sends prompt to Private AI agent asking for top-level markdown categories (### headings) and counts
  4. Parses AI response to extract `{category: string, count: number}[]`
- **Returns**: Array of categories found in the markdown

#### Step 3.3: Cleanup Lists Folder
- Lists all files in `{userId}/Lists/` folder
- Deletes existing files (except `.keep` placeholder files)
- Prepares folder for new processing results

#### Step 3.4: Save Results to S3
- Saves PDF file to: `{userId}/Lists/{cleanedFileName}`
- Saves processing results to: `{userId}/Lists/{cleanedFileName}_results.json`
- **Results JSON contains**:
  ```json
  {
    "fileName": "...",
    "totalPages": N,
    "pages": [...],
    "categories": [...],
    "fullMarkdown": "...",
    "categoryError": "...", // if category extraction failed
    "pdfProcessedAt": "ISO timestamp"
  }
  ```

#### Step 3.5: Return Response
- Returns JSON with:
  - `totalPages`, `pages[]`, `categories[]`, `fullMarkdown`
  - `savedPdfBucketKey`, `savedResultsBucketKey`
  - `categoryError` (if extraction failed)

---

## Phase 4: Frontend Display

After receiving backend response:
1. Sets `pdfData.value = data`
2. Sets `categories.value = data.categories`
3. Sets `hasSavedResults.value = true`
4. Stores `savedPdfBucketKey` and `savedResultsBucketKey` refs
5. Displays:
   - Category list (if any categories were found)
   - Page-by-page markdown preview
   - Processing status indicators

---

## Phase 5: Category Processing (On-Demand)

When user clicks on a category (e.g., "Clinical Notes", "Medication Records"):

### Frontend: `processCategory(categoryName)` (line 693-691)

1. Calls `POST /api/files/lists/process-category` with:
   ```json
   {
     "categoryName": "Clinical Notes",
     "resultsBucketKey": "{userId}/Lists/{filename}_results.json"
   }
   ```

### Backend: Process Category Endpoint (line 1396-1573)

#### Step 5.1: Load Saved Results
- Loads `_results.json` file from S3 using `resultsBucketKey`
- Parses JSON to get `fullMarkdown`, `pages`, `fileName`, etc.

#### Step 5.2: Check Cache
- Checks for existing list file: `{filename}_{categoryName}_list.json`
- If exists and not stale (PDF wasn't reprocessed after list creation), returns cached result

#### Step 5.3: Process Category

**For Clinical Notes:**
- Gets `ClinicalNotesClient` instance
- Deletes existing notes for this filename in OpenSearch
- Calls `extractIndividualClinicalNotes(fullMarkdown, pages, fileName)` to extract individual notes
- Bulk indexes to OpenSearch via `notesClient.indexNotesBulk()`
- Returns indexing stats: `{total, indexed, errors, deleted}`

**For Medication Records:**
- Calls `extractMedicationRecords()` (extracts, doesn't index to OpenSearch)
- Returns extraction stats: `{total, indexed, errors}`

#### Step 5.4: Save List File
- Saves processed list to: `{userId}/Lists/{filename}_{categoryName}_list.json`
- **Contains**:
  ```json
  {
    "categoryName": "...",
    "fileName": "...",
    "list": [...], // Array of individual items
    "indexed": {...}, // Indexing stats
    "processedAt": "ISO timestamp",
    "pdfProcessedAt": "ISO timestamp"
  }
  ```

#### Step 5.5: Return Response
- Returns JSON with:
  - `categoryName`, `list[]`, `indexed{}`, `processedAt`
  - `fromCache: true/false`

---

## Phase 6: Display Processed Items

After category processing completes:

1. Updates `categoryProcessingStatus[categoryName]` with indexing stats
2. Sets `currentCategoryDisplay.value = categoryName`
3. Sets `categoryItems.value = result.list`
4. Displays items with:
   - Formatting based on category type (Clinical Notes vs Medications)
   - Copy-to-clipboard functionality
   - Individual item details

---

## Key Points:

1. **Two-Step Process**: PDF extraction happens first, then category processing is on-demand
2. **Caching**: Results are saved to S3; list files are cached to avoid reprocessing
3. **Category Extraction**: Uses Private AI agent to identify markdown categories
4. **Indexing**: Clinical Notes are indexed to OpenSearch; Medication Records are just extracted
5. **Staleness Check**: List files are invalidated if PDF is reprocessed after list creation
6. **Error Handling**: Category extraction errors don't block PDF processing

This flow provides the foundation for understanding how to automate list creation during the provisioning process.
