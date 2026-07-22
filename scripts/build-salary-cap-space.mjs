import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIVE_POOL_URL = process.env.SALARY_CAP_SPACE_SOURCE_URL
  || "https://leagueofchampions.vercel.app/api/players?mode=leaderboard";
const OUTPUT_DIR = process.env.SALARY_CAP_SPACE_OUTPUT_DIR
  ? path.resolve(process.env.SALARY_CAP_SPACE_OUTPUT_DIR)
  : path.join(ROOT, "data");
const CAPSPACE_BASE_URL = process.env.CAPSPACE_BASE_URL || "https://cap-space.com";
const JSON_OUTPUT = path.join(OUTPUT_DIR, "SALARY_CAP_SPACE.json");
const CSV_OUTPUT = path.join(OUTPUT_DIR, "SALARY_CAP_SPACE.csv");
const ZERO_OUTPUT = path.join(OUTPUT_DIR, "SALARY_CAP_SPACE_ZERO_LIST.csv");
const SUPPLEMENTS_PATH = path.join(ROOT, "data", "salary-cap-space-supplements.json");

const TEAMS = [
  ["ana", "ANA"], ["bos", "BOS"], ["buf", "BUF"], ["cgy", "CGY"],
  ["car", "CAR"], ["chi", "CHI"], ["col", "COL"], ["cbj", "CBJ"],
  ["dal", "DAL"], ["det", "DET"], ["edm", "EDM"], ["fla", "FLA"],
  ["lak", "LAK"], ["min", "MIN"], ["mtl", "MTL"], ["nsh", "NSH"],
  ["njd", "NJD"], ["nyi", "NYI"], ["nyr", "NYR"], ["ott", "OTT"],
  ["phi", "PHI"], ["pit", "PIT"], ["sjs", "SJS"], ["sea", "SEA"],
  ["stl", "STL"], ["tbl", "TBL"], ["tor", "TOR"], ["uta", "UTA"],
  ["van", "VAN"], ["vgk", "VGK"], ["wsh", "WSH"], ["wpg", "WPG"]
];

const NAMED_ENTITIES = {
  nbsp: " ", amp: "&", quot: '"', apos: "'", ndash: "–", mdash: "—",
  agrave: "à", aacute: "á", acirc: "â", atilde: "ã", auml: "ä", aring: "å", aelig: "æ",
  Agrave: "À", Aacute: "Á", Acirc: "Â", Atilde: "Ã", Auml: "Ä", Aring: "Å", AElig: "Æ",
  ccedil: "ç", ccaron: "č", Ccedil: "Ç", Ccaron: "Č",
  egrave: "è", eacute: "é", ecirc: "ê", euml: "ë", ecaron: "ě",
  Egrave: "È", Eacute: "É", Ecirc: "Ê", Euml: "Ë", Ecaron: "Ě",
  igrave: "ì", iacute: "í", icirc: "î", iuml: "ï",
  Igrave: "Ì", Iacute: "Í", Icirc: "Î", Iuml: "Ï",
  ntilde: "ñ", ncaron: "ň", Ntilde: "Ñ", Ncaron: "Ň",
  ograve: "ò", oacute: "ó", ocirc: "ô", otilde: "õ", ouml: "ö", oslash: "ø",
  Ograve: "Ò", Oacute: "Ó", Ocirc: "Ô", Otilde: "Õ", Ouml: "Ö", Oslash: "Ø",
  scaron: "š", Scaron: "Š", zcaron: "ž", Zcaron: "Ž",
  ugrave: "ù", uacute: "ú", ucirc: "û", uuml: "ü", uring: "ů",
  Ugrave: "Ù", Uacute: "Ú", Ucirc: "Û", Uuml: "Ü", Uring: "Ů",
  yacute: "ý", yuml: "ÿ", Yacute: "Ý", Yuml: "Ÿ",
  eth: "ð", thorn: "þ", Eth: "Ð", Thorn: "Þ", szlig: "ß",
  lstrok: "ł", Lstrok: "Ł", dstrok: "đ", Dstrok: "Đ"
};

