import {
  BOT_TEAM,
  DREAM_TEAM,
  ROSTER_LIMITS,
  SALARY_CAP
} from "@/data/league-config";
import { projectionContextFor } from "@/data/projection-context";
import { getPlayerPool } from "@/lib/nhl";
import { getRankingSnapshot, pickPlayerRankings } from "@/lib/rankings";
import { getMoneyPuckSnapshot, findMoneyPuckRecord } from "@/lib/moneypuck";
import { getNhlHistorySnapshot, findNhlHistory } from "@/lib/nhl-history";
import { createPlayerProjection } from "@/lib/projections";
import { applyStaticProjection } from "@/lib/static-projections";
import { salaryCapSpaceRecordFor } from "@/lib/salary-cap-space";
import { getRedis } from "@/lib/redis";
import { rosterStorageKey } from "@/lib/standings";

const CAP_UNIT = 25_000;
const BUDGET_UNITS = Math.floor(SALARY_CAP / CAP_UNIT);
const NEGATIVE_INFINITY = -1e100;
const DREAM_WEEK_PREFIX = "champions-league:dream-team:2026-27:week:";

function capHitFor(player) {
  const record = salaryCapSpaceRecordFor(player);
  const value = Number(record?.capHit);
  return Number.isFinite(value) && value >= 500_000 ? Math.round(value) : null;
}

async function optimizationBoard() {
  const [pool, rankingsResult, moneyPuckResult, historyResult] = await Promise.all([
    getPlayerPool(),
    getRankingSnapshot().catch(() => null),
    getMoneyPuckSnapshot().catch(() => null),
    getNhlHistorySnapshot().catch(() => null)
  ]);

  return (pool.players || []).map((player) => {
    const capHit = capHitFor(player);
    const expectedRanks = rankingsResult ? pickPlayerRankings(rankingsResult, player.name) : null;
    const advanced = moneyPuckResult ? findMoneyPuckRecord(moneyPuckResult, player) : null;
    const history = historyResult ? findNhlHistory(historyResult, player) : [];
    const modelProjection = createPlayerProjection(
      player,
      history,
      advanced,
      expectedRanks,
      projectionContextFor(player)
    );
    const projection = applyStaticProjection(player, modelProjection);

    return {
      ...player,
      capHit,
      projection,
      expectedRanks
    };
  });
}

function exactPositionFrontier(players, slots, scorePlayer) {
  const scores = Array.from({ length: slots + 1 }, () => {
    const row = new Float64Array(BUDGET_UNITS + 1);
    row.fill(NEGATIVE_INFINITY);
    return row;
  });
  const paths = Array.from({ length: slots + 1 }, () => Array(BUDGET_UNITS + 1).fill(null));
  scores[0][0] = 0;

  for (const player of players) {
    const capHit = Number(player.capHit);
    if (!Number.isFinite(capHit) || capHit <= 0) continue;
    const cost = Math.ceil(capHit / CAP_UNIT);
    if (cost > BUDGET_UNITS) continue;
    const value = Number(scorePlayer(player));
    if (!Number.isFinite(value)) continue;

    for (let count = slots; count >= 1; count -= 1) {
      const current = scores[count];
      const previous = scores[count - 1];
      const currentPaths = paths[count];
      const previousPaths = paths[count - 1];

      for (let budget = BUDGET_UNITS; budget >= cost; budget -= 1) {
        const previousScore = previous[budget - cost];
        if (previousScore <= NEGATIVE_INFINITY / 2) continue;
        const candidate = previousScore + value;
        if (candidate > current[budget]) {
          current[budget] = candidate;
          currentPaths[budget] = {
            player,
            previous: previousPaths[budget - cost]
          };
        }
      }
    }
  }

  return { scores: scores[slots], paths: paths[slots] };
}

function pathPlayers(path) {
  const players = [];
  let node = path;
  while (node) {
    players.push(node.player);
    node = node.previous;
  }
  return players.reverse();
}

function goaliePrefix(goalieFrontier) {
  const scores = new Float64Array(BUDGET_UNITS + 1);
  scores.fill(NEGATIVE_INFINITY);
  const paths = Array(BUDGET_UNITS + 1).fill(null);
  let bestScore = NEGATIVE_INFINITY;
  let bestPath = null;

  for (let budget = 0; budget <= BUDGET_UNITS; budget += 1) {
    if (goalieFrontier.scores[budget] > bestScore) {
      bestScore = goalieFrontier.scores[budget];
      bestPath = goalieFrontier.paths[budget];
    }
    scores[budget] = bestScore;
    paths[budget] = bestPath;
  }

  return { scores, paths };
}

