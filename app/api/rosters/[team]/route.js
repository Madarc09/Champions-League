import { NextResponse } from "next/server";
import {
  PUBLIC_TEAMS,
  ROSTERS_LOCKED,
  ROSTER_LOCKED_AT,
  ROSTER_LIMITS,
  ROSTER_REVEAL_AT,
  SALARY_CAP,
  TEAMS,
  rostersArePublic
} from "@/data/league-config";
import { getRedis } from "@/lib/redis";
import { managerFromRequest } from "@/lib/auth";
import { rosterStorageKey } from "@/lib/standings";
import { ensureDreamTeamRoster, specialRosterFor } from "@/lib/special-teams";
import { getPlayerPool } from "@/lib/nhl";
import { getDreamChallengeSnapshot } from "@/lib/dream-challenge";

function validTeam(team) {
  return PUBLIC_TEAMS.some((item) => item.slug === team);
}

function isHumanTeam(team) {
  return TEAMS.some((item) => item.slug === team);
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
    if (!Object.hasOwn(counts, rosterType)) return "Every player must be a forward, defence, or goalie.";
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

export async function GET(request, context) {
  const { team } = await context.params;
  if (!validTeam(team)) return NextResponse.json({ error: "Team not found." }, { status: 404 });

  if (!isHumanTeam(team)) {
    try {
      let roster;
      if (team === "dream-team") {
        const [aiRoster, pool] = await Promise.all([ensureDreamTeamRoster(), getPlayerPool()]);
        const challenge = await getDreamChallengeSnapshot({ aiRoster, pool });
        roster = challenge.crownedRoster;
      } else {
        roster = await specialRosterFor(team);
      }
      return NextResponse.json({
        roster,
        concealed: false,
        visibility: "public-generated-roster",
        locked: true,
        lockedAt: roster?.lockedAt || ROSTER_LOCKED_AT,
        revealAt: ROSTER_REVEAL_AT
      }, {
        headers: { "Cache-Control": "no-store" }
      });
    } catch (error) {
      console.error("Generated roster read failed:", error);
      return NextResponse.json({ error: "The generated roster could not be loaded." }, { status: 500 });
    }
  }

  const manager = await managerFromRequest(request).catch(() => null);
  const isOwner = manager?.slug === team;
  const publicAfterSeasonStart = rostersArePublic();

  if (!isOwner && !publicAfterSeasonStart) {
    return NextResponse.json({
      roster: null,
      concealed: true,
      visibility: "private-until-season-start",
      revealAt: ROSTER_REVEAL_AT,
      locked: ROSTERS_LOCKED,
      lockedAt: ROSTER_LOCKED_AT
    }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: "Upstash is not connected to this Vercel project." }, { status: 503 });
  }

  try {
    const roster = await redis.get(rosterStorageKey(team));
    return NextResponse.json({
      roster: roster || null,
      concealed: false,
      visibility: isOwner ? "owner" : "public-after-season-start",
      revealAt: ROSTER_REVEAL_AT,
      locked: ROSTERS_LOCKED,
      lockedAt: ROSTER_LOCKED_AT
    }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("Roster read failed:", error);
    return NextResponse.json({ error: "The roster could not be loaded." }, { status: 500 });
  }
}

export async function POST(request, context) {
  const { team } = await context.params;
  if (!validTeam(team)) return NextResponse.json({ error: "Team not found." }, { status: 404 });
  if (!isHumanTeam(team)) {
    return NextResponse.json({ error: "Generated league teams cannot be edited." }, { status: 403 });
  }

  if (ROSTERS_LOCKED) {
    return NextResponse.json({
      error: "The 2026–27 roster deadline has passed. All submitted rosters are locked for the season.",
      locked: true,
      lockedAt: ROSTER_LOCKED_AT
    }, { status: 423 });
  }

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

  await redis.set(rosterStorageKey(team), roster);
  return NextResponse.json({ roster, persistence: "private" }, {
    headers: { "Cache-Control": "no-store, private" }
  });
}
