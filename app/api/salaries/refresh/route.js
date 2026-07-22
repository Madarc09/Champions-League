import { NextResponse } from "next/server";
import { managerFromRequest } from "@/lib/auth";
import { rebuildStaticSalaryMaster } from "@/lib/static-salary-master";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  const manager = await managerFromRequest(request);
  if (manager?.slug !== "nick") {
    return NextResponse.json({ error: "Only Nick can run the league-wide salary audit." }, { status: 403 });
  }

  try {
    const master = await rebuildStaticSalaryMaster();
    return NextResponse.json({
      source: master.source,
      initializedAt: master.initializedAt,
      sourceCapturedAt: master.sourceCapturedAt,
      auditedTeamCount: master.sourceTeamCount,
      recordCount: master.recordCount,
      correctionCount: master.correctionCount
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "The 32-team salary audit failed. The existing master was left unchanged." },
      { status: 502 }
    );
  }
}
