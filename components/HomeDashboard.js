"use client";

import { useEffect, useState } from "react";
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
  const { standings, dreamTeam, loaded } = useLeagueStandings();
  const [selection, setSelection] = useState(null);
  const [rankingData, setRankingData] = useState(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const dreamPlayers = Array.isArray(dreamTeam?.players) ? dreamTeam.players : [];

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
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRankingLoading(false);
      });

    return () => { cancelled = true; };
  }, [selection?.player?.name]);

  return (
    <div className="home-scene-shell">
      <section className="home-scene" aria-label="Champions League live dashboard">
        <div className="home-scene-title">
          <span>Salary-cap fantasy hockey · 2026–27</span>
          <h1>Champions League</h1>
          <small>Live Season</small>
        </div>

        <div className="home-board-grid">
          <section className="home-board standings-board" aria-labelledby="standings-title">
            <header className="board-heading">
              <div>
                <span>Current standings</span>
                <h2 id="standings-title">League Table</h2>
              </div>
              <div className="standings-columns" aria-hidden="true">
                <span>FPTS</span>
                <span>DREAM</span>
              </div>
            </header>

            <ol className="standings-list">
              {standings.map((team) => (
                <li key={team.slug} className={`standing-row rank-${team.rank}`}>
                  <a href={`/team/${team.slug}/locker-room`}>
                    <span className="standing-rank">{team.rank}</span>
                    <strong>{team.name}</strong>
                    <span>{loaded ? formatPoints(team.fantasyPoints) : "—"}</span>
                    <span>{loaded ? `${team.dreamTeamPlayers || 0}/20` : "—"}</span>
                  </a>
                </li>
              ))}
            </ol>

            <div className="scoring-strip" aria-label="Champions League scoring system">
              <strong>Scoring</strong>
              <span>Skaters · G 2 · A 1.5 · SOG 1 · HIT .25</span>
              <span>Goalies · W 5 · SV .25 · GA −1 · SO 5 · A 7 · G 50</span>
            </div>
          </section>

          <section className="home-board dream-board" aria-labelledby="dream-title">
            <header className="board-heading dream-heading">
              <div>
                <span>Weekly cap-legal benchmark</span>
                <h2 id="dream-title">Dream Team</h2>
              </div>
              <small>{dreamTeam?.weekKey || "Current week"}</small>
            </header>

            <div className="dream-summary">
              <span><strong>{loaded && dreamTeam ? formatPoints(dreamTeam.fantasyPoints) : "—"}</strong><small>FPTS</small></span>
              <span><strong>{dreamTeam ? formatSalary(dreamTeam.totalCap) : "—"}</strong><small>CAP</small></span>
              <span><strong>{dreamPlayers.length || 20}</strong><small>PLAYERS</small></span>
            </div>

            <div className="dream-list">
              {!loaded ? <p className="scene-message">Loading Dream Team…</p> : null}
              {loaded && dreamPlayers.length === 0 ? <p className="scene-message">Dream Team is being generated.</p> : null}
              {dreamPlayers.map((player, index) => (
                <button
                  className="dream-player"
                  key={`${player.playerId}-${index}`}
                  type="button"
                  onClick={() => setSelection({ player, goalie: player.rosterType === "G" })}
                >
                  <span className="dream-position">{player.rosterType}</span>
                  <img src={player.headshot || "/player-silhouette.svg"} alt="" />
                  <span className="dream-copy">
                    <strong>{player.name}</strong>
                    <small>{player.team || "NHL"} · {formatSalary(player.capHit)}</small>
                  </span>
                  <b>{formatPoints(player.fantasyPoints)}</b>
                </button>
              ))}
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
  );
}
