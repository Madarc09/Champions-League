import { NextResponse } from "next/server";
import { ROSTER_LIMITS, SALARY_CAP, TEAMS } from "@/data/league-config";
import { getRedis } from "@/lib/redis";
import { managerFromRequest } from "@/lib/auth";

function validTeam(team) {
  return TEAMS.some((item) => item.slug === team);
}

function rosterKey(team) {
  return `champions-league:roster:${team}:2026-27`;
}

function validateRoster(players) {
  if (!Array.isArray(players)) return "Roster must contain a players array.";

  const seen = new Set();
  const counts = { F: 0, D: 0, G: 0 };
  let totalCapHit = 0;

  for (const player of players) {
    const id = String(player.playerId || "");
    if (!id || seen.has(id)) return "A player cannot appear twice on the same roster.";
    seen.add(id);

    const rosterType = player.rosterType;
    if (!counts.hasOwnProperty(rosterType)) return "Every player must be a forward, defence, or goalie.";
    counts[rosterType] += 1;

    const capHit = Number(player.capHit);
    if (!Number.isFinite(capHit) || capHit < 0) return `A valid cap hit is required for ${player.name || "every player"}.`;
    totalCapHit += capHit;
  }

  for (const [position, max] of Object.entries(ROSTER_LIMITS)) {
    if (counts[position] > max) return `Too many ${position} players.`;
  }

  if (players.length > 20) return "A roster cannot contain more than 20 players.";
  if (totalCapHit > SALARY_CAP) return "The roster is over the salary cap.";

  return null;
}


async function playerClaimedByAnotherTeam(redis, team, players) {
  const requested = new Map(players.map((player) => [String(player.playerId), player]));
  const results = await Promise.allSettled(
    TEAMS
      .filter((entry) => entry.slug !== team)
      .map((entry) => redis.get(rosterKey(entry.slug)))
  );

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const claimed of result.value?.players || []) {
      const conflict = requested.get(String(claimed?.playerId));
      if (conflict) return conflict;
    }
  }
  return null;
}

export async function GET(request, context) {
  const { team } = await context.params;
  if (!validTeam(team)) return NextResponse.json({ error: "Team not found." }, { status: 404 });

  const manager = await managerFromRequest(request);
  if (!manager) return NextResponse.json({ error: "Sign in to view this private roster." }, { status: 401 });
  if (manager.slug !== team) return NextResponse.json({ error: "This roster is private to its manager." }, { status: 403 });

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: "Upstash is not connected to this Vercel project." }, { status: 503 });
  }

  try {
    const roster = await redis.get(rosterKey(team));
    return NextResponse.json({ roster: roster || null, persistence: "private" }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("Roster read failed:", error);
    return NextResponse.json({ error: "The private roster could not be loaded." }, { status: 500 });
  }
}

export async function POST(request, context) {
  const { team } = await context.params;
  if (!validTeam(team)) return NextResponse.json({ error: "Team not found." }, { status: 404 });

  const manager = await managerFromRequest(request);
  if (!manager) return NextResponse.json({ error: "Sign in before saving a roster." }, { status: 401 });
  if (manager.slug !== team) return NextResponse.json({ error: "You can only save your own roster." }, { status: 403 });

  const body = await request.json();
  const error = validateRoster(body.players);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const roster = {
    team,
    players: body.players,
    updatedAt: new Date().toISOString()
  };

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json(
      { error: "Upstash is not connected to this Vercel project.", roster },
      { status: 503 }
    );
  }

  const conflict = await playerClaimedByAnotherTeam(redis, team, roster.players);
  if (conflict) {
    return NextResponse.json(
      {
        error: `${conflict.name || "That player"} has already been drafted and is no longer available.`,
        conflictPlayerId: String(conflict.playerId)
      },
      { status: 409 }
    );
  }

  await redis.set(rosterKey(team), roster);
  return NextResponse.json({ roster, persistence: "private" }, {
    headers: { "Cache-Control": "no-store, private" }
  });
}
