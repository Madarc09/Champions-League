"use client";

import { usePathname } from "next/navigation";
import { TEAMS } from "@/data/league-config";

export default function SiteHeader() {
  const pathname = usePathname();
  const teamMatch = pathname?.match(/^\/team\/([^/]+)/);
  const teamSlug = teamMatch?.[1] || null;
  const currentTeam = TEAMS.find((team) => team.slug === teamSlug);

  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label="Champions League home">
        <span className="brand-mark">CL</span>
        <span>
          <strong>Champions League</strong>
          <small>Fantasy Hockey</small>
        </span>
      </a>

      <nav className="header-nav" aria-label="Primary navigation">
        {currentTeam ? (
          <>
            <a
              className={pathname === `/team/${teamSlug}` ? "active" : ""}
              href={`/team/${teamSlug}`}
            >
              Draft Room
            </a>
            <a
              className={pathname === `/team/${teamSlug}/locker-room` ? "active" : ""}
              href={`/team/${teamSlug}/locker-room`}
            >
              Locker Room
            </a>
          </>
        ) : null}
        <a className={pathname === "/" ? "active" : ""} href="/">
          Standings
        </a>
      </nav>
    </header>
  );
}
