# KB Implementation Analysis: Current Practice

This document traces every DigitalOcean API call made between clicking the "UPDATE AND INDEX" button and detecting indexing completion.

## Flow Overview

1. **Frontend: Button Click** → POST to `/api/update-knowledge-base`
2. **Backend: File Moves** → S3 operations (not DO API)
3. **Backend: KB Management** → Multiple DO API calls
4. **Backend: Start Indexing** → DO API call
5. **Frontend: Poll Status** → Repeated DO API calls
6. **Frontend: Completion Detection** → Final status check
7. **Frontend: Post-Indexing** → Attach KB and generate summary

---

## Phase 1: Initial Request (Frontend → Backend)

### 1.1 Frontend Button Click
**Location:** `src/components/MyStuffDialog.vue:1033-1144`

**Action:** User clicks "Update and index knowledge base" button

**Frontend Code:**
- Calls `updateAndIndexKB()`
- Collects file changes (files to add/remove from KB)
- POSTs to `/api/update-knowledge-base`

**No DO API calls at this stage** - only frontend logic and HTTP request.

---

## Phase 2: Backend KB Update Endpoint (`/api/update-knowledge-base`)

**Location:** `server/index.js:2738-3260`

### 2.1 File Movement (S3 Operations)
**Location:** `server/index.js:2801-2844`

**Actions:**
- Move files between `userId/archived/` and `userId/{kbName}/` folders
- Uses AWS S3 SDK (DigitalOcean Spaces compatible)
- Operations: `CopyObjectCommand`, `DeleteObjectCommand`

**No DO API calls** - only S3/Spaces operations.

---

### 2.2 Step 1: Check if KB Exists in DO
**Location:** `server/index.js:2854-2879`

**DO API Call #1:** `GET /v2/gen-ai/knowledge_bases`
- **Method:** GET
- **Client Call:** `doClient.kb.list()`
- **Purpose:** List all KBs to find existing KB by name
- **Response:** Array of KB objects
- **Cached:** Result stored in `allKBsCache` variable

**DO API Call #2 (if KB found):** `GET /v2/gen-ai/knowledge_bases/{kbId}`
- **Method:** GET
- **Client Call:** `doClient.kb.get(kbId)`
- **Purpose:** Get full KB details including datasources
- **Response:** KB object with `uuid`, `name`, `datasources[]`, etc.
- **Stored:** Result stored in `kbDetails` variable

**Conditional:** Only if KB exists (found by name match)

---

### 2.3 Step 2: Create KB if Not Found
**Location:** `server/index.js:2881-3002`

**Conditional:** Only if `existingKbFound === false`

#### 2.3.1 Get Project ID (if not in env)
**Location:** `server/index.js:2895-2908`

**DO API Call #3 (conditional):** `GET /v2/gen-ai/agents` (or similar list endpoint)
- **Method:** GET (implied from `doClient.agent.list()`)
- **Client Call:** `doClient.agent.list()`
- **Purpose:** Get list of agents to extract `project_id`
- **Conditional:** Only if `DO_PROJECT_ID` env var is not set or invalid UUID

**DO API Call #4 (conditional):** `GET /v2/gen-ai/agents/{agentId}`
- **Method:** GET
- **Client Call:** `doClient.agent.get(agents[0].uuid)`
- **Purpose:** Get agent details to extract `project_id`
- **Conditional:** Only if agent list returned results

#### 2.3.2 Get Database ID and Embedding Model ID (if not in env)
**Location:** `server/index.js:2910-2952`

**DO API Call #5 (conditional):** `GET /v2/gen-ai/knowledge_bases`
- **Method:** GET
- **Client Call:** `doClient.kb.list()` (if `allKBsCache` is empty)
- **Purpose:** Get list of existing KBs to extract database/embedding IDs
- **Conditional:** Only if `allKBsCache` is empty/null

**DO API Call #6 (conditional):** `GET /v2/gen-ai/knowledge_bases/{kbId}`
- **Method:** GET
- **Client Call:** `doClient.kb.get(allKBsCache[0].uuid)` or use cached `kbDetails`
- **Purpose:** Get KB details to extract `database_id` and `embedding_model_uuid`
- **Conditional:** Only if we need to extract IDs and don't have cached KB details

#### 2.3.3 Create New KB
**Location:** `server/index.js:2970-3001`

**DO API Call #7:** `POST /v2/gen-ai/knowledge_bases`
- **Method:** POST
- **Client Call:** `doClient.kb.create(kbCreateOptions)`
- **Request Body:**
  ```json
  {
    "name": "sun17-kb-20251106728986",
    "description": "Knowledge base for sun17",
    "project_id": "uuid",
    "database_id": "uuid",
    "embedding_model_uuid": "uuid",
    "region": "tor1",
    "datasources": [{
      "spaces_data_source": {
        "bucket_name": "maia",
        "item_path": "sun17/sun17-kb-20251106728986/",
        "region": "tor1"
      }
    }]
  }
  ```
