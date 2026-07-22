import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_ENDPOINT = "http://localhost:3000/api/players?mode=leaderboard";
const OUTPUT_DIR = path.resolve("data/salary-audit-output");

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(headers, rows) {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))
  ].join("\n") + "\n";
}


function numericCapHit(value) {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function canonicalName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/gi, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}

async function loadPayload() {
  const inputPath = option("--input");
  if (inputPath) {
    return JSON.parse(await fs.readFile(path.resolve(inputPath), "utf8"));
  }

  const endpoint = option("--url") || DEFAULT_ENDPOINT;
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Player endpoint returned ${response.status}: ${endpoint}`);
  }
  return response.json();
}

const payload = await loadPayload();
const players = Array.isArray(payload.players) ? payload.players : [];
if (!players.length) {
  throw new Error("No players were returned. Run this against the full leaderboard player endpoint.");
}

const seenIds = new Map();
const seenNames = new Map();
const duplicateRows = [];

for (const player of players) {
  const id = String(player.playerId ?? "");
  const nameKey = canonicalName(player.name);

  if (id && seenIds.has(id)) {
    duplicateRows.push({
      duplicateType: "playerId",
      duplicateKey: id,
      keptName: seenIds.get(id).name,
      duplicateName: player.name,
      keptTeam: seenIds.get(id).team,
      duplicateTeam: player.team
    });
  } else if (id) {
    seenIds.set(id, player);
  }

  if (nameKey && seenNames.has(nameKey) && String(seenNames.get(nameKey).playerId) !== id) {
    duplicateRows.push({
      duplicateType: "canonicalName",
      duplicateKey: nameKey,
      keptName: seenNames.get(nameKey).name,
      duplicateName: player.name,
      keptTeam: seenNames.get(nameKey).team,
      duplicateTeam: player.team
    });
  } else if (nameKey) {
    seenNames.set(nameKey, player);
  }
}

const masterRows = players
  .map((player) => {
    const capHit = numericCapHit(player.capHit);
    return {
      playerId: player.playerId,
      name: player.name,
      team: player.team,
      position: player.position || player.rosterType,
      rosterType: player.rosterType,
      capHit: capHit ?? "",
      salaryState: capHit == null ? "unresolved" : "signed",
      salarySource: player.salarySource || "",
      salaryUpdatedAt: player.salaryUpdatedAt || ""
    };
  })
  .sort((left, right) => String(left.name).localeCompare(String(right.name)));

const missingRows = masterRows.filter((row) => row.capHit === "");

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await Promise.all([
  fs.writeFile(
    path.join(OUTPUT_DIR, "salaries-current-snapshot.csv"),
    toCsv(
      ["playerId", "name", "team", "position", "rosterType", "capHit", "salaryState", "salarySource", "salaryUpdatedAt"],
      masterRows
    )
  ),
  fs.writeFile(
    path.join(OUTPUT_DIR, "salary-missing-review.csv"),
    toCsv(
      ["playerId", "name", "team", "position", "rosterType", "capHit", "salaryState", "salarySource", "salaryUpdatedAt"],
      missingRows
    )
  ),
  fs.writeFile(
    path.join(OUTPUT_DIR, "player-duplicates-review.csv"),
    toCsv(
      ["duplicateType", "duplicateKey", "keptName", "duplicateName", "keptTeam", "duplicateTeam"],
      duplicateRows
    )
  ),
  fs.writeFile(
    path.join(OUTPUT_DIR, "audit-summary.json"),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      playerCount: players.length,
      salaryCount: masterRows.length - missingRows.length,
      missingSalaryCount: missingRows.length,
      duplicateCount: duplicateRows.length,
      source: payload.salaryData || null,
      playerPool: payload.poolData || null
    }, null, 2) + "\n"
  )
]);

console.log(`Salary audit created in ${OUTPUT_DIR}`);
console.log(`Players: ${players.length}`);
console.log(`Salaries present: ${masterRows.length - missingRows.length}`);
console.log(`Missing/unresolved: ${missingRows.length}`);
console.log(`Potential duplicates: ${duplicateRows.length}`);
