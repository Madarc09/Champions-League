import { getRedis } from "@/lib/redis";

const CAPSPACE_BASE = "https://cap-space.com";
const TARGET_SEASON = "2026-27";
const SNAPSHOT_KEY = "champions-league:capspace-open-source-snapshot:2026-27:v6-resilient";
const LEGACY_SNAPSHOT_KEYS = [
  "champions-league:capspace-open-source-snapshot:2026-27:v5-strict-roster-counts",
  "champions-league:capspace-open-source-snapshot:2026-27:v3-rookies"
];
const REFRESH_SECONDS = 60 * 60 * 6;
const STALE_CACHE_SECONDS = 60 * 60 * 24 * 7;
const MIN_VALID_RECORDS = 450;

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

let memorySnapshot = null;
let memoryExpiresAt = 0;

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
  return decodeHtml(
    String(value || "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
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

export function canonicalPlayerName(value) {
  return displayName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/gi, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}

function parseMoney(value) {
  const amount = Number(String(value || "").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(amount) || amount < 500_000 || amount > 30_000_000) return null;
  return Math.round(amount);
}

export function parseCapSpaceRosterCount(html) {
  const text = cleanText(html);
  const patterns = [
    /\bRoster\s*:\s*(\d{1,2})\b/i,
    /\bRoster\s+(\d{1,2})\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const count = Number(match?.[1]);
    if (Number.isInteger(count) && count >= 1 && count <= 50) return count;
  }

  return null;
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

  const possibleEnds = [
    findHeadingIndex(source, "Reserve Rights", start + 1),
    findHeadingIndex(source, "Draft Picks", start + 1)
  ].filter((index) => index > start);

  const end = possibleEnds.length ? Math.min(...possibleEnds) : source.length;
  return source.slice(start, end);
}

function salaryFromRow(row) {
  const values = [...String(row || "").matchAll(/\$\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{6,8})/g)]
    .map((match) => parseMoney(match[1]))
    .filter((value) => value != null);
  return values[0] ?? null;
}

function recordFromRow(row, teamSlug, teamAbbreviation) {
  const anchor = String(row || "").match(
    /<a\b[^>]*href=["'](?:https?:\/\/(?:www\.)?cap-space\.com)?\/person\/([^"'?#]+)["'][^>]*>([\s\S]*?)<\/a>/i
  );
  if (!anchor) return null;

  const name = displayName(anchor[2]);
  const key = canonicalPlayerName(name);
  const capHit = salaryFromRow(row);
  if (!key || !name || capHit == null) return null;

  return {
    key,
    name,
    capHit,
    playerSlug: anchor[1],
    teamSlug,
    teamAbbreviation,
    season: TARGET_SEASON,
    source: "CapSpace open-source team data"
  };
}

/**
 * CapSpace renders every team's contract tables on the server. The first money
 * column in the NHL Roster and signed Non-Roster sections is the current
 * 2026-27 cap hit. Including Non-Roster contracts is necessary for signed
 * rookies and prospects who have not played an NHL game yet.
 */
export function parseCapSpaceTeamHtml(html, teamSlug = "unknown", teamAbbreviation = "—") {
  const section = rosterSection(html);
  const records = [];
  const seen = new Set();
  const rowExpression = /<tr\b[^>]*>[\s\S]*?<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowExpression.exec(section)) !== null) {
    const record = recordFromRow(rowMatch[0], teamSlug, teamAbbreviation);
    if (!record || seen.has(record.key)) continue;
    seen.add(record.key);
    records.push(record);
  }

  // Defensive fallback for a future markup change where table row tags are
  // removed but person links and salaries remain in the same local segment.
  if (records.length === 0) {
    const playerExpression = /<a\b[^>]*href=["'](?:https?:\/\/(?:www\.)?cap-space\.com)?\/person\/([^"'?#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const links = [];
    let linkMatch;
    while ((linkMatch = playerExpression.exec(section)) !== null) {
      links.push({ start: linkMatch.index, end: playerExpression.lastIndex });
    }

    for (let index = 0; index < links.length; index += 1) {
      const current = links[index];
      const next = links[index + 1]?.start ?? Math.min(section.length, current.end + 1800);
      const record = recordFromRow(section.slice(current.start, next), teamSlug, teamAbbreviation);
      if (!record || seen.has(record.key)) continue;
      seen.add(record.key);
      records.push(record);
    }
  }

  return records;
}

