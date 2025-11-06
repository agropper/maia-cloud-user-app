

#### null
#### has_passkey
#### request_sent
#### approved
#### agent_named
#### agent_deployed
#### files_stored
#### kb_named
#### kb_indexed
#### kb_attached
#### to_be_removed
#### passkey_reset


<<<<<<<<<<<<<<<<<>>>>>>>>>>>>>>>>>>>

## Workflow Stage Assignment Proposal

This section proposes where each `workflowStage` value should be set in the codebase to track user progress through the MAIA system.

### Implementation Principles

1. **Set stages at key milestones** - Only update when a meaningful state change occurs
2. **Use clear, descriptive logic** - Each stage should represent a specific achievement
3. **Rely on careful code placement** - No explicit stage progression protection; stages progress forward through careful code organization
4. **Handle special states** - `passkey_reset` and `to_be_removed` can override normal progression

### Stage Assignments

#### 1. `null` (Initial State)
- **Location:** `server/routes/auth.js` - `app.post('/api/passkey/register')`
- **When:** When creating a new user document (before passkey registration)
- **Logic:** Set `workflowStage: null` (or omit field) in new user document
- **Current Code:** Already sets `workflowStage: 'no_request_yet'` - **CHANGE TO:** `workflowStage: null`

#### 2. `request_sent` (replaces `has_passkey`)
- **Location:** `server/routes/auth.js` - `app.post('/api/passkey/register-verify')`
- **When:** When provision token is generated and admin notification email is sent (after passkey verification)
- **Logic:** Set `workflowStage: 'request_sent'` to indicate user has registered and admin has been notified (can provision)
- **Implementation:** Set immediately after provision token is created, replacing any previous stage
- **Code:** Line ~65: `updatedUser.workflowStage = 'request_sent';` before `cloudant.saveDocument`
- **Note:** `request_sent` replaces `has_passkey` immediately - there is no separate `has_passkey` stage

#### 3. `approved`
- **Location:** `server/index.js` - `app.get('/api/admin/provision')`
- **When:** When admin clicks the provision link and provisioning starts
- **Logic:** Set `workflowStage: 'approved'` when token is validated and provisioning begins
- **Implementation:** Set before starting async provisioning process
- **Code:** Line ~447: `userDoc.workflowStage = 'approved'; await cloudant.saveDocument('maia_users', userDoc);` after token validation

#### 4. `agent_named`
- **Location:** `server/index.js` - `provisionUserAsync()` function
- **When:** After agent is successfully created (has UUID and name)
- **Logic:** Set `workflowStage: 'agent_named'` after `agentClient.create()` succeeds and agent UUID is available
- **Implementation:** Set immediately after agent creation is confirmed
- **Code:** Line ~630: `userDoc.workflowStage = 'agent_named'; await cloudant.saveDocument('maia_users', userDoc);` after `updateStatus('Agent created')`

#### 5. `agent_deployed`
- **Location:** `server/index.js` - `provisionUserAsync()` function
- **When:** After agent deployment status reaches `STATUS_RUNNING`
- **Logic:** Set `workflowStage: 'agent_deployed'` when deployment status is confirmed as `STATUS_RUNNING`
- **Implementation:** Set after deployment polling loop completes successfully
- **Code:** Line ~676: `userDoc.workflowStage = 'agent_deployed'; await cloudant.saveDocument('maia_users', userDoc);` after `updateStatus('Agent deployed')`

#### 6. `files_stored`
- **Location:** `server/index.js` - `app.post('/api/user-file-metadata')`
- **When:** Whenever files exist (checked on every file metadata update)
- **Logic:** Set `workflowStage: 'files_stored'` if `userDoc.files.length > 0` (whenever files exist)
- **Implementation:** Set whenever files array has items (not just on first file)
- **Code:** Line ~1013: `if (userDoc.files.length > 0) { userDoc.workflowStage = 'files_stored'; }` before `cloudant.saveDocument`

#### 8. `kb_named`
- **Location:** TBD - Future endpoint for KB creation/naming
- **When:** When a knowledge base is created and given a name
- **Logic:** Set `workflowStage: 'kb_named'` when KB creation/naming API is implemented
- **Current Code:** Not yet implemented
- **Future:** Will be set in KB creation endpoint

#### 9. `kb_indexed`
- **Location:** TBD - Future endpoint for KB indexing
- **When:** When a knowledge base indexing process completes
- **Logic:** Set `workflowStage: 'kb_indexed'` when KB indexing API is implemented and indexing completes
- **Current Code:** Not yet implemented
- **Future:** Will be set in KB indexing endpoint or callback

