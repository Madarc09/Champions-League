import { SEED_SALARIES } from "@/data/seed-salaries";
import { getRedis } from "@/lib/redis";

const SALARY_HASH_KEY = "champions-league:salaries:2026-27";

function normalizeSalaryRecord(value) {
  if (!value) return null;

  if (typeof value === "number") {
    return { capHit: value, source: "seed", updatedAt: null };
  }

  if (typeof value === "string") {
    try {
      return normalizeSalaryRecord(JSON.parse(value));
    } catch {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? { capHit: numeric, source: "saved", updatedAt: null } : null;
    }
  }

  const capHit = Number(value.capHit);
  if (!Number.isFinite(capHit)) return null;

  return {
    capHit,
    source: value.source || "saved",
    updatedAt: value.updatedAt || null,
    name: value.name || null
  };
}

export async function getSalaryRecords(playerIds = []) {
  const result = {};

  for (const playerId of playerIds) {
    const seed = normalizeSalaryRecord(SEED_SALARIES[String(playerId)]);
    if (seed) result[String(playerId)] = seed;
  }

  const redis = getRedis();
  if (!redis || playerIds.length === 0) return result;

  try {
    const values = await redis.hmget(SALARY_HASH_KEY, ...playerIds.map(String));
    playerIds.forEach((playerId, index) => {
      const record = normalizeSalaryRecord(values[index]);
      if (record) result[String(playerId)] = record;
    });
  } catch (error) {
    console.error("Unable to read salary records:", error);
  }

  return result;
}

export async function saveSalaryRecord({ playerId, name, capHit, source = "manual" }) {
  const redis = getRedis();
  if (!redis) return { persisted: false };

  const record = {
    playerId: Number(playerId),
    name: String(name || "Unknown player"),
    capHit: Number(capHit),
    source,
    updatedAt: new Date().toISOString()
  };

  await redis.hset(SALARY_HASH_KEY, {
    [String(playerId)]: JSON.stringify(record)
  });

  return { persisted: true, record };
}

export async function saveSalaryRecords(records) {
  const redis = getRedis();
  if (!redis) return { persisted: false, count: 0 };

  const payload = {};
  for (const item of records) {
    payload[String(item.playerId)] = JSON.stringify({
      playerId: Number(item.playerId),
      name: String(item.name || "Unknown player"),
      capHit: Number(item.capHit),
      source: item.source || "import",
      updatedAt: new Date().toISOString()
    });
  }

  if (Object.keys(payload).length > 0) {
    await redis.hset(SALARY_HASH_KEY, payload);
  }

  return { persisted: true, count: Object.keys(payload).length };
}
