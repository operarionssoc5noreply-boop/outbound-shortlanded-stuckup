const crypto = require("node:crypto");
const express = require("express");
const { config } = require("./config");
const { syncSheets } = require("./syncSheets");
const { createSummaryWatcher } = require("./summaryWatcher");

function secretsMatch(receivedSecret) {
  if (!receivedSecret) {
    return false;
  }

  const expected = Buffer.from(config.webhookSecret);
  const received = Buffer.from(String(receivedSecret));

  if (expected.length !== received.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, received);
}

const app = express();
const summaryWatcher = createSummaryWatcher();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    sourceSpreadsheetId: config.sourceSpreadsheetId,
    destinationSpreadsheetId: config.destinationSpreadsheetId,
    summary: summaryWatcher.getStatus(),
  });
});

app.post("/webhook/sync", async (req, res) => {
  const secretFromHeader = req.header("x-webhook-secret");
  const secretFromBody = req.body?.secret;
  const webhookSecret = secretFromHeader || secretFromBody;

  if (!secretsMatch(webhookSecret)) {
    return res.status(401).json({ ok: false, error: "Unauthorized webhook request." });
  }

  try {
    const result = await syncSheets(req.body || {});
    return res.status(200).json({ ok: true, result });
  } catch (error) {
    console.error("Sync failed:", error);
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.post("/sync", async (req, res) => {
  const authHeader = req.header("x-webhook-secret");

  if (!secretsMatch(authHeader)) {
    return res.status(401).json({ ok: false, error: "Unauthorized sync request." });
  }

  try {
    const result = await syncSheets({ manual: true });
    return res.status(200).json({ ok: true, result });
  } catch (error) {
    console.error("Manual sync failed:", error);
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.post("/summary/send", async (req, res) => {
  const authHeader = req.header("x-webhook-secret");

  if (!secretsMatch(authHeader)) {
    return res.status(401).json({ ok: false, error: "Unauthorized summary request." });
  }

  try {
    const result = await summaryWatcher.runOnce({ force: true });
    return res.status(200).json({ ok: true, result });
  } catch (error) {
    console.error("Summary send failed:", error);
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.listen(config.port, () => {
  console.log(`Seatalk sync bot listening on port ${config.port}`);
  summaryWatcher.start();
});
