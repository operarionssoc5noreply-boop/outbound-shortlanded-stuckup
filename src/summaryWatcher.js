const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { config } = require("./config");
const { createSheetsClient, getAuthorizedAccessToken } = require("./googleSheets");

function columnLettersToIndex(columnLetters) {
  let value = 0;

  for (const letter of columnLetters.toUpperCase()) {
    value = value * 26 + (letter.charCodeAt(0) - 64);
  }

  return value - 1;
}

function parseA1Cell(a1Cell) {
  const match = /^([A-Za-z]+)(\d+)$/.exec(String(a1Cell).trim());
  if (!match) {
    throw new Error(`Invalid A1 cell reference: ${a1Cell}`);
  }

  return {
    rowIndex: Number.parseInt(match[2], 10) - 1,
    columnIndex: columnLettersToIndex(match[1]),
  };
}

function parseA1Range(a1Range) {
  const match = /^([A-Za-z]+\d+):([A-Za-z]+\d+)$/.exec(String(a1Range).trim());
  if (!match) {
    throw new Error(`Invalid A1 range: ${a1Range}`);
  }

  const start = parseA1Cell(match[1]);
  const end = parseA1Cell(match[2]);

  return {
    startRowIndex: start.rowIndex,
    endRowIndex: end.rowIndex + 1,
    startColumnIndex: start.columnIndex,
    endColumnIndex: end.columnIndex + 1,
  };
}

function buildSheetRange(sheetName, range) {
  return `'${sheetName.replace(/'/g, "''")}'!${range}`;
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `${command} exited with code ${code}.${stderr ? ` ${stderr.trim()}` : ""}`.trim(),
        ),
      );
    });
  });
}

async function runFirstAvailableCommand(candidates) {
  let lastError = null;

  for (const [command, args] of candidates) {
    try {
      return await runCommand(command, args);
    } catch (error) {
      if (error.code === "ENOENT" || /not recognized|not found/i.test(error.message)) {
        lastError = error;
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error("No supported command was available.");
}

async function getSheetId(sheets, spreadsheetId, sheetName) {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });

  const matchedSheet = response.data.sheets?.find(
    (sheet) => sheet.properties?.title === sheetName,
  );

  if (!matchedSheet?.properties?.sheetId && matchedSheet?.properties?.sheetId !== 0) {
    throw new Error(`Summary sheet not found: ${sheetName}`);
  }

  return matchedSheet.properties.sheetId;
}

async function readWatchCell(sheets) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.summary.spreadsheetId,
    range: buildSheetRange(config.summary.sheetName, config.summary.watchCell),
    valueRenderOption: "FORMATTED_VALUE",
  });

  return String(response.data.values?.[0]?.[0] || "");
}

