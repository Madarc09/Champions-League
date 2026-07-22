import { NextResponse } from "next/server";
import { managerFromRequest } from "@/lib/auth";
import { getPlayerPool } from "@/lib/nhl";
import { getSalaryRecords } from "@/lib/salaries";
import { getStaticSalaryMaster, salaryTeamNameKey } from "@/lib/static-salary-master";
import { SEED_SALARIES_BY_NAME } from "@/data/seed-salaries";
import { canonicalPlayerName } from "@/lib/capspace-snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET(request) {
  const manager = await managerFromRequest(request);
  if (manager?.slug !== "nick") {
    return NextResponse.json({ error: "Only Nick can export the salary master." }, { status: 403 });
  }

  const [master, pool] = await Promise.all([
    getStaticSalaryMaster(),
    getPlayerPool()
  ]);
  const players = pool.players || [];
  const saved = await getSalaryRecords(players.map((player) => player.playerId));

  const headers = [
    "playerId", "name", "team", "position", "capHit", "status", "source", "updatedAt"
  ];
  const rows = players
    .map((player) => {
      const key = canonicalPlayerName(player.name);
      const override = saved[String(player.playerId)] || null;
      const frozen = master.byPlayerId?.[String(player.playerId)]
        || master.byTeamAndName?.[salaryTeamNameKey(player.team, key)]
        || master.byName?.[key]
        || null;
      const rookie = SEED_SALARIES_BY_NAME[key] || null;
      const selected = override || frozen || rookie;
      const capHit = Number(selected?.capHit);
      return {
        playerId: player.playerId,
        name: player.name,
        team: player.team,
        position: player.position || player.rosterType,
        capHit: Number.isFinite(capHit) ? Math.round(capHit) : "",
        status: Number.isFinite(capHit) ? "signed" : "unresolved",
        source: selected?.source || "",
        updatedAt: override?.updatedAt || selected?.verifiedAt || master.initializedAt || ""
      };
    })
    .sort((left, right) => String(left.name).localeCompare(String(right.name), "en", { sensitivity: "base" }));

  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))
  ].join("\n") + "\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=champions-league-player-salaries-2026-27.csv",
      "Cache-Control": "no-store"
    }
  });
}
