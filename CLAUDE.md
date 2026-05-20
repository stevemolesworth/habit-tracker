# Chicken Check-In (CCI) — Project Reference

## 1. What is Chicken Check-In?

Chicken Check-In (CCI) is a private, single-user daily habit and wellbeing tracker. It prompts the user to complete two structured check-ins per day — one in the morning and one in the evening — capturing mood, sleep, exercise, alcohol, focus, mindfulness, behaviours, supplements, and weather conditions.

The app is built for personal use and is not a multi-tenant or public-facing product. All data belongs to one person.

### USPs

- **Dual check-in model** — Morning focuses on sleep quality and setting intent; evening focuses on behaviours, focus, alcohol, and reflection. This gives a richer picture than a single daily entry.
- **Weather correlation** — Weather data (postcode-based) is fetched at check-in time and stored alongside the submission, enabling future analysis of mood/behaviour vs. weather conditions.
- **Historical data entry** — Past dates can be filled in via the calendar, with historical weather data automatically fetched from the archive API.
- **NHS design system** — Clean, accessible UI using the NHS Frontend design system. Familiar to UK users, built for readability and form usability.
- **No login friction** — Single-user, no auth. Direct access, no accounts.
- **Lightweight and fast** — No framework, no bundler, no build step. Vanilla JS ES modules served as static files.

---

## 2. Features and Functionality

### Check-In Pages (`/`, `/?type=morning`, `/?type=evening`)

- **Time-based type selection** — Defaults to morning before 17:00 London time, evening after. Overridable via `?type=` param.
- **Past date entry** — Accessed via calendar (`?date=YYYY-MM-DD`). Pre-fills form if a record already exists for that date/type.
- **Already submitted banner** — NHS warning card shown when editing an existing record. Submit button disabled until a change is made (dirty state tracking).
- **Navigation guard** — Modal prompt if user tries to leave with unsaved changes (link interception, back button, tab close).
- **Weather widget** — Right-hand column showing a table of 2-hourly temperatures and conditions. First row is bold **Average** temp. Uses default postcode from Settings, or the stored postcode from the existing record.
- **Loading spinner** — Shown while existing record and supplements load.
- **Delete** — Delete button (with confirm modal) shown only when an existing record is loaded.

#### Morning fields
- Bedtime (previous night), Wake time
- Sleep quality (Bad / Average / Good)
- Overall mood (1–5)
- Notes ("What would make today good?")
- Supplements (dynamic, configured in Settings)
- Weather

#### Evening fields
- Overall mood (1–5)
- Focus — Financial admin (1–5)
- Focus — Consulting (1–5)
- Focus — Opiner (1–5)
- Exercise (checkbox + type checkboxes: Running, Cycling, Walking, Strength)
- Alcohol — Spirits, Beer, Wine (units, numeric inputs)
- Mindfulness — Meditation, Yoga (checkboxes)
- Supplements
- Outside time (checkbox)
- Avoided social media (checkbox)
- Avoided p... 🍑 (checkbox, stored as field `p`)
- Didn't m... 🍆💦 (checkbox, stored as field `m`)
- Had s... 🎆 (checkbox, stored as field `s`)
- Notes ("What made today good? Anything you'd like to achieve tomorrow?")
- Weather

### Confirmation Page (`/confirmation.html`)

- Random celebratory heading (10 messages: "Well done!", "Nailed it!", etc.)
- Status message showing date/period of the saved check-in
- Mood card showing current rating and delta vs. previous check-in (up/down/same, with colour)
- Links to edit the check-in or view reports

### Calendar Page (`/calendar.html`)

- Monthly grid view, navigable by prev/next month
- Days with check-ins show M (morning) and/or E (evening) badges
- All past and today's days are clickable
- Clicking a day opens a detail panel showing existing check-ins with edit links, plus "Add morning/evening check-in" buttons for any missing period

### Edit Page (`/edit.html?id=:id`)

- Loads existing check-in by ID
- Two-column layout: form left, stored weather snapshot right
- Heading shows check-in type and date (e.g. "Morning check-in / Tuesday, 19 May 2026")
- Back link to calendar
- Delete button with confirm modal (redirects to calendar on success)
- Weather column shows stored snapshot or "No weather data recorded"
- Loading spinner while data fetches

### Reports Page (`/reports.html`)

- Date range presets: **This week**, **Last week**, **This month**, **Last month**, **Date range** (reveals from/to inputs)
- All chart data points and habit dots are clickable links to the edit page for that day

**Charts (Chart.js v4.4.2):**
- **Mood** — Smooth curved line (tension 0.4, spans gaps), y-axis 0.5–5.5 with padding
- **Sleep timeline** — Floating bar chart (bedtime → wake time), coloured by sleep quality
- **Sleep hours** — Line chart
- **Focus** — Grouped vertical bars per day (Financial, Consulting, Opiner)
- **Alcohol** — Stacked bar per day (Beer amber, Wine burgundy, Spirits NHS blue)

