import { NextResponse } from "next/server";
import { NHL_TEAMS_FALLBACK, nhlLogoUrl } from "@/data/nhl-teams";

export const dynamic = "force-dynamic";

const NHL_STANDINGS_URL = "https://api-web.nhle.com/v1/standings/now";

function localized(value) {
  if (typeof value === "string") return value;
  return value?.default || value?.fr || "";
}

function normalizeConference(value) {
  const text = localized(value).toLowerCase();
  if (text.includes("east")) return "East";
  if (text.includes("west")) return "West";
  return null;
}

function normalizeLiveTeams(payload) {
  const fallbackByAbbrev = new Map(NHL_TEAMS_FALLBACK.map((team) => [team.abbrev, team]));
  const seen = new Map();

  for (const row of payload?.standings || []) {
    const abbrev = localized(row.teamAbbrev).trim().toUpperCase();
    if (!abbrev || seen.has(abbrev)) continue;

    const fallback = fallbackByAbbrev.get(abbrev);
    const name = localized(row.teamName) || localized(row.teamCommonName) || fallback?.name || abbrev;
    const conference = normalizeConference(row.conferenceName) || fallback?.conference;
    const division = localized(row.divisionName) || fallback?.division || "";
    const logo = row.teamLogo || nhlLogoUrl(abbrev);

    if (!conference) continue;
    seen.set(abbrev, { abbrev, name, conference, division, logo });
  }

  return [...seen.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export async function GET() {
  try {
    const response = await fetch(NHL_STANDINGS_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 * 60 * 12 }
    });

    if (!response.ok) throw new Error(`NHL standings returned ${response.status}`);
    const teams = normalizeLiveTeams(await response.json());
    if (teams.length < 30) throw new Error(`Only ${teams.length} NHL teams were returned.`);

    return NextResponse.json({ teams, source: "NHL.com", stale: false });
  } catch (error) {
    console.error("NHL team directory unavailable:", error);
    return NextResponse.json({
      teams: NHL_TEAMS_FALLBACK,
      source: "Built-in NHL directory",
      stale: true,
      warning: "The live NHL team directory was unavailable, so the latest saved alignment was used."
    });
  }
}
