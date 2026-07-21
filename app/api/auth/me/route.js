import { NextResponse } from "next/server";
import { managerFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request) {
  const manager = await managerFromRequest(request);
  return NextResponse.json({ manager });
}
