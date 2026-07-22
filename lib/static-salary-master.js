import { getRedis } from "@/lib/redis";
import {
  canonicalPlayerName,
  getCapSpaceSalarySnapshot
} from "@/lib/capspace-snapshot";
import {
  REQUIRED_SALARY_GUARDS,
  VERIFIED_SALARY_CORRECTIONS_BY_NAME
} from "@/data/verified-salary-corrections";

const MASTER_KEY = "champions-league:salary-master:2026-27:v4-complete-roster-audit";
const MASTER_VERSION = 4;
const EXPECTED_TEAM_COUNT = 32;
const MIN_VALID_RECORDS = 450;
let memoryMaster = null;

export function salaryTeamNameKey(team, nameOrKey) {
  const nameKey = canonicalPlayerName(nameOrKey) || String(nameOrKey || "");
  return `${String(team || "").toUpperCase()}:${nameKey}`;
}

function normalizeRecord(record, fallbackKey = "") {
  if (!record || !Number.isFinite(Number(record.capHit))) return null;
  const name = String(record.name || "").trim();
  const key = canonicalPlayerName(name) || fallbackKey;
  if (!key) return null;

  return {
    key,
    playerId: record.playerId != null ? String(record.playerId) : null,
    name: name || key,
    capHit: Math.round(Number(record.capHit)),
    teamAbbreviation: record.teamAbbreviation || record.team || null,
    position: record.position || null,
    source: record.source || "Frozen salary master",
    sourceUrl: record.sourceUrl || null,
    contractSignedDate: record.contractSignedDate || null,
    verifiedAt: record.verifiedAt || null
  };
}

function validateGuards(byName) {
  const failures = [];
  for (const [key, expectedCapHit] of Object.entries(REQUIRED_SALARY_GUARDS)) {
    const actual = Number(byName[key]?.capHit);
    if (actual !== Number(expectedCapHit)) {
      failures.push(`${byName[key]?.name || key}: expected ${expectedCapHit}, received ${Number.isFinite(actual) ? actual : "missing"}`);
    }
  }
  if (failures.length) {
    throw new Error(`Salary master failed its verified-contract checks (${failures.join("; ")}).`);
  }
}

function validateMaster(master) {
  if (!master || Number(master.version) !== MASTER_VERSION) {
    throw new Error("The stored salary master is from an obsolete version and must be rebuilt.");
  }
  if (Number(master.sourceTeamCount) !== EXPECTED_TEAM_COUNT) {
    throw new Error(`The salary master contains ${master.sourceTeamCount || 0} of ${EXPECTED_TEAM_COUNT} NHL teams.`);
  }
  if (Array.isArray(master.failedTeams) && master.failedTeams.length) {
    throw new Error(`The salary master contains failed team imports: ${master.failedTeams.map((team) => team.teamAbbreviation).join(", ")}.`);
  }
  if (Number(master.recordCount) < MIN_VALID_RECORDS) {
    throw new Error(`The salary master contains only ${master.recordCount || 0} valid contracts.`);
  }
  const parsedCounts = master.teamRecordCounts || {};
  const publishedCounts = master.teamPublishedRosterCounts || {};
  for (const [team, published] of Object.entries(publishedCounts)) {
    if (Number(parsedCounts[team]) !== Number(published)) {
      throw new Error(
        `${team} published ${published} salary-bearing roster rows but the frozen master contains ${parsedCounts[team] ?? 0}.`
      );
    }
  }
  if (Object.keys(publishedCounts).length !== EXPECTED_TEAM_COUNT) {
    throw new Error(`The salary master contains published roster totals for only ${Object.keys(publishedCounts).length} of ${EXPECTED_TEAM_COUNT} teams.`);
  }
  validateGuards(master.byName || {});
  return master;
}

function normalizeMaster(value) {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return normalizeMaster(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || !value.byName) return null;

  const byName = {};
  const byTeamAndName = {};
  const byPlayerId = {};
  for (const [key, valueRecord] of Object.entries(value.byName)) {
    const record = normalizeRecord(valueRecord, key);
    if (!record) continue;
    byName[record.key] = record;
    if (record.teamAbbreviation) byTeamAndName[salaryTeamNameKey(record.teamAbbreviation, record.key)] = record;
    if (record.playerId) byPlayerId[record.playerId] = record;
  }
  for (const [teamKey, valueRecord] of Object.entries(value.byTeamAndName || {})) {
    const record = normalizeRecord(valueRecord);
    if (record) byTeamAndName[teamKey] = record;
  }

  const master = {
    version: Number(value.version || 0),
    season: value.season || "2026-27",
    initializedAt: value.initializedAt || null,
    sourceCapturedAt: value.sourceCapturedAt || null,
    source: value.source || "Frozen salary master",
    sourceUrl: value.sourceUrl || null,
    sourceTeamCount: Number(value.sourceTeamCount || 0),
    failedTeams: Array.isArray(value.failedTeams) ? value.failedTeams : [],
    teamRecordCounts: value.teamRecordCounts || {},
    teamPublishedRosterCounts: value.teamPublishedRosterCounts || {},
    recordCount: Object.keys(byTeamAndName).length,
    correctionCount: Number(value.correctionCount || 0),
    byName,
    byTeamAndName,
    byPlayerId
  };

  try {
    return validateMaster(master);
  } catch {
    return null;
  }
}

