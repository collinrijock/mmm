# MMM — Meme Ranking Battle

A Tinder-style meme ranking SPA. Friends swipe left/right on memes and an ELO system ranks them to find the ultimate top meme.

## Setup

```bash
bun install
cp .env.example .env   # edit VITE_API_URL if needed
bun dev
```

## Environment

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | SC backend base URL (no trailing slash) | `http://localhost:51763` |

Production: set `VITE_API_URL` to `https://collinrijock.com` in Vercel env vars.

## Deploy

Deployed as a separate Vercel project. Point `mmm.collinrijock.com` DNS to this project.
