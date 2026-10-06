import { NextResponse } from "next/server";
import { DREAM_TEAM, STANDINGS_TEAMS } from "@/data/league-config";
import { getLeagueDayFantasySnapshot, getLeagueDayScheduleSnapshot, getPlayerPool } from "@/lib/nhl";
import { getRedis } from "@/lib/redis";
import {
  buildLeagueStandings,
  rosterFantasyTotal,
  rosterProjectedTotal,
  rosterStorageKey
} from "@/lib/standings";
import { applyStaticProjection } from "@/lib/static-projections";
import { buildPlayerIdentityIndex, canonicalPlayerName, resolvePlayerFromIndex } from "@/lib/player-identity";
import { ensureSpecialRosters } from "@/lib/special-teams";
import { getDreamChallengeSnapshot } from "@/lib/dream-challenge";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function overlapCount(roster, dreamRoster) {
  const dreamIds = new Set((dreamRoster?.players || []).map((player) => String(player.playerId)));
  const dreamNames = new Set((dreamRoster?.players || []).map((player) => canonicalPlayerName(player.name)).filter(Boolean));
  return (roster?.players || []).reduce((count, player) => {
    const idMatch = dreamIds.has(String(player.playerId));
    const nameMatch = dreamNames.has(canonicalPlayerName(player.name));
    return count + (idMatch || nameMatch ? 1 : 0);
  }, 0);
}

function rosterTodayTotal(roster, pointsById = {}) {
  const total = (roster?.players || []).reduce((sum, player) => {
    const points = Number(pointsById[String(player?.playerId || "")] || 0);
    return sum + (Number.isFinite(points) ? points : 0);
  }, 0);
  return Math.round(total * 10) / 10;
}