function indexRecords(records) {
  const byName = {};
  const byTeamAndName = {};
  const candidatesByName = {};

  for (const record of records) {
    const teamKey = `${record.teamAbbreviation}:${record.key}`;
    const teamCurrent = byTeamAndName[teamKey];
    if (!teamCurrent || record.capHit > teamCurrent.capHit) byTeamAndName[teamKey] = record;

    if (!candidatesByName[record.key]) candidatesByName[record.key] = [];
    candidatesByName[record.key].push(record);

    const current = byName[record.key];
    // The team-aware index is authoritative. The name-only index remains a
    // compatibility fallback and uses the full (not retained) cap charge.
    if (!current || record.capHit > current.capHit) byName[record.key] = record;
  }

  const ambiguousNames = Object.entries(candidatesByName)
    .filter(([, candidates]) => new Set(candidates.map((record) => record.teamAbbreviation)).size > 1)
    .map(([key, candidates]) => ({
      key,
      names: [...new Set(candidates.map((record) => record.name))],
      teams: [...new Set(candidates.map((record) => record.teamAbbreviation))].sort()
    }));

  return { byName, byTeamAndName, ambiguousNames };
}

async function fetchWithTimeout(url, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      next: { revalidate: REFRESH_SECONDS },
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Champions-League-Fantasy-Hockey/1.0"
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTeam([teamSlug, teamAbbreviation], { strict = false } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchWithTimeout(`${CAPSPACE_BASE}/team/${teamSlug}`);
      if (!response.ok) throw new Error(`${teamAbbreviation} returned ${response.status}`);

      const html = await response.text();
      const records = parseCapSpaceTeamHtml(html, teamSlug, teamAbbreviation);
      const expectedRosterCount = parseCapSpaceRosterCount(html);

      // Normal page loads accept a plausible contract table so one parser or
      // source hiccup cannot erase every salary. Exact validation is only used
      // for Nick's explicit full-audit button.
      if (records.length < 10) {
        throw new Error(`${teamAbbreviation} returned only ${records.length} contract rows`);
      }
      if (strict) {
        if (expectedRosterCount == null || expectedRosterCount < 10) {
          throw new Error(`${teamAbbreviation} did not publish a valid roster-row count`);
        }
        if (records.length !== expectedRosterCount) {
          throw new Error(
            `${teamAbbreviation} published ${expectedRosterCount} salary-bearing roster rows but ${records.length} were parsed`
          );
        }
      }
      return { records, expectedRosterCount };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw lastError || new Error(`${teamAbbreviation} could not be loaded`);
}

async function mapWithConcurrency(items, concurrency, worker) {
  const output = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      output[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return output;
}

function normalizeSnapshot(value) {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return normalizeSnapshot(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || !value.byName) return null;
  return value;
}

function snapshotIsFresh(snapshot) {
  const updated = Date.parse(snapshot?.updatedAt || "");
  return Number.isFinite(updated) && Date.now() - updated < REFRESH_SECONDS * 1000;
}

async function readRedisSnapshot() {
  const redis = getRedis();
  if (!redis) return null;

  for (const key of [SNAPSHOT_KEY, ...LEGACY_SNAPSHOT_KEYS]) {
    try {
      const snapshot = normalizeSnapshot(await redis.get(key));
      const recordCount = Number(snapshot?.recordCount || Object.keys(snapshot?.byName || {}).length);
      if (snapshot && recordCount >= MIN_VALID_RECORDS) {
        return { ...snapshot, recordCount, cacheKey: key };
      }
    } catch (error) {
      console.error(`Unable to read the CapSpace salary cache ${key}:`, error);
    }
  }

  return null;
}

async function writeRedisSnapshot(snapshot) {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(SNAPSHOT_KEY, JSON.stringify(snapshot), { ex: STALE_CACHE_SECONDS });
  } catch (error) {
    console.error("Unable to save the CapSpace salary cache:", error);
  }
}

async function buildSnapshot({ strict = false } = {}) {
  const failures = [];
  const teamResults = await mapWithConcurrency(TEAMS, 8, async (team) => {
    try {
      const result = await fetchTeam(team, { strict });
      return {
        teamSlug: team[0],
        teamAbbreviation: team[1],
        records: result.records,
        expectedRosterCount: result.expectedRosterCount
      };
    } catch (error) {
      const failure = {
        teamSlug: team[0],
        teamAbbreviation: team[1],
        message: error?.message || "Unknown error"
      };
      failures.push(failure);
      return { ...failure, records: [], expectedRosterCount: null };
    }
  });

  if (strict && failures.length) {
    const failed = failures.map((failure) => `${failure.teamAbbreviation}: ${failure.message}`).join("; ");
    throw new Error(`Salary master was not rebuilt because ${failures.length} of 32 team pages failed (${failed}).`);
  }

  const indexed = indexRecords(teamResults.flatMap((result) => result.records));
  const teamRecordCounts = Object.fromEntries(
    teamResults.map((result) => [result.teamAbbreviation, result.records.length])
  );
  const teamPublishedRosterCounts = Object.fromEntries(
    teamResults.map((result) => [result.teamAbbreviation, result.expectedRosterCount])
  );

  return {
    season: TARGET_SEASON,
    source: "CapSpace open-source team data",
    sourceUrl: CAPSPACE_BASE,
    updatedAt: new Date().toISOString(),
    teamCount: TEAMS.length - failures.length,
    expectedTeamCount: TEAMS.length,
    failedTeams: failures,
    teamRecordCounts,
    teamPublishedRosterCounts,
    recordCount: Object.keys(indexed.byTeamAndName).length,
    ambiguousNames: indexed.ambiguousNames,
    byName: indexed.byName,
    byTeamAndName: indexed.byTeamAndName
  };
}

export async function getCapSpaceSalarySnapshot({ force = false, strict = false } = {}) {
  const now = Date.now();
  if (!force && memorySnapshot && memoryExpiresAt > now) return memorySnapshot;

  const cached = await readRedisSnapshot();
  const cachedHasEnoughContracts = cached && Number(cached.recordCount || 0) >= MIN_VALID_RECORDS;
  const cachedIsComplete = cachedHasEnoughContracts
    && Number(cached.teamCount) === TEAMS.length
    && (!Array.isArray(cached.failedTeams) || cached.failedTeams.length === 0);
  const cachedIsUsable = strict ? cachedIsComplete : cachedHasEnoughContracts;

  // Even a stale salary cache is safer than returning no salaries. Existing
  // signed contracts do not become invalid merely because the cache aged.
  if (!force && cachedIsUsable) {
    memorySnapshot = cached;
    memoryExpiresAt = now + REFRESH_SECONDS * 1000;
    return cached;
  }

  const fresh = await buildSnapshot({ strict });
  const freshIsInvalid = fresh.recordCount < MIN_VALID_RECORDS
    || (strict && fresh.teamCount !== TEAMS.length);
  if (freshIsInvalid) {
    if (!strict && cachedHasEnoughContracts) {
      const stale = {
        ...cached,
        stale: true,
        refreshFailures: fresh.failedTeams,
        refreshRecordCount: fresh.recordCount
      };
      memorySnapshot = stale;
      memoryExpiresAt = now + 15 * 60 * 1000;
      return stale;
    }

    throw new Error(
      `Salary refresh found ${fresh.recordCount} valid cap hits from ${fresh.teamCount} of ${TEAMS.length} teams.`
    );
  }

  memorySnapshot = fresh;
  memoryExpiresAt = now + REFRESH_SECONDS * 1000;
  await writeRedisSnapshot(fresh);
  return fresh;
}