**Habits & Behaviours:**
- Dot rows for: Exercise, Meditation, Yoga, Supplements (dynamic), Outside, Avoided social media, Avoided p..., Didn't m..., Had s...
- Green dot = yes, grey placeholder = no/no data (only "yes" is plotted visually)

### Settings Page (`/settings.html`)

- **Location** — Default postcode for weather widget
- **Supplements** — Add/remove supplements that appear as checkboxes on every check-in
- **Export data** — Download all check-ins as CSV or JSON
- **Delete data** — Delete all check-ins within a date range (with confirm modal showing count deleted)

---

## 3. Tech Stack

### Frontend

- **Vanilla JavaScript ES modules** — No framework, no bundler, no build step
- **NHS Frontend design system v10.4.2** — Loaded from CDN (`cdn.jsdelivr.net`). Provides all UI components: buttons, forms, cards, tables, error summaries, etc.
- **Custom CSS** (`public/app.css`) — Overrides and additions: global header, loading spinner, calendar grid, bool-dot rows, active preset button style
- **Chart.js v4.4.2** — Loaded from CDN, used only on reports page
- **Static HTML files** — One per page, no templating

### Backend

- **Netlify Serverless Functions** — All API endpoints are ES module-format Netlify functions in `netlify/functions/`
- **No build step** — `netlify.toml` sets `command = "echo 'No build step'"`, `publish = "public"`, `functions = "netlify/functions"`
- **esbuild** — Used by Netlify to bundle functions (`node_bundler = "esbuild"`)
- **URL routing** — `/api/checkin/:id` redirected to `checkin-by-id` function; all other `/api/*` routed via wildcard splat

### Database

- **Supabase (PostgreSQL)** — Accessed via `@supabase/supabase-js` v2 from within Netlify functions
- **Credentials** — `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` environment variables set in Netlify dashboard

### External APIs (browser-direct, no keys required)

- **postcodes.io** — Converts UK postcode to lat/lng: `GET https://api.postcodes.io/postcodes/{postcode}`
- **Open-Meteo forecast** — Current + hourly forecast, and past dates ≤7 days old: `https://api.open-meteo.com/v1/forecast`
- **Open-Meteo archive** — Historical weather for dates >7 days ago: `https://archive-api.open-meteo.com/v1/archive` (note: 2–5 day lag)

### Key Files

| File | Purpose |
|---|---|
| `public/index.html` / `checkin.js` | Morning/evening check-in form |
| `public/edit.html` / `edit.js` | Edit existing check-in by ID |
| `public/calendar.html` / `calendar.js` | Monthly calendar view |
| `public/reports.html` / `reports.js` | Charts and habit dot report |
| `public/confirmation.html` / `confirmation.js` | Post-submit confirmation |
| `public/settings.html` / `settings.js` | App configuration |
| `public/weather.js` | Weather fetch + table rendering |
| `public/api.js` | All frontend API calls (single `request()` helper) |
| `public/app.css` | Custom styles on top of NHS design system |
| `netlify/functions/checkin.js` | POST new check-in |
| `netlify/functions/checkin-by-id.js` | GET / PUT / DELETE check-in by ID |
| `netlify/functions/checkins.js` | GET check-ins list (by month) |
| `netlify/functions/today-checkin.js` | GET check-in for today by type+date |
| `netlify/functions/report.js` | GET check-ins for a date range |
| `netlify/functions/supplements.js` | GET / POST / DELETE supplements |
| `netlify/functions/weights.js` | GET / PUT app config (default postcode) |
| `netlify/functions/export.js` | GET full data export (CSV or JSON) |
| `netlify/functions/delete-range.js` | DELETE check-ins within date range |
| `netlify/functions/_shared/supabase.js` | Shared Supabase client |

### Database Schema (key columns)

**`check_ins` table**
- `id` (uuid), `check_in_date` (date), `check_in_type` (text: morning/evening), `submitted_at` (timestamptz)
- `global_mood`, `sleep_quality`, `focus_financial`, `focus_consulting`, `focus_opiner` (integer 1–5)
- `bedtime`, `wake_time` (time), `hours_slept` (numeric)
- `exercised` (boolean), `exercise_types` (text[])
- `alcohol_spirits`, `alcohol_beer`, `alcohol_wine` (numeric)
- `mindfulness_meditation`, `mindfulness_yoga` (boolean)
- `supplements` (jsonb — `{ "Vitamin D": true, "Magnesium": false }`)
- `outside_time`, `social_media`, `p`, `m`, `s` (boolean)
- `notes` (text)
- `weather_postcode` (text), `weather_snapshot` (jsonb — `{ current: {temp, code}, hourly: [{time, hour, temp, code, isForecast}] }`)

**`supplements` table**
- `id` (uuid), `name` (text)

**`weights` table**
- Single-row config: `default_postcode` (text)

### Deployment

- **Hosting:** Netlify (site: `chickencheckin.netlify.app`)
- **Repo:** `github.com/stevemolesworth/habit-tracker`
- **Branch:** `main` (auto-deploys on push)
- **Local dev:** `netlify dev` using global netlify-cli (v24.x) — requires `.env` file with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
