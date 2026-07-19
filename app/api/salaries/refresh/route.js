import { NextResponse } from "next/server";
import { getCapSpaceSalarySnapshot } from "@/lib/capspace-snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function adminAuthorized(request) {
  if (!process.env.ADMIN_KEY) return true;
  return request.headers.get("x-admin-key") === process.env.ADMIN_KEY;
}

export async function POST(request) {
  if (!adminAuthorized(request)) {
    return NextResponse.json({ error: "Invalid admin key." }, { status: 401 });
  }

  try {
    const snapshot = await getCapSpaceSalarySnapshot({ force: true });
    return NextResponse.json({
      source: snapshot.source,
      updatedAt: snapshot.updatedAt,
      recordCount: snapshot.recordCount,
      teamCount: snapshot.teamCount,
      failedTeams: snapshot.failedTeams
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Salary refresh failed." },
      { status: 502 }
    );
  }
}
