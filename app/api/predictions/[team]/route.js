import { NextResponse } from "next/server";
import { TEAMS } from "@/data/league-config";
import { NHL_TEAMS_FALLBACK } from "@/data/nhl-teams";
import { getRedis } from "@/lib/redis";
import { managerFromRequest } from "@/lib/auth";

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
  const playerId = Number(value.playerId);
  const name = String(value.name || "").trim();
  if (!Number.isFinite(playerId) || !name) return null;

  return {
    playerId,
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

export async function GET(request, context) {
  const { team } = await context.params;
  if (!validLeagueTeam(team)) return NextResponse.json({ error: "Team not found." }, { status: 404 });

  const manager = await managerFromRequest(request);
  if (!manager) return NextResponse.json({ error: "Sign in to view these private predictions." }, { status: 401 });
  if (manager.slug !== team) return NextResponse.json({ error: "These predictions are private to their manager." }, { status: 403 });

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Upstash is not connected to this Vercel project." }, { status: 503 });

  try {
    const predictions = await redis.get(predictionsKey(team));
    return NextResponse.json({ predictions: predictions || null, persistence: "private" }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("Predictions read failed:", error);
    return NextResponse.json({ error: "The private predictions could not be loaded." }, { status: 500 });
  }
}

export async function POST(request, context) {
  const { team } = await context.params;
  if (!validLeagueTeam(team)) return NextResponse.json({ error: "Team not found." }, { status: 404 });

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
