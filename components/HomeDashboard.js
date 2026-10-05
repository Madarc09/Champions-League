"use client";

import { useEffect, useRef, useState } from "react";
import useLeagueStandings from "@/components/useLeagueStandings";
import { HockeyCardOverlay } from "@/components/LockerRoom";

function formatPoints(value) {
  return Number(value || 0).toLocaleString("en-CA", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
}

function formatSalary(value) {
  const salary = Number(value || 0);
  if (!Number.isFinite(salary) || salary <= 0) return "—";
  return `$${(salary / 1_000_000).toFixed(salary % 1_000_000 === 0 ? 0 : 2)}M`;
}

export default function HomeDashboard() {
  const { standings, dreamTeam, loaded: standingsLoaded } = useLeagueStandings();
  const scrollerRef = useRef(null);
  const [selection, setSelection] = useState(null);
  const [rankingData, setRankingData] = useState(null);
  const [rankingLoading, setRankingLoading] = useState(false);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || window.innerWidth > 900) return;
    const frame = window.requestAnimationFrame(() => {
      // Open on the complete standings board. The Dream Team remains one swipe to the right.
      scroller.scrollLeft = 12;
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

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

  const dreamPlayers = Array.isArray(dreamTeam?.players) ? dreamTeam.players : [];

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
                  <span>2026–27 live NHL results</span>
                  <h1 id="home-standings-title">Champions League Standings</h1>
                </div>
                <div className="home-standing-column-headings" aria-label="Standing point columns">
                  <span><strong>FPTS</strong><small>2026–27</small></span>
                  <span><strong>DREAM</strong><small>players / 20</small></span>
                </div>
              </header>

              <ol className="home-standings-list">
                {standings.map((team) => (
                  <li key={team.slug} className={`home-standing-row rank-${team.rank}`}>
                    <a
                      className="home-standing-private home-standing-locker-link"
                      href={`/team/${team.slug}/locker-room`}
                      aria-label={`Open ${team.name}'s locker room; ${formatPoints(team.fantasyPoints)} current fantasy points and ${team.dreamTeamPlayers || 0} players on this week's Dream Team`}
                    >
                      <span className="home-standing-rank">{team.rank}</span>
                      <span className="home-standing-name">{team.name}</span>
                      <span className="home-standing-points home-standing-current-points">
                        {standingsLoaded ? formatPoints(team.fantasyPoints) : "—"}
                      </span>
                      <span className="home-standing-points home-standing-projected-points home-standing-dream-count">
                        {standingsLoaded ? `${team.dreamTeamPlayers || 0}/20` : "—"}
                      </span>
                    </a>
                  </li>
                ))}
              </ol>

              <div className="home-scoring-card" aria-label="Champions League fantasy scoring system">
                <span className="home-scoring-badge">SCORING SYSTEM</span>
                <div className="home-scoring-lines">
                  <span><strong>Skaters</strong> G 2.0 · A 1.5 · SOG 1.0 · HIT 0.25</span>
                  <span><strong>Goalies</strong> W 5 · SV 0.25 · GA −1 · SO 5 · A 7 · G 50</span>
                </div>
              </div>
            </section>

            <section className="home-live-board home-dream-board" aria-labelledby="home-dream-title">
              <header className="performers-heading home-dream-heading">
                <div>
                  <span>Weekly benchmark</span>
                  <h2 id="home-dream-title">Dream Team</h2>
                </div>
                <small>{dreamPlayers.length || 20} players</small>
              </header>

              <div className="home-dream-summary">
                <span><strong>{standingsLoaded && dreamTeam ? formatPoints(dreamTeam.fantasyPoints) : "—"}</strong><small>FPTS</small></span>
                <span><strong>{dreamTeam ? formatSalary(dreamTeam.totalCap) : "—"}</strong><small>CAP</small></span>
                <span><strong>{dreamTeam?.weekKey || "Current"}</strong><small>WEEK</small></span>
              </div>

              <div className="home-dream-list">
                {!standingsLoaded ? (
                  <p className="home-dashboard-message">Loading this week&apos;s Dream Team…</p>
                ) : dreamPlayers.length === 0 ? (
                  <p className="home-dashboard-message">The Dream Team is being generated.</p>
                ) : (
                  dreamPlayers.map((player, index) => (
                    <button
                      className="home-dream-player-row"
                      key={`${player.playerId}-${index}`}
                      type="button"
                      onClick={() => setSelection({ player, goalie: player.rosterType === "G" })}
                      aria-label={`Open ${player.name} hockey card`}
                    >
                      <span className={`home-dream-position position-${String(player.rosterType || "").toLowerCase()}`}>{player.rosterType}</span>
                      <img
                        className="home-dream-photo"
                        src={player.headshot || "/player-silhouette.svg"}
                        alt=""
                      />
                      <span className="home-dream-identity">
                        <strong>{player.name}</strong>
                        <span>{player.team || "NHL"} · {formatSalary(player.capHit)}</span>
                      </span>
                      <strong className="home-dream-points">{formatPoints(player.fantasyPoints)}</strong>
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
              teamName="Dream Team"
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}
