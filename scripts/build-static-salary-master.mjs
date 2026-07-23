import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = path.join(ROOT, "data", "SALARY_CAP_MASTER_2026-27.csv");
const JSON_OUTPUT = path.join(ROOT, "data", "SALARY_CAP_SPACE.json");
const CSV_OUTPUT = path.join(ROOT, "data", "SALARY_CAP_SPACE.csv");
const ZERO_OUTPUT = path.join(ROOT, "data", "SALARY_CAP_SPACE_ZERO_LIST.csv");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (character === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  const [headers, ...body] = rows.filter((item) => item.some((value) => value !== ""));
  return body.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function canonicalName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/gi, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(records) {
  const headers = ["name", "team", "teamName", "position", "rosterStatus", "capHit", "salaryState", "source"];
  return [
    headers.join(","),
    ...records.map((record) => headers.map((header) => csvCell(record[header])).join(","))
  ].join("\n") + "\n";
}

const sourceRows = parseCsv(await fs.readFile(INPUT, "utf8"));
const records = sourceRows.map((row) => {
  const capHit = Number(row.capHit || 0);
  if (!Number.isFinite(capHit) || capHit < 0) throw new Error(`Invalid cap hit for ${row.name}`);

  const position = String(row.position || "F").toUpperCase();
  if (!["F", "D", "G"].includes(position)) throw new Error(`Invalid position for ${row.name}: ${position}`);

  return {
    name: String(row.name || "").trim(),
    nameKey: canonicalName(row.name),
    team: String(row.team || "").trim().toUpperCase(),
    teamName: String(row.teamName || "").trim(),
    position,
    rosterStatus: String(row.rosterStatus || "").trim(),
    capHit: Math.round(capHit),
    salaryState: capHit > 0 ? "signed" : "unsigned",
    source: "Champions League 2026-27 master salary list"
  };
});

const duplicateKeys = new Map();
for (const record of records) {
  const key = `${record.team}:${record.nameKey}:${record.position}`;
  duplicateKeys.set(key, (duplicateKeys.get(key) || 0) + 1);
}
const duplicates = [...duplicateKeys.entries()].filter(([, count]) => count > 1);
if (duplicates.length) throw new Error(`Duplicate master records: ${duplicates.slice(0, 10).map(([key]) => key).join(", ")}`);

records.sort((left, right) =>
  left.team.localeCompare(right.team)
  || left.name.localeCompare(right.name, "en", { sensitivity: "base" })
  || left.position.localeCompare(right.position)
);

const teams = new Set(records.map((record) => record.team));
const signedCount = records.filter((record) => record.capHit > 0).length;
const zeroRecords = records.filter((record) => record.capHit === 0);
const statusCounts = Object.fromEntries(
  [...new Set(records.map((record) => record.rosterStatus))]
    .sort()
    .map((status) => [status, records.filter((record) => record.rosterStatus === status).length])
);

if (teams.size !== 32) throw new Error(`Expected 32 NHL teams, found ${teams.size}.`);
if (records.length !== 2197) throw new Error(`Expected 2,197 salary records, found ${records.length}.`);

const snapshot = {
  season: "2026-27",
  generatedAt: "2026-07-22",
  sourceFile: "data/SALARY_CAP_MASTER_2026-27.xlsx",
  sourceMethod: "Static 32-team master assembled from the 2026-27 PuckPedia roster pages. The website reads this frozen file only; it does not refresh salaries from an API.",
  recordCount: records.length,
  teamCount: teams.size,
  signedCount,
  zeroSalaryCount: zeroRecords.length,
  statusCounts,
  records
};

await fs.writeFile(JSON_OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
await fs.writeFile(CSV_OUTPUT, writeCsv(records), "utf8");
await fs.writeFile(ZERO_OUTPUT, writeCsv(zeroRecords), "utf8");

console.log(`Static salary master built: ${records.length} records, ${teams.size} teams, ${signedCount} signed, ${zeroRecords.length} unsigned/$0.`);
