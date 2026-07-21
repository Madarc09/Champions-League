"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function totalFantasyPoints(players = []) {
  return Math.round(
    players.reduce((sum, player) => sum + Number(player?.fantasyPoints || 0), 0) * 10
  ) / 10;
}

function rankStandings(entries = []) {
  return [...entries]
    .sort((left, right) => (
      Number(right.fantasyPoints || 0) - Number(left.fantasyPoints || 0)
      || Number(left.originalIndex || 0) - Number(right.originalIndex || 0)
    ))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export default function useLeagueStandings({
  currentTeamSlug = null,
  currentPlayers = [],
  currentRosterReady = false
} = {}) {
  const [snapshot, setSnapshot] = useState({
    standings: [],
    loaded: false,
    persistence: "private"
  });

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/standings", {
        cache: "no-store",
        signal: AbortSignal.timeout(60000)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Standings could not be loaded.");

      setSnapshot({
        standings: Array.isArray(data.standings) ? data.standings : [],
        loaded: true,
        persistence: data.persistence || "private"
      });
    } catch {
      setSnapshot((current) => ({ ...current, loaded: true }));
    }
  }, []);

  useEffect(() => {
    refresh();

    function handleRosterUpdate() {
      refresh();
    }
    function handleFocus() {
      refresh();
    }
    function refreshWhileVisible() {
      if (document.visibilityState === "visible") refresh();
    }

    const interval = window.setInterval(refreshWhileVisible, 3000);
    window.addEventListener("champions-league:roster-updated", handleRosterUpdate);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("champions-league:roster-updated", handleRosterUpdate);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refresh]);

  const standings = useMemo(() => {
    const base = snapshot.standings.map((entry, originalIndex) => ({ ...entry, originalIndex }));
    if (currentTeamSlug && currentRosterReady) {
      const current = base.find((entry) => entry.slug === currentTeamSlug);
      if (current) current.fantasyPoints = totalFantasyPoints(currentPlayers);
    }
    return rankStandings(base).map(({ originalIndex: _originalIndex, ...entry }) => entry);
  }, [snapshot.standings, currentTeamSlug, currentPlayers, currentRosterReady]);

  return {
    standings,
    loaded: snapshot.loaded,
    persistence: snapshot.persistence,
    refresh
  };
}
