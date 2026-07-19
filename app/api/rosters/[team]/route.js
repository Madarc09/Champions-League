import { NextResponse } from "next/server";
import { ROSTER_LIMITS, SALARY_CAP, TEAMS } from "@/data/league-config";
import { getRedis } from "@/lib/redis";

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

export async function GET(_request, context) {
  const { team } = await context.params;
  if (!validTeam(team)) return NextResponse.json({ error: "Team not found." }, { status: 404 });

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ roster: null, persistence: "local" });
  }

  try {
    const roster = await redis.get(rosterKey(team));
    return NextResponse.json({ roster: roster || null, persistence: "shared" });
  } catch (error) {
    console.error("Roster read failed:", error);
    return NextResponse.json({ roster: null, persistence: "local" });
  }
}

export async function POST(request, context) {
  const { team } = await context.params;
  if (!validTeam(team)) return NextResponse.json({ error: "Team not found." }, { status: 404 });

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
      { error: "Upstash is not connected. Save this roster in the browser instead.", roster },
      { status: 503 }
    );
  }

  await redis.set(rosterKey(team), roster);
  return NextResponse.json({ roster, persistence: "shared" });
}