function mergeVerifiedCorrections(byName, byTeamAndName, byPlayerId) {
  let correctionCount = 0;
  for (const [key, rawRecord] of Object.entries(VERIFIED_SALARY_CORRECTIONS_BY_NAME)) {
    const record = normalizeRecord(rawRecord, key);
    if (!record) continue;
    byName[record.key] = record;
    if (record.teamAbbreviation) byTeamAndName[salaryTeamNameKey(record.teamAbbreviation, record.key)] = record;
    if (record.playerId) byPlayerId[record.playerId] = record;
    correctionCount += 1;
  }
  return correctionCount;
}

async function readStoredMaster() {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return normalizeMaster(await redis.get(MASTER_KEY));
  } catch (error) {
    console.error("Unable to read the frozen salary master:", error);
    return null;
  }
}

async function saveStoredMaster(master) {
  const redis = getRedis();
  if (!redis) throw new Error("Upstash Redis is required to freeze the salary master.");
  await redis.set(MASTER_KEY, master);
}

export async function buildStaticSalaryMaster({ force = false } = {}) {
  if (!force) {
    if (memoryMaster) return memoryMaster;
    const stored = await readStoredMaster();
    if (stored) {
      memoryMaster = stored;
      return stored;
    }
  }

  // A master can only be created from a successful 32-of-32 team audit. The
  // old implementation accepted a large partial scrape, which is how an
  // established contract such as Adam Fox's could disappear permanently.
  const snapshot = await getCapSpaceSalarySnapshot({ force: true, strict: true });
  if (snapshot.teamCount !== EXPECTED_TEAM_COUNT || snapshot.failedTeams?.length) {
    throw new Error(`Salary master requires all ${EXPECTED_TEAM_COUNT} NHL teams; received ${snapshot.teamCount || 0}.`);
  }

  const foxSource = snapshot.byTeamAndName?.[salaryTeamNameKey("NYR", "Adam Fox")];
  if (Number(foxSource?.capHit) !== 9_500_000) {
    throw new Error("The Rangers source audit did not return Adam Fox at $9,500,000, so the master was not replaced.");
  }

  const byName = {};
  const byTeamAndName = {};
  const byPlayerId = {};
  for (const [teamKey, rawRecord] of Object.entries(snapshot.byTeamAndName || {})) {
    const record = normalizeRecord({
      ...rawRecord,
      source: "Frozen all-team CapSpace audit",
      sourceUrl: snapshot.sourceUrl || "https://cap-space.com"
    });
    if (!record) continue;
    byTeamAndName[teamKey] = record;
    const current = byName[record.key];
    if (!current || record.capHit > current.capHit) byName[record.key] = record;
    if (record.playerId) byPlayerId[record.playerId] = record;
  }

  // Backward-compatible fallback if the upstream cache predates the team index.
  if (Object.keys(byTeamAndName).length === 0) {
    for (const [key, rawRecord] of Object.entries(snapshot.byName || {})) {
      const record = normalizeRecord({ ...rawRecord, source: "Frozen all-team CapSpace audit", sourceUrl: snapshot.sourceUrl || "https://cap-space.com" }, key);
      if (!record) continue;
      byName[record.key] = record;
      if (record.teamAbbreviation) byTeamAndName[salaryTeamNameKey(record.teamAbbreviation, record.key)] = record;
    }
  }

  const correctionCount = mergeVerifiedCorrections(byName, byTeamAndName, byPlayerId);
  const master = {
    version: MASTER_VERSION,
    season: "2026-27",
    initializedAt: new Date().toISOString(),
    sourceCapturedAt: snapshot.updatedAt || new Date().toISOString(),
    source: "Frozen 32-team salary audit plus verified contract safeguards",
    sourceUrl: snapshot.sourceUrl || "https://cap-space.com",
    sourceTeamCount: snapshot.teamCount,
    failedTeams: snapshot.failedTeams || [],
    teamRecordCounts: snapshot.teamRecordCounts || {},
    teamPublishedRosterCounts: snapshot.teamPublishedRosterCounts || {},
    recordCount: Object.keys(byTeamAndName).length,
    correctionCount,
    byName,
    byTeamAndName,
    byPlayerId
  };

  validateMaster(master);
  await saveStoredMaster(master);
  memoryMaster = master;
  return master;
}

export async function getStaticSalaryMaster() {
  return buildStaticSalaryMaster({ force: false });
}

export async function rebuildStaticSalaryMaster() {
  return buildStaticSalaryMaster({ force: true });
}

export function clearStaticSalaryMasterMemory() {
  memoryMaster = null;
}
