# How It Works

This guide explains how `vercel-env-checker` works under the hood.

## Overview

The tool uses the [Vercel API](https://vercel.com/docs/rest-api) to fetch environment variables from your projects and searches for specific text within their values.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    vercel-env-checker                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────┐   │
│  │   CLI    │───▶│  Index   │───▶│  VercelAPI       │   │
│  │ (bin/)   │    │(src/)    │    │  (vercel-api.ts) │   │
│  └──────────┘    └──────────┘    └────────┬─────────┘   │
│                                            │             │
│  ┌──────────┐    ┌──────────┐             │             │
│  │   run.ts │───▶│  Config  │◀────────────┘             │
│  │(wizard)  │    │(config.ts)                           │
│  └──────────┘    └──────────────────────────────────────┘
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Components

### 1. CLI (`bin/cli.ts`)
Command-line interface using [Commander.js](https://www.npmjs.com/package/commander). Provides commands:
- `login` - Authenticate with Vercel
- `logout` - Clear credentials
- `check-value` / `val` - Search env var values
- `run` - Interactive wizard

### 2. Core (`src/index.ts`)
Main application logic:
- Authentication handling
- Project fetching and caching
- Value search with concurrency control
- Results formatting with tables

### 3. Vercel API (`src/vercel-api.ts`)
HTTP client for Vercel API:
- Token validation
- Project listing
- Environment variable retrieval

### 4. Config (`src/config.ts`)
Local storage:
- Token management
- Cache handling
- Config file at `~/.vercel-env-checker/`

### 5. Interactive Wizard (`run.ts`)
Step-by-step CLI with:
- Keyboard navigation (arrow keys, Space, Enter)
- Project selection UI
- Environment selection

## API Endpoints Used

The tool uses these Vercel API endpoints:

| Endpoint | Purpose |
|----------|---------|
| `GET /v6/user` | Validate token |
| `GET /v6/deployments` | List projects |
| `GET /v6/projects/{id}/env` | Get environment variables |

## Rate Limiting

To avoid hitting Vercel's API limits:

- **Concurrency**: Max 5 parallel requests
- **Rate**: 100ms delay between requests (~10 req/sec)
- **Retries**: 3 attempts with exponential backoff

## Caching Strategy

| Data | Duration | Notes |
|------|----------|-------|
| Project list | 1 hour | Stable, rarely changes |
| Env variables | 5 minutes | Raw data only |

**Security**: Decrypted/sensitive values are **never** cached.

## Data Flow

```
1. User provides query (e.g., "postgres://")
       │
       ▼
2. Fetch all projects from Vercel API
       │
       ▼
3. For each project (with concurrency limit):
   - Fetch env variables
   - Search for query in values
       │
       ▼
4. Display results in formatted table
```

## Security Considerations

1. **Token Storage**: Stored locally in plain JSON
2. **No Cloud Storage**: All data stays on your machine
3. **No Caching of Secrets**: Decrypted values never cached
4. **HTTPS**: All API calls use HTTPS

## Error Handling

- Invalid tokens → Clear error message
- Rate limited → Automatic retry with backoff
- Network errors → Graceful degradation, skip failed projects

## Extending

To add new commands:

1. Add command to `bin/cli.ts` using Commander
2. Implement logic in `src/index.ts`
3. Add tests if needed
