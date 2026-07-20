"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TEAMS } from "@/data/league-config";
import {
  buildLeagueStandings,
  newerRoster,
  rosterStorageKey
} from "@/lib/standings";

function readLocalRoster(teamSlug) {
  try {
    const raw = window.localStorage.getItem(rosterStorageKey(teamSlug));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function useLeagueStandings({
  currentTeamSlug = null,
  currentPlayers = [],
  currentRosterReady = false
} = {}) {
  const [snapshot, setSnapshot] = useState({
    rosters: {},
    liveFantasyPoints: {},
    loaded: false,
    persistence: "local"
  });

  const refresh = useCallback(async () => {
    let serverData = {
      rosters: {},
      liveFantasyPoints: {},
      persistence: "local"
    };

    try {
      const response = await fetch("/api/standings", {
        cache: "no-store",
        signal: AbortSignal.timeout(60000)
      });
      const data = await response.json();
      if (response.ok) serverData = data;
    } catch {
      // Browser saves below remain a complete fallback.
    }

    const rosters = {};
    for (const team of TEAMS) {
      rosters[team.slug] = newerRoster(
        serverData.rosters?.[team.slug] || null,
        readLocalRoster(team.slug)
      );
    }

    setSnapshot({
      rosters,
      liveFantasyPoints: serverData.liveFantasyPoints || {},
      loaded: true,
      persistence: serverData.persistence || "local"
    });
  }, []);

  useEffect(() => {
    refresh();

    function handleStorage(event) {
      if (!event.key || event.key.startsWith("champions-league:roster:")) refresh();
    }
    function handleRosterUpdate() {
      refresh();
    }
    function handleFocus() {
      refresh();
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener("champions-league:roster-updated", handleRosterUpdate);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("champions-league:roster-updated", handleRosterUpdate);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refresh]);

  const standings = useMemo(() => {
    const rosters = { ...snapshot.rosters };
    if (currentTeamSlug && currentRosterReady) {
      rosters[currentTeamSlug] = {
        team: currentTeamSlug,
        players: currentPlayers
      };
    }
    return buildLeagueStandings(rosters, snapshot.liveFantasyPoints);
  }, [snapshot.rosters, snapshot.liveFantasyPoints, currentTeamSlug, currentPlayers, currentRosterReady]);

  return {
    standings,
    loaded: snapshot.loaded,
    persistence: snapshot.persistence,
    refresh
  };
}
