# maia-cloud-user-app

Authenticated user portal for MAIA (Medical AI Assistant). Available at **https://maia.agropper.xyz**.

## What’s Included Today

### One-click provisioning
- Passkey registration notifies the admin automatically.
- The admin receives a provisioning link; clicking it provisioned new users end‑to‑end:
  - DigitalOcean agent creation, deployment and health check.
  - Spaces folder structure (root, archived, KB).
  - Agent API key generation and storage.
  - Workflow stages updated (`request_sent → approved → agent_named → agent_deployed`).

### Knowledge Base automation
- Users import PDFs directly into their account; text is extracted automatically.
- “Update and Index KB”:
  - Creates or syncs the DO Knowledge Base.
  - Registers the correct Spaces prefix as the data source.
  - Starts indexing and polls DO every 30 s until tokens/files are reported or timeout.
  - Auto-attaches the KB to the user’s agent.
  - Generates a fresh patient summary once indexing completes and stores it in Cloudant.
- Indexing state and file lists stay consistent through conflict-safe Cloudant updates.

### Deep-link guest access
- Share any saved chat via deep links.
- Guests join with a lightweight name/email form; sessions persist in Cloudant without affecting the owner’s passkey session.
- Deep-link users see the shared chat only, can request context actions (e.g., patient summary once allowed), and stay isolated from owner settings.

### Chat + File interface
- Streaming chat with multiple providers (DigitalOcean Private AI, Anthropic, OpenAI, Gemini, DeepSeek).
- PDFs can be viewed, paged, and parsed (selectable text layer preserved).
- “Save Locally” PDF exports retain chat formatting and markdown.

### Observability & Safety
- Sessions stored in Cloudant with `userId` or `deeplink_*` IDs for auditability.
- Authentication events logged to `maia_audit_log`.
- Environment-driven configuration (Cloudant, DO GenAI/Spaces, Resend email, etc.).

## Quick Start (local)

```bash
git clone https://github.com/agropper/maia-cloud-user-app.git
cd maia-cloud-user-app
npm install
cp .env.example .env   # fill in Cloudant, DO, Resend, etc.
npm run dev            # starts Vite on http://localhost:5173
npm run start          # (in another terminal) backend on http://localhost:3001
```

Health check:

```bash
curl http://localhost:3001/health
```

## Key Environment Variables

```
# Passkeys
PASSKEY_RPID=maia.agropper.xyz
PASSKEY_ORIGIN=https://maia.agropper.xyz

# Cloudant
CLOUDANT_URL=...
CLOUDANT_USERNAME=...
CLOUDANT_PASSWORD=...

# DigitalOcean GenAI & Spaces
DIGITALOCEAN_TOKEN=...
DO_REGION=tor1
DIGITALOCEAN_BUCKET=https://maia.tor1.digitaloceanspaces.com
DIGITALOCEAN_AWS_ACCESS*=
DO_DATABASE_ID=...  # OpenSearch database ID for knowledge bases

# OpenSearch for Clinical Notes (optional)
OPENSEARCH_ENDPOINT=https://your-cluster.region.opensearch.digitalocean.com
OPENSEARCH_USERNAME=...
OPENSEARCH_PASSWORD=...

# App + email
PORT=3001
PUBLIC_APP_URL=https://maia.agropper.xyz
RESEND_API_KEY=...
RESEND_FROM_EMAIL=...
RESEND_ADMIN_EMAIL=...

# Optional provider keys
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
```

The server will create `maia_sessions`, `maia_users`, and `maia_audit_log` automatically on startup.

## Architecture Notes

- **Cloudant session store** keeps both owner and deep-link guest sessions with rehydrate support.
- **DigitalOcean integrations**:
  - `lib-maia-do-client` for agents/KB/indexing APIs.
  - Agent provisioning waits for deployment endpoints before declaring success.
  - KB automation handles creation, data-source linkage, indexing poll, auto-attach, and summary.
- **Spaces file flow**:
  - Upload → root (`userId/`).
  - “Saved Files” dialog archives to `userId/archived/`.
  - KB selections move into `userId/<kbName>/`.
- **Background workers**:
  - Indexing poller with timeout.
  - Auto summary generation after indexing.
  - Conflict-safe KB state persistence (retries on 409s).

## Development Checklist

- [ ] Additional provider templates (OpenAI, Gemini, DeepSeek) with default configs.
- [ ] Expanded deep-link permissions (read-only summary preview, attachments).
- [ ] UI indicators for indexing progress per user.
- [ ] Publish shared libraries (`lib-maia-*`) to npm once stable.

---

MAIA user portal is actively deployed to DigitalOcean App Platform. Open issues and feature requests are welcome. 👍
