import crypto from "node:crypto";
import { cookies } from "next/headers";
import { TEAMS } from "@/data/league-config";
import { getRedis } from "@/lib/redis";

export const SESSION_COOKIE = "champions_league_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const AUTH_VERSION = "v1";

function userKey(slug) {
  return `champions-league:auth:${AUTH_VERSION}:user:${slug}`;
}

function sessionKey(tokenHash) {
  return `champions-league:auth:${AUTH_VERSION}:session:${tokenHash}`;
}

function normalizeCredential(value) {
  return String(value || "").trim().toLowerCase();
}

function starterPassword(name) {
  return Array.from(String(name)).reverse().join("").toLowerCase();
}

function passwordDigest(password, salt) {
  return crypto.scryptSync(normalizeCredential(password), salt, 64).toString("hex");
}

function safeEqual(left, right) {
  try {
    const a = Buffer.from(String(left), "hex");
    const b = Buffer.from(String(right), "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function findManagerByUsername(username) {
  const normalized = normalizeCredential(username);
  return TEAMS.find((team) => team.slug === normalized || team.name.toLowerCase() === normalized) || null;
}

export async function ensureManagerUsers() {
  const redis = getRedis();
  if (!redis) throw new Error("Upstash Redis is required for manager login.");

  await Promise.all(TEAMS.map(async (team) => {
    const key = userKey(team.slug);
    const existing = await redis.get(key);
    if (existing) return;

    const salt = crypto.randomBytes(18).toString("hex");
    const record = {
      slug: team.slug,
      name: team.name,
      username: team.name.toLowerCase(),
      passwordHash: passwordDigest(starterPassword(team.name), salt),
      salt,
      role: "manager",
      createdAt: new Date().toISOString(),
      starterCredentialVersion: 1
    };

    await redis.set(key, record, { nx: true });
  }));
}

export async function authenticateManager(username, password) {
  const manager = findManagerByUsername(username);
  if (!manager) return null;

  const redis = getRedis();
  if (!redis) throw new Error("Upstash Redis is required for manager login.");

  await ensureManagerUsers();
  const record = await redis.get(userKey(manager.slug));
  if (!record?.passwordHash || !record?.salt) return null;

  const enteredHash = passwordDigest(password, record.salt);
  if (!safeEqual(enteredHash, record.passwordHash)) return null;

  return manager;
}

export async function createManagerSession(manager) {
  const redis = getRedis();
  if (!redis) throw new Error("Upstash Redis is required for manager login.");

  const token = crypto.randomBytes(32).toString("base64url");
  const hashed = tokenHash(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);

  await redis.set(sessionKey(hashed), {
    managerSlug: manager.slug,
    managerName: manager.name,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  }, { ex: SESSION_TTL_SECONDS });

  return { token, expiresAt };
}

export async function destroyManagerSession(token) {
  if (!token) return;
  const redis = getRedis();
  if (!redis) return;
  await redis.del(sessionKey(tokenHash(token)));
}

export async function managerFromSessionToken(token) {
  if (!token) return null;
  const redis = getRedis();
  if (!redis) return null;

  try {
    const session = await redis.get(sessionKey(tokenHash(token)));
    if (!session?.managerSlug) return null;
    return TEAMS.find((team) => team.slug === session.managerSlug) || null;
  } catch (error) {
    console.error("Session lookup failed:", error);
    return null;
  }
}

export async function managerFromRequest(request) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return managerFromSessionToken(token);
}

export async function currentManager() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return managerFromSessionToken(token);
}

export function starterLoginList() {
  return TEAMS.map((team) => ({
    username: team.name,
    password: starterPassword(team.name)
  }));
}
