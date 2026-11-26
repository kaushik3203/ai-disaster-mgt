# DisasterHub — Complete Setup & Run Guide (A to Z)

Welcome to **DisasterHub** (`disaster-response-hub`). This guide explains everything step by step in simple English so you can set up, configure, and run the project from the ZIP archive without needing any prior GitHub setup.

---

## 1. Prerequisites (Install These First)

Before running the project, make sure the following tools are installed on your computer:

1. **Node.js (v18 or higher, recommended v20 LTS)**
   - Download from: https://nodejs.org/
   - Verify installation by opening a terminal (Command Prompt, PowerShell, or VS Code Terminal) and running:
     ```bash
     node -v
     npm -v
     ```
2. **A Code Editor** (optional, recommended): **Visual Studio Code** (https://code.visualstudio.com/)
3. **Free Accounts Needed for API Keys**:
   - **Supabase** (Database, Real-time Sync & Login): https://supabase.com/
   - **Google AI Studio** (Gemini AI Chat, Analysis & Future Route Predictions): https://aistudio.google.com/
   - **Mapbox** (Required token for the `mapbox-gl` map component): https://www.mapbox.com/

---

## 2. Extract the Project & Install Dependencies

1. **Unzip** the project folder (`ai-disaster-mgt.zip`) to a location on your computer (for example, `C:\Projects\ai-disaster-mgt` or `~/Projects/ai-disaster-mgt`).
2. Open your terminal inside the extracted project folder (the folder that contains `package.json`):
   ```bash
   cd path/to/ai-disaster-mgt
   ```
3. Install all required packages:
   ```bash
   npm install
   ```
   Wait until the installation finishes without errors.

---

## 3. Supabase Setup (Database, Realtime & Authentication)

Supabase powers the database tables (`disasters`, `resources`, `teams`, `reports`, `alerts`, `user_profiles`), live updates, and email login.

### Step 3.1: Create a New Supabase Project
1. Go to https://supabase.com/ and sign in (or create a free account).
2. Click **New Project**.
3. Choose your Organization, enter a **Project Name** (e.g. `disaster-hub`), set a strong **Database Password** (save it somewhere safe), and select a **Region** closest to your users.
4. Click **Create new project** and wait 1–2 minutes for provisioning to complete.

### Step 3.2: Get Your Supabase URL & API Key
1. In your Supabase project dashboard, open **Project Settings** (gear icon at bottom-left) → **API** (or click **Connect** at the top bar).
2. Copy these two values (you will paste them into `.env` in Section 5):
   - **Project URL** → looks like `https://xxxxxxxxxxxx.supabase.co` (`VITE_SUPABASE_URL`)
   - **anon / public key** (or Publishable key) → (`VITE_SUPABASE_ANON_KEY`)

> **Important:** Never use the `service_role` secret key in the frontend `.env` file. Always use the `anon` / publishable key.

### Step 3.3: Create Database Tables (Run SQL Scripts)
1. In the left sidebar of Supabase Dashboard, click **SQL Editor** → **New query**.
2. Open the file `supabase/migrations/20250315171444_dark_rice.sql` from your project folder, copy its entire contents, paste it into the Supabase SQL Editor, and click **Run**.
   - This enables PostGIS (`postgis`, `uuid-ossp`), creates all 5 core tables (`disasters`, `resources`, `teams`, `reports`, `alerts`), sets up spatial indexes and triggers, and inserts initial sample records.
3. Click **New query** again, open `supabase/migrations/20261126000000_phone_auth_profiles.sql`, copy its contents, paste it into the SQL Editor, and click **Run**.
   - This creates the `user_profiles` table and automatic signup trigger.

### Step 3.4: Enable Supabase Realtime
To receive live updates on the map, alerts, and notifications without refreshing the page:
1. In Supabase Dashboard, go to **Database** → **Publications** (or **Replication**).
2. Click on `supabase_realtime` and make sure these tables are toggled **ON**:
   - `disasters`
   - `resources`
   - `teams`
   - `reports`
   - `alerts`

### Step 3.5: Configure Authentication & Email Login
1. Go to **Authentication** → **Providers** → verify **Email** is enabled (it is enabled by default).
2. Go to **Authentication** → **URL Configuration**:
   - Set **Site URL** to `http://localhost:5173` for local testing (or your live domain when deployed, e.g. `https://yourdomain.com`).
   - Add `http://localhost:5173/**` under **Redirect URLs** and click **Save**.
3. *(Optional — For Custom Branded 6-Digit OTP Emails)*:
   - Without custom SMTP, Supabase sends a default clickable confirmation/login link that logs users in automatically when clicked.
   - If you want to send branded 6-digit OTP emails, go to **Project Settings → Authentication → SMTP Settings**, connect a free SMTP provider (such as **Resend**, **Brevo**, or **Gmail App Password**), and then paste the HTML from `supabase/templates/magic_link.html` into **Authentication → Email Templates** for both **Confirm sign up** and **Magic Link** (Subject: `Your DisasterHub Verification Code: {{ .Token }}`).

---

## 4. Get Required External API Keys

### 4.1: Google Gemini API Key (`VITE_GEMINI_API_KEY`)
Used for the AI Assistant Chat, Severity Analysis, Misinformation Detection, Situation Reports, and Map Future Trajectory / Route Predictions.

1. Visit **Google AI Studio**: https://aistudio.google.com/
2. Sign in with your Google account.
3. Click **Get API key** → **Create API key**.
4. Copy the generated key (`VITE_GEMINI_API_KEY`).

### 4.2: Mapbox Access Token (`VITE_MAPBOX_TOKEN`)
Used to initialize the Mapbox GL map engine (`mapbox-gl`).

1. Create a free account at https://www.mapbox.com/
2. Open your **Account Dashboard** → **Access Tokens**.
3. Copy your **Default public token** (starts with `pk.eyJ1...`) or create a new public token (`VITE_MAPBOX_TOKEN`).

### 4.3: Built-in Free Public APIs (No API Key Needed!)
The project automatically fetches live data from these public APIs without any key or registration:
- **USGS Earthquake Feed** — Live global earthquakes (Magnitude 4.5+, last 24h)
- **NASA EONET v3** — Live open wildfires, storms/cyclones, floods, and volcanoes
- **Open-Meteo (Weather, Marine & Flood)** — Live wind speed, rainfall, temperature, humidity, river discharge, wave height, and sea current
- **RainViewer** — Live animated precipitation radar tiles
- **Esri & OpenStreetMap** — Satellite, Street, Terrain, and Dark map tiles

---

## 5. Configure Environment Variables (`.env`)

1. In the root folder of the project (next to `package.json`), locate `.env.example`.
2. Make a copy of `.env.example` and rename it to `.env` (or create a new file named `.env`).
3. Open `.env` and fill in your real keys:

```env
# Supabase Configuration (Required)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key

# Google Gemini AI (Required for AI Chat, Analysis & Future Route Predictions)
VITE_GEMINI_API_KEY=your-gemini-api-key

# Mapbox Token (Required for Map Engine)
VITE_MAPBOX_TOKEN=pk.your-mapbox-public-token
```

> **Note:** Whenever you edit `.env`, you must **stop and restart** the dev server (`Ctrl + C` then `npm run dev`) so Vite picks up the new values.

---

## 6. Run the Project Locally

### Development Mode
Start the local development server:
```bash
npm run dev
```
Open the URL shown in your terminal (usually **`http://localhost:5173`**) in Chrome, Edge, or Firefox.

### Production Build & Preview
To verify TypeScript compilation and create an optimized production bundle:
```bash
npm run build
```
To test the built production files locally:
```bash
npm run preview
```

### Code Quality Check (Optional)
Run ESLint to verify there are no lint or TypeScript issues:
```bash
npm run lint
```

---

## 7. Quick Feature Checklist After Launch

Once `http://localhost:5173` loads in your browser, verify these work:
1. **Map View:** Satellite map loads with live Rain Radar animation (`▶`), Heat Zones, and clickable Disaster markers showing **Current Live** telemetry + **AI Future Path**.
2. **Disaster Filters:** Clicking `Flood`, `Cyclone`, `Earthquake`, or `Wildfire` filters the map to only that disaster type; `All` restores everything.
3. **3D Globe View:** Click the Globe icon on the bottom dock to view live global markers on the 3D globe.
4. **AI Assistant & AI Analysis:** Click the bot icon (Navbar/Dock) or brain icon (Dock) to test Gemini AI responses.
5. **Forms (`Report Incident`, `Add Resource`, `Send Alert`):** Test submitting an incident or alert to confirm Supabase write + realtime sync works.
6. **Login & Device Alerts:** Click **Login** in the top-right Navbar, enter an email address, click the confirmation link sent to your inbox, and allow browser notifications.

---

## 8. Troubleshooting

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **`Failed to fetch data` on load** | Wrong `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`, or SQL tables not created | Double-check `.env`, ensure `20250315171444_dark_rice.sql` was run in Supabase SQL Editor, and restart `npm run dev` |
| **Blank map or Mapbox token error** | Missing or invalid `VITE_MAPBOX_TOKEN` | Paste a valid `pk....` public token from Mapbox into `.env` and restart `npm run dev` |
| **AI Chat / AI Future Path fails** | Missing/invalid `VITE_GEMINI_API_KEY` or quota exceeded | Verify your key at https://aistudio.google.com/ and make sure Generative Language API is enabled |
| **Login email link redirects to wrong URL** | Supabase `Site URL` mismatch | In Supabase Dashboard → **Authentication → URL Configuration**, set **Site URL** to `http://localhost:5173` (or your deployed URL) |
| **Email shows link instead of 6-digit code** | Supabase requires Custom SMTP to edit email templates | Click the link in the email directly (it logs you in automatically), or configure free Custom SMTP + paste `supabase/templates/magic_link.html` |
| **Port `5173` already in use** | Another Vite app is running | Run `npm run dev -- --port 3000` to use port `3000` instead |

---

## 9. Important Production Security Note (Before Public Deployment)

- The migration `20250315171444_dark_rice.sql` uses permissive public RLS policies (`USING (true)`) for easy demo/client testing. Before launching publicly in production, restrict `INSERT`/`UPDATE`/`DELETE` RLS policies to authorized/authenticated roles.
- For production deployments, consider proxying Gemini API requests through a **Supabase Edge Function** so `VITE_GEMINI_API_KEY` is not exposed in the browser bundle.
- **Never share your `.env` file publicly**—share `.env.example` and configure real environment variables directly on your hosting platform (e.g., Vercel, Netlify, or Cloudflare Pages).
