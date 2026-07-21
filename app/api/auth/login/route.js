import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  authenticateManager,
  createManagerSession
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Enter a username and password." }, { status: 400 });
  }

  try {
    const manager = await authenticateManager(body.username, body.password);
    if (!manager) {
      return NextResponse.json({ error: "The manager name or password is incorrect." }, { status: 401 });
    }

    const session = await createManagerSession(manager);
    const response = NextResponse.json({ manager });
    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
      expires: session.expiresAt
    });
    return response;
  } catch (error) {
    console.error("Login failed:", error);
    return NextResponse.json({
      error: "Manager login needs the Upstash Redis environment variables connected in Vercel."
    }, { status: 503 });
  }
}