export function optimizeCapRoster(players, scorePlayer) {
  const signed = players.filter((player) => (
    ["F", "D", "G"].includes(player.rosterType)
    && Number.isFinite(Number(player.capHit))
    && Number(player.capHit) > 0
  ));

  const forwards = exactPositionFrontier(
    signed.filter((player) => player.rosterType === "F"),
    ROSTER_LIMITS.F,
    scorePlayer
  );
  const defence = exactPositionFrontier(
    signed.filter((player) => player.rosterType === "D"),
    ROSTER_LIMITS.D,
    scorePlayer
  );
  const goalies = exactPositionFrontier(
    signed.filter((player) => player.rosterType === "G"),
    ROSTER_LIMITS.G,
    scorePlayer
  );
  const goalieBestAtOrBelow = goaliePrefix(goalies);

  let best = null;
  for (let forwardBudget = 0; forwardBudget <= BUDGET_UNITS; forwardBudget += 1) {
    const forwardScore = forwards.scores[forwardBudget];
    if (forwardScore <= NEGATIVE_INFINITY / 2) continue;

    const remainingAfterForwards = BUDGET_UNITS - forwardBudget;
    for (let defenceBudget = 0; defenceBudget <= remainingAfterForwards; defenceBudget += 1) {
      const defenceScore = defence.scores[defenceBudget];
      if (defenceScore <= NEGATIVE_INFINITY / 2) continue;

      const goalieBudget = remainingAfterForwards - defenceBudget;
      const goalieScore = goalieBestAtOrBelow.scores[goalieBudget];
      if (goalieScore <= NEGATIVE_INFINITY / 2) continue;

      const score = forwardScore + defenceScore + goalieScore;
      if (!best || score > best.score) {
        best = {
          score,
          forwardPath: forwards.paths[forwardBudget],
          defencePath: defence.paths[defenceBudget],
          goaliePath: goalieBestAtOrBelow.paths[goalieBudget]
        };
      }
    }
  }

  if (!best) throw new Error("No legal 12F / 6D / 2G roster could be built under the salary cap.");

  const roster = [
    ...pathPlayers(best.forwardPath),
    ...pathPlayers(best.defencePath),
    ...pathPlayers(best.goaliePath)
  ];
  const totalCap = roster.reduce((sum, player) => sum + Number(player.capHit || 0), 0);
  const counts = roster.reduce((result, player) => {
    result[player.rosterType] += 1;
    return result;
  }, { F: 0, D: 0, G: 0 });

  if (
    roster.length !== 20
    || counts.F !== ROSTER_LIMITS.F
    || counts.D !== ROSTER_LIMITS.D
    || counts.G !== ROSTER_LIMITS.G
    || totalCap > SALARY_CAP
  ) {
    throw new Error("The optimizer produced an invalid roster.");
  }

  return { players: roster, totalCap, score: best.score, counts };
}

function torontoParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function dreamWeekKey(now = new Date()) {
  const parts = torontoParts(now);
  let localDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  if (Number(parts.hour) < 4) localDate = new Date(localDate.getTime() - 24 * 60 * 60 * 1000);
  const day = localDate.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  localDate = new Date(localDate.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
  return localDate.toISOString().slice(0, 10);
}

function makeRoster(team, optimized, extra = {}) {
  const now = new Date().toISOString();
  return {
    team: team.slug,
    teamName: team.name,
    players: optimized.players,
    totalCap: optimized.totalCap,
    updatedAt: now,
    lockedAt: now,
    locked: true,
    generated: true,
    ...extra
  };
}

export async function ensureBotRoster({ board = null } = {}) {
  const redis = getRedis();
  const key = rosterStorageKey(BOT_TEAM.slug);

  if (redis) {
    const existing = await redis.get(key);
    if (existing?.players?.length) return existing;
  }

  const playerBoard = board || await optimizationBoard();
  const optimized = optimizeCapRoster(
    playerBoard,
    (player) => Number(player.projection?.fantasyPoints || 0)
  );
  const roster = makeRoster(BOT_TEAM, optimized, {
    strategy: "Maximize preseason 2026–27 projected Champions League fantasy points under the same cap and roster limits as every manager."
  });

  if (!redis) return roster;
  await redis.set(key, roster, { nx: true });
  return (await redis.get(key)) || roster;
}

export async function ensureDreamTeamRoster({ board = null, now = new Date() } = {}) {
  const redis = getRedis();
  const weekKey = dreamWeekKey(now);
  const key = `${DREAM_WEEK_PREFIX}${weekKey}`;

  if (redis) {
    const existing = await redis.get(key);
    if (existing?.players?.length) return existing;
  }

  const playerBoard = board || await optimizationBoard();
  // Current season fantasy points are the primary objective. Projection is a
  // small tie-breaker, which makes week one sensible before everyone has played.
  const optimized = optimizeCapRoster(
    playerBoard,
    (player) => Number(player.fantasyPoints || 0) * 1_000_000 + Number(player.projection?.fantasyPoints || 0)
  );
  const roster = makeRoster(DREAM_TEAM, optimized, {
    weekKey,
    strategy: "Maximize current 2026–27 Champions League fantasy points under the cap; use the preseason projection only to break equal current-point totals."
  });

  if (!redis) return roster;
  await redis.set(key, roster, { nx: true });
  const saved = (await redis.get(key)) || roster;
  await redis.set(rosterStorageKey(DREAM_TEAM.slug), saved);
  return saved;
}

export async function ensureSpecialRosters({ now = new Date() } = {}) {
  const redis = getRedis();
  const weekKey = dreamWeekKey(now);
  if (redis) {
    const [botExisting, dreamExisting] = await Promise.all([
      redis.get(rosterStorageKey(BOT_TEAM.slug)),
      redis.get(`${DREAM_WEEK_PREFIX}${weekKey}`)
    ]);
    if (botExisting?.players?.length && dreamExisting?.players?.length) {
      return { bot: botExisting, dream: dreamExisting };
    }
  }

  const board = await optimizationBoard();
  const [bot, dream] = await Promise.all([
    ensureBotRoster({ board }),
    ensureDreamTeamRoster({ board, now })
  ]);
  return { bot, dream };
}

export async function specialRosterFor(teamSlug) {
  if (teamSlug === BOT_TEAM.slug) return ensureBotRoster();
  if (teamSlug === DREAM_TEAM.slug) return ensureDreamTeamRoster();
  return null;
}
