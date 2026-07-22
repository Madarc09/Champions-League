import { getRedis } from "@/lib/redis";
import {
  canonicalPlayerName,
  getCapSpaceSalarySnapshot
} from "@/lib/capspace-snapshot";
import { VERIFIED_SALARY_CORRECTIONS_BY_NAME } from "@/data/verified-salary-corrections";

const MASTER_KEY = "champions-league:salary-master:2026-27:v1";
const MASTER_VERSION = 1;
let memoryMaster = null;

function normalizeRecord(record, fallbackKey = "") {
  if (!record || !Number.isFinite(Number(record.capHit))) return null;
  const name = String(record.name || "").trim();
  const key = canonicalPlayerName(name) || fallbackKey;
  if (!key) return null;

  return {
    key,
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
  for (const [key, valueRecord] of Object.entries(value.byName)) {
    const record = normalizeRecord(valueRecord, key);
    if (record) byName[record.key] = record;
  }

  if (Object.keys(byName).length < 100) return null;
  return {
    version: Number(value.version || MASTER_VERSION),
    season: value.season || "2026-27",
    initializedAt: value.initializedAt || null,
    sourceCapturedAt: value.sourceCapturedAt || null,
    source: value.source || "Frozen salary master",
    sourceUrl: value.sourceUrl || null,
    recordCount: Object.keys(byName).length,
    correctionCount: Number(value.correctionCount || 0),
    byName
  };
}

function mergeVerifiedCorrections(byName) {
  let correctionCount = 0;
  for (const [key, rawRecord] of Object.entries(VERIFIED_SALARY_CORRECTIONS_BY_NAME)) {
    const record = normalizeRecord(rawRecord, key);
    if (!record) continue;
    byName[record.key] = record;
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

  // This is the only point where the public salary source is consulted. The
  // resulting table is frozen in Redis and normal draft-room requests never
  // refresh it automatically.
  const snapshot = await getCapSpaceSalarySnapshot({ force });
  const byName = {};

  for (const [key, rawRecord] of Object.entries(snapshot.byName || {})) {
    const record = normalizeRecord({
      ...rawRecord,
      source: "Frozen CapSpace snapshot",
      sourceUrl: snapshot.sourceUrl || "https://cap-space.com"
    }, key);
    if (record) byName[record.key] = record;
  }

  const correctionCount = mergeVerifiedCorrections(byName);
  const master = {
    version: MASTER_VERSION,
    season: "2026-27",
    initializedAt: new Date().toISOString(),
    sourceCapturedAt: snapshot.updatedAt || new Date().toISOString(),
    source: "Frozen CapSpace snapshot plus verified NHL.com corrections",
    sourceUrl: snapshot.sourceUrl || "https://cap-space.com",
    recordCount: Object.keys(byName).length,
    correctionCount,
    byName
  };

  if (master.recordCount < 450) {
    throw new Error(`The frozen salary master contained only ${master.recordCount} valid contracts.`);
  }

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
