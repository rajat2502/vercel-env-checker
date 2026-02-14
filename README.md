# Vercel Environment Variable Value Checker

Search inside environment variable **values** across your Vercel projects. Find where specific connection strings, API keys, or URLs are being used.

## What it does

This tool searches **inside the actual values** of environment variables (not the names). For example:
- Find all env vars containing `postgres://`
- Find where `stripe.com` is used
- Search for specific API keys or tokens

## Installation

```bash
npm install
```

## Usage

Simply run:

```bash
npm run env-check
```

The tool will guide you through:

1. **Authentication** - Login with Vercel token (if not already logged in)
2. **Environment selection** - Choose: production, preview, development, or all
3. **Project selection** - Use arrow keys and space to select which projects to search
4. **Value search** - Enter the text to search for inside env values

## Example

```bash
$ npm run env-check

🚀 Vercel Environment Variable Value Checker

This tool searches INSIDE the values of environment variables

✅ Already authenticated

🌍 Select environment to check:

1. production - Production deployments
2. preview - Preview deployments
3. development - Development environment
4. all - All environments (default)

Enter choice (1-4) [4]: 1

✅ Will check production environment

📦 Fetching projects...

📋 Select Projects (Space to toggle, Enter to confirm, A to select all):

→ [✓] web-app
  [ ] api-service
  [✓] payment-portal
  [ ] marketing-site

2 project(s) selected

✅ Selected 2 project(s): web-app, payment-portal

Enter value to search for: postgres://

🔍 Searching for "postgres://" inside environment variable values...

🔍 Found 2 variable(s) (production) with values containing "postgres://":

📁 web-app:
┌─────────────────┬──────────────────────────────────────────┬────────────┐
│ Key             │ Value (partial)                          │ Target     │
├─────────────────┼──────────────────────────────────────────┼────────────┤
│ DATABASE_URL    │ postgres://user:pass@...com:5432/dbname  │ production │
└─────────────────┴──────────────────────────────────────────┴────────────┘

📁 payment-portal:
┌─────────────────┬──────────────────────────────────────────┬────────────┐
│ Key             │ Value (partial)                          │ Target     │
├─────────────────┼──────────────────────────────────────────┼────────────┤
│ DB_CONNECTION   │ postgres://admin:...xyz.com/production   │ production │
└─────────────────┴──────────────────────────────────────────┴────────────┘

⚠️  Note: Some values may be encrypted and not accessible via API

✅ Done!
```

## Controls

- **Space** - Toggle project selection
- **Enter** - Confirm selection and continue
- **A** - Select/deselect all projects
- **↑↓** - Navigate up/down
- **Ctrl+C** - Cancel

## Getting a Vercel Token

1. Go to https://vercel.com/account/tokens
2. Click "Create Token"
3. Copy the token
4. Paste it when prompted on first run

## Requirements

- Node.js 18.0.0 or higher
- Vercel account with API access

## License

ISC
