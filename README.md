# Seatalk Shortland Sync Bot

This project provides:

- a Node.js webhook server that authenticates with a Google service account
- a sync job that copies `ConsoFile!A2:AA` from spreadsheet `1f0BuJ_x5Lm3eOnZ1MMvT90eYZDa5_eAL18ANtN9_5Og`
- an Apps Script watcher that checks `ConsoFile!A1` on a time-driven trigger and calls the webhook only when `A1` changes

## Flow

1. Apps Script checks `ConsoFile!A1` every 5 minutes.
2. If `A1` changed since the last successful run, Apps Script calls `POST /webhook/sync`.
3. The Node server uses the shared Google service account to read `ConsoFile!A2:AA`.
4. The Node server clears the destination range and writes the latest rows into `SPX PH LH Shortlanded Live Tracker!A2:AA`.

## Files

- `src/server.js`: webhook server and manual sync endpoint
- `src/syncSheets.js`: Google Sheets read/clear/write logic
- `apps-script/Code.gs`: Apps Script polling and trigger helpers
- `apps-script/appsscript.json`: Apps Script manifest with required scopes

## Server Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env`.

3. Fill in these values in `.env`:

- `WEBHOOK_SECRET`: shared secret for Apps Script and the server
- `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` or `GOOGLE_SERVICE_ACCOUNT_JSON`
- `DESTINATION_SHEET_NAME`: update this if the actual destination tab name has different spacing

4. Start the server:

```bash
npm start
```

5. Expose the server on a public HTTPS URL so Apps Script can reach it.

## Apps Script Setup

1. Create a standalone Apps Script project.
2. Copy `apps-script/Code.gs` into the script editor.
3. Replace `WEBHOOK_URL` with your public server URL.
4. Replace `WEBHOOK_SECRET` with the same value used by the Node server.
5. Copy `apps-script/appsscript.json` into the Apps Script manifest.
6. Run `seedLastKnownValue()` once.
7. Run `registerTimeDrivenTrigger()` once.

The trigger will then poll every 5 minutes. If you need a different interval, change `.everyMinutes(5)` in `registerTimeDrivenTrigger()`.

## Endpoints

- `GET /health`: health check
- `POST /webhook/sync`: used by Apps Script when `A1` changes
- `POST /sync`: manual sync endpoint using the same `x-webhook-secret` header

## Notes

- Apps Script runs as the Google user who owns the script. It does not use the service account directly.
- The Node server uses the service account to access both spreadsheets.
- The destination tab name in your request appears once as `SPX PH LH Shortlanded Live  Tracker` and once as `SPX PH LH Shortlanded Live Tracker`. The code defaults to the single-space version. If the real tab has double spaces, update `DESTINATION_SHEET_NAME` in `.env`.
