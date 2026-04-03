# Uncle Carter Pipeline — Web App

Your content production hub. Research, script, schedule, analyze — all connected, all in one place.

## Quick Setup (15 minutes)

### Step 1: Create Supabase Project (5 min)

1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Click **New Project**
3. Name it `uncle-carter` — choose a region close to you
4. Set a database password (save it somewhere)
5. Wait 2 minutes for it to spin up
6. Go to **SQL Editor** (left sidebar)
7. Paste the contents of `supabase-schema.sql` and click **Run**
8. Go to **Settings → API** — copy your **Project URL** and **anon public** key

### Step 2: Configure Environment (2 min)

1. Copy `.env.example` to `.env.local`:
   ```
   cp .env.example .env.local
   ```
2. Open `.env.local` in a text editor and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — your anon key
   - `ANTHROPIC_API_KEY` — your Claude API key from [console.anthropic.com](https://console.anthropic.com)
   - (Optional) Airtable keys if you want auto-sync

### Step 3: Install & Run (3 min)

Open Terminal, navigate to this folder, and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. That's it — you're running.

### Step 4: Deploy to Vercel (5 min)

1. Push this folder to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```
   Then create a repo on github.com and push.

2. Go to [vercel.com](https://vercel.com) and sign in with GitHub
3. Click **Import Project** → select your repo
4. Add your environment variables (same as .env.local)
5. Click **Deploy**
6. Your app is live at `your-project.vercel.app`
7. (Optional) Add your custom domain `pipeline.peekmedia.co`

## Features

| Tab | What it does |
|-----|-------------|
| **Pipeline** | Kanban view of all stories by stage. Advance, filter, search, bulk approve. |
| **Research** | Find NBA stories via Claude AI. Accept directly into pipeline. |
| **Script** | Generate scripts in English. One-click translate to FR/ES/PT. |
| **Calendar** | Weekly schedule. Assign stories to days. Smart variety suggestions. |
| **Analyze** | Log metrics + production variables. See what performs best. |

## Airtable Auto-Sync

When configured, every story automatically syncs to your Airtable base:
- New stories create records
- Status changes update records
- Scripts, translations, and metrics all sync

To set up:
1. Get your Airtable API key from [airtable.com/account](https://airtable.com/account)
2. Get your Base ID from the Airtable API docs page
3. Add both to `.env.local`
4. Make sure your Airtable table has matching field names (see `supabase-schema.sql` for reference)

## Mobile

The app works as a PWA (Progressive Web App). On your phone:
1. Open your deployed URL in Safari/Chrome
2. Tap "Add to Home Screen"
3. It runs like a native app — full screen, no browser bar

## Project Structure

```
src/
├── app/
│   ├── api/claude/route.js   ← Server-side Claude API proxy
│   ├── globals.css            ← Tailwind + custom styles
│   ├── layout.js              ← Root layout
│   └── page.js                ← Main app (ties all tabs together)
├── components/
│   ├── PipelineView.jsx       ← Pipeline tab
│   ├── ResearchView.jsx       ← Research tab
│   ├── ScriptView.jsx         ← Script + translation tab
│   ├── CalendarView.jsx       ← Calendar tab
│   ├── AnalyzeView.jsx        ← Analytics tab
│   └── DetailModal.jsx        ← Story detail modal
└── lib/
    ├── constants.js           ← Shared config, archetypes, prompts
    └── db.js                  ← Supabase client + Airtable sync
```
