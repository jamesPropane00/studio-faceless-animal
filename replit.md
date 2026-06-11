# Faceless Animal Studios — replit.md

## Overview

Faceless Animal Studios is a creative platform for artists, DJs, producers, gamers, visual creators, and businesses. It provides identity pages (at `facelessanimalstudios.com/yourname`), a creator network board, a supply store, and digital drops. The platform is based in Providence, Rhode Island.

The site is a **static HTML/CSS/JS website** with Supabase as the planned backend. Most pages are currently static HTML with clearly marked `[SUPABASE CONNECT]` hooks throughout the code indicating exactly where live database queries will replace static content. A React/Vite app stub exists under `artifacts/studio/` as a secondary workspace artifact.

Core pages:
- `index.html` — Homepage
- `about.html` — Studio info
- `network.html` — Creator network board
- `store.html` — Faceless Supply storefront
- `pricing.html` — Four-tier pricing (free, starter, pro, premium)
- `start.html` — Get started / intake form
- `free.html` — Free signup flow
- `paid.html` — Paid intake form
- `drops.html` — Digital drops
- `faq.html` — FAQ
- `thankyou.html` — Post-submission confirmation
- `admin/index.html` — Internal admin dashboard (noindex)
- `artists/djfacelessanimal.html` — Featured artist page (static)
- `artists/samplecreator.html` — Sample creator page template
- `business/samplebusiness.html` — Sample business page template
- `templates/artist.html` — Dynamic DJ/musician/producer page template (served at `/artist/[slug]`)
- `templates/creator.html` — Dynamic visual artist/gamer/writer page template (served at `/creator/[slug]`)
- `templates/business.html` — Dynamic business page template (served at `/business/[slug]`)

---

## User Preferences

Preferred communication style: Simple, everyday language.

---

## System Architecture

### Frontend — Static HTML + Vanilla JS

**Problem:** Needed a fast, deployable creative platform without complex build requirements.

**Solution:** Vanilla HTML/CSS/JS with ES modules. No framework on the main site. All pages share `assets/style.css` and `assets/script.js`.

**Design system:**
- Dark premium theme with gold (`#c9a96e`) accent color
- CSS custom properties (design tokens) for all colors, spacing, shadows
- Inter font via Google Fonts
- Mobile-first responsive layout with hamburger nav

**Key JS modules (ES modules, no bundler):**
- `assets/js/supabase-client.js` — Single shared Supabase client, reads from `window.__FAS_CONFIG`
- `assets/js/supabase-config.js` — Re-exports from supabase-client.js for backward compatibility
- `assets/js/creator-data.js` — Static data store (mirrors Supabase schema; swap exports for live queries)
- `assets/js/page-renderer.js` — Supabase-backed template engine; reads slug from URL path (`/creator/slug`), fetches `profiles JOIN pages`, hydrates `data-f`/`data-slot`/`data-section` targets
- `assets/js/board-feed.js` — Network board rendering (consumes creator-data.js)
- `assets/js/intake-form.js` — Handles `start.html` intake form submission
- `assets/js/free-signup.js` — Handles `free.html` free plan signup
- `assets/js/paid-intake.js` — Handles `paid.html` paid intake form
- `assets/js/services/submissions.js` — Supabase writes for submissions table + Storage uploads
- `assets/js/services/creators.js` — Supabase queries for profiles/pages tables
- `assets/js/services/board.js` — Supabase queries for board_posts table
- `assets/js/admin.js` — Admin dashboard module: auth, 6-tab data loader, action handlers
- `assets/js/env.js` — Auto-generated; exposes `window.__FAS_CONFIG` with Supabase credentials

### Environment / Credential Injection Pattern

**Problem:** Supabase credentials need to be available in the browser without hardcoding them in source.

**Solution:** `server.js` reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from environment variables at startup and writes `assets/js/env.js`, which sets `window.__FAS_CONFIG`. For Cloudflare Pages deployments, `scripts/generate-env.js` does the same thing as a build step without starting a server.

**Key:** `env.js` is gitignored and regenerated on every startup/deploy. HTML pages load it before any module scripts.

### Auto-Generated Creator Pages (Slug Routing)

**Problem:** Each creator needs a unique page URL but maintaining individual HTML files doesn't scale.

**Solution:** Three template HTML files handle all dynamic creator pages:
- `templates/artist.html` → served at `/artist/[slug]`
- `templates/creator.html` → served at `/creator/[slug]`
- `templates/business.html` → served at `/business/[slug]`

**Dev routing:** `server.js` detects the path pattern and serves the matching template HTML file while preserving the URL.

**Production routing:** `_redirects` (Cloudflare Pages) uses `200` rewrite rules:
```
/artist/*    /templates/artist.html    200
/creator/*   /templates/creator.html   200
/business/*  /templates/business.html  200
```

**Hydration:** `page-renderer.js` (ES module) reads the slug from `window.location.pathname`, queries `profiles JOIN pages` via Supabase where `slug = [slug]` and `page_status = 'live'`, then fills template targets:
- `data-f="fieldName"` — textContent injection
- `data-slot="slotName"` — innerHTML replaced with generated HTML
- `data-section="name"` — section shown/hidden based on data presence

