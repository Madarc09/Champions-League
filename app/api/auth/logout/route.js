import { NextResponse } from "next/server";
import { SESSION_COOKIE, destroyManagerSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  await destroyManagerSession(token);

  const response = NextResponse.json({ loggedOut: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0)
  });
  return response;
}
