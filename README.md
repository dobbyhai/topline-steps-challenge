# Topline Steps Challenge

A tiny shared web app for a friendly team steps competition.

## What it does

- Teammates submit daily steps from any device
- Same person + same date updates that day
- Overall leaderboard ranks by average steps per submitted day
- Weekly leaderboard ranks by weekly total
- Export/import/reset tools for lightweight admin
- Shared data is stored in `data/entries.json`

## Run locally

```bash
npm start
```

Open:

```text
http://localhost:4180
```

## Public deployment recommendation

Because teammates will be on their own Wi‑Fi/cellular networks, this needs a public URL.

Use a small Node host that supports a persistent disk/volume, such as:

- Render Web Service + Persistent Disk
- Railway service + Volume
- Fly.io app + Volume

Avoid pure static/serverless hosting like Vercel or Netlify for this version because `data/entries.json` needs persistent writes.

## Render setup: simple path

1. Create a new Render **Web Service** from this folder/repo.
2. Runtime: Node
3. Build command:

```bash
npm install
```

4. Start command:

```bash
npm start
```

5. Add a persistent disk:
   - Mount path: `/opt/render/project/src/data`
   - Size: smallest available is fine

6. Deploy and share the Render URL with teammates.

## Environment variables

Optional for local hosting; most public hosts inject `PORT` automatically:

```bash
PORT=4180
HOST=0.0.0.0
```

Recommended for public deployment:

```bash
ADMIN_PIN=choose-a-private-pin
```

When `ADMIN_PIN` is set, import, reset, sample data, and delete actions require the PIN. Normal teammate submissions do not require a PIN.

## Admin notes

- Export data regularly during the challenge if you want a backup.
- Reset deletes all shared submissions from the deployed app.
- Normal submissions are open to anyone with the link. Admin actions require `ADMIN_PIN` if configured.

## If you want more guardrails later

Good next upgrades:

- Participant dropdown to avoid misspelled names
- Challenge start/end dates
- Separate public leaderboard and private admin page
- Google Sheets backend for easier manual auditing