#### 10. `kb_attached`
- **Location:** TBD - Future endpoint for KB attachment to agent
- **When:** When a knowledge base is successfully attached to the user's agent
- **Logic:** Set `workflowStage: 'kb_attached'` when KB attachment API is implemented
- **Current Code:** Not yet implemented
- **Future:** Will be set in KB attachment endpoint

#### 11. `to_be_removed`
- **Location:** TBD - Future endpoint for user deletion/deactivation
- **When:** When admin or system marks a user for removal
- **Logic:** Set `workflowStage: 'to_be_removed'` when user deletion/deactivation endpoint is implemented
- **Current Code:** Not yet implemented
- **Future:** Will be set in user removal/deactivation endpoint

#### 12. `passkey_reset`
- **Location:** TBD - Future endpoint for passkey reset
- **When:** During the passkey reset process (temporary 1-hour state)
- **Logic:** 
  - Set `workflowStage: 'passkey_reset'` when admin clicks reset token (allows bypassing duplicate username check)
  - Store previous `workflowStage` value before setting to `passkey_reset`
  - After successful passkey reset, revert to previous `workflowStage` value (not `has_passkey`)
- **Current Code:** Not yet implemented
- **Future:** Will be set in passkey reset endpoint
- **Duration:** 1 hour (temporary state)

---

### Stage Progression Flow

```
[New User Registration]
    ↓
null (initial)
    ↓
request_sent (passkey verified, admin notified)
    ↓
approved (admin starts provisioning)
    ↓
agent_named (agent created)
    ↓
agent_deployed (agent running)
    ↓
files_stored (files exist)
    ↓
kb_named (KB created) [Future]
    ↓
kb_indexed (KB indexed) [Future]
    ↓
kb_attached (KB attached to agent) [Future]
```

**Special States:**
- `to_be_removed` - Can be set from any stage (user marked for deletion)
- `passkey_reset` - Temporary 1-hour state activated by admin token, allows bypassing duplicate username check, reverts to previous stage after reset

---

### Implementation Order

**Phase 1: Core Registration & Provisioning (✅ IMPLEMENTED)**
1. ✅ Update initial registration to use `null` instead of `'no_request_yet'`
2. ✅ Set `request_sent` when provision token is created (replaces `has_passkey`)
3. ✅ Set `approved` when provisioning starts
4. ✅ Set `agent_named` after agent creation
5. ✅ Set `agent_deployed` after deployment completes

**Phase 2: File Management (✅ IMPLEMENTED)**
6. ✅ Set `files_stored` whenever files exist (checked on file metadata updates)

**Phase 3: Future Features (Implement Later)**
8. `kb_named` - When KB creation is implemented
9. `kb_indexed` - When KB indexing is implemented
10. `kb_attached` - When KB attachment is implemented
11. `to_be_removed` - When user deletion is implemented
12. `passkey_reset` - When passkey reset is implemented

---

### Implementation Notes

1. **No explicit progression protection** - We rely on careful code placement to ensure stages progress forward. Each stage is set at the appropriate point in the workflow.

2. **Special states** - `to_be_removed` and `passkey_reset` can override normal progression:
   - `passkey_reset`: Temporary 1-hour state that must store previous stage and revert after reset
   - `to_be_removed`: Can be set from any stage

3. **Stage transitions** - Stages naturally progress in order:
   - `null` → `request_sent` → `approved` → `agent_named` → `agent_deployed` → `files_stored` → (future KB stages)

---

### Implementation Status

**✅ Completed (Stages 1-6):**
- ✅ `null` - Set during initial user registration
- ✅ `request_sent` - Set when provision token is created (replaces `has_passkey`)
- ✅ `approved` - Set when admin starts provisioning
- ✅ `agent_named` - Set after agent creation
- ✅ `agent_deployed` - Set when agent deployment reaches STATUS_RUNNING
- ✅ `files_stored` - Set whenever files exist

**📋 Future Implementation:**
- [ ] `kb_named` - When KB creation is implemented
- [ ] `kb_indexed` - When KB indexing is implemented
- [ ] `kb_attached` - When KB attachment is implemented
- [ ] `to_be_removed` - When user deletion is implemented
- [ ] `passkey_reset` - When passkey reset is implemented (must store/revert previous stage)

### Testing Checklist

- [x] New user registration sets `null` initially
- [x] Passkey verification sets `request_sent` (not `has_passkey`)
- [x] Admin provision click sets `approved`
- [x] Agent creation sets `agent_named`
- [x] Agent deployment sets `agent_deployed`
- [x] File upload sets `files_stored` whenever files exist
- [ ] Contextual tip displays correct workflowStage
- [ ] Future: `passkey_reset` stores and reverts previous stage correctly