export async function GET() {
  const redis = getRedis();
  const rosters = {};
  let dreamRoster = null;
  let aiDreamRoster = null;

  try {
    const special = await ensureSpecialRosters();
    rosters[special.bot.team] = special.bot;
    dreamRoster = special.dream;
    aiDreamRoster = special.dream;
  } catch (error) {
    console.error("Special roster refresh failed:", error);
  }

  if (redis) {
    const humanTeams = STANDINGS_TEAMS.filter((team) => team.kind !== "bot");
    const results = await Promise.allSettled(
      humanTeams.map(async (team) => [team.slug, await redis.get(rosterStorageKey(team.slug))])
    );

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const [teamSlug, roster] = result.value;
      rosters[teamSlug] = roster || null;
    }
  } else {
    for (const team of STANDINGS_TEAMS) {
      if (!(team.slug in rosters)) rosters[team.slug] = null;
    }
  }

  let liveFantasyPoints = {};
  let liveProjectedPoints = {};
  let dailyFantasyPoints = {};
  let livePlayersById = new Map();
  let statsUpdatedAt = null;
  let leagueDayKey = null;
  let playingTeamAbbrevs = new Set();
  let scheduleAvailable = false;
  let dailyStatsSource = null;
  let dailyStatsUpdatedAt = null;
  let dailyStatsPlayerCount = 0;
  let dailyStatsActiveGameCount = null;
  let dailyStatsLoadedBoxscoreCount = 0;

  try {
    const [pool, dailySnapshot, scheduleSnapshot] = await Promise.all([
      getPlayerPool(),
      getLeagueDayFantasySnapshot().catch((error) => {
        console.error("Today fantasy snapshot unavailable:", error);
        return null;
      }),
      getLeagueDayScheduleSnapshot().catch((error) => {
        console.error("Today schedule snapshot unavailable:", error);
        return null;
      })
    ]);
    dailyFantasyPoints = dailySnapshot?.pointsById || {};
    dailyStatsSource = dailySnapshot?.source || null;
    dailyStatsUpdatedAt = dailySnapshot?.updatedAt || null;
    dailyStatsPlayerCount = Number(dailySnapshot?.playerCount || 0);
    dailyStatsActiveGameCount = dailySnapshot?.activeGameCount ?? null;
    dailyStatsLoadedBoxscoreCount = Number(dailySnapshot?.loadedBoxscoreCount || 0);
    leagueDayKey = dailySnapshot?.dateKey || scheduleSnapshot?.dateKey || null;
    scheduleAvailable = Boolean(scheduleSnapshot);
    playingTeamAbbrevs = new Set((scheduleSnapshot?.teamAbbrevs || []).map((team) => String(team).toUpperCase()));

    // The AI still creates the opening roster every week, but the public Dream
    // Team slot is owned by the highest-scoring challenge entry until somebody
    // beats it. Challenge entries live in their own Redis namespace and never
    // touch any real drafted roster.
    try {
      const challenge = await getDreamChallengeSnapshot({ aiRoster: dreamRoster, pool });
      aiDreamRoster = challenge.ai;
      dreamRoster = challenge.crownedRoster;
    } catch (challengeError) {
      console.error("Dream Team Challenge crown refresh failed:", challengeError);
    }

    const liveIdentityIndex = buildPlayerIdentityIndex(pool.players || []);
    livePlayersById = new Map(
      (pool.players || []).map((player) => [String(player.playerId), player])
    );
    liveFantasyPoints = Object.fromEntries(
      (pool.players || []).map((player) => [
        String(player.playerId),
        Number(player.fantasyPoints || 0)
      ])
    );

    // Saved rookie picks may carry a temporary draft/prospect ID. Alias every
    // stored roster ID to the live NHL record by verified identity so those
    // players start scoring automatically once the NHL assigns the official ID.
    const allStoredPlayers = Object.values(rosters)
      .flatMap((roster) => Array.isArray(roster?.players) ? roster.players : []);
    for (const storedPlayer of allStoredPlayers) {
      const livePlayer = resolvePlayerFromIndex(storedPlayer, liveIdentityIndex);
      if (!livePlayer) continue;
      livePlayersById.set(String(storedPlayer.playerId), livePlayer);
      liveFantasyPoints[String(storedPlayer.playerId)] = Number(livePlayer.fantasyPoints || 0);
      dailyFantasyPoints[String(storedPlayer.playerId)] = Number(
        dailyFantasyPoints[String(livePlayer.playerId)] || 0
      );
    }

    const rosterPlayers = [
      ...Object.values(rosters).flatMap((roster) => Array.isArray(roster?.players) ? roster.players : []),
      ...(dreamRoster?.players || [])
    ];
    liveProjectedPoints = Object.fromEntries(
      rosterPlayers.map((player) => {
        const projection = applyStaticProjection(player, player.projection || {});
        return [String(player.playerId), Number(projection?.fantasyPoints || 0)];
      })
    );
    statsUpdatedAt = pool.updatedAt || null;
  } catch (error) {
    console.error("Standings player refresh failed:", error);
  }

  const standings = buildLeagueStandings(rosters, liveFantasyPoints, liveProjectedPoints)
    .map((team) => ({
      ...team,
      // Keep the original league-side Dream Team overlap stat tied to the AI's
      // weekly optimized roster. A mini-game winner may occupy the public Dream
      // Team display, but cannot alter this established league metric.
      todayPoints: rosterTodayTotal(rosters[team.slug], dailyFantasyPoints),
      dreamTeamPlayers: overlapCount(rosters[team.slug], aiDreamRoster || dreamRoster)
    }));

  const positionOrder = { F: 0, D: 1, G: 2 };
  const dreamPlayers = (dreamRoster?.players || [])
    .map((storedPlayer) => {
      const livePlayer = livePlayersById.get(String(storedPlayer.playerId));
      return {
        ...storedPlayer,
        ...(livePlayer || {}),
        capHit: Number(storedPlayer.capHit || livePlayer?.capHit || 0),
        fantasyPoints: Number(liveFantasyPoints[String(storedPlayer.playerId)] || 0),
        todayPoints: Number(
          dailyFantasyPoints[String(storedPlayer.playerId)]
          ?? dailyFantasyPoints[String(livePlayer?.playerId || "")]
          ?? 0
        ),
        playingToday: scheduleAvailable
          ? playingTeamAbbrevs.has(String(livePlayer?.team || storedPlayer.team || "").toUpperCase())
          : null
      };
    })
    .sort((left, right) => (
      (positionOrder[left.rosterType] ?? 9) - (positionOrder[right.rosterType] ?? 9)
      || Number(right.fantasyPoints || 0) - Number(left.fantasyPoints || 0)
      || String(left.name || "").localeCompare(String(right.name || ""))
    ));

  const dreamTeam = dreamRoster ? {
    ...DREAM_TEAM,
    players: dreamPlayers,
    fantasyPoints: rosterFantasyTotal(dreamRoster, liveFantasyPoints),
    projectedFantasyPoints: rosterProjectedTotal(dreamRoster, liveProjectedPoints),
    totalCap: Number(dreamRoster.totalCap || 0),
    weekKey: dreamRoster.weekKey || null,
    updatedAt: dreamRoster.updatedAt || null,
    challengeHolder: dreamRoster.challengeHolder || { type: "ai", name: "AI" },
    strategy: dreamRoster.strategy || null
  } : null;

  // The homepage roster carousel uses the same already-fetched NHL snapshot as
  // standings, so switching teams never requires another API round-trip and
  // never falls back to stale fantasy totals stored on draft-day roster objects.
  const teamRosters = STANDINGS_TEAMS.map((team) => {
    const storedRoster = rosters[team.slug];
    const players = (storedRoster?.players || []).map((storedPlayer) => {
      const livePlayer = livePlayersById.get(String(storedPlayer.playerId));
      return {
        ...storedPlayer,
        ...(livePlayer || {}),
        capHit: Number(storedPlayer.capHit || livePlayer?.capHit || 0),
        fantasyPoints: Number(liveFantasyPoints[String(storedPlayer.playerId)] || 0),
        todayPoints: Number(
          dailyFantasyPoints[String(storedPlayer.playerId)]
          ?? dailyFantasyPoints[String(livePlayer?.playerId || "")]
          ?? 0
        ),
        playingToday: scheduleAvailable
          ? playingTeamAbbrevs.has(String(livePlayer?.team || storedPlayer.team || "").toUpperCase())
          : null
      };
    });

    return {
      slug: team.slug,
      name: team.name,
      kind: team.kind || null,
      players,
      fantasyPoints: Number(standings.find((entry) => entry.slug === team.slug)?.fantasyPoints || 0),
      totalCap: players.reduce((sum, player) => sum + Number(player.capHit || 0), 0)
    };
  });

  return NextResponse.json({
    standings,
    dreamTeam,
    teamRosters,
    persistence: redis ? "private" : "unavailable",
    statsUpdatedAt,
    leagueDay: {
      dateKey: leagueDayKey,
      resetsAtEastern: "10:00",
      scheduleAvailable,
      playingTeamAbbrevs: [...playingTeamAbbrevs],
      dailyStats: {
        source: dailyStatsSource,
        updatedAt: dailyStatsUpdatedAt,
        playerCount: dailyStatsPlayerCount,
        activeGameCount: dailyStatsActiveGameCount,
        loadedBoxscoreCount: dailyStatsLoadedBoxscoreCount
      }
    }
  }, {
    headers: { "Cache-Control": "no-store" }
  });
}
