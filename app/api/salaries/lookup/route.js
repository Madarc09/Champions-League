import { NextResponse } from "next/server";
import { getSalaryRecords, saveSalaryRecord } from "@/lib/salaries";
import { lookupPuckPediaSalary } from "@/lib/puckpedia-salaries";

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

  try {
    const lookedUp = await lookupPuckPediaSalary({ playerId, name });
    if (!lookedUp) return null;

    try {
      await saveSalaryRecord(lookedUp);
    } catch (error) {
      console.error("Salary cache save failed:", error);
    }

    return lookedUp;
  } catch (error) {
    console.error(`Salary lookup failed for ${name}:`, error);
    return null;
  }
}

export async function POST(request) {
  const body = await request.json();
  const players = Array.isArray(body.players)
    ? body.players.slice(0, 12)
    : body.player
      ? [body.player]
      : [];

  if (players.length === 0) {
    return NextResponse.json({ error: "No players supplied." }, { status: 400 });
  }

  const records = {};
  const results = await Promise.all(players.map(resolveOne));
  for (const result of results) {
    if (result) records[String(result.playerId)] = result;
  }

  return NextResponse.json({ records });
}
