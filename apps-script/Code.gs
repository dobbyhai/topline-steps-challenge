const CONFIG = {
  sheetName: 'Steps',
  adminPin: 'Topline',
  headers: ['ID', 'Name', 'Date', 'Steps', 'Updated At'],
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Topline Steps Challenge')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getEntries() {
  const sheet = getSheet_();
  const rows = sheet.getDataRange().getValues();
  return normalizeRows_(rows.slice(1));
}

function submitEntry(input) {
  const name = titleCaseName_(String(input && input.name || '').trim());
  const date = String(input && input.date || '');
  const steps = parseInt(input && input.steps, 10);

  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(steps) || steps < 0) {
    throw new Error('Name, valid date, and non-negative steps are required.');
  }

  const sheet = getSheet_();
  const rows = sheet.getDataRange().getValues();
  const updatedAt = new Date().toISOString();

  for (let i = 1; i < rows.length; i++) {
    const rowName = String(rows[i][1] || '').toLowerCase();
    const rowDate = formatDateValue_(rows[i][2]);
    if (rowName === name.toLowerCase() && rowDate === date) {
      sheet.getRange(i + 1, 2, 1, 4).setValues([[name, date, steps, updatedAt]]);
      return { ok: true, entries: getEntries() };
    }
  }

  sheet.appendRow([Utilities.getUuid(), name, date, steps, updatedAt]);
  return { ok: true, entries: getEntries() };
}

function deleteEntry(payload) {
  requireAdmin_(payload && payload.adminPin);
  const id = String(payload && payload.id || '');
  const sheet = getSheet_();
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === id) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return { ok: true, entries: getEntries() };
}

function importEntries(payload) {
  requireAdmin_(payload && payload.adminPin);
  const entries = normalizeInputEntries_(payload && payload.entries);
  const sheet = getSheet_();
  sheet.clear();
  sheet.getRange(1, 1, 1, CONFIG.headers.length).setValues([CONFIG.headers]);
  if (entries.length) {
    sheet.getRange(2, 1, entries.length, CONFIG.headers.length).setValues(entries.map(entry => [
      entry.id,
      entry.name,
      entry.date,
      entry.steps,
      entry.updatedAt,
    ]));
  }
  return { ok: true, entries: getEntries() };
}

function resetEntries(payload) {
  requireAdmin_(payload && payload.adminPin);
  const sheet = getSheet_();
  sheet.clear();
  sheet.getRange(1, 1, 1, CONFIG.headers.length).setValues([CONFIG.headers]);
  return { ok: true, entries: [] };
}

function loadSampleEntries(payload) {
  requireAdmin_(payload && payload.adminPin);
  return importEntries({ adminPin: payload.adminPin, entries: sampleEntries_() });
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(CONFIG.sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(CONFIG.sheetName);

  const headerRange = sheet.getRange(1, 1, 1, CONFIG.headers.length);
  const existingHeaders = headerRange.getValues()[0];
  if (existingHeaders.join('|') !== CONFIG.headers.join('|')) {
    headerRange.setValues([CONFIG.headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function requireAdmin_(pin) {
  if (String(pin || '') !== CONFIG.adminPin) throw new Error('Admin PIN required.');
}

function normalizeRows_(rows) {
  return rows
    .map(row => ({
      id: String(row[0] || ''),
      name: titleCaseName_(String(row[1] || '').trim()),
      date: formatDateValue_(row[2]),
      steps: parseInt(row[3], 10),
      updatedAt: String(row[4] || ''),
    }))
    .filter(entry => entry.id && entry.name && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && Number.isFinite(entry.steps) && entry.steps >= 0)
    .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}

function normalizeInputEntries_(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map(entry => ({
      id: String(entry.id || Utilities.getUuid()),
      name: titleCaseName_(String(entry.name || '').trim()),
      date: String(entry.date || ''),
      steps: parseInt(entry.steps, 10),
      updatedAt: String(entry.updatedAt || new Date().toISOString()),
    }))
    .filter(entry => entry.name && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && Number.isFinite(entry.steps) && entry.steps >= 0);
}

function formatDateValue_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value || '');
}

function titleCaseName_(name) {
  return name.replace(/\s+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function sampleEntries_() {
  const names = ['Summer', 'Liz', 'Alex', 'Priya', 'Jordan'];
  const start = new Date();
  start.setDate(start.getDate() - 9);
  const entries = [];

  names.forEach((name, personIndex) => {
    for (let dayIndex = 0; dayIndex < 8; dayIndex++) {
      const date = new Date(start);
      date.setDate(start.getDate() + dayIndex);
      entries.push({
        id: Utilities.getUuid(),
        name,
        date: Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        steps: 6500 + personIndex * 850 + ((dayIndex * 1379 + personIndex * 613) % 5200),
        updatedAt: new Date().toISOString(),
      });
    }
  });

  return entries;
}
