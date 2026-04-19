const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config();

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

const config = {
  port: Number(process.env.PORT || 3000),
  webhookSecret: process.env.WEBHOOK_SECRET || "",
  googleCredentials: readServiceAccountCredentials(),
  sourceSpreadsheetId: process.env.SOURCE_SPREADSHEET_ID || "1f0BuJ_x5Lm3eOnZ1MMvT90eYZDa5_eAL18ANtN9_5Og",
  sourceSheetName: process.env.SOURCE_SHEET_NAME || "ConsoFile",
  sourceRange: process.env.SOURCE_RANGE || "A2:AA",
  sourceWatchCell: process.env.SOURCE_WATCH_CELL || "A1",
  destinationSpreadsheetId:
    process.env.DESTINATION_SPREADSHEET_ID || "11ubwEg_XrGghhjhpWW1kuEj0gw12nes3GsOgDyaBFXg",
  destinationSheetName:
    process.env.DESTINATION_SHEET_NAME || "SPX PH LH Shortlanded Live Tracker",
  destinationStartCell: process.env.DESTINATION_START_CELL || "A2",
  destinationClearRange: process.env.DESTINATION_CLEAR_RANGE || "A2:AA",
};

if (!config.webhookSecret) {
  throw new Error("Missing WEBHOOK_SECRET in environment variables.");
}

module.exports = { config };
