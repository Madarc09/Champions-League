import { getRedis } from "@/lib/redis";

const NHL_STATS_BASE = "https://api.nhle.com/stats/rest/en";
const SEASONS = [20252026, 20242025, 20232024];
const CACHE_SECONDS = 60 * 60 * 24;
const CACHE_KEY = "champions-league:projection:nhl-history:v3";
let memorySnapshot = null;

function numberValue(row, keys, fallback = 0) {
  for (const key of keys) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function secondsValue(row, keys) {
  for (const key of keys) {
    const raw = row?.[key];
    if (raw == null || raw === "") continue;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    const text = String(raw);
    if (/^\d+:\d{2}$/.test(text)) {
      const [minutes, seconds] = text.split(":").map(Number);
      return minutes * 60 + seconds;
    }
    const numeric = Number(text);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
}

function reportUrl(path, sortProperty, seasonId) {
  const params = new URLSearchParams({
    isAggregate: "false",
    isGame: "false",
    start: "0",
    limit: "-1",
    sort: JSON.stringify([{ property: sortProperty, direction: "DESC" }]),
    cayenneExp: `seasonId=${seasonId} and gameTypeId=2`
  });
  return `${NHL_STATS_BASE}/${path}?${params.toString()}`;
}

async function fetchReport(path, sortProperty, seasonId) {
  const response = await fetch(reportUrl(path, sortProperty, seasonId), {
    next: { revalidate: CACHE_SECONDS },
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`NHL ${path} ${seasonId} returned ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.data) ? payload.data : [];
}

function indexById(rows) {
  return new Map(rows.map((row) => [String(row.playerId), row]));
}

async function loadSeason(seasonId) {
  const [skaterSummary, skaterRealtime, skaterToi, skaterPowerPlay, goalieSummary] = await Promise.all([
    fetchReport("skater/summary", "points", seasonId),
    fetchReport("skater/realtime", "hits", seasonId),
    fetchReport("skater/timeonice", "timeOnIce", seasonId).catch(() => []),
    fetchReport("skater/powerplay", "ppTimeOnIce", seasonId).catch(() => []),
    fetchReport("goalie/summary", "wins", seasonId)
  ]);

  const realtime = indexById(skaterRealtime);
  const toi = indexById(skaterToi);
  const powerPlay = indexById(skaterPowerPlay);
  const records = [];

  for (const row of skaterSummary) {
    const id = String(row.playerId);
    const realtimeRow = realtime.get(id) || {};
    const toiRow = toi.get(id) || {};
    const powerPlayRow = powerPlay.get(id) || {};
    const gamesPlayed = numberValue(row, ["gamesPlayed"]);
    records.push({
      playerId: Number(row.playerId),
      seasonId,
      rosterType: String(row.positionCode || "F").toUpperCase() === "D" ? "D" : "F",
      gamesPlayed,
      goals: numberValue(row, ["goals"]),
      assists: numberValue(row, ["assists"]),
      shots: numberValue(row, ["shots"]),
      hits: numberValue(realtimeRow, ["hits"]),
      timeOnIceSeconds: secondsValue(toiRow, ["timeOnIce", "totalTimeOnIce"]),
      timeOnIcePerGameSeconds: secondsValue(toiRow, ["timeOnIcePerGame", "avgTimeOnIce"]),
      powerPlayTimeOnIceSeconds: secondsValue(powerPlayRow, ["ppTimeOnIce", "powerPlayTimeOnIce"]),
      powerPlayTimeOnIcePerGameSeconds: secondsValue(powerPlayRow, ["ppTimeOnIcePerGame", "powerPlayTimeOnIcePerGame"])
    });
  }

  for (const row of goalieSummary) {
    records.push({
      playerId: Number(row.playerId),
      seasonId,
      rosterType: "G",
      gamesPlayed: numberValue(row, ["gamesPlayed"]),
      wins: numberValue(row, ["wins"]),
      saves: numberValue(row, ["saves"]),
      goalsAgainst: numberValue(row, ["goalsAgainst"]),
      savePct: numberValue(row, ["savePct"], null),
      shutouts: numberValue(row, ["shutouts"]),
      goals: numberValue(row, ["goals"]),
      assists: numberValue(row, ["assists"])
    });
  }

  return records;
}

function fresh(snapshot) {
  const loaded = Number(snapshot?.loadedAt || 0);
  return loaded > 0 && Date.now() - loaded < CACHE_SECONDS * 1000;
}

function buildIndex(records) {
  const byId = {};
  for (const record of records) {
    const key = String(record.playerId);
    if (!byId[key]) byId[key] = [];
    byId[key].push(record);
  }
  for (const history of Object.values(byId)) {
    history.sort((a, b) => Number(b.seasonId) - Number(a.seasonId));
  }
  return byId;
}

export async function getNhlHistorySnapshot({ force = false } = {}) {
  if (!force && memorySnapshot && fresh(memorySnapshot)) return memorySnapshot;

  const redis = getRedis();
  if (!force && redis) {
    try {
      const saved = await redis.get(CACHE_KEY);
      if (saved && fresh(saved)) {
        memorySnapshot = saved;
        return saved;
      }
    } catch (error) {
      console.error("NHL projection history cache read failed:", error);
    }
  }

  const results = await Promise.allSettled(SEASONS.map(loadSeason));
  const records = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!records.length) throw new Error("NHL three-season history was unavailable.");

  const warnings = results
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason?.message || "One NHL season failed to load.");

  const snapshot = {
    loadedAt: Date.now(),
    updatedAt: new Date().toISOString(),
    seasons: SEASONS,
    byId: buildIndex(records),
    source: "NHL Stats three-season reports",
    warning: warnings.length ? warnings.join(" ") : null
  };
  memorySnapshot = snapshot;

  if (redis) {
    try {
      await redis.set(CACHE_KEY, snapshot, { ex: CACHE_SECONDS });
    } catch (error) {
      console.error("NHL projection history cache write failed:", error);
    }
  }
  return snapshot;
}

export function findNhlHistory(snapshot, player) {
  return snapshot?.byId?.[String(player?.playerId)] || [];
}
