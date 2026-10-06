"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function totalFantasyPoints(players = []) {
  return Math.round(
    players.reduce((sum, player) => sum + Number(player?.fantasyPoints || 0), 0) * 10
  ) / 10;
}

function totalProjectedFantasyPoints(players = []) {
  return Math.round(
    players.reduce((sum, player) => sum + Number(player?.projection?.fantasyPoints || 0), 0) * 10
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
    dreamTeam: null,
    teamRosters: [],
    leagueDay: null,
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
        dreamTeam: data.dreamTeam || null,
        teamRosters: Array.isArray(data.teamRosters) ? data.teamRosters : [],
        leagueDay: data.leagueDay || null,
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

    // Rosters are frozen now. A one-minute refresh is more than enough for the
    // live NHL totals and avoids hammering the standings/special-team optimizer.
    const interval = window.setInterval(refreshWhileVisible, 60_000);
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
    return rankStandings(base).map(({ originalIndex: _originalIndex, ...entry }) => entry);
  }, [snapshot.standings]);

  return {
    standings,
    dreamTeam: snapshot.dreamTeam,
    teamRosters: snapshot.teamRosters,
    leagueDay: snapshot.leagueDay,
    loaded: snapshot.loaded,
    persistence: snapshot.persistence,
    refresh
  };
}
