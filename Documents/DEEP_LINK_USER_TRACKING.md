# Deep Link User Tracking

## Overview

Deep link users are tracked directly on chat documents using a `deepLinkUserIds` array. This provides a simple, efficient way to track which deep link users have accessed each chat and which owner users have deep link users.

## Data Structure

### Chat Documents
- **Location**: `maia_chats` database
- **New Field**: `deepLinkUserIds` - Array of deep link user IDs who have accessed this chat
  - Example: `["john-doe-abc123", "jane-smith-xyz789"]`
  - Initialized as empty array `[]` when chat is created
  - Automatically populated when deep link users access the chat

### Deep Link Users
- **Location**: `maia_users` database
- **Identifier**: `isDeepLink: true`
- **Fields**:
  - `userId`: Unique identifier (e.g., `john-doe-abc123`)
  - `displayName`: User's display name
  - `deepLinkShareIds`: Array of shareIds for chats they've accessed
  - `email`: Optional email address
  - `createdAt`: When the deep link user was created

### Connection

```
Owner User (maia_users)
  ↓ owns
Chat (maia_chats)
  ↓ has deepLinkUserIds: ["deepLinkUser1", "deepLinkUser2"]
  ↓
Deep Link Users (maia_users with isDeepLink: true)
```

## Implementation

### Tracking Deep Link Users

When a deep link user accesses a chat, the `addDeepLinkUserToChat()` function:
1. Ensures the chat has a `deepLinkUserIds` array
2. Adds the deep link user ID if not already present
3. Saves the updated chat document

**Access points where tracking occurs:**
- `/api/deep-link/session` - When checking session
- `/api/deep-link/login` - When logging in/registering
- `/api/load-chat/:chatId` - When loading a chat by ID
- `/api/load-chat-by-share/:shareId` - When loading a chat by shareId

### Counting Deep Link Users per Owner

The admin endpoint (`/api/admin/users`) counts deep link users by:
1. Finding all chats owned by each user (via `patientOwner` or extracted from `_id`)
2. Collecting unique deep link user IDs from those chats' `deepLinkUserIds` arrays
3. Returning the count in `deepLinkUsersCount`

**Code location**: `server/index.js` line ~7018-7040

### Deleting Deep Link Users

When an owner user is deleted via the admin interface:
1. Find all chats owned by the user
2. Collect all unique deep link user IDs from those chats' `deepLinkUserIds` arrays
3. Delete each deep link user from `maia_users`
4. Delete the chat documents
5. Delete the owner user document

**Code location**: `server/index.js` line ~7227-7282

## Benefits

- **Simple**: Direct relationship stored on chat document
- **Efficient**: No need to traverse shareIds or build complex maps
- **Accurate**: Tracks actual access, not just registration
- **Scalable**: Works with any number of chats and deep link users

## Limitations

- **Multiple Owners**: If a deep link user accesses chats from multiple owners, they will be counted for each owner. When one owner is deleted, the deep link user will also be deleted even if they have access to other owners' chats. This is a known limitation and acceptable for the current use case.