- **Response:** KB object with `uuid`, `name`, etc.
- **Note:** When KB is created with datasource, DigitalOcean **automatically starts indexing** (but we don't capture the job ID from this response)

**Stored:** `kbId = kbResult.uuid`, `kbDetails = kbResult`

---

### 2.4 Step 3: Ensure KB Data Source Points to Correct Path
**Location:** `server/index.js:3004-3124`

**Conditional Logic:**
- If KB has datasources: Check if path matches expected path
- If path doesn't match: Delete old datasources, add new one
- If no datasources: Add new datasource

#### 2.4.1 Delete Old Data Sources (if path changed)
**Location:** `server/index.js:3018-3024`

**DO API Call #8 (conditional, per datasource):** `DELETE /v2/gen-ai/knowledge_bases/{kbId}/data_sources/{dataSourceId}`
- **Method:** DELETE
- **Client Call:** `doClient.kb.deleteDataSource(kbId, ds.uuid)`
- **Purpose:** Remove old datasource(s) with incorrect path
- **Conditional:** Only if path doesn't match expected path
- **Repeats:** Once per existing datasource

#### 2.4.2 Add New Data Source (if path changed or no datasource)
**Location:** `server/index.js:3027-3031` or `3080-3084`

**DO API Call #9:** `POST /v2/gen-ai/knowledge_bases/{kbId}/data_sources`
- **Method:** POST
- **Client Call:** `doClient.kb.addDataSource(kbId, {...})`
- **Request Body:**
  ```json
  {
    "spaces_data_source": {
      "bucket_name": "maia",
      "item_path": "sun17/sun17-kb-20251106728986/",
      "region": "tor1"
    }
  }
  ```
- **Response:** Data source object with `knowledge_base_data_source.uuid`
- **Conditional:** Only if path changed or no datasource exists
- **Note:** UUID extracted from response, or fallback to refresh KB details

#### 2.4.3 Refresh KB Details (fallback only)
**Location:** `server/index.js:3056-3061` or `3108-3114`

**DO API Call #10 (conditional):** `GET /v2/gen-ai/knowledge_bases/{kbId}`
- **Method:** GET
- **Client Call:** `doClient.kb.get(kbId)`
- **Purpose:** Get updated KB details to extract datasource UUID
- **Conditional:** Only if datasource UUID not in `addDataSource` response
- **Fallback:** Used when UUID extraction from response fails

---

### 2.5 Step 4: Start Indexing Job
**Location:** `server/index.js:3126-3216`

#### 2.5.1 Attempt to Start Indexing
**Location:** `server/index.js:3138-3157`

**DO API Call #11:** `POST /v2/gen-ai/indexing_jobs`
- **Method:** POST
- **Client Call:** `doClient.indexing.startGlobal(kbId, dataSourceUuid)`
- **Request Body:**
  ```json
  {
    "knowledge_base_uuid": "kb-uuid",
    "data_source_uuids": ["datasource-uuid"]
  }
  ```
- **Response:** Indexing job object with `uuid`, `status`, etc.
- **Job ID Extraction:** Checks multiple response formats:
  - `indexingJob.uuid`
  - `indexingJob.id`
  - `indexingJob.indexing_job?.uuid`
  - `indexingJob.indexing_job?.id`
  - `indexingJob.job?.uuid`
  - `indexingJob.job?.id`

#### 2.5.2 Handle "Already Running" Error
**Location:** `server/index.js:3159-3206`

**If Error:** "already has an indexing job running"

**DO API Call #12 (conditional):** `GET /v2/gen-ai/indexing_jobs/{jobId}`
- **Method:** GET
- **Client Call:** `doClient.indexing.getStatus(userDoc.kbLastIndexingJobId)`
- **Purpose:** Verify existing job ID from user document is still running
- **Conditional:** Only if `userDoc.kbLastIndexingJobId` exists
- **Checks:** Job status is `INDEX_JOB_STATUS_PENDING` or `INDEX_JOB_STATUS_RUNNING`

**DO API Call #13 (conditional):** `GET /v2/gen-ai/knowledge_bases/{kbId}`
- **Method:** GET
- **Client Call:** `doClient.kb.get(kbId)`
- **Purpose:** Try to find indexing job ID from KB details
- **Conditional:** Only if `userDoc.kbLastIndexingJobId` doesn't exist or is invalid
- **Result:** Currently doesn't find job ID (KB details don't contain it)
- **Note:** This is where we should use `GET /v2/gen-ai/knowledge_bases/{kbId}/indexing_jobs` but we don't

