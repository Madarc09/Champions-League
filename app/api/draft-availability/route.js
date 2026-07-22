import { NextResponse } from "next/server";
import { TEAMS } from "@/data/league-config";
import { managerFromRequest } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import { rosterStorageKey } from "@/lib/standings";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const manager = await managerFromRequest(request);
  if (!manager) {
    return NextResponse.json({ error: "Sign in to view draft availability." }, { status: 401 });
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ claimedPlayerIds: [], persistence: "unavailable" }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  }

  const results = await Promise.allSettled(
    TEAMS
      .filter((team) => team.slug !== manager.slug)
      .map((team) => redis.get(rosterStorageKey(team.slug)))
  );

  const claimedPlayerIds = new Set();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const player of result.value?.players || []) {
      if (player?.playerId != null) claimedPlayerIds.add(String(player.playerId));
    }
  }

  return NextResponse.json({
    claimedPlayerIds: [...claimedPlayerIds],
    updatedAt: new Date().toISOString(),
    visibility: "availability-only"
  }, {
    headers: { "Cache-Control": "no-store, private" }
  });
}
