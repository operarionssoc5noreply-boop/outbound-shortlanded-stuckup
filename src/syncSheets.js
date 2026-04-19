const { config } = require("./config");
const { createSheetsClient } = require("./googleSheets");

function quoteSheetName(sheetName) {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

function buildRange(sheetName, range) {
  return `${quoteSheetName(sheetName)}!${range}`;
}

function buildStartCellRange(sheetName, startCell) {
  return `${quoteSheetName(sheetName)}!${startCell}`;
}

async function syncSheets(triggerPayload = {}) {
  const sheets = createSheetsClient();

  const sourceRange = buildRange(config.sourceSheetName, config.sourceRange);
  const destinationClearRange = buildRange(config.destinationSheetName, config.destinationClearRange);
  const destinationStartRange = buildStartCellRange(
    config.destinationSheetName,
    config.destinationStartCell,
  );

  const sourceResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sourceSpreadsheetId,
    range: sourceRange,
    majorDimension: "ROWS",
  });

  const rows = sourceResponse.data.values || [];

  await sheets.spreadsheets.values.batchClear({
    spreadsheetId: config.destinationSpreadsheetId,
    requestBody: {
      ranges: [destinationClearRange],
    },
  });

  if (rows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.destinationSpreadsheetId,
      range: destinationStartRange,
      valueInputOption: "RAW",
      requestBody: {
        majorDimension: "ROWS",
        values: rows,
      },
    });
  }

  return {
    syncedAt: new Date().toISOString(),
    sourceSpreadsheetId: config.sourceSpreadsheetId,
    sourceRange,
    destinationSpreadsheetId: config.destinationSpreadsheetId,
    destinationStartRange,
    rowCount: rows.length,
    columnCount: rows.reduce((max, row) => Math.max(max, row.length), 0),
    watchedCell: config.sourceWatchCell,
    triggerPayload,
  };
}

module.exports = { syncSheets };
