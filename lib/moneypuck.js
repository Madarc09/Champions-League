import { getRedis } from "@/lib/redis";

const SEASONS = [2025, 2024, 2023];
const MEMORY_MS = 1000 * 60 * 60 * 24;
const CACHE_SECONDS = 60 * 60 * 24;
const CACHE_KEY = "champions-league:projection:moneypuck:v3";
let memorySnapshot = null;

function seasonUrl(season, file) {
  return `https://moneypuck.com/moneypuck/playerData/seasonSummary/${season}/regular/${file}.csv`;
}

function canonicalName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-zA-Z0-9' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(value);
      value = "";
    } else value += character;
  }
  cells.push(value);
  return cells;
}

function parseCsv(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function firstValue(row, keys) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row[key] !== "") return row[key];
  }
  return null;
}

function numberValue(row, keys) {
  const raw = firstValue(row, keys);
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function isAllSituations(row) {
  const value = String(firstValue(row, ["situation", "strengthState", "gameState"]) || "all").toLowerCase();
  return ["all", "all situations", "all_situations"].includes(value);
}

function isFiveOnFive(row) {
  const value = String(firstValue(row, ["situation", "strengthState", "gameState"]) || "5on5").toLowerCase();
  return ["5on5", "5v5", "5 on 5", "ev", "even strength"].includes(value);
}

function rowIdentity(row) {
  const playerId = numberValue(row, ["playerId", "player_id", "id"]);
  const name = firstValue(row, ["name", "playerName", "player", "fullName"]);
  return {
    playerId: Number.isFinite(playerId) ? playerId : null,
    name: String(name || "").trim()
  };
}

function normalizeSkater(row, season) {
  const identity = rowIdentity(row);
  return {
    ...identity,
    season,
    gamesPlayed: numberValue(row, ["games_played", "gamesPlayed"]),
    iceTime: numberValue(row, ["icetime", "iceTime"]),
    xGoals: numberValue(row, ["I_F_xGoals", "xGoals", "individualExpectedGoals"]),
    shootingTalentAdjustedXGoals: numberValue(row, ["I_F_shootingTalentAdjustedxGoals", "shootingTalentAdjustedxGoals"]),
    expectedShotsOnGoal: numberValue(row, ["I_F_xOnGoal", "xOnGoal", "expectedShotsOnGoal"]),
    shotsOnGoal: numberValue(row, ["I_F_shotsOnGoal", "shotsOnGoal"]),
    goals: numberValue(row, ["I_F_goals", "goals"]),
    primaryAssists: numberValue(row, ["I_F_primaryAssists", "primaryAssists"]),
    secondaryAssists: numberValue(row, ["I_F_secondaryAssists", "secondaryAssists"]),
    hits: numberValue(row, ["I_F_hits", "hits"]),
    onIceXGoalsFor: numberValue(row, ["OnIce_F_xGoals", "onIce_xGoalsFor", "onIceXGoalsFor"]),
    onIceXGoalsPercentage: numberValue(row, ["onIce_xGoalsPercentage", "onIceXGoalsPercentage"]),
    source: `MoneyPuck ${season}-${String(season + 1).slice(-2)} season summary`
  };
}

function normalizeGoalie(row, season) {
  const identity = rowIdentity(row);
  return {
    ...identity,
    season,
    gamesPlayed: numberValue(row, ["games_played", "gamesPlayed"]),
    iceTime: numberValue(row, ["icetime", "iceTime"]),
    goalsAgainst: numberValue(row, ["goals", "goalsAgainst"]),
    expectedGoalsAgainst: numberValue(row, ["xGoals", "expectedGoalsAgainst", "xGoalsAgainst"]),
    goalsSavedAboveExpected: numberValue(row, ["goalsSavedAboveExpected", "GSAx"]),
    saves: numberValue(row, ["savedShotsOnGoal", "saves", "shotsOnGoalSaved"]),
    savePercentage: numberValue(row, ["savePercentageOnShotsOnGoal", "savePercentage", "savePct"]),
    expectedSavePercentage: numberValue(row, ["xSavePercentage", "expectedSavePercentage"]),
    source: `MoneyPuck ${season}-${String(season + 1).slice(-2)} goalie summary`
  };
}

function normalizeTeam(row) {
  const team = String(firstValue(row, ["team", "teamCode", "teamAbbrev", "name"]) || "").trim().toUpperCase();
  const iceTime = numberValue(row, ["icetime", "iceTime"]);
  const xGoalsFor = numberValue(row, ["xGoalsFor", "xGoals", "onIce_xGoalsFor", "OnIce_F_xGoals"]);
  const xGoalsAgainst = numberValue(row, ["xGoalsAgainst", "onIce_xGoalsAgainst", "OnIce_A_xGoals"]);
  const goalsFor = numberValue(row, ["goalsFor", "goals", "onIce_goalsFor", "OnIce_F_goals"]);
  const goalsAgainst = numberValue(row, ["goalsAgainst", "onIce_goalsAgainst", "OnIce_A_goals"]);
  return {
    team,
    iceTime,
    xGoalsFor,
    xGoalsAgainst,
    goalsFor,
    goalsAgainst,
    xGoalsForPer60: iceTime > 0 && xGoalsFor != null ? xGoalsFor * 3600 / iceTime : null,
    xGoalsAgainstPer60: iceTime > 0 && xGoalsAgainst != null ? xGoalsAgainst * 3600 / iceTime : null,
    goalsForPer60: iceTime > 0 && goalsFor != null ? goalsFor * 3600 / iceTime : null,
    goalsAgainstPer60: iceTime > 0 && goalsAgainst != null ? goalsAgainst * 3600 / iceTime : null
  };
}

function linePlayers(row) {
  const direct = firstValue(row, ["name", "line", "lineName", "players"]);
  if (direct) {
    const names = String(direct)
      .split(/\s*[-|/]\s*/)
      .map((name) => name.trim())
      .filter((name) => name && !/^[FD]$/i.test(name));
    if (names.length >= 2) return names;
  }

  return [
    firstValue(row, ["player1", "playerName1", "forward1", "defenseman1"]),
    firstValue(row, ["player2", "playerName2", "forward2", "defenseman2"]),
    firstValue(row, ["player3", "playerName3", "forward3"])
  ].map((name) => String(name || "").trim()).filter(Boolean);
}

function normalizeLine(row) {
  const players = linePlayers(row);
  const iceTime = numberValue(row, ["icetime", "iceTime"]);
  const xGoalsFor = numberValue(row, ["xGoalsFor", "xGoals", "onIce_xGoalsFor", "OnIce_F_xGoals"]);
  const xGoalsAgainst = numberValue(row, ["xGoalsAgainst", "onIce_xGoalsAgainst", "OnIce_A_xGoals"]);
  const team = String(firstValue(row, ["team", "teamCode", "teamAbbrev"]) || "").trim().toUpperCase();
  const type = String(firstValue(row, ["position", "lineType", "type"]) || (players.length === 2 ? "D" : "F")).toUpperCase();
  return {
    players,
    team,
    type,
    iceTime,
    xGoalsFor,
    xGoalsAgainst,
    xGoalsForPer60: iceTime > 0 && xGoalsFor != null ? xGoalsFor * 3600 / iceTime : null,
    xGoalsPercentage: xGoalsFor != null && xGoalsAgainst != null && xGoalsFor + xGoalsAgainst > 0
      ? xGoalsFor / (xGoalsFor + xGoalsAgainst)
      : numberValue(row, ["xGoalsPercentage", "xGoalsPct"])
  };
}

async function fetchCsv(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 14000);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "text/csv,text/plain,*/*",
        "User-Agent": "ChampionsLeagueFantasy/2.0 (private non-commercial fantasy hockey pool)"
      }
    });
    if (!response.ok) throw new Error(`MoneyPuck returned ${response.status}: ${url}`);
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function addHistory(index, record) {
  if (!record.playerId && !record.name) return;
  const idKey = record.playerId ? String(record.playerId) : null;
  const nameKey = record.name ? canonicalName(record.name) : null;
  if (idKey) {
    if (!index.byId[idKey]) index.byId[idKey] = [];
    index.byId[idKey].push(record);
    if (nameKey) index.nameToId[nameKey] = idKey;
    return;
  }
  if (nameKey) {
    if (!index.byName[nameKey]) index.byName[nameKey] = [];
    index.byName[nameKey].push(record);
  }
}

