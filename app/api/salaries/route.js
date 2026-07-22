import { NextResponse } from "next/server";
import { getSalaryRecords, saveSalaryRecord, saveSalaryRecords } from "@/lib/salaries";
import { managerFromRequest } from "@/lib/auth";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ids = (searchParams.get("ids") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 100);

  const records = await getSalaryRecords(ids);
  return NextResponse.json({ records });
}

export async function POST(request) {
  const manager = await managerFromRequest(request);
  if (manager?.slug !== "nick") {
    return NextResponse.json({ error: "Only Nick can update league salaries." }, { status: 403 });
  }

  const body = await request.json();

  if (Array.isArray(body.records)) {
    const validRecords = body.records.filter((item) => {
      const capHit = Number(item.capHit);
      return Number.isInteger(Number(item.playerId)) && capHit >= 500_000 && capHit <= 30_000_000;
    });

    const result = await saveSalaryRecords(validRecords);
    if (!result.persisted) {
      return NextResponse.json(
        { error: "Upstash is not connected. Salary was not saved to the shared database." },
        { status: 503 }
      );
    }
    return NextResponse.json(result);
  }

  const playerId = Number(body.playerId);
  const capHit = Number(body.capHit);

  if (!Number.isInteger(playerId) || !Number.isFinite(capHit) || capHit < 500_000 || capHit > 30_000_000) {
    return NextResponse.json({ error: "Invalid player ID or cap hit." }, { status: 400 });
  }

  const result = await saveSalaryRecord({
    playerId,
    name: body.name,
    capHit,
    source: body.source || "manual"
  });

  if (!result.persisted) {
    return NextResponse.json(
      { error: "Upstash is not connected. Salary was not saved to the shared database." },
      { status: 503 }
    );
  }

  return NextResponse.json(result);
}
