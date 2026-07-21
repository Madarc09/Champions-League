"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TEAMS } from "@/data/league-config";

export default function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [manager, setManager] = useState(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const teamMatch = pathname?.match(/^\/team\/([^/]+)/);
  const teamSlug = teamMatch?.[1] || null;
  const currentTeam = TEAMS.find((team) => team.slug === teamSlug);
  const ownTeamRoute = Boolean(manager && currentTeam && manager.slug === currentTeam.slug);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setManager(data.manager || null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAuthLoaded(true);
      });
    return () => { cancelled = true; };
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setManager(null);
    router.push("/");
    router.refresh();
  }

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
        <a className={pathname === "/" ? "active" : ""} href="/">Home</a>

        {ownTeamRoute ? (
          <>
            <a className={pathname === `/team/${teamSlug}` ? "active" : ""} href={`/team/${teamSlug}`}>
              Draft Room
            </a>
            <a
              className={pathname === `/team/${teamSlug}/locker-room` ? "active" : ""}
              href={`/team/${teamSlug}/locker-room`}
            >
              Locker Room
            </a>
            <a
              className={pathname === `/team/${teamSlug}/predictions` ? "active" : ""}
              href={`/team/${teamSlug}/predictions`}
            >
              Predictions
            </a>
          </>
        ) : null}

        {manager ? (
          <>
            {!ownTeamRoute ? <a href={`/team/${manager.slug}`}>My Draft Room</a> : null}
            {!ownTeamRoute ? <a href={`/team/${manager.slug}/locker-room`}>My Locker</a> : null}
            {!ownTeamRoute ? <a href={`/team/${manager.slug}/predictions`}>My Predictions</a> : null}
            <span className="manager-session" title={`Signed in as ${manager.name}`}>{manager.name}</span>
            <button className="header-auth-button" type="button" onClick={logout}>Log out</button>
          </>
        ) : authLoaded ? (
          <a className={pathname === "/login" ? "active" : ""} href="/login">Manager Login</a>
        ) : null}
      </nav>
    </header>
  );
}
