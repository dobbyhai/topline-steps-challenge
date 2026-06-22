const FORM_POST_URL = "https://docs.google.com/forms/d/e/1FAIpQLSexdqxC_e5sfsjnyT1LgKeVOPy7mOJ7cpPMHDE3SEpNTQqgow/formResponse";
const FORM_FIELDS = {
  name: "entry.837247199",
  dateYear: "entry.1784503650_year",
  dateMonth: "entry.1784503650_month",
  dateDay: "entry.1784503650_day",
  steps: "entry.1711485762",
};
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1EXZlrBFPoThMQuAb6JT_SAggoTvhRbaHe4s10BBjvjk/gviz/tq?tqx=out:csv&sheet=Form%20Responses%202";

const $ = (id) => document.getElementById(id);
const state = { entries: [] };
const today = new Date().toISOString().slice(0, 10);
const CHALLENGE_START = "2026-06-15";
const CHALLENGE_END = "2026-08-06";
$("dateInput").value = today;

// Admin tools are not used in the no-login Google Form version.
const adminInput = $("adminPinInput");
if (adminInput) adminInput.closest("label").style.display = "none";
for (const id of ["importInput", "resetBtn", "sampleBtn"]) {
  const el = $(id);
  if (el) (el.closest("label") || el).style.display = "none";
}

init();

$("entryForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("nameInput").value.trim();
  const date = $("dateInput").value;
  const steps = Number.parseInt($("stepsInput").value, 10);
  if (!name || !date || !Number.isFinite(steps) || steps < 0) return;

  await submitToGoogleForm({ name, date, steps });
  $("stepsInput").value = "";
  $("nameInput").value = titleCaseName(name);
  await sleep(1200);
  await loadEntries();
});

$("refreshBtn").addEventListener("click", loadEntries);
$("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), entries: state.entries }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `topline-steps-${today}.json`;
  link.click();
  URL.revokeObjectURL(url);
});
$("weekSelect").addEventListener("change", renderWeeklyLeaderboard);

async function init() {
  await loadEntries();
  setInterval(loadEntries, 30000);
}