**If no job ID found:** Returns 400 error with `INDEXING_ALREADY_RUNNING`

---

### 2.6 Step 5: Update User Document
**Location:** `server/index.js:3218-3251`

**No DO API calls** - only Cloudant database update.

**Response to Frontend:**
```json
{
  "success": true,
  "message": "Knowledge base updated, indexing started",
  "jobId": "job-uuid",
  "kbId": "kb-uuid",
  "filesInKB": ["path/to/file1.pdf"],
  "phase": "indexing_started"
}
```

---

## Phase 3: Frontend Polling Loop

**Location:** `src/components/MyStuffDialog.vue:1164-1275`

**Initialization:** Frontend calls `pollIndexingProgress(jobId)`

**Polling Interval:** Every 10 seconds (or 2 seconds - need to verify)

**Polling Duration:** Until completion or timeout (30 minutes)

### 3.1 Each Polling Cycle
**Location:** `src/components/MyStuffDialog.vue:1176-1233`

**Frontend Request:** `GET /api/kb-indexing-status/{jobId}?userId={userId}`

**Backend Endpoint:** `server/index.js:3262-3461`

#### 3.1.1 Get Job Status
**Location:** `server/index.js:3296-3316`

**DO API Call #14 (per poll):** `GET /v2/gen-ai/indexing_jobs/{jobId}`
- **Method:** GET
- **Client Call:** `doClient.indexing.getStatus(jobId)`
- **Purpose:** Get current status of indexing job
- **Response:** Job object with `status`, `progress`, `error`, etc.
- **Status Values:**
  - `INDEX_JOB_STATUS_PENDING`
  - `INDEX_JOB_STATUS_RUNNING`
  - `INDEX_JOB_STATUS_COMPLETED`
  - `INDEX_JOB_STATUS_FAILED`
- **Frequency:** Called every polling cycle (every 10 seconds)

#### 3.1.2 Get KB Details (for token count)
**Location:** `server/index.js:3318-3328`

**DO API Call #15 (per poll):** `GET /v2/gen-ai/knowledge_bases/{kbId}`
- **Method:** GET
- **Client Call:** `doClient.kb.get(userDoc.kbId)`
- **Purpose:** Get KB details for token count and name
- **Response:** KB object with `total_tokens`, `token_count`, `tokens`, `name`
- **Frequency:** Called every polling cycle (every 10 seconds)

#### 3.1.3 Update User Document (on completion)
**Location:** `server/index.js:3352-3421`

**No DO API calls** - only Cloudant database update when `status === 'INDEX_JOB_STATUS_COMPLETED'`

**Response to Frontend:**
```json
{
  "success": true,
  "phase": "complete",
  "status": "INDEX_JOB_STATUS_COMPLETED",
  "kb": "sun17-kb-20251106728986",
  "tokens": "125000",
  "filesIndexed": 2,
  "completed": true,
  "progress": 1.0,
  "kbIndexedFiles": ["sun17/sun17-kb-20251106728986/file1.pdf"]
}
```

---

## Phase 4: Frontend Completion Detection

**Location:** `src/components/MyStuffDialog.vue:1232-1275`

**Completion Check:** `result.completed || result.phase === 'complete' || result.status === 'INDEX_JOB_STATUS_COMPLETED'`

**No additional DO API calls** - completion detected from polling response.

**Actions on Completion:**
1. Clear polling interval
2. Update UI status
3. Reload agent info (includes KB info)
4. Call `attachKBAndGenerateSummary()`

---

## Phase 5: Post-Indexing Actions

### 5.1 Attach KB to Agent
**Location:** `src/components/MyStuffDialog.vue:1368-1450`

**Frontend Request:** `POST /api/attach-kb-to-agent`

**Backend Endpoint:** `server/index.js:3676-3750`

#### 5.1.1 Attach KB
**Location:** `server/index.js:3717`

**DO API Call #16:** `POST /v2/gen-ai/agents/{agentId}/knowledge_bases/{kbId}` (or similar)
- **Method:** POST (implied from `doClient.agent.attachKB`)
- **Client Call:** `doClient.agent.attachKB(userDoc.assignedAgentId, userDoc.kbId)`
- **Purpose:** Attach KB to agent so agent can use it for queries
- **Response:** Success/failure response
- **Error Handling:** If already attached (409), treats as success

---

### 5.2 Generate Patient Summary
**Location:** `src/components/MyStuffDialog.vue:1402-1429`

**Frontend Request:** `POST /api/generate-patient-summary`

**Backend Endpoint:** `server/index.js:3752-3820`

