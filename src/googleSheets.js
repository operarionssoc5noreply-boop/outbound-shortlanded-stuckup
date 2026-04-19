const { google } = require("googleapis");
const { config } = require("./config");

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
];

function createGoogleAuth() {
  return new google.auth.GoogleAuth({
    credentials: config.googleCredentials,
    scopes: GOOGLE_SCOPES,
  });
}

function createSheetsClient() {
  return google.sheets({
    version: "v4",
    auth: createGoogleAuth(),
  });
}

async function getAuthorizedAccessToken() {
  const auth = createGoogleAuth();
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();

  if (typeof tokenResponse === "string" && tokenResponse) {
    return tokenResponse;
  }

  if (tokenResponse && tokenResponse.token) {
    return tokenResponse.token;
  }

  throw new Error("Failed to obtain a Google access token for PDF export.");
}

module.exports = {
  createSheetsClient,
  getAuthorizedAccessToken,
};
