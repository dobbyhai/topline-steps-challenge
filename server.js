const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT || 4180);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "entries.json");
const ADMIN_PIN = process.env.ADMIN_PIN || "";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

let writeQueue = Promise.resolve();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/entries") {
      if (req.method === "GET") return sendJson(res, { entries: await readEntries() });
      if (req.method === "POST") {
        const body = await readBody(req);
        const saved = await upsertEntry(body);
        return sendJson(res, { ok: true, entry: saved, entries: await readEntries() }, 201);
      }
    }

    if (url.pathname.startsWith("/api/entries/") && req.method === "DELETE") {
      requireAdmin(req);
      const id = decodeURIComponent(url.pathname.replace("/api/entries/", ""));
      await deleteEntry(id);
      return sendJson(res, { ok: true, entries: await readEntries() });
    }

    if (url.pathname === "/api/import" && req.method === "POST") {
      requireAdmin(req);
      const body = await readBody(req);
      const imported = normalizeEntries(Array.isArray(body) ? body : body.entries);
      await writeEntries(imported);
      return sendJson(res, { ok: true, entries: imported });
    }

    if (url.pathname === "/api/reset" && req.method === "POST") {
      requireAdmin(req);
      await writeEntries([]);
      return sendJson(res, { ok: true, entries: [] });
    }

    if (url.pathname === "/api/sample" && req.method === "POST") {
      requireAdmin(req);
      const sample = sampleEntries();
      await writeEntries(sample);
      return sendJson(res, { ok: true, entries: sample });
    }

    if (url.pathname.startsWith("/api/")) return sendJson(res, { error: "Not found" }, 404);

    const filePath = safeStaticPath(url.pathname);
    const content = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  } catch (error) {
    if (error.code === "ENOENT") return sendJson(res, { error: "Not found" }, 404);
    if (error.statusCode) return sendJson(res, { error: error.message }, error.statusCode);
    console.error(error);
    sendJson(res, { error: "Server error" }, 500);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Topline Steps Challenge running at http://${HOST}:${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});

function safeStaticPath(pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const resolved = path.resolve(ROOT, `.${requested}`);
  if (!resolved.startsWith(ROOT) || resolved.includes(`${path.sep}data${path.sep}`)) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    throw error;
  }
  return resolved;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Invalid JSON");
    error.statusCode = 400;
    throw error;
  }
}

function requireAdmin(req) {
  if (!ADMIN_PIN) return;
  const provided = req.headers["x-admin-pin"] || "";
  if (provided === ADMIN_PIN) return;
  const error = new Error("Admin PIN required.");
  error.statusCode = 401;
  throw error;
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readEntries() {
  try {
    return normalizeEntries(JSON.parse(await fs.readFile(DATA_FILE, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeEntries(entries) {
  const normalized = normalizeEntries(entries);
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, `${JSON.stringify(normalized, null, 2)}\n`);
  });
  await writeQueue;
  return normalized;
}

async function upsertEntry(input) {
  const name = titleCaseName(String(input.name || "").trim());
  const date = String(input.date || "");
  const steps = Number.parseInt(input.steps, 10);
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(steps) || steps < 0) {
    const error = new Error("Name, valid date, and non-negative steps are required.");
    error.statusCode = 400;
    throw error;
  }

  const entries = await readEntries();
  const existing = entries.find((entry) => entry.name.toLowerCase() === name.toLowerCase() && entry.date === date);
  const saved = existing || { id: crypto.randomUUID(), name, date, steps, updatedAt: new Date().toISOString() };
  saved.name = name;
  saved.date = date;
  saved.steps = steps;
  saved.updatedAt = new Date().toISOString();

  if (!existing) entries.push(saved);
  await writeEntries(entries);
  return saved;
}

async function deleteEntry(id) {
  const entries = await readEntries();
  await writeEntries(entries.filter((entry) => entry.id !== id));
}

function normalizeEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
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

function titleCaseName(name) {
  return name.replace(/\s+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sampleEntries() {
  const names = ["Summer", "Liz", "Alex", "Priya", "Jordan"];
  const start = new Date();
  start.setDate(start.getDate() - 9);
  return names.flatMap((name, personIndex) =>
    Array.from({ length: 8 }, (_, dayIndex) => {
      const date = new Date(start);
      date.setDate(start.getDate() + dayIndex);
      return {
        id: crypto.randomUUID(),
        name,
        date: date.toISOString().slice(0, 10),
        steps: 6500 + personIndex * 850 + ((dayIndex * 1379 + personIndex * 613) % 5200),
        updatedAt: new Date().toISOString(),
      };
    }),
  );
}
