# Water Tracker

Personal CEMC NFC hydration tracker.

## Flow

CEMC bottle NFC tag → iPhone Shortcuts automation → Vercel API → Supabase Postgres → authenticated dashboard.

## Bottle configuration

- Bottle: CEMC
- Bottle amount: 25 oz
- Daily goal: 96 oz
- Time zone: America/New_York

## Local setup

1. Install packages:

   ```powershell
   npm install
   ```

2. Create `.env.local`:

   ```env
   SUPABASE_URL=
   SUPABASE_SECRET_KEY=
   WATER_TRACKER_NFC_TOKEN=
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
   WATER_TRACKER_OWNER_EMAIL=
   ```

3. Run:

   ```powershell
   npm run dev
   ```

## Security model

- `SUPABASE_SECRET_KEY` is server-only and never exposed to browser code.
- `WATER_TRACKER_NFC_TOKEN` is used only by the iPhone Shortcut in the `x-water-tracker-token` request header.
- Dashboard reads, manual logs, and deletes require Supabase magic-link authentication.
- The API accepts dashboard access only when the authenticated email matches `WATER_TRACKER_OWNER_EMAIL`.
- Duplicate NFC events with the same bottle, source, and ounces inside 15 seconds are ignored.

## Deployment

Configure all six variables in Vercel Production environment variables before deploying.

## NFC Shortcut request

```http
POST /api/water-log
x-water-tracker-token: <private-token>
Content-Type: application/json
```

```json
{
  "amountOz": 25,
  "source": "nfc",
  "bottleName": "CEMC"
}
```