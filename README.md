# maia-cloud-user-app

Authenticated User app for MAIA (Medical AI Assistant) - `user.agropper.xyz`

## Purpose

Simplified, maintainable user-facing app with passkey authentication, chat interface, agent management, and knowledge base operations.

## Features

- **Passkey authentication**: Secure WebAuthn login
- **Chat interface**: Full chat with private AI agent
- **Knowledge base management**: Upload files, create KBs, manage documents
- **Agent management**: View and configure private AI agent
- **Clean architecture**: < 5,000 lines total, no debug logging

## Configuration

`.env`:
```
PASSKEY_RPID=user.agropper.xyz
PASSKEY_ORIGIN=https://user.agropper.xyz
DOMAIN=user.agropper.xyz
CLOUDANT_URL=https://...
DIGITALOCEAN_TOKEN=...
SPACES_KEY=...
RESEND_KEY=...
```

## Architecture

- **Frontend**: Vue 3 + Quasar + Vite
- **Backend**: Express.js minimal API server
- **Libraries**: Uses `lib-maia-do-client`, `lib-maia-cloudant`, `lib-maia-passkey`
- **Storage**: DigitalOcean Spaces (S3-compatible)
- **Database**: Cloudant (for user docs, sessions, logs)

## Development

### Setup
```bash
npm install
npm link ../lib-maia-do-client
npm link ../lib-maia-cloudant
npm link ../lib-maia-passkey
npm run dev
```

### Build
```bash
npm run build
npm start
```

## Status

🚧 In Progress - Initial structure only

