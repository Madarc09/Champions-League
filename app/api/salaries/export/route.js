import { NextResponse } from "next/server";
import { managerFromRequest } from "@/lib/auth";
import { getSalaryRecords } from "@/lib/salaries";
import { salaryCapSpaceRecords, salaryCapSpaceSnapshot } from "@/lib/salary-cap-space";

export const dynamic = "force-dynamic";

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET(request) {
  const manager = await managerFromRequest(request);
  if (manager?.slug !== "nick") {
    return NextResponse.json({ error: "Only Nick can export SALARY CAP SPACE." }, { status: 403 });
  }

  const snapshot = salaryCapSpaceSnapshot();
  const records = salaryCapSpaceRecords();
  const overrides = await getSalaryRecords(records.map((record) => record.playerId));
  const headers = ["playerId", "name", "team", "position", "capHit", "status", "source", "updatedAt"];

  const rows = records.map((record) => {
    const override = overrides[String(record.playerId)] || null;
    const overrideCapHit = Number(override?.capHit);
    const staticCapHit = Number(record.capHit);
    const capHit = Number.isFinite(overrideCapHit) && overrideCapHit >= 500_000
      ? Math.round(overrideCapHit)
      : Number.isFinite(staticCapHit) && staticCapHit >= 500_000
        ? Math.round(staticCapHit)
        : 0;

    return {
      playerId: record.playerId,
      name: record.name,
      team: record.team,
      position: record.position,
      capHit,
      status: capHit > 0 ? "signed" : "zero",
      source: override?.source || record.source || "",
      updatedAt: override?.updatedAt || snapshot.generatedAt || ""
    };
  });

  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))
  ].join("\n") + "\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="SALARY CAP SPACE.csv"',
      "Cache-Control": "no-store"
    }
  });
}
