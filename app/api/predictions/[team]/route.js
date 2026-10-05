import { NextResponse } from "next/server";
import { PREDICTIONS_LOCKED, PREDICTIONS_LOCKED_AT, TEAMS } from "@/data/league-config";
import { NHL_TEAMS_FALLBACK } from "@/data/nhl-teams";
import { getRedis } from "@/lib/redis";
import { managerFromRequest } from "@/lib/auth";
import { getPlayerPool } from "@/lib/nhl";
import { buildPlayerIdentityIndex, canonicalPlayerName, resolvePlayerFromIndex, samePlayerIdentity } from "@/lib/player-identity";

const PLAYER_KEYS = ["artRoss", "hart", "rocket", "vezina", "calder", "norris"];
const TEAM_KEYS = ["stanleyCup", "eastChamp", "westChamp", "presidentsTrophy"];
const validTeamAbbrevs = new Set(NHL_TEAMS_FALLBACK.map((team) => team.abbrev));

function validLeagueTeam(team) {
  return TEAMS.some((item) => item.slug === team);
}

function predictionsKey(team) {
  return `champions-league:predictions:${team}:2026-27`;
}

function cleanPlayer(value) {
  if (!value) return null;
  const rawPlayerId = Number(value.playerId);
  const name = String(value.name || "").trim();
  if (!name) return null;

  return {
    playerId: Number.isFinite(rawPlayerId) ? rawPlayerId : null,
    name,
    team: String(value.team || "NHL").trim().toUpperCase(),
    rosterType: String(value.rosterType || "F").trim().toUpperCase(),
    position: String(value.position || value.rosterType || "F").trim().toUpperCase(),
    headshot: value.headshot || null,
    teamLogo: value.teamLogo || null,
    rookie: Boolean(value.rookie),
    draftYear: value.draftYear || null,
    gamesPlayed: Number(value.gamesPlayed || 0)
  };
}

function cleanNhlTeam(value, requiredConference = null) {
  if (!value) return null;
  const abbrev = String(value.abbrev || "").trim().toUpperCase();
  const known = NHL_TEAMS_FALLBACK.find((team) => team.abbrev === abbrev);
  if (!known || !validTeamAbbrevs.has(abbrev)) return null;
  if (requiredConference && known.conference !== requiredConference) return null;
  return known;
}

function normalizePredictions(body = {}) {
  const playerAwards = {};
  for (const key of PLAYER_KEYS) playerAwards[key] = cleanPlayer(body.playerAwards?.[key]);

  const teamAwards = {
    stanleyCup: cleanNhlTeam(body.teamAwards?.stanleyCup),
    eastChamp: cleanNhlTeam(body.teamAwards?.eastChamp, "East"),
    westChamp: cleanNhlTeam(body.teamAwards?.westChamp, "West"),
    presidentsTrophy: cleanNhlTeam(body.teamAwards?.presidentsTrophy)
  };

  return { playerAwards, teamAwards };
}

function mergePredictionPlayer(saved, live) {
  if (!saved && !live) return null;
  if (!saved) return live;
  if (!live) return saved;

  return {
    ...saved,
    ...live,
    playerId: Number(live.playerId || saved.playerId),
    name: live.name || saved.name,
    team: live.team || saved.team,
    rosterType: live.rosterType || saved.rosterType,
    position: live.position || saved.position || live.rosterType || saved.rosterType,
    headshot: live.headshot || saved.headshot || null,
    teamLogo: live.teamLogo || saved.teamLogo || null,
    rookie: Boolean(live.rookie || saved.rookie),
    draftYear: live.draftYear || saved.draftYear || null,
    gamesPlayed: Number(live.gamesPlayed ?? saved.gamesPlayed ?? 0)
  };
}

async function enrichPredictions(predictions) {
  if (!predictions?.playerAwards) return predictions || null;

  try {
    const pool = await getPlayerPool();
    const index = buildPlayerIdentityIndex(pool.players || []);
    const repairedAwards = {};

    for (const key of PLAYER_KEYS) {
      const saved = cleanPlayer(predictions.playerAwards?.[key]);
      let live = null;

      if (saved) {
        // Gavin McKenna was originally saved while he still had prospect-era
        // data. Pin his official NHL identity, then use the same safe name/ID
        // reconciliation for every other rookie prediction.
        if (canonicalPlayerName(saved.name) === "gavin mckenna") {
          live = index.byId?.get("8486067") || null;
        }

        if (!live) {
          const idMatch = index.byId?.get(String(saved.playerId));
          if (idMatch && samePlayerIdentity(saved, idMatch)) live = idMatch;
        }

        if (!live) {
          live = resolvePlayerFromIndex({ ...saved, playerId: null }, index);
        }
      }

      repairedAwards[key] = mergePredictionPlayer(saved, live);
    }

    return {
      ...predictions,
      playerAwards: repairedAwards
    };
  } catch (error) {
    console.error("Prediction enrichment unavailable:", error);
    return predictions;
  }
}

export async function GET(request, context) {
  const { team } = await context.params;
  if (!validLeagueTeam(team)) return NextResponse.json({ error: "Team not found." }, { status: 404 });

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Upstash is not connected to this Vercel project." }, { status: 503 });

  try {
    const predictions = await redis.get(predictionsKey(team));
    const enriched = await enrichPredictions(predictions || null);
    return NextResponse.json({ predictions: enriched, visibility: "public" }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("Predictions read failed:", error);
    return NextResponse.json({ error: "The predictions could not be loaded." }, { status: 500 });
  }
}

export async function POST(request, context) {
  const { team } = await context.params;
  if (!validLeagueTeam(team)) return NextResponse.json({ error: "Team not found." }, { status: 404 });

  if (PREDICTIONS_LOCKED) {
    return NextResponse.json({
      error: "Preseason predictions are locked now that the 2026–27 season has begun.",
      locked: true,
      lockedAt: PREDICTIONS_LOCKED_AT
    }, { status: 423 });
  }

  const manager = await managerFromRequest(request);
  if (!manager) return NextResponse.json({ error: "Sign in before saving predictions." }, { status: 401 });
  if (manager.slug !== team) return NextResponse.json({ error: "You can only save your own predictions." }, { status: 403 });

  const cleaned = normalizePredictions(await request.json());
  const predictions = {
    team,
    ...cleaned,
    updatedAt: new Date().toISOString()
  };

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json(
      { error: "Upstash is not connected to this Vercel project.", predictions },
      { status: 503 }
    );
  }

  await redis.set(predictionsKey(team), predictions);
  return NextResponse.json({ predictions, persistence: "private" }, {
    headers: { "Cache-Control": "no-store, private" }
  });
}