#### 5.2.1 Generate Summary via Agent
**Location:** `server/index.js:3796-3802`

**DO API Call #17:** `POST {agentEndpoint}/api/v1/chat/completions`
- **Method:** POST
- **Client Call:** `agentProvider.chat({...})` via DigitalOceanProvider
- **Purpose:** Use the agent (with attached KB) to generate patient summary
- **Request Body:**
  ```json
  {
    "messages": [{
      "role": "user",
      "content": "Please generate a comprehensive patient summary..."
    }],
    "model": "openai-gpt-oss-120b"
  }
  ```
- **Response:** Chat completion with generated summary text
- **Note:** This is an agent API call, not a direct GenAI Platform API call

---

## Summary: Total DO API Calls

### Typical Flow (KB already exists, no errors):
1. `GET /v2/gen-ai/knowledge_bases` - List KBs
2. `GET /v2/gen-ai/knowledge_bases/{kbId}` - Get KB details
3. `GET /v2/gen-ai/knowledge_bases/{kbId}` - Refresh KB details (if datasource path changed)
4. `DELETE /v2/gen-ai/knowledge_bases/{kbId}/data_sources/{dsId}` - Delete old datasource (if path changed)
5. `POST /v2/gen-ai/knowledge_bases/{kbId}/data_sources` - Add new datasource (if path changed)
6. `POST /v2/gen-ai/indexing_jobs` - Start indexing
7. `GET /v2/gen-ai/indexing_jobs/{jobId}` - Poll status (repeated every 10s)
8. `GET /v2/gen-ai/knowledge_bases/{kbId}` - Get KB details for tokens (repeated every 10s)
9. `POST /v2/gen-ai/agents/{agentId}/knowledge_bases/{kbId}` - Attach KB to agent
10. `POST {agentEndpoint}/api/v1/chat/completions` - Generate patient summary

**Total for polling (8 minutes at 10s intervals = 48 polls):**
- 48 × `GET /v2/gen-ai/indexing_jobs/{jobId}`
- 48 × `GET /v2/gen-ai/knowledge_bases/{kbId}`

**Grand Total: ~110+ DO API calls for a typical successful flow**

### New KB Creation Flow:
Adds 2-4 additional calls:
- `GET /v2/gen-ai/agents` (if project ID needed)
- `GET /v2/gen-ai/agents/{agentId}` (if project ID needed)
- `GET /v2/gen-ai/knowledge_bases` (if IDs needed from existing KBs)
- `POST /v2/gen-ai/knowledge_bases` - Create new KB

### Error Handling Flow ("Already Running"):
- Adds 1-2 calls:
  - `GET /v2/gen-ai/indexing_jobs/{jobId}` (verify existing job)
  - `GET /v2/gen-ai/knowledge_bases/{kbId}` (try to find job ID - doesn't work)

---

## Critical Issues Identified

### Issue 1: Missing API Call
**Problem:** When KB is created with datasource, DigitalOcean automatically starts indexing, but we don't capture the job ID.

**Missing Call:** `GET /v2/gen-ai/knowledge_bases/{kbId}/indexing_jobs`
- **Should be used:** After KB creation to find auto-started indexing job
- **Should be used:** When "already running" error occurs to find active job
- **Current Status:** Not implemented in client, not called anywhere

### Issue 2: Inefficient Polling
**Problem:** Every polling cycle calls both:
- `GET /v2/gen-ai/indexing_jobs/{jobId}` (needed for status)
- `GET /v2/gen-ai/knowledge_bases/{kbId}` (only needed for token count)

**Impact:** Doubles the number of API calls during polling (48 → 96 calls for 8-minute indexing)

### Issue 3: No Job ID Discovery
**Problem:** When "already running" error occurs, we try to get job ID from:
1. `userDoc.kbLastIndexingJobId` (might not exist)
2. KB details (doesn't contain job ID)

**Missing:** We never call `GET /v2/gen-ai/knowledge_bases/{kbId}/indexing_jobs` to list active jobs

### Issue 4: KB Creation Auto-Indexing Not Handled
**Problem:** When `POST /v2/gen-ai/knowledge_bases` creates a KB with datasource, DigitalOcean automatically starts indexing, but:
- We don't check the KB creation response for job ID
- We don't query the KB's indexing jobs list after creation
- We proceed to try starting indexing again, causing "already running" error

---

## Recommendations

1. **Implement `listIndexingJobsForKB(kbId)` method** in `lib/do-client/indexing.js`
2. **Call this method** after KB creation to find auto-started job
3. **Call this method** when "already running" error occurs
4. **Reduce polling frequency** for KB details (only poll every 30s or on completion)
5. **Check KB creation response** for indexing job information

