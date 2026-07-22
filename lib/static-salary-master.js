import { getRedis } from "@/lib/redis";
import {
  canonicalPlayerName,
  getCapSpaceSalarySnapshot
} from "@/lib/capspace-snapshot";
import {
  REQUIRED_SALARY_GUARDS,
  VERIFIED_SALARY_CORRECTIONS_BY_NAME
} from "@/data/verified-salary-corrections";

const MASTER_KEY = "champions-league:salary-master:2026-27:v5-resilient";
const MASTER_VERSION = 5;
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

function mergeVerifiedCorrections(byName, byTeamAndName, byPlayerId) {
  let correctionCount = 0;
  for (const [key, rawRecord] of Object.entries(VERIFIED_SALARY_CORRECTIONS_BY_NAME)) {
    const record = normalizeRecord(rawRecord, key);
    if (!record) continue;
    byName[record.key] = record;
    if (record.teamAbbreviation) {
      byTeamAndName[salaryTeamNameKey(record.teamAbbreviation, record.key)] = record;
    }
    if (record.playerId) byPlayerId[record.playerId] = record;
    correctionCount += 1;
  }
  return correctionCount;
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
    throw new Error(`Salary master failed verified-contract checks (${failures.join("; ")}).`);
  }
}

function validateMaster(master, { requireCompleteAudit = false } = {}) {
  if (!master || Number(master.version) !== MASTER_VERSION) {
    throw new Error("The stored salary master is obsolete and must be rebuilt.");
  }
  if (Number(master.recordCount) < MIN_VALID_RECORDS) {
    throw new Error(`The salary master contains only ${master.recordCount || 0} valid contracts.`);
  }

  if (requireCompleteAudit || master.auditComplete) {
    if (Number(master.sourceTeamCount) !== EXPECTED_TEAM_COUNT) {
      throw new Error(`The salary audit contains ${master.sourceTeamCount || 0} of ${EXPECTED_TEAM_COUNT} NHL teams.`);
    }
    if (Array.isArray(master.failedTeams) && master.failedTeams.length) {
      throw new Error(`The salary audit contains failed imports: ${master.failedTeams.map((team) => team.teamAbbreviation).join(", ")}.`);
    }
    const parsedCounts = master.teamRecordCounts || {};
    const publishedCounts = master.teamPublishedRosterCounts || {};
    if (Object.keys(publishedCounts).length !== EXPECTED_TEAM_COUNT) {
      throw new Error(`The strict audit has roster totals for only ${Object.keys(publishedCounts).length} teams.`);
    }
    for (const [team, published] of Object.entries(publishedCounts)) {
      if (Number(parsedCounts[team]) !== Number(published)) {
        throw new Error(`${team} published ${published} salary rows but ${parsedCounts[team] ?? 0} were parsed.`);
      }
    }
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

  for (const [key, valueRecord] of Object.entries(value.byName || {})) {
    const record = normalizeRecord(valueRecord, key);
    if (!record) continue;
    byName[record.key] = record;
    if (record.teamAbbreviation) {
      byTeamAndName[salaryTeamNameKey(record.teamAbbreviation, record.key)] = record;
    }
    if (record.playerId) byPlayerId[record.playerId] = record;
  }
  for (const [teamKey, valueRecord] of Object.entries(value.byTeamAndName || {})) {
    const record = normalizeRecord(valueRecord);
    if (!record) continue;
    byTeamAndName[teamKey] = record;
    if (!byName[record.key] || record.capHit > byName[record.key].capHit) byName[record.key] = record;
    if (record.playerId) byPlayerId[record.playerId] = record;
  }
  for (const [playerId, valueRecord] of Object.entries(value.byPlayerId || {})) {
    const record = normalizeRecord(valueRecord);
    if (record) byPlayerId[String(playerId)] = record;
  }

  const correctionCount = mergeVerifiedCorrections(byName, byTeamAndName, byPlayerId);
  const master = {
    version: MASTER_VERSION,
    season: value.season || "2026-27",
    initializedAt: value.initializedAt || null,
    sourceCapturedAt: value.sourceCapturedAt || null,
    source: value.source || "Frozen salary master",
    sourceUrl: value.sourceUrl || null,
    sourceTeamCount: Number(value.sourceTeamCount || value.teamCount || 0),
    failedTeams: Array.isArray(value.failedTeams) ? value.failedTeams : [],
    teamRecordCounts: value.teamRecordCounts || {},
    teamPublishedRosterCounts: value.teamPublishedRosterCounts || {},
    auditComplete: Boolean(value.auditComplete),
    recordCount: Math.max(Object.keys(byName).length, Object.keys(byTeamAndName).length),
    correctionCount: Math.max(Number(value.correctionCount || 0), correctionCount),
    byName,
    byTeamAndName,
    byPlayerId
  };

  try {
    return validateMaster(master, { requireCompleteAudit: master.auditComplete });
  } catch (error) {
    console.error("Stored salary master is invalid:", error);
    return null;
  }
}

function masterFromSnapshot(snapshot, { auditComplete = false } = {}) {
  if (!snapshot) throw new Error("No salary snapshot was available.");

  const byName = {};
  const byTeamAndName = {};
  const byPlayerId = {};

  for (const [teamKey, rawRecord] of Object.entries(snapshot.byTeamAndName || {})) {
    const record = normalizeRecord({
      ...rawRecord,
      source: rawRecord.source || "Frozen CapSpace salary snapshot",
      sourceUrl: rawRecord.sourceUrl || snapshot.sourceUrl || "https://cap-space.com"
    });
    if (!record) continue;
    byTeamAndName[teamKey] = record;
    if (!byName[record.key] || record.capHit > byName[record.key].capHit) byName[record.key] = record;
    if (record.playerId) byPlayerId[record.playerId] = record;
  }

  for (const [key, rawRecord] of Object.entries(snapshot.byName || {})) {
    const record = normalizeRecord({
      ...rawRecord,
      source: rawRecord.source || "Frozen CapSpace salary snapshot",
      sourceUrl: rawRecord.sourceUrl || snapshot.sourceUrl || "https://cap-space.com"
    }, key);
    if (!record) continue;
    if (!byName[record.key] || record.capHit > byName[record.key].capHit) byName[record.key] = record;
    if (record.teamAbbreviation) {
      const teamKey = salaryTeamNameKey(record.teamAbbreviation, record.key);
      if (!byTeamAndName[teamKey] || record.capHit > byTeamAndName[teamKey].capHit) {
        byTeamAndName[teamKey] = record;
      }
    }
    if (record.playerId) byPlayerId[record.playerId] = record;
  }

  const correctionCount = mergeVerifiedCorrections(byName, byTeamAndName, byPlayerId);
  const master = {
    version: MASTER_VERSION,
    season: "2026-27",
    initializedAt: new Date().toISOString(),
    sourceCapturedAt: snapshot.updatedAt || new Date().toISOString(),
    source: auditComplete
      ? "Frozen strict 32-team salary audit plus verified corrections"
      : "Frozen working salary snapshot plus verified corrections",
    sourceUrl: snapshot.sourceUrl || "https://cap-space.com",
    sourceTeamCount: Number(snapshot.teamCount || 0),
    failedTeams: Array.isArray(snapshot.failedTeams) ? snapshot.failedTeams : [],
    teamRecordCounts: snapshot.teamRecordCounts || {},
    teamPublishedRosterCounts: snapshot.teamPublishedRosterCounts || {},
    auditComplete,
    recordCount: Math.max(Object.keys(byName).length, Object.keys(byTeamAndName).length),
    correctionCount,
    byName,
    byTeamAndName,
    byPlayerId
  };

  return validateMaster(master, { requireCompleteAudit: auditComplete });
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
  if (!redis) return false;
  try {
    await redis.set(MASTER_KEY, master);
    return true;
  } catch (error) {
    console.error("Unable to save the frozen salary master:", error);
    return false;
  }
}

export async function buildStaticSalaryMaster({ force = false, strict = false } = {}) {
  if (!force) {
    if (memoryMaster) return memoryMaster;
    const stored = await readStoredMaster();
    if (stored) {
      memoryMaster = stored;
      return stored;
    }
  }

  // Ordinary draft pages bootstrap from the existing working cache. Only
  // Nick's explicit audit uses the strict all-team acceptance rules.
  const snapshot = await getCapSpaceSalarySnapshot({ force, strict });
  const master = masterFromSnapshot(snapshot, { auditComplete: strict });

  // A temporary Redis problem must not blank the page. Return the usable
  // in-memory master even if persistence fails.
  memoryMaster = master;
  await saveStoredMaster(master);
  return master;
}

export async function getStaticSalaryMaster() {
  return buildStaticSalaryMaster({ force: false, strict: false });
}

export async function rebuildStaticSalaryMaster() {
  return buildStaticSalaryMaster({ force: true, strict: true });
}

export function clearStaticSalaryMasterMemory() {
  memoryMaster = null;
}
