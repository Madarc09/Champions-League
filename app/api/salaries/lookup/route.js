import { NextResponse } from "next/server";
import { getSalaryRecords, saveSalaryRecord } from "@/lib/salaries";
import { lookupCapSpaceSalary } from "@/lib/capspace-salaries";

export const dynamic = "force-dynamic";

async function resolveOne(player) {
  const playerId = Number(player?.playerId);
  const name = String(player?.name || "").trim();
  if (!Number.isInteger(playerId) || !name) return null;

  const existing = await getSalaryRecords([playerId]);
  if (existing[String(playerId)]?.capHit) {
    return {
      playerId,
      name,
      ...existing[String(playerId)]
    };
  }

  const lookedUp = await lookupCapSpaceSalary({ playerId, name });
  if (!lookedUp) return null;

  try {
    await saveSalaryRecord(lookedUp);
  } catch (error) {
    console.error("Salary cache save failed:", error);
  }

  return lookedUp;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const players = Array.isArray(body.players)
    ? body.players.slice(0, 20)
    : body.player
      ? [body.player]
      : [];

  if (players.length === 0) {
    return NextResponse.json({ error: "No players supplied." }, { status: 400 });
  }

  const records = {};
  const missing = [];
  const results = await Promise.all(players.map(async (player) => {
    try {
      return await resolveOne(player);
    } catch (error) {
      console.error(`Salary lookup failed for ${player?.name || "unknown player"}:`, error);
      return null;
    }
  }));

  results.forEach((result, index) => {
    if (result) records[String(result.playerId)] = result;
    else missing.push({
      playerId: Number(players[index]?.playerId),
      name: String(players[index]?.name || "Unknown player")
    });
  });

  return NextResponse.json({ records, missing, source: "CapSpace" });
}
