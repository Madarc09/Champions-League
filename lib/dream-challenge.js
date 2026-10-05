import { DREAM_TEAM, ROSTER_LIMITS, SALARY_CAP } from "@/data/league-config";
import { getRedis } from "@/lib/redis";
import { getPlayerPool } from "@/lib/nhl";
import { buildPlayerIdentityIndex, resolvePlayerFromIndex } from "@/lib/player-identity";
import { salaryCapSpaceRecordFor } from "@/lib/salary-cap-space";
import { dreamWeekKey, ensureDreamTeamRoster } from "@/lib/special-teams";

const CHALLENGE_PREFIX = "champions-league:dream-challenge:2026-27";

function entriesKey(weekKey) {
  return `${CHALLENGE_PREFIX}:week:${weekKey}:entries`;
}

function managerAttemptKey(weekKey, managerSlug) {
  return `${CHALLENGE_PREFIX}:week:${weekKey}:attempts:${managerSlug}`;
}

function roundOne(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function capHitFor(player) {
  const saved = Number(player?.capHit);
  if (Number.isFinite(saved) && saved >= 500_000) return Math.round(saved);
  const record = salaryCapSpaceRecordFor(player);
  const value = Number(record?.capHit);
  return Number.isFinite(value) && value >= 500_000 ? Math.round(value) : null;
}

export function challengePlayerPool(pool) {
  return (pool?.players || [])
    .map((player) => ({
      ...player,
      capHit: capHitFor(player)
    }))
    .filter((player) => (
      ["F", "D", "G"].includes(player.rosterType)
      && Number.isFinite(Number(player.capHit))
      && Number(player.capHit) > 0
    ));
}

function playerSnapshot(player) {
  return {
    playerId: Number(player.playerId),
    name: player.name,
    team: player.team || "NHL",
    statsTeam: player.statsTeam || player.team || "NHL",
    rosterType: player.rosterType,
    position: player.position || player.rosterType,
    headshot: player.headshot || null,
    teamLogo: player.teamLogo || null,
    capHit: Number(player.capHit || 0),
    birthDate: player.birthDate || null
  };
}

function validateSelection(playerIds, board) {
  if (!Array.isArray(playerIds)) return { error: "Choose a roster before submitting." };
  if (playerIds.length !== 20) return { error: "A challenge roster must contain exactly 20 players." };

  const uniqueIds = [...new Set(playerIds.map((value) => String(value)))];
  if (uniqueIds.length !== 20) return { error: "A player can only appear once on a challenge roster." };

  const byId = new Map(board.map((player) => [String(player.playerId), player]));
  const selected = uniqueIds.map((id) => byId.get(id)).filter(Boolean);
  if (selected.length !== 20) return { error: "One or more selected players are no longer available in the live NHL pool." };

  const counts = selected.reduce((result, player) => {
    if (Object.hasOwn(result, player.rosterType)) result[player.rosterType] += 1;
    return result;
  }, { F: 0, D: 0, G: 0 });

  if (counts.F !== ROSTER_LIMITS.F || counts.D !== ROSTER_LIMITS.D || counts.G !== ROSTER_LIMITS.G) {
    return { error: `The challenge requires exactly ${ROSTER_LIMITS.F} forwards, ${ROSTER_LIMITS.D} defence and ${ROSTER_LIMITS.G} goalies.` };
  }

  const totalCap = selected.reduce((sum, player) => sum + Number(player.capHit || 0), 0);
  if (totalCap > SALARY_CAP) {
    return { error: `That roster is $${((totalCap - SALARY_CAP) / 1_000_000).toFixed(2)}M over the $104M cap.` };
  }

  return { players: selected, counts, totalCap };
}

function liveEntry(entry, poolIndex) {
  const players = (entry?.players || []).map((storedPlayer) => {
    const live = resolvePlayerFromIndex(storedPlayer, poolIndex);
    return {
      ...storedPlayer,
      ...(live || {}),
      capHit: Number(storedPlayer.capHit || capHitFor(live) || 0),
      fantasyPoints: Number(live?.fantasyPoints || 0)
    };
  });

  const fantasyPoints = roundOne(players.reduce((sum, player) => sum + Number(player.fantasyPoints || 0), 0));
  const totalCap = Number(entry?.totalCap || players.reduce((sum, player) => sum + Number(player.capHit || 0), 0));

  return {
    ...entry,
    players,
    fantasyPoints,
    totalCap
  };
}

function aiEntry(aiRoster, poolIndex, weekKey) {
  const entry = liveEntry({
    id: `ai-${weekKey}`,
    type: "ai",
    managerSlug: null,
    managerName: "AI",
    attemptNumber: null,
    weekKey,
    players: aiRoster?.players || [],
    totalCap: Number(aiRoster?.totalCap || 0),
    submittedAt: `${weekKey}T04:00:00-04:00`
  }, poolIndex);

  return {
    ...entry,
    label: "AI Weekly Team"
  };
}

function compareEntries(left, right) {
  const scoreDifference = Number(right.fantasyPoints || 0) - Number(left.fantasyPoints || 0);
  if (scoreDifference !== 0) return scoreDifference;

  // "Beat" means strictly exceed the holder. The AI owns ties against its
  // opening weekly roster, and among human entries the earlier submission keeps it.
  if (left.type !== right.type) return left.type === "ai" ? -1 : 1;
  const leftTime = Date.parse(left.submittedAt || "") || Number.MAX_SAFE_INTEGER;
  const rightTime = Date.parse(right.submittedAt || "") || Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return String(left.id || "").localeCompare(String(right.id || ""));
}

function crownedDreamRoster(champion, aiRoster, weekKey) {
  const isAI = champion?.type === "ai";
  return {
    ...DREAM_TEAM,
    team: DREAM_TEAM.slug,
    teamName: DREAM_TEAM.name,
    players: champion?.players || [],
    totalCap: Number(champion?.totalCap || 0),
    weekKey,
    updatedAt: isAI ? aiRoster?.updatedAt || null : champion?.submittedAt || null,
    lockedAt: isAI ? aiRoster?.lockedAt || null : champion?.submittedAt || null,
    locked: true,
    generated: isAI,
    challengeHolder: isAI ? {
      type: "ai",
      name: "AI",
      entryId: champion?.id || `ai-${weekKey}`
    } : {
      type: "manager",
      name: champion?.managerName || "Manager",
      slug: champion?.managerSlug || null,
      attemptNumber: champion?.attemptNumber || null,
      entryId: champion?.id || null
    },
    strategy: isAI
      ? aiRoster?.strategy || "AI weekly optimized roster."
      : `${champion?.managerName || "A manager"}'s Dream Team Challenge roster currently leads the weekly AI challenge.`
  };
}

async function readEntries(redis, weekKey) {
  if (!redis) return [];
  const values = await redis.lrange(entriesKey(weekKey), 0, -1);
  return Array.isArray(values) ? values.filter(Boolean) : [];
}

export async function getDreamChallengeSnapshot({ aiRoster = null, pool = null, now = new Date() } = {}) {
  const weekKey = dreamWeekKey(now);
  const [resolvedAI, resolvedPool] = await Promise.all([
    aiRoster ? Promise.resolve(aiRoster) : ensureDreamTeamRoster({ now }),
    pool ? Promise.resolve(pool) : getPlayerPool()
  ]);
  const redis = getRedis();
  const poolIndex = buildPlayerIdentityIndex(resolvedPool?.players || []);
  const rawEntries = await readEntries(redis, weekKey);
  const humanEntries = rawEntries.map((entry) => liveEntry(entry, poolIndex));
  const ai = aiEntry(resolvedAI, poolIndex, weekKey);
  const ranked = [ai, ...humanEntries].sort(compareEntries);
  const champion = ranked[0] || ai;
  const humanLeaderboard = humanEntries.sort(compareEntries).map((entry, index) => ({
    ...entry,
    rank: index + 1,
    gapToAI: roundOne(Number(entry.fantasyPoints || 0) - Number(ai.fantasyPoints || 0)),
    isChampion: entry.id === champion.id
  }));

  return {
    weekKey,
    ai,
    champion,
    crownedRoster: crownedDreamRoster(champion, resolvedAI, weekKey),
    leaderboard: humanLeaderboard,
    entryCount: humanEntries.length
  };
}

export async function submitDreamChallenge(manager, playerIds, { now = new Date() } = {}) {
  if (!manager?.slug) throw new Error("Sign in as a pool manager before submitting a challenge roster.");
  const redis = getRedis();
  if (!redis) throw new Error("Upstash Redis is required for the Dream Team Challenge.");

  const pool = await getPlayerPool();
  const board = challengePlayerPool(pool);
  const validated = validateSelection(playerIds, board);
  if (validated.error) {
    const error = new Error(validated.error);
    error.status = 400;
    throw error;
  }

  const weekKey = dreamWeekKey(now);
  const attemptNumber = Number(await redis.incr(managerAttemptKey(weekKey, manager.slug)) || 1);
  const submittedAt = new Date().toISOString();
  const entry = {
    id: `${manager.slug}-${weekKey}-${attemptNumber}`,
    type: "manager",
    managerSlug: manager.slug,
    managerName: manager.name,
    attemptNumber,
    weekKey,
    submittedAt,
    totalCap: validated.totalCap,
    players: validated.players.map(playerSnapshot)
  };

  await redis.lpush(entriesKey(weekKey), entry);
  return entry;
}

export async function challengeEntryById(entryId, { now = new Date() } = {}) {
  if (!entryId) return null;
  const snapshot = await getDreamChallengeSnapshot({ now });
  if (snapshot.ai.id === entryId) return snapshot.ai;
  return snapshot.leaderboard.find((entry) => entry.id === entryId) || null;
}