function decodeHtml(value) {
  return String(value || "")
    .replace(/&#([0-9]+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-zA-Z]+);/g, (match, name) => NAMED_ENTITIES[name] ?? match);
}

function cleanText(value) {
  return decodeHtml(String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function displayName(value) {
  const name = cleanText(value)
    .replace(/\s+["“”](?:A|C)["“”]\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name.includes(",")) return name;
  const [last, ...first] = name.split(",");
  return [...first, last].join(" ").replace(/\s+/g, " ").trim();
}

function canonicalName(value) {
  return displayName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/gi, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}

function normalizeTeam(value) {
  const team = String(value || "").trim().toUpperCase();
  return team === "ARI" ? "UTA" : team;
}

function parseMoney(value) {
  const amount = Number(String(value || "").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(amount) || amount < 500_000 || amount > 30_000_000) return 0;
  return Math.round(amount);
}

function salaryFromRow(row) {
  const values = [...String(row || "").matchAll(/\$\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{6,8})/g)]
    .map((match) => parseMoney(match[1]))
    .filter((value) => value > 0);
  return values[0] || 0;
}

function findHeadingIndex(html, heading, fromIndex = 0) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`<h[1-6]\\b[^>]*>[\\s\\S]{0,160}?${escaped}[\\s\\S]{0,160}?<\\/h[1-6]>`, "i");
  const match = expression.exec(String(html || "").slice(fromIndex));
  return match ? fromIndex + match.index : -1;
}

function rosterSection(html) {
  const source = String(html || "");
  const start = findHeadingIndex(source, "NHL Roster");
  if (start < 0) return source;
  const ends = [
    findHeadingIndex(source, "Reserve Rights", start + 1),
    findHeadingIndex(source, "Draft Picks", start + 1)
  ].filter((index) => index > start);
  return source.slice(start, ends.length ? Math.min(...ends) : source.length);
}