async function submitToGoogleForm({ name, date, steps }) {
  const [year, month, day] = date.split("-");
  const body = new URLSearchParams({
    [FORM_FIELDS.name]: titleCaseName(name),
    [FORM_FIELDS.dateYear]: String(Number(year)),
    [FORM_FIELDS.dateMonth]: String(Number(month)),
    [FORM_FIELDS.dateDay]: String(Number(day)),
    [FORM_FIELDS.steps]: String(steps),
    fvv: "1",
    pageHistory: "0",
  });

  await fetch(FORM_POST_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

async function loadEntries() {
  try {
    state.entries = normalizeEntries(await loadRowsFromGoogleSheet());
    render();
  } catch (error) {
    console.warn(error);
    render();
  }
}

function loadRowsFromGoogleSheet() {
  return new Promise((resolve, reject) => {
    const callbackName = `toplineSteps${Date.now()}${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement("script");
    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };

    window[callbackName] = (response) => {
      cleanup();
      if (!response || response.status !== "ok") {
        reject(new Error(response && response.errors ? response.errors.map((item) => item.detailed_message || item.message).join(", ") : "Sheet JSONP failed"));
        return;
      }
      resolve(rowsFromGoogleTable(response.table));
    };

    script.onerror = () => { cleanup(); reject(new Error("Sheet JSONP request failed")); };
    script.src = `${SHEET_CSV_URL.replace("out:csv", `out:json;responseHandler:${callbackName}`)}&cacheBust=${Date.now()}`;
    document.head.append(script);
  });
}

function rowsFromGoogleTable(table) {
  const headers = (table.cols || []).map((column) => String(column.label || "").trim().toLowerCase());
  return (table.rows || []).map((row, index) => {
    const get = (name) => {
      const cell = (row.c || [])[headers.indexOf(name.toLowerCase())] || {};
      return cell.f ?? cell.v ?? "";
    };
    return {
      id: `${get("Timestamp")}-${get("Name")}-${get("Date")}-${index}`,
      name: get("Name"),
      date: normalizeDate(get("Date")),
      steps: get("Steps"),
      updatedAt: get("Timestamp"),
    };
  });
}

function rowsFromCsv(csv) {
  const rows = parseCsv(csv);
  if (rows.length <= 1) return [];
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  return rows.slice(1).map((row, index) => {
    const get = (name) => row[headers.indexOf(name.toLowerCase())] || "";
    return {
      id: `${get("Timestamp")}-${get("Name")}-${get("Date")}-${index}`,
      name: get("Name"),
      date: normalizeDate(get("Date")),
      steps: get("Steps"),
      updatedAt: get("Timestamp"),
    };
  });
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const next = csv[i + 1];
    if (char === '"' && inQuotes && next === '"') { cell += '"'; i++; }
    else if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((items) => items.some(Boolean));
}

function normalizeDate(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return raw;
}

function normalizeEntries(entries) {
  const latestByPersonDate = new Map();
  for (const entry of entries) {
    const normalized = {
      id: entry.id || crypto.randomUUID(),
      name: titleCaseName(String(entry.name || "").trim()),
      date: normalizeDate(entry.date),
      steps: Number.parseInt(entry.steps, 10),
      updatedAt: entry.updatedAt || "",
    };
    if (!normalized.name || !/^\d{4}-\d{2}-\d{2}$/.test(normalized.date) || !Number.isFinite(normalized.steps) || normalized.steps < 0) continue;
    latestByPersonDate.set(`${normalized.name.toLowerCase()}|${normalized.date}`, normalized);
  }
  return [...latestByPersonDate.values()].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}

function titleCaseName(name) { return name.replace(/\s+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function isWithinChallengePeriod(entry) {
  return entry.date >= CHALLENGE_START && entry.date <= CHALLENGE_END;
}

function isLeaderboardEntry(entry) {
  return entry.steps > 0;
}

function groupStats(entries, sortBy = "average") {
  const stats = new Map();
  for (const entry of entries.filter(isLeaderboardEntry)) {
    const current = stats.get(entry.name) || { name: entry.name, total: 0, days: 0, best: 0 };
    current.total += entry.steps;
    current.days += 1;
    current.best = Math.max(current.best, entry.steps);
    stats.set(entry.name, current);
  }
  return [...stats.values()].map((person) => ({ ...person, average: Math.round(person.total / person.days) }))
    .sort((a, b) => {
      if (sortBy === "total") return b.total - a.total || b.average - a.average || a.name.localeCompare(b.name);
      return b.average - a.average || b.total - a.total || a.name.localeCompare(b.name);
    });
}
function challengeWeekKey(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const start = new Date(`${CHALLENGE_START}T00:00:00`);
  const end = new Date(`${CHALLENGE_END}T00:00:00`);
  if (date < start) return "pre-challenge";
  if (date > end) return "post-challenge";
  const dayOffset = Math.floor((date - start) / 86400000);
  const weekNumber = Math.floor(dayOffset / 7) + 1;
  return `challenge-week-${weekNumber}`;
}
function weekLabel(key) {
  if (key === "pre-challenge") return "Pre-challenge";
  if (key === "post-challenge") return "Post-challenge";
  const weekNumber = Number(key.replace("challenge-week-", ""));
  const start = new Date(`${CHALLENGE_START}T00:00:00`);
  const end = new Date(`${CHALLENGE_END}T00:00:00`);
  const weekStart = new Date(start);
  weekStart.setDate(start.getDate() + (weekNumber - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const cappedWeekEnd = weekEnd > end ? end : weekEnd;
  return `Challenge Week ${weekNumber} (${formatShortDate(weekStart)}–${formatShortDate(cappedWeekEnd)})`;
}
function weekSortValue(key) {
  if (key === "pre-challenge") return 0;
  if (key === "post-challenge") return 999;
  return Number(key.replace("challenge-week-", ""));
}
function render() { renderSummary(); renderWeekOptions(); renderOverallLeaderboard(); renderWeeklyLeaderboard(); renderEntries(); }
function renderSummary() {
  const activeChallengeEntries = state.entries.filter((entry) => isLeaderboardEntry(entry) && isWithinChallengePeriod(entry));
  const people = new Set(activeChallengeEntries.map((entry) => entry.name));
  const overall = groupStats(activeChallengeEntries);
  $("totalParticipants").textContent = people.size;
  $("totalEntries").textContent = activeChallengeEntries.length;
  $("overallPace").textContent = overall.length ? formatNumber(Math.round(overall.reduce((sum, item) => sum + item.average, 0) / overall.length)) : "0";
}
function renderWeekOptions() {
  const select = $("weekSelect");
  const previous = select.value;
  const weeks = [...new Set(state.entries.filter(isLeaderboardEntry).map((entry) => challengeWeekKey(entry.date)))].sort((a, b) => weekSortValue(b) - weekSortValue(a));
  select.innerHTML = "";
  if (!weeks.length) { select.innerHTML = '<option value="">No weeks yet</option>'; return; }
  for (const week of weeks) {
    const option = document.createElement("option");
    option.value = week; option.textContent = weekLabel(week); select.append(option);
  }
  select.value = weeks.includes(previous) ? previous : weeks[0];
}
function renderOverallLeaderboard() {
  const stats = groupStats(state.entries.filter(isWithinChallengePeriod));
  $("overallWinner").textContent = stats[0] ? `👑 ${stats[0].name}` : "No winner yet";
  renderLeaderboard($("overallLeaderboard"), stats, "average");
}
function renderWeeklyLeaderboard() {
  const week = $("weekSelect").value;
  const entries = week ? state.entries.filter((entry) => isLeaderboardEntry(entry) && challengeWeekKey(entry.date) === week) : [];
  renderLeaderboard($("weeklyLeaderboard"), groupStats(entries, "total"), "total");
}
function renderLeaderboard(container, stats, primaryMetric) {
  if (!stats.length) { container.className = "leaderboard empty"; container.textContent = "No submissions yet."; return; }
  container.className = "leaderboard";
  container.innerHTML = stats.map((person, index) => {
    const metric = primaryMetric === "total" ? person.total : person.average;
    const metricLabel = primaryMetric === "total" ? "weekly total" : "avg / submitted day";
    return `<div class="rank-row"><div class="medal">${index + 1}</div><div class="person"><strong>${escapeHtml(person.name)}</strong><span>${person.days} submitted day${person.days === 1 ? "" : "s"} · best ${formatNumber(person.best)}</span></div><div class="metric">${formatNumber(metric)}<br><span>${metricLabel}</span></div></div>`;
  }).join("");
}
function renderEntries() {
  const body = $("entriesBody");
  if (!state.entries.length) { body.innerHTML = '<tr><td colspan="4">No submissions yet. If you just submitted, click Refresh in a few seconds.</td></tr>'; return; }
  body.innerHTML = state.entries.map((entry) => `<tr><td>${escapeHtml(entry.name)}</td><td>${formatDate(entry.date)}</td><td>${formatNumber(entry.steps)}</td><td></td></tr>`).join("");
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function formatNumber(value) { return new Intl.NumberFormat("en-US").format(value); }
function formatDate(dateString) { return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function formatShortDate(date) { return date.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
