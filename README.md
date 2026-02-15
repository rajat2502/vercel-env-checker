# Vercel Environment Variable Value Checker

Search within environment variable **values** across your Vercel projects. Find where specific connection strings, API keys, or URLs are being used.

## Installation

```bash
npm install -g vercel-env-checker
```

## Quick Start

```bash
# Run the interactive wizard
vecw

# Or use the CLI with commands
vec login -t YOUR_TOKEN
vec val "postgres://"
vec run
```

## Commands

| Command | Description |
|---------|-------------|
| `vec login -t <token>` | Authenticate with Vercel |
| `vec logout` | Clear stored authentication |
| `vec val <query>` | Search env var values (alias: `check-value`) |
| `vec run` | Run interactive step-by-step wizard |
| `vecw` | Shortcut for interactive wizard |

## Examples

```bash
# Authenticate
vec login -t your_vercel_token

# Search for postgres connections
vec val "postgres://"

# Search in production only
vec val "stripe.com" --target production

# Run interactive wizard
vecw
```

The interactive wizard guides you through:
1. **Authentication** — Log in with your Vercel token
2. **Environment Selection** — Choose: production, preview, development, or all
3. **Project Selection** — Use arrow keys and Space to select projects
4. **Value Search** — Enter text to search within env var values

## Getting a Vercel Token

1. Navigate to https://vercel.com/account/tokens
2. Click **Create Token**
3. Copy the generated token

## Requirements

- Node.js 18.0.0 or higher
- Vercel account with API access

## Security

- Token stored locally at `~/.vercel-env-checker/config.json`
- Or use `VERCEL_TOKEN` environment variable
- Decrypted values are never cached

## License

ISC
