import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Redis } from "@upstash/redis";

const filePath = path.resolve(process.argv[2] || "data/salaries-2026-27.csv");

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  console.error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN.");
  process.exit(1);
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

const text = await fs.readFile(filePath, "utf8");
const lines = text.split(/\r?\n/).filter(Boolean);
const headers = parseCsvLine(lines.shift()).map((item) => item.toLowerCase());
const playerIdIndex = headers.indexOf("playerid");
const nameIndex = headers.indexOf("name");
const capHitIndex = headers.indexOf("caphit");

if (playerIdIndex < 0 || capHitIndex < 0) {
  console.error("CSV must include playerId and capHit columns.");
  process.exit(1);
}

const records = {};
for (const line of lines) {
  const columns = parseCsvLine(line);
  const playerId = Number(columns[playerIdIndex]);
  const capHit = Number(String(columns[capHitIndex]).replace(/[^0-9.]/g, ""));
  if (!Number.isInteger(playerId) || !Number.isFinite(capHit)) continue;

  records[String(playerId)] = JSON.stringify({
    playerId,
    name: nameIndex >= 0 ? columns[nameIndex] : "Unknown player",
    capHit,
    source: "csv-import",
    updatedAt: new Date().toISOString()
  });
}

if (Object.keys(records).length === 0) {
  console.error("No valid salary rows were found in the CSV.");
  process.exit(1);
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

await redis.hset("champions-league:salaries:2026-27", records);
console.log(`Imported ${Object.keys(records).length} salary records from ${filePath}.`);
