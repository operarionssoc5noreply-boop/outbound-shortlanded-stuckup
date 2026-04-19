const SOURCE_SPREADSHEET_ID = 'replace-with-source-spreadsheet-id';
const SOURCE_SHEET_NAME = 'ConsoFile';
const WATCH_CELL = 'A1';

function getWebhookConfig() {
  const properties = PropertiesService.getScriptProperties();
  const webhookUrl = properties.getProperty('WEBHOOK_URL');
  const webhookSecret = properties.getProperty('WEBHOOK_SECRET');

  if (!webhookUrl || !webhookSecret) {
    throw new Error(
      'Missing WEBHOOK_URL or WEBHOOK_SECRET in Script Properties. Run setWebhookConfig(webhookUrl, webhookSecret) first.',
    );
  }

  return {
    webhookUrl: webhookUrl,
    webhookSecret: webhookSecret,
  };
}

function setWebhookConfig(webhookUrl, webhookSecret) {
  if (!webhookUrl || !webhookSecret) {
    throw new Error('Both webhookUrl and webhookSecret are required.');
  }

  PropertiesService.getScriptProperties().setProperties({
    WEBHOOK_URL: String(webhookUrl),
    WEBHOOK_SECRET: String(webhookSecret),
  });
}

function pollSourceA1() {
  const properties = PropertiesService.getScriptProperties();
  const webhookConfig = getWebhookConfig();
  const sourceSpreadsheet = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID);
  const sourceSheet = sourceSpreadsheet.getSheetByName(SOURCE_SHEET_NAME);

  if (!sourceSheet) {
    throw new Error('Source tab not found: ' + SOURCE_SHEET_NAME);
  }

  const currentValue = String(sourceSheet.getRange(WATCH_CELL).getDisplayValue());
  const lastValue = properties.getProperty('LAST_SOURCE_A1');

  if (currentValue === lastValue) {
    return;
  }

  const payload = {
    sourceSpreadsheetId: SOURCE_SPREADSHEET_ID,
    sourceSheetName: SOURCE_SHEET_NAME,
    watchedCell: WATCH_CELL,
    previousValue: lastValue,
    currentValue: currentValue,
    changedAt: new Date().toISOString(),
  };

  const response = UrlFetchApp.fetch(webhookConfig.webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      'x-webhook-secret': webhookConfig.webhookSecret,
    },
    payload: JSON.stringify(payload),
  });

  const statusCode = response.getResponseCode();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error('Webhook sync failed with status ' + statusCode + ': ' + response.getContentText());
  }

  properties.setProperty('LAST_SOURCE_A1', currentValue);
}

function seedLastKnownValue() {
  const sourceSpreadsheet = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID);
  const sourceSheet = sourceSpreadsheet.getSheetByName(SOURCE_SHEET_NAME);

  if (!sourceSheet) {
    throw new Error('Source tab not found: ' + SOURCE_SHEET_NAME);
  }

  const currentValue = String(sourceSheet.getRange(WATCH_CELL).getDisplayValue());
  PropertiesService.getScriptProperties().setProperty('LAST_SOURCE_A1', currentValue);
}

function manualSync() {
  const webhookConfig = getWebhookConfig();

  const response = UrlFetchApp.fetch(webhookConfig.webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      'x-webhook-secret': webhookConfig.webhookSecret,
    },
    payload: JSON.stringify({
      sourceSpreadsheetId: SOURCE_SPREADSHEET_ID,
      sourceSheetName: SOURCE_SHEET_NAME,
      watchedCell: WATCH_CELL,
      manual: true,
      changedAt: new Date().toISOString(),
    }),
  });

  Logger.log(response.getContentText());
}

function registerTimeDrivenTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i += 1) {
    if (triggers[i].getHandlerFunction() === 'pollSourceA1') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('pollSourceA1')
    .timeBased()
    .everyMinutes(5)
    .create();
}

function resetWatcherState() {
  PropertiesService.getScriptProperties().deleteProperty('LAST_SOURCE_A1');
}
