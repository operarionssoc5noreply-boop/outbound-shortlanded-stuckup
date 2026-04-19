# Seatalk Shortland Sync Bot

This project provides:

- a Node.js webhook server that authenticates with a Google service account
- a sync job that copies `ConsoFile!A2:AA` from your configured source spreadsheet
- an Apps Script watcher that checks `ConsoFile!A1` on a time-driven trigger and calls the webhook only when `A1` changes
- a server-side summary watcher that polls `shortlanded_summary!U2` every 10 seconds and sends `B3:T45` to SeaTalk as an image when that cell changes

## Flow

1. Apps Script checks `ConsoFile!A1` every 5 minutes.
2. If `A1` changed since the last successful run, Apps Script calls `POST /webhook/sync`.
3. The Node server uses the shared Google service account to read `ConsoFile!A2:AA`.
4. The Node server clears the destination range and writes the latest rows into `SPX PH LH Shortlanded Live Tracker!A2:AA`.

## Files

- `src/server.js`: webhook server and manual sync endpoint
- `src/syncSheets.js`: Google Sheets read/clear/write logic
- `src/summaryWatcher.js`: summary polling, PDF export, PNG conversion, and SeaTalk delivery
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
- `SOURCE_SPREADSHEET_ID`
- `DESTINATION_SPREADSHEET_ID`
- `DESTINATION_SHEET_NAME`
- `HOST=0.0.0.0` for container platforms such as Render
- `SUMMARY_ENABLED=true` if you want the 10-second summary watcher enabled
- `SUMMARY_SEATALK_WEBHOOK_URL`: SeaTalk system account webhook URL for the target group

4. Start the server:

```bash
npm start
```

5. Expose the server on a public HTTPS URL so Apps Script can reach it.

## Summary Watcher

When `SUMMARY_ENABLED=true`, the server will:

1. Poll `shortlanded_summary!U2` every 10 seconds.
2. Detect a change relative to the last successfully delivered value.
3. Export `B3:T45` from that tab as a PDF.
4. Convert the first PDF page to PNG using `pdftoppm` and optimize it with `magick`.
5. Send the PNG to your SeaTalk group through the system account webhook in `SUMMARY_SEATALK_WEBHOOK_URL`.

The first poll only seeds the baseline value. It does not send a message until `U2` changes after startup.

You can trigger a manual send with:

```bash
curl -X POST http://localhost:3000/summary/send -H "x-webhook-secret: <WEBHOOK_SECRET>"
```

## Apps Script Setup

1. Create a standalone Apps Script project.
2. Copy `apps-script/Code.gs` into the script editor.
3. Replace `SOURCE_SPREADSHEET_ID` if you are watching a different source file.
4. Copy `apps-script/appsscript.json` into the Apps Script manifest.
5. Run this once in the Apps Script editor, using the same secret from `.env`:

```javascript
setWebhookConfig(
  'https://your-public-server.example.com/webhook/sync',
  'same-value-as-WEBHOOK_SECRET-in-.env'
);
```

6. Run `seedLastKnownValue()` once.
7. Run `registerTimeDrivenTrigger()` once.

The trigger will then poll every 5 minutes. If you need a different interval, change `.everyMinutes(5)` in `registerTimeDrivenTrigger()`.

## Endpoints

- `GET /health`: health check
- `POST /webhook/sync`: used by Apps Script when `A1` changes
- `POST /sync`: manual sync endpoint using the same `x-webhook-secret` header
- `POST /summary/send`: manual summary image send using the same `x-webhook-secret` header

## Docker

This repo includes a `Dockerfile` and `docker-compose.yml`. The container installs:

- `poppler-utils` for `pdftoppm`
- `imagemagick` for PNG post-processing

Build the image with plain Docker:

```bash
docker build -t seatalk-shortland-sync-bot .
```

Run the container with your env file and service account mount:

```bash
docker run --rm -p 3000:3000 --env-file .env -v <absolute-path-to-service-account.json>:/app/service-account.json:ro seatalk-shortland-sync-bot
```

If your Docker installation includes the Compose plugin, you can also use:

```bash
docker compose up --build -d
```

If you use `GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./service-account.json`, either mount that file into `/app/service-account.json` or use the included compose file. If you prefer not to mount a file, set `GOOGLE_SERVICE_ACCOUNT_JSON` in `.env` instead.

## Notes

- Apps Script runs as the Google user who owns the script. It does not use the service account directly.
- The Node server uses the service account to access both spreadsheets and to export the summary PDF.
- Keep `.env`, service-account key files, and Apps Script Script Properties out of git. `.gitignore` now excludes the common secret-bearing files for this project.
- The summary PDF export uses Google Sheets' export endpoint with explicit row and column bounds for `B3:T45`.