async function exportSummaryPdf(pdfPath, sheetId) {
  const token = await getAuthorizedAccessToken();
  const exportBounds = parseA1Range(config.summary.exportRange);
  const exportUrl = new URL(
    `https://docs.google.com/spreadsheets/d/${config.summary.spreadsheetId}/export`,
  );

  exportUrl.searchParams.set("format", "pdf");
  exportUrl.searchParams.set("exportFormat", "pdf");
  exportUrl.searchParams.set("gid", String(sheetId));
  exportUrl.searchParams.set("portrait", "false");
  exportUrl.searchParams.set("size", "a4");
  exportUrl.searchParams.set("scale", "2");
  exportUrl.searchParams.set("sheetnames", "false");
  exportUrl.searchParams.set("printtitle", "false");
  exportUrl.searchParams.set("gridlines", "false");
  exportUrl.searchParams.set("fzr", "false");
  exportUrl.searchParams.set("fzc", "false");
  exportUrl.searchParams.set("attachment", "false");
  exportUrl.searchParams.set("r1", String(exportBounds.startRowIndex));
  exportUrl.searchParams.set("r2", String(exportBounds.endRowIndex));
  exportUrl.searchParams.set("c1", String(exportBounds.startColumnIndex));
  exportUrl.searchParams.set("c2", String(exportBounds.endColumnIndex));

  const response = await fetch(exportUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google Sheets PDF export failed (${response.status}): ${errorBody}`);
  }

  const pdfBuffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(pdfPath, pdfBuffer);
}

async function convertPdfToPng(pdfPath, pngPath) {
  const pngBasePath = pngPath.slice(0, -4);
  const optimizedPngPath = path.join(
    path.dirname(pngPath),
    `${path.basename(pngBasePath)}-optimized.png`,
  );

  await runCommand("pdftoppm", ["-png", "-singlefile", "-f", "1", "-l", "1", pdfPath, pngBasePath]);
  await runFirstAvailableCommand([
    ["magick", [pngPath, "-strip", optimizedPngPath]],
    ["convert", [pngPath, "-strip", optimizedPngPath]],
    ["convert-im6.q16", [pngPath, "-strip", optimizedPngPath]],
  ]);
  await fs.rm(pngPath, { force: true });
  await fs.rename(optimizedPngPath, pngPath);
}

async function sendImageToSeatalk(pngPath) {
  const pngBuffer = await fs.readFile(pngPath);
  const base64Image = pngBuffer.toString("base64");

  const response = await fetch(config.summary.seatalkWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tag: "image",
      image_base64: {
        content: base64Image,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`SeaTalk webhook failed (${response.status}): ${errorBody}`);
  }

  return {
    pngSizeBytes: pngBuffer.byteLength,
  };
}

async function generateAndSendSummary(sheetId) {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "shortlanded-summary-"));
  const pdfPath = path.join(tempDirectory, `${config.summary.filePrefix}.pdf`);
  const pngPath = path.join(tempDirectory, `${config.summary.filePrefix}.png`);

  try {
    await exportSummaryPdf(pdfPath, sheetId);
    await convertPdfToPng(pdfPath, pngPath);
    const seatalkResult = await sendImageToSeatalk(pngPath);

    return {
      pdfPath,
      pngPath,
      ...seatalkResult,
    };
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
}

function createSummaryWatcher() {
  const state = {
    enabled: config.summary.enabled,
    started: false,
    running: false,
    seeded: false,
    lastObservedValue: null,
    lastDeliveredValue: null,
    lastRunAt: null,
    lastSentAt: null,
    lastError: null,
  };

  let stopRequested = false;
  let timer = null;
  let cachedSheetId = null;

  async function resolveSheetId() {
    if (cachedSheetId !== null) {
      return cachedSheetId;
    }

    const sheets = createSheetsClient();
    cachedSheetId = await getSheetId(
      sheets,
      config.summary.spreadsheetId,
      config.summary.sheetName,
    );
    return cachedSheetId;
  }

  async function runOnce({ force = false } = {}) {
    if (!config.summary.enabled) {
      return { ok: false, skipped: true, reason: "disabled" };
    }

    if (state.running) {
      return { ok: false, skipped: true, reason: "already-running" };
    }

    state.running = true;
    state.lastRunAt = new Date().toISOString();

    try {
      const sheets = createSheetsClient();
      const currentValue = await readWatchCell(sheets);
      const previousDeliveredValue = state.lastDeliveredValue;

      state.lastObservedValue = currentValue;

      if (!state.seeded && !force) {
        state.seeded = true;
        state.lastDeliveredValue = currentValue;
        state.lastError = null;
        return {
          ok: true,
          seeded: true,
          currentValue,
        };
      }

      if (!force && currentValue === state.lastDeliveredValue) {
        state.lastError = null;
        return {
          ok: true,
          skipped: true,
          reason: "unchanged",
          currentValue,
        };
      }

      const sheetId = await resolveSheetId();
      const summaryResult = await generateAndSendSummary(sheetId);

      state.seeded = true;
      state.lastDeliveredValue = currentValue;
      state.lastSentAt = new Date().toISOString();
      state.lastError = null;

      return {
        ok: true,
        sent: true,
        currentValue,
        previousValue: previousDeliveredValue,
        pngSizeBytes: summaryResult.pngSizeBytes,
      };
    } catch (error) {
      state.lastError = error.message;
      throw error;
    } finally {
      state.running = false;
    }
  }

  function scheduleNextRun() {
    if (stopRequested || !config.summary.enabled) {
      return;
    }

    timer = setTimeout(async () => {
      try {
        const result = await runOnce();
        if (result.sent) {
          console.log(
            `Summary sent for ${config.summary.sheetName}!${config.summary.exportRange} after ${config.summary.watchCell} changed.`,
          );
        }
      } catch (error) {
        console.error("Summary watcher failed:", error);
      } finally {
        scheduleNextRun();
      }
    }, config.summary.pollIntervalMs);
  }

  function start() {
    state.started = true;

    if (!config.summary.enabled) {
      console.log("Summary watcher disabled.");
      return;
    }

    console.log(
      `Summary watcher polling ${config.summary.sheetName}!${config.summary.watchCell} every ${config.summary.pollIntervalMs}ms.`,
    );

    scheduleNextRun();
  }

  function stop() {
    stopRequested = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function getStatus() {
    return {
      ...state,
      watchCell: config.summary.watchCell,
      exportRange: config.summary.exportRange,
      sheetName: config.summary.sheetName,
      intervalMs: config.summary.pollIntervalMs,
    };
  }

  return {
    start,
    stop,
    runOnce,
    getStatus,
  };
}

module.exports = {
  createSummaryWatcher,
};
