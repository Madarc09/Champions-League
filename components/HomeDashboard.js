"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useLeagueStandings from "@/components/useLeagueStandings";
import { HockeyCardOverlay } from "@/components/LockerRoom";
import { TEAMS } from "@/data/league-config";
import { newerRoster, rosterStorageKey } from "@/lib/standings";

const PANELS = [
  { key: "forwards", label: "Forwards", shortLabel: "F", count: 10 },
  { key: "defence", label: "Defence", shortLabel: "D", count: 10 },
  { key: "goalies", label: "Goalies", shortLabel: "G", count: 10 },
  { key: "rookies", label: "Rookie Race", shortLabel: "R", count: 5 }
];

function readLocalRoster(teamSlug) {
  try {
    const raw = window.localStorage.getItem(rosterStorageKey(teamSlug));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function ownerNames(playerId, rosters) {
  const owners = TEAMS.filter((team) => (
    Array.isArray(rosters?.[team.slug]?.players)
    && rosters[team.slug].players.some((player) => String(player.playerId) === String(playerId))
  )).map((team) => team.name);

  return owners.length ? owners.join(" · ") : "Undrafted";
}

function formatPoints(value) {
  return Number(value || 0).toLocaleString("en-CA", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
}

export default function HomeDashboard() {
  const { standings, loaded: standingsLoaded } = useLeagueStandings();
  const scrollerRef = useRef(null);
  const [activePanel, setActivePanel] = useState("forwards");
  const [selection, setSelection] = useState(null);
  const [rankingData, setRankingData] = useState(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [dashboard, setDashboard] = useState({
    performers: { forwards: [], defence: [], goalies: [], rookies: [] },
    rosters: {},
    loaded: false,
    error: null
  });

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || window.innerWidth > 900) return;
    const frame = window.requestAnimationFrame(() => {
      scroller.scrollLeft = Math.max(0, (scroller.scrollWidth - scroller.clientWidth) / 2);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        const response = await fetch("/api/home-dashboard", {
          cache: "no-store",
          signal: AbortSignal.timeout(60000)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "The NHL leaderboard could not be loaded.");
        if (cancelled) return;

        const rosters = {};
        for (const team of TEAMS) {
          rosters[team.slug] = newerRoster(
            data.rosters?.[team.slug] || null,
            readLocalRoster(team.slug)
          );
        }

        setDashboard({
          performers: data.performers || {},
          rosters,
          loaded: true,
          error: null,
          updatedAt: data.updatedAt || null,
          stale: Boolean(data.stale)
        });
      } catch (error) {
        if (cancelled) return;
        setDashboard((current) => ({
          ...current,
          loaded: true,
          error: error.message || "The NHL leaderboard could not be loaded."
        }));
      }
    }

    loadDashboard();
    return () => { cancelled = true; };
  }, []);

  const activeDefinition = PANELS.find((panel) => panel.key === activePanel) || PANELS[0];
  const activePlayers = useMemo(
    () => dashboard.performers?.[activePanel] || [],
    [dashboard.performers, activePanel]
  );

  useEffect(() => {
    const playerName = selection?.player?.name;
    if (!playerName) return undefined;

    let cancelled = false;
    setRankingLoading(true);
    setRankingData(null);

    fetch(`/api/rankings?name=${encodeURIComponent(playerName)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(45000)
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Rankings could not be loaded.");
        if (!cancelled) setRankingData(data);
      })
      .catch((error) => {
        console.error("Home-page hockey card rankings unavailable:", error);
      })
      .finally(() => {
        if (!cancelled) setRankingLoading(false);
      });

    return () => { cancelled = true; };
  }, [selection?.player?.name]);

  return (
    <div className="champions-home">
      <div className="champions-home-scroller" ref={scrollerRef}>
        <section className="champions-home-stage" aria-label="Champions League live dashboard">
          <div className="champions-home-watermark" aria-hidden="true">
            <img src="/champions-league-logo.png" alt="" />
          </div>

          <div className="champions-board-grid">
            <section className="home-live-board home-standings-board" aria-labelledby="home-standings-title">
              <header className="home-board-title">
                <div>
                  <span>2025–26 NHL results</span>
                  <h1 id="home-standings-title">Champions League Standings</h1>
                </div>
                <strong>FPTS</strong>
              </header>

              <ol className="home-standings-list">
                {standings.map((team) => (
                  <li key={team.slug} className={`home-standing-row rank-${team.rank}`}>
                    <a href={`/team/${team.slug}/locker-room`} aria-label={`Open ${team.name}'s locker room`}>
                      <span className="home-standing-rank">{team.rank}</span>
                      <span className="home-standing-name">{team.name}</span>
                      <span className="home-standing-points">
                        {standingsLoaded ? formatPoints(team.fantasyPoints) : "—"}
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            </section>

            <section className="home-live-board home-performers-board" aria-labelledby="home-performers-title">
              <header className="performers-heading">
                <div>
                  <span>League-wide</span>
                  <h2 id="home-performers-title">Top Performers</h2>
                </div>
                <small>{activeDefinition.count} ranked</small>
              </header>

              <div className="performer-tabs" role="tablist" aria-label="Player leaderboard position">
                {PANELS.map((panel) => (
                  <button
                    key={panel.key}
                    type="button"
                    className={activePanel === panel.key ? "active" : ""}
                    onClick={() => setActivePanel(panel.key)}
                    role="tab"
                    aria-selected={activePanel === panel.key}
                  >
                    <span>{panel.shortLabel}</span>
                    <strong>{panel.label}</strong>
                  </button>
                ))}
              </div>

              <div className="performer-list" role="tabpanel">
                {!dashboard.loaded ? (
                  <p className="home-dashboard-message">Loading NHL.com results…</p>
                ) : dashboard.error ? (
                  <p className="home-dashboard-message error">{dashboard.error}</p>
                ) : activePlayers.length === 0 ? (
                  <p className="home-dashboard-message">No players are available for this category.</p>
                ) : (
                  activePlayers.map((player, index) => (
                    <button
                      className="performer-row"
                      key={`${activePanel}-${player.playerId}`}
                      type="button"
                      onClick={() => setSelection({ player, goalie: player.rosterType === "G" })}
                      aria-label={`Open ${player.name} hockey card`}
                    >
                      <span className="performer-rank">{index + 1}</span>
                      <img
                        className="performer-photo"
                        src={player.headshot || "/player-silhouette.svg"}
                        alt=""
                      />
                      <span className="performer-identity">
                        <strong>{player.name}</strong>
                        <span>{player.team} · {ownerNames(player.playerId, dashboard.rosters)}</span>
                      </span>
                      <strong className="performer-points">{formatPoints(player.fantasyPoints)}</strong>
                    </button>
                  ))
                )}
              </div>
            </section>
          </div>

          {selection ? (
            <HockeyCardOverlay
              selection={selection}
              onClose={() => setSelection(null)}
              rankingData={rankingData}
              rankingLoading={rankingLoading}
              teamName="Champions League"
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}
