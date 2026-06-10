const $ = (id) => document.getElementById(id);
const state = { entries: [] };
const ADMIN_PIN_STORAGE_KEY = "toplineStepsChallengeAdminPin:v1";
const today = new Date().toISOString().slice(0, 10);
const CHALLENGE_START = "2026-06-15";
const CHALLENGE_END = "2026-08-06";
$("dateInput").value = today;
$("adminPinInput").value = sessionStorage.getItem(ADMIN_PIN_STORAGE_KEY) || "";
$("adminPinInput").addEventListener("input", () => sessionStorage.setItem(ADMIN_PIN_STORAGE_KEY, $("adminPinInput").value));

init();

$("entryForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("nameInput").value.trim();
  const date = $("dateInput").value;
  const steps = Number.parseInt($("stepsInput").value, 10);
  if (!name || !date || !Number.isFinite(steps) || steps < 0) return;

  await api("/api/entries", { method: "POST", body: { name, date, steps } });
  $("stepsInput").value = "";
  $("nameInput").value = titleCaseName(name);
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

$("importInput").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const payload = JSON.parse(await file.text());
  await api("/api/import", { method: "POST", body: payload, admin: true });
  event.target.value = "";
  await loadEntries();
});

$("resetBtn").addEventListener("click", async () => {
  if (!confirm("Reset all shared submissions? Export first if you need a backup.")) return;
  await api("/api/reset", { method: "POST", admin: true });
  await loadEntries();
});

$("sampleBtn").addEventListener("click", async () => {
  await api("/api/sample", { method: "POST", admin: true });
  await loadEntries();
});

$("weekSelect").addEventListener("change", renderWeeklyLeaderboard);

async function init() {
  await loadEntries();
  setInterval(loadEntries, 30000);
}

async function loadEntries() {
  const payload = await api("/api/entries");
  state.entries = normalizeEntries(payload.entries);
  render();
}

async function api(path, options = {}) {
  const headers = {};
  if (options.body) headers["Content-Type"] = "application/json";
  if (options.admin) {
    const pin = $("adminPinInput").value.trim();
    if (!pin) {
      alert("Enter the admin PIN first.");
      throw new Error("Admin PIN required");
    }
    headers["X-Admin-Pin"] = pin;
  }

  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) {
    alert(payload.error || "Request failed");
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

function normalizeEntries(entries) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      id: entry.id || crypto.randomUUID(),
      name: titleCaseName(String(entry.name || "").trim()),
      date: String(entry.date || ""),
      steps: Number.parseInt(entry.steps, 10),
      updatedAt: entry.updatedAt || new Date().toISOString(),
    }))
    .filter((entry) => entry.name && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && Number.isFinite(entry.steps) && entry.steps >= 0)
    .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}

function titleCaseName(name) { return name.replace(/\s+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

function groupStats(entries) {
  const stats = new Map();
  for (const entry of entries) {
    const current = stats.get(entry.name) || { name: entry.name, total: 0, days: 0, best: 0 };
    current.total += entry.steps;
    current.days += 1;
    current.best = Math.max(current.best, entry.steps);
    stats.set(entry.name, current);
  }
  return [...stats.values()].map((person) => ({ ...person, average: Math.round(person.total / person.days) }))
    .sort((a, b) => b.average - a.average || b.total - a.total || a.name.localeCompare(b.name));
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

function render() {
  state.entries = normalizeEntries(state.entries);
  renderSummary(); renderWeekOptions(); renderOverallLeaderboard(); renderWeeklyLeaderboard(); renderEntries();
}
function renderSummary() {
  const people = new Set(state.entries.map((entry) => entry.name));
  const overall = groupStats(state.entries);
  $("totalParticipants").textContent = people.size;
  $("totalEntries").textContent = state.entries.length;
  $("overallPace").textContent = overall.length ? formatNumber(Math.round(overall.reduce((sum, item) => sum + item.average, 0) / overall.length)) : "0";
}
function renderWeekOptions() {
  const select = $("weekSelect");
  const previous = select.value;
  const weeks = [...new Set(state.entries.map((entry) => challengeWeekKey(entry.date)))].sort((a, b) => weekSortValue(b) - weekSortValue(a));
  select.innerHTML = "";
  if (!weeks.length) { select.innerHTML = '<option value="">No weeks yet</option>'; return; }
  for (const week of weeks) {
    const option = document.createElement("option");
    option.value = week; option.textContent = weekLabel(week); select.append(option);
  }
  select.value = weeks.includes(previous) ? previous : weeks[0];
}
function renderOverallLeaderboard() {
  const stats = groupStats(state.entries);
  $("overallWinner").textContent = stats[0] ? `👑 ${stats[0].name}` : "No winner yet";
  renderLeaderboard($("overallLeaderboard"), stats, "average");
}
function renderWeeklyLeaderboard() {
  const week = $("weekSelect").value;
  const entries = week ? state.entries.filter((entry) => challengeWeekKey(entry.date) === week) : [];
  renderLeaderboard($("weeklyLeaderboard"), groupStats(entries), "total");
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
  if (!state.entries.length) { body.innerHTML = '<tr><td colspan="4">No submissions yet.</td></tr>'; return; }
  body.innerHTML = state.entries.map((entry) => `<tr><td>${escapeHtml(entry.name)}</td><td>${formatDate(entry.date)}</td><td>${formatNumber(entry.steps)}</td><td><button class="danger delete-btn" type="button" data-delete="${entry.id}">Delete</button></td></tr>`).join("");
  body.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", async () => { await api(`/api/entries/${encodeURIComponent(button.dataset.delete)}`, { method: "DELETE", admin: true }); await loadEntries(); });
  });
}
function formatNumber(value) { return new Intl.NumberFormat("en-US").format(value); }
function formatDate(dateString) { return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function formatShortDate(date) { return date.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
