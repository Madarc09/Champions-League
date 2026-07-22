const SKATER_URL = "https://moneypuck.com/moneypuck/playerData/seasonSummary/2025/regular/skaters.csv";
const GOALIE_URL = "https://moneypuck.com/moneypuck/playerData/seasonSummary/2025/regular/goalies.csv";
const MEMORY_MS = 1000 * 60 * 60 * 24;

let memorySnapshot = null;

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
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(value);
      value = "";
    } else {
      value += character;
    }
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
    if (row[key] !== undefined && row[key] !== "") return row[key];
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

function rowIdentity(row) {
  const playerId = numberValue(row, ["playerId", "player_id", "id"]);
  const name = firstValue(row, ["name", "playerName", "player", "fullName"]);
  return {
    playerId: Number.isFinite(playerId) ? playerId : null,
    name: String(name || "").trim()
  };
}

function normalizeSkater(row) {
  const identity = rowIdentity(row);
  return {
    ...identity,
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
    source: "MoneyPuck 2025-26 season summary"
  };
}

function normalizeGoalie(row) {
  const identity = rowIdentity(row);
  return {
    ...identity,
    gamesPlayed: numberValue(row, ["games_played", "gamesPlayed"]),
    iceTime: numberValue(row, ["icetime", "iceTime"]),
    goalsAgainst: numberValue(row, ["goals", "goalsAgainst"]),
    expectedGoalsAgainst: numberValue(row, ["xGoals", "expectedGoalsAgainst", "xGoalsAgainst"]),
    goalsSavedAboveExpected: numberValue(row, ["goalsSavedAboveExpected", "GSAx"]),
    saves: numberValue(row, ["savedShotsOnGoal", "saves", "shotsOnGoalSaved"]),
    savePercentage: numberValue(row, ["savePercentageOnShotsOnGoal", "savePercentage", "savePct"]),
    expectedSavePercentage: numberValue(row, ["xSavePercentage", "expectedSavePercentage"]),
    rebounds: numberValue(row, ["rebounds", "reboundShots"]),
    source: "MoneyPuck 2025-26 goalie summary"
  };
}

async function fetchCsv(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "text/csv,text/plain,*/*",
        "User-Agent": "ChampionsLeagueFantasy/1.0 (private fantasy hockey pool)"
      }
    });
    if (!response.ok) throw new Error(`MoneyPuck returned ${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function buildLookup(rows, normalizer) {
  const byId = {};
  const byName = {};
  for (const row of rows) {
    if (!isAllSituations(row)) continue;
    const record = normalizer(row);
    if (record.playerId) byId[String(record.playerId)] = record;
    if (record.name) byName[canonicalName(record.name)] = record;
  }
  return { byId, byName };
}

export async function getMoneyPuckSnapshot() {
  if (memorySnapshot && Date.now() - memorySnapshot.loadedAt < MEMORY_MS) return memorySnapshot;

  try {
    const [skaterText, goalieText] = await Promise.all([fetchCsv(SKATER_URL), fetchCsv(GOALIE_URL)]);
    const skaters = buildLookup(parseCsv(skaterText), normalizeSkater);
    const goalies = buildLookup(parseCsv(goalieText), normalizeGoalie);
    memorySnapshot = {
      loadedAt: Date.now(),
      updatedAt: new Date().toISOString(),
      skaters,
      goalies,
      source: "MoneyPuck",
      sourceUrls: [SKATER_URL, GOALIE_URL],
      warning: null
    };
    return memorySnapshot;
  } catch (error) {
    memorySnapshot = {
      loadedAt: Date.now(),
      updatedAt: null,
      skaters: { byId: {}, byName: {} },
      goalies: { byId: {}, byName: {} },
      source: "MoneyPuck",
      sourceUrls: [SKATER_URL, GOALIE_URL],
      warning: error.message || "MoneyPuck data was unavailable."
    };
    return memorySnapshot;
  }
}

export function findMoneyPuckRecord(snapshot, player) {
  const lookup = player?.rosterType === "G" ? snapshot?.goalies : snapshot?.skaters;
  return lookup?.byId?.[String(player?.playerId)] || lookup?.byName?.[canonicalName(player?.name)] || null;
}