function sortHistories(index) {
  for (const collection of [index.byId, index.byName]) {
    for (const history of Object.values(collection)) history.sort((a, b) => Number(b.season) - Number(a.season));
  }
}

function buildLineLookup(rows) {
  const byName = {};
  for (const row of rows) {
    if (!isFiveOnFive(row)) continue;
    const line = normalizeLine(row);
    if (line.players.length < 2 || !line.iceTime) continue;
    for (const playerName of line.players) {
      const key = canonicalName(playerName);
      if (!byName[key] || Number(line.iceTime) > Number(byName[key].iceTime || 0)) byName[key] = line;
    }
  }
  return byName;
}

function buildTeamLookup(rows) {
  const byTeam = {};
  for (const row of rows) {
    if (!isFiveOnFive(row)) continue;
    const team = normalizeTeam(row);
    if (!team.team) continue;
    if (!byTeam[team.team] || Number(team.iceTime || 0) > Number(byTeam[team.team].iceTime || 0)) byTeam[team.team] = team;
  }
  return byTeam;
}

export async function getMoneyPuckSnapshot({ force = false } = {}) {
  if (!force && memorySnapshot && Date.now() - memorySnapshot.loadedAt < MEMORY_MS) return memorySnapshot;

  const redis = getRedis();
  if (!force && redis) {
    try {
      const saved = await redis.get(CACHE_KEY);
      if (saved && Date.now() - Number(saved.loadedAt || 0) < MEMORY_MS) {
        memorySnapshot = saved;
        return saved;
      }
    } catch (error) {
      console.error("MoneyPuck projection cache read failed:", error);
    }
  }

  const jobs = [];
  for (const season of SEASONS) {
    jobs.push({ key: `skaters-${season}`, season, type: "skaters", url: seasonUrl(season, "skaters") });
    jobs.push({ key: `goalies-${season}`, season, type: "goalies", url: seasonUrl(season, "goalies") });
  }
  jobs.push({ key: "lines-2025", season: 2025, type: "lines", url: seasonUrl(2025, "lines") });
  jobs.push({ key: "teams-2025", season: 2025, type: "teams", url: seasonUrl(2025, "teams") });

  const results = await Promise.allSettled(jobs.map((job) => fetchCsv(job.url)));
  const skaters = { byId: {}, byName: {}, nameToId: {} };
  const goalies = { byId: {}, byName: {}, nameToId: {} };
  let lineRows = [];
  let teamRows = [];
  const warnings = [];

  results.forEach((result, index) => {
    const job = jobs[index];
    if (result.status !== "fulfilled") {
      warnings.push(result.reason?.message || `${job.key} unavailable.`);
      return;
    }
    const rows = parseCsv(result.value);
    if (job.type === "skaters") {
      for (const row of rows) if (isAllSituations(row)) addHistory(skaters, normalizeSkater(row, job.season));
    } else if (job.type === "goalies") {
      for (const row of rows) if (isAllSituations(row)) addHistory(goalies, normalizeGoalie(row, job.season));
    } else if (job.type === "lines") lineRows = rows;
    else if (job.type === "teams") teamRows = rows;
  });

  sortHistories(skaters);
  sortHistories(goalies);

  memorySnapshot = {
    loadedAt: Date.now(),
    updatedAt: new Date().toISOString(),
    seasons: SEASONS,
    skaters,
    goalies,
    linesByName: buildLineLookup(lineRows),
    teamsByCode: buildTeamLookup(teamRows),
    source: "MoneyPuck approved downloadable season summaries, lines and team data",
    sourceUrls: jobs.map((job) => job.url),
    warning: warnings.length ? warnings.join(" ") : null
  };

  if (redis) {
    try {
      await redis.set(CACHE_KEY, memorySnapshot, { ex: CACHE_SECONDS });
    } catch (error) {
      console.error("MoneyPuck projection cache write failed:", error);
    }
  }
  return memorySnapshot;
}

export function findMoneyPuckRecord(snapshot, player) {
  const lookup = player?.rosterType === "G" ? snapshot?.goalies : snapshot?.skaters;
  const nameKey = canonicalName(player?.name);
  const mappedId = lookup?.nameToId?.[nameKey];
  const history = lookup?.byId?.[String(player?.playerId)] || (mappedId ? lookup?.byId?.[mappedId] : null) || lookup?.byName?.[nameKey] || [];
  const line = snapshot?.linesByName?.[canonicalName(player?.name)] || null;
  const team = snapshot?.teamsByCode?.[String(player?.team || "").toUpperCase()] || null;
  return {
    latest: history[0] || null,
    history,
    line,
    team
  };
}
