import { NextResponse } from "next/server";
import { runSkynetMidnightPickJob } from "@/lib/pick-em";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await runSkynetMidnightPickJob(new Date());
    return NextResponse.json({
      ok: true,
      ...result,
      updatedAt: new Date().toISOString()
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Skynet Pick 'Em cron failed:", error);
    return NextResponse.json({ error: error.message || "Skynet Pick 'Em refresh failed." }, { status: 500 });
  }
}
