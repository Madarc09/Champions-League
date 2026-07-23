import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshot = JSON.parse(await fs.readFile(path.join(ROOT, "data", "SALARY_CAP_SPACE.json"), "utf8"));
const records = Array.isArray(snapshot.records) ? snapshot.records : [];
const teams = new Set(records.map((record) => record.team));
const duplicateKeys = new Set();
const seen = new Set();

for (const record of records) {
  const key = `${record.team}:${record.nameKey}:${record.position}`;
  if (seen.has(key)) duplicateKeys.add(key);
  seen.add(key);
  if (!Number.isFinite(Number(record.capHit)) || Number(record.capHit) < 0) {
    throw new Error(`Invalid cap hit: ${record.name}`);
  }
}

if (records.length !== 2197) throw new Error(`Expected 2,197 records, found ${records.length}.`);
if (teams.size !== 32) throw new Error(`Expected 32 teams, found ${teams.size}.`);
if (duplicateKeys.size) throw new Error(`Duplicate records: ${[...duplicateKeys].slice(0, 10).join(", ")}`);
if (Number(snapshot.signedCount) !== records.filter((record) => Number(record.capHit) > 0).length) throw new Error("Signed count is incorrect.");
if (Number(snapshot.zeroSalaryCount) !== records.filter((record) => Number(record.capHit) === 0).length) throw new Error("Zero salary count is incorrect.");

const elias = records.filter((record) => record.team === "VAN" && record.nameKey === "eliaspettersson");
if (elias.length !== 2 || !elias.some((record) => record.position === "F") || !elias.some((record) => record.position === "D")) {
  throw new Error("The two Vancouver Elias Pettersson records are not preserved by position.");
}

console.log(`Validated ${records.length} salary records across ${teams.size} teams with no duplicate team/name/position keys.`);
