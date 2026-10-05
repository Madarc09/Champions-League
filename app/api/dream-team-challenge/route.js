import { NextResponse } from "next/server";
import { managerFromRequest } from "@/lib/auth";
import { getDreamChallengeSnapshot, submitDreamChallenge } from "@/lib/dream-challenge";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function entrySummary(entry) {
  return {
    id: entry.id,
    type: entry.type,
    managerSlug: entry.managerSlug || null,
    managerName: entry.managerName || (entry.type === "ai" ? "AI" : "Manager"),
    attemptNumber: entry.attemptNumber || null,
    weekKey: entry.weekKey,
    submittedAt: entry.submittedAt || null,
    fantasyPoints: Number(entry.fantasyPoints || 0),
    totalCap: Number(entry.totalCap || 0),
    gapToAI: entry.gapToAI == null ? null : Number(entry.gapToAI),
    rank: entry.rank || null,
    isChampion: Boolean(entry.isChampion)
  };
}

function playerView(player) {
  return {
    playerId: Number(player.playerId),
    name: player.name,
    team: player.team || "NHL",
    rosterType: player.rosterType,
    position: player.position || player.rosterType,
    headshot: player.headshot || null,
    teamLogo: player.teamLogo || null,
    fantasyPoints: Number(player.fantasyPoints || 0),
    capHit: Number(player.capHit || 0)
  };
}

function detailedEntry(entry) {
  return {
    ...entrySummary(entry),
    players: (entry.players || []).map(playerView)
  };
}

export async function GET(request) {
  try {
    const manager = await managerFromRequest(request).catch(() => null);
    const url = new URL(request.url);
    const requestedEntry = url.searchParams.get("entry");
    const snapshot = await getDreamChallengeSnapshot();

    if (requestedEntry) {
      const entry = snapshot.ai.id === requestedEntry
        ? snapshot.ai
        : snapshot.leaderboard.find((item) => item.id === requestedEntry);
      if (!entry) return NextResponse.json({ error: "Challenge entry not found." }, { status: 404 });
      return NextResponse.json({ entry: detailedEntry(entry) }, { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({
      weekKey: snapshot.weekKey,
      manager,
      canSubmit: Boolean(manager),
      ai: detailedEntry(snapshot.ai),
      champion: detailedEntry(snapshot.champion),
      leaderboard: snapshot.leaderboard.map(entrySummary),
      myAttempts: manager
        ? snapshot.leaderboard.filter((entry) => entry.managerSlug === manager.slug).map(entrySummary)
        : [],
      entryCount: snapshot.entryCount,
      rules: {
        salaryCap: 104_000_000,
        forwards: 12,
        defence: 6,
        goalies: 2,
        unlimitedAttempts: true,
        scoring: "Current live 2026–27 Champions League fantasy points",
        note: "Dream Team Challenge entries never alter a manager's real drafted roster."
      }
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Dream Team Challenge read failed:", error);
    return NextResponse.json({ error: error.message || "The Dream Team Challenge could not be loaded." }, { status: 500 });
  }
}

export async function POST(request) {
  const manager = await managerFromRequest(request).catch(() => null);
  if (!manager) return NextResponse.json({ error: "Sign in as a pool manager before submitting a challenge." }, { status: 401 });

  try {
    const body = await request.json();
    const submitted = await submitDreamChallenge(manager, body.playerIds);
    const snapshot = await getDreamChallengeSnapshot();
    const liveSubmitted = snapshot.leaderboard.find((entry) => entry.id === submitted.id) || submitted;

    return NextResponse.json({
      submitted: detailedEntry(liveSubmitted),
      champion: detailedEntry(snapshot.champion),
      ai: detailedEntry(snapshot.ai),
      leaderboard: snapshot.leaderboard.map(entrySummary)
    }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("Dream Team Challenge submission failed:", error);
    return NextResponse.json({ error: error.message || "The challenge roster could not be submitted." }, { status: error.status || 500 });
  }
}
