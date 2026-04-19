const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in environment variables.`);
  }

  return value;
}

function readBooleanEnv(name, fallback = false) {
  const rawValue = process.env[name];
  if (rawValue === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(rawValue).trim().toLowerCase());
}

function readIntegerEnv(name, fallback) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === "") {
    return fallback;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue)) {
    throw new Error(`Invalid ${name}. Expected an integer value.`);
  }

  return parsedValue;
}

function readServiceAccountCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }

  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    const keyFilePath = path.resolve(process.cwd(), process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
    return JSON.parse(fs.readFileSync(keyFilePath, "utf8"));
  }

  throw new Error(
    "Missing Google credentials. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_KEY_FILE.",
  );
}

const baseConfig = {
  host: process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT || 3000),
  webhookSecret: requireEnv("WEBHOOK_SECRET"),
  googleCredentials: readServiceAccountCredentials(),
  sourceSpreadsheetId: requireEnv("SOURCE_SPREADSHEET_ID"),
  sourceSheetName: process.env.SOURCE_SHEET_NAME || "ConsoFile",
  sourceRange: process.env.SOURCE_RANGE || "A2:AA",
  sourceWatchCell: process.env.SOURCE_WATCH_CELL || "A1",
  destinationSpreadsheetId: requireEnv("DESTINATION_SPREADSHEET_ID"),
  destinationSheetName: requireEnv("DESTINATION_SHEET_NAME"),
  destinationStartCell: process.env.DESTINATION_START_CELL || "A2",
  destinationClearRange: process.env.DESTINATION_CLEAR_RANGE || "A2:AA",
};

const summaryWebhookUrl = process.env.SUMMARY_SEATALK_WEBHOOK_URL || "";
const summaryEnabled =
  readBooleanEnv("SUMMARY_ENABLED", false) || Boolean(summaryWebhookUrl);

const config = {
  ...baseConfig,
  summary: {
    enabled: summaryEnabled,
    spreadsheetId: process.env.SUMMARY_SPREADSHEET_ID || baseConfig.destinationSpreadsheetId,
    sheetName: process.env.SUMMARY_SHEET_NAME || "shortlanded_summary",
    watchCell: process.env.SUMMARY_WATCH_CELL || "U2",
    exportRange: process.env.SUMMARY_EXPORT_RANGE || "B3:T45",
    pollIntervalMs: readIntegerEnv("SUMMARY_POLL_INTERVAL_MS", 10_000),
    seatalkWebhookUrl: summaryWebhookUrl,
    filePrefix: process.env.SUMMARY_FILE_PREFIX || "shortlanded_summary",
  },
};

if (config.summary.enabled && !config.summary.seatalkWebhookUrl) {
  throw new Error("Missing SUMMARY_SEATALK_WEBHOOK_URL while SUMMARY_ENABLED is true.");
}

module.exports = { config };