function parseCapSpaceTeam(html, team) {
  const section = rosterSection(html);
  const records = [];
  const seen = new Set();
  const rowExpression = /<tr\b[^>]*>[\s\S]*?<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowExpression.exec(section)) !== null) {
    const row = rowMatch[0];
    const anchor = row.match(/<a\b[^>]*href=["'](?:https?:\/\/(?:www\.)?cap-space\.com)?\/person\/([^"'?#]+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;
    const name = displayName(anchor[2]);
    const key = canonicalName(name);
    const capHit = salaryFromRow(row);
    if (!key || !name || capHit <= 0 || seen.has(key)) continue;
    seen.add(key);
    records.push({ name, nameKey: key, team, capHit, source: "CapSpace" });
  }

  return records;
}

async function fetchText(url, { attempts = 3, timeoutMs = 45_000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/json",
          "User-Agent": "Champions-League-Salary-Cap-Space/1.0"
        }
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Unable to fetch ${url}: ${lastError?.message || "unknown error"}`);
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function positionOf(player) {
  return String(player.position || player.rosterType || player.positionCode || "").toUpperCase();
}

function makeBaseRecord(player) {
  const rawCapHit = Number(player.capHit);
  const capHit = Number.isFinite(rawCapHit) && rawCapHit >= 500_000 ? Math.round(rawCapHit) : 0;
  return {
    playerId: Number(player.playerId),
    name: String(player.name || "").trim(),
    team: normalizeTeam(player.team),
    position: positionOf(player),
    capHit,
    status: capHit > 0 ? "signed" : "zero",
    source: capHit > 0 ? "Champions League live page" : ""
  };
}

function buildCapSpaceIndexes(records) {
  const byTeamAndName = new Map();
  const candidatesByName = new Map();
  for (const record of records) {
    byTeamAndName.set(`${record.team}:${record.nameKey}`, record);
    if (!candidatesByName.has(record.nameKey)) candidatesByName.set(record.nameKey, []);
    candidatesByName.get(record.nameKey).push(record);
  }
  return { byTeamAndName, candidatesByName };
}

function findCapSpaceRecord(player, indexes) {
  const nameKey = canonicalName(player.name);
  const teamMatch = indexes.byTeamAndName.get(`${normalizeTeam(player.team)}:${nameKey}`);
  if (teamMatch) return teamMatch;
  const candidates = indexes.candidatesByName.get(nameKey) || [];
  return candidates.length === 1 ? candidates[0] : null;
}

function applySupplements(records, supplements) {
  const byId = new Map(records.map((record) => [String(record.playerId), record]));
  const byTeamAndName = new Map(records.map((record) => [`${record.team}:${canonicalName(record.name)}`, record]));
  const byName = new Map();
  for (const record of records) {
    const key = canonicalName(record.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(record);
  }

  for (const supplement of supplements) {
    let target = supplement.playerId != null ? byId.get(String(supplement.playerId)) : null;
    if (!target && supplement.team) {
      target = byTeamAndName.get(`${normalizeTeam(supplement.team)}:${canonicalName(supplement.name)}`) || null;
    }
    if (!target) {
      const candidates = byName.get(canonicalName(supplement.name)) || [];
      if (candidates.length === 1) target = candidates[0];
    }
    const capHit = parseMoney(supplement.capHit);
    if (!target || capHit <= 0) continue;
    target.capHit = capHit;
    target.status = "signed";
    target.source = supplement.source || "Salary supplement";
  }
}

async function main() {
  console.log(`Building SALARY CAP SPACE from ${LIVE_POOL_URL}`);
  const liveText = await fetchText(LIVE_POOL_URL, { attempts: 3, timeoutMs: 120_000 });
  let payload;
  try {
    payload = JSON.parse(liveText);
  } catch (error) {
    throw new Error(`The live player feed was not valid JSON: ${error.message}`);
  }

  const players = Array.isArray(payload.players) ? payload.players : [];
  if (players.length === 0) throw new Error("The live player feed returned no players. The deployment was stopped before replacing the salary file.");

  const records = players.map(makeBaseRecord).filter((record) => Number.isInteger(record.playerId) && record.name);
  const idCount = new Set(records.map((record) => String(record.playerId))).size;
  if (idCount !== records.length) throw new Error(`The live feed contained ${records.length - idCount} duplicate player IDs. The deployment was stopped.`);

  const initialZeroCount = records.filter((record) => record.capHit === 0).length;
  console.log(`Copied ${records.length} pool players; ${initialZeroCount} had a zero salary.`);

  let capSpaceRecords = [];
  if (initialZeroCount > 0) {
    const results = await Promise.allSettled(TEAMS.map(async ([slug, abbreviation]) => {
      const html = await fetchText(`${CAPSPACE_BASE_URL}/team/${slug}`, { attempts: 3, timeoutMs: 45_000 });
      return parseCapSpaceTeam(html, abbreviation);
    }));

    const failedTeams = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") capSpaceRecords.push(...result.value);
      else failedTeams.push(`${TEAMS[index][1]}: ${result.reason?.message || "failed"}`);
    });

    if (failedTeams.length) {
      console.warn(`CapSpace pages that could not be read: ${failedTeams.join("; ")}`);
    }

    const indexes = buildCapSpaceIndexes(capSpaceRecords);
    for (const record of records) {
      if (record.capHit > 0) continue;
      const match = findCapSpaceRecord(record, indexes);
      if (!match) continue;
      record.capHit = match.capHit;
      record.status = "signed";
      record.source = match.source;
    }
  }

  const supplements = JSON.parse(await fs.readFile(SUPPLEMENTS_PATH, "utf8"));
  applySupplements(records, Array.isArray(supplements.records) ? supplements.records : []);

  records.sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base" }));
  const generatedAt = new Date().toISOString();
  const signedCount = records.filter((record) => record.capHit > 0).length;
  const zeroRecords = records.filter((record) => record.capHit === 0);

  const snapshot = {
    season: "2026-27",
    generatedAt,
    sourceUrl: LIVE_POOL_URL,
    sourceMethod: "Every player and salary shown by the Champions League live page; zero salaries filled from CapSpace and explicit recent-contract supplements.",
    recordCount: records.length,
    signedCount,
    zeroSalaryCount: zeroRecords.length,
    records
  };

  const headers = ["playerId", "name", "team", "position", "capHit", "status", "source"];
  const csv = [
    headers.join(","),
    ...records.map((record) => headers.map((header) => csvCell(record[header])).join(","))
  ].join("\n") + "\n";
  const zeroCsv = [
    headers.join(","),
    ...zeroRecords.map((record) => headers.map((header) => csvCell(record[header])).join(","))
  ].join("\n") + "\n";

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const tempJson = `${JSON_OUTPUT}.tmp`;
  await fs.writeFile(tempJson, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await fs.rename(tempJson, JSON_OUTPUT);
  await fs.writeFile(CSV_OUTPUT, csv, "utf8");
  await fs.writeFile(ZERO_OUTPUT, zeroCsv, "utf8");

  console.log(`SALARY CAP SPACE complete: ${records.length} players, ${signedCount} signed salaries, ${zeroRecords.length} zero salaries.`);
  if (zeroRecords.length) {
    console.log(`Zero list written to ${path.relative(ROOT, ZERO_OUTPUT)}.`);
  }
}

main().catch((error) => {
  console.error(`SALARY CAP SPACE build failed: ${error.message}`);
  process.exitCode = 1;
});