**Data shape (profiles.metadata_json):** `accent_color`, `tags`, `marquee_words`, `stats`, `quick_info`, `works`, `services`, `hours`, `contact`

**Data shape (profiles.links_json):** `spotify`, `youtube`, `instagram`, `tiktok`, `soundcloud`, `twitch`, `website`, `email`, `phone`

**Loading/404 state:** Page body starts at `data-loading="true"` (opacity:0). A loading overlay shows until Supabase responds. If no live page matches the slug, a clean 404 state replaces the main content.

### Static → Supabase Migration Pattern

Every file has explicit `[SUPABASE CONNECT]` comments showing exactly what Supabase query replaces what static content. `creator-data.js` is designed so its exported functions and data shapes match the Supabase schema exactly — consuming files (`board-feed.js`, `page-renderer.js`) require zero changes when the backend goes live.

### Dev Server

`server.js` is a zero-dependency pure Node.js HTTP server that serves all static files from the project root. It handles env injection and MIME types. For production, Cloudflare Pages serves the static files directly.

### Admin Dashboard

`admin/index.html` is a private Supabase-connected admin dashboard (noindex). Accessible at `/admin/`.

**Auth:** Supabase email/password sign-in (create an account in Supabase Dashboard → Authentication → Users). After sign-in, the authenticated session allows full read/write access to all tables per the RLS policies in `supabase/migrations/007_admin_tables.sql`.

**6 tabs:**
1. **Profiles** — view all profiles, toggle active/inactive, toggle featured; filter by status
2. **Pages** — view all pages, change page_status (draft/submitted/live/paused)
3. **Submissions** — view free signups, paid intake, update requests; filter by type or status; change status
4. **Board Posts** — approve/unapprove posts, toggle featured, show/hide; filter by visibility
5. **Payments** — track payments (provider, amount, plan, status); requires running migration 007
6. **Notes** — internal admin notes linked to profiles; add/delete; requires running migration 007

**Setup required:**
- Run `supabase/migrations/007_admin_tables.sql` in Supabase SQL Editor to create `payments` and `admin_notes` tables and add admin RLS policies
- Create an admin user in Supabase Dashboard → Authentication → Users

### Supabase Migrations — Password Auth (012)

`supabase/migrations/012_password_auth.sql` adds the PBKDF2 password system.

**Why it has DROP FUNCTION IF EXISTS at the top (PART 0):** An older version of the platform used plaintext-password RPCs (`set_member_password(p_password, p_username)`, `verify_member_password(p_password, p_username)`). When `CREATE OR REPLACE` is run on a function with a *different number of arguments* (old had 2, new `set_member_password` has 3), PostgreSQL does not replace — it creates a second overload. PostgREST then cannot resolve calls by named parameters and returns HTTP 404. The explicit `DROP FUNCTION IF EXISTS` at the top of 012 removes any legacy overloads before the new functions are created, making the migration safe to re-run regardless of existing DB state.

**Test script:** `scripts/test-rpc-password.js` — runs a 4-step live integration test (create user → set password → verify correct hash → verify wrong hash → cleanup). Run with:
```
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/test-rpc-password.js
```

### Artifacts — React/Vite App Stub

`artifacts/studio/` contains a React + Vite + TypeScript + Tailwind + shadcn/ui app stub. It uses Wouter for routing and React Query for data fetching. This appears to be a Replit-scaffolded workspace and is not yet built out. The `package.json` dev script in the root delegates to this workspace via pnpm.

---

## External Dependencies

### Supabase (primary backend)
- **Purpose:** Database (Postgres), Storage (profile images), and planned Auth
- **Tables planned:** `profiles`, `pages`, `submissions`, `page_data`, `board_posts`, `creator_profiles`, `creator_categories`
- **Storage bucket:** `profile-images` (public bucket, per-username paths)
- **Client:** Loaded via ESM from `https://esm.sh/@supabase/supabase-js@2` (no npm install needed on the static site)
- **Credentials:** Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` as environment/secret variables. The server writes these to `assets/js/env.js` on startup.
- **RLS:** Row Level Security enforces data access; anon key is safe to expose publicly per Supabase design

### Google Fonts
- Inter font family loaded via Google Fonts CDN on all pages

### Cloudflare Pages (production hosting)
- Static site hosting; build command is `node scripts/generate-env.js`
- Environment variables set in CF Pages dashboard

### shadcn/ui + Radix UI (React stub only)
- Used in `artifacts/studio/src/components/ui/`
- Includes: Accordion, Alert, Avatar, Badge, Button, Calendar, Card, Carousel, Chart, Checkbox, Dialog, Drawer, and more

### Other React-side dependencies (artifacts/studio only)
- Vite + `@vitejs/plugin-react` — build tool
- Tailwind CSS v4 (`@tailwindcss/vite`)
- Wouter — client-side routing
- React Query (`@tanstack/react-query`) — server state management
- `embla-carousel-react` — carousel
- `react-day-picker` — calendar
- `recharts` — charts
- `vaul` — drawer
- `lucide-react` — icons
- `class-variance-authority`, `clsx`, `tailwind-merge` — styling utilities
- Replit-specific: `@replit/vite-plugin-runtime-error-modal`, `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner`