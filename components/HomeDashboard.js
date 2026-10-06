"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  return `$${(salary / 1_000_000).toFixed(1)}M`;
}

function shortName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "Player";
  return parts.at(-1);
}

function RosterPlayerCard({ player, onOpen }) {
  if (!player) {
    return <span className="lineup-player lineup-player-empty" aria-hidden="true" />;
  }

  return (
    <button
      className="lineup-player"
      type="button"
      title={`${player.name} · ${formatPoints(player.fantasyPoints)} FPTS`}
      onClick={() => onOpen(player)}
    >
      <span className="lineup-player-photo">
        <em>{player.rosterType || player.position || "F"}</em>
        <img src={player.headshot || "/player-silhouette.svg"} alt="" />
        {player.teamLogo ? <img className="lineup-team-logo" src={player.teamLogo} alt="" /> : null}
      </span>
      <span className="lineup-player-name">
        <strong>{shortName(player.name)}</strong>
        <small><b>{formatPoints(player.fantasyPoints)}</b><span className="fpts-suffix"> FPTS</span></small>
      </span>
    </button>
  );
}

function LineupGroup({ players, onOpen, className = "" }) {
  return (
    <section className={`lineup-group ${className}`.trim()}>
      <div className="lineup-group-players">
        {players.map((player, index) => (
          <RosterPlayerCard
            key={player ? `${player.playerId}-${index}` : `empty-${index}`}
            player={player}
            onOpen={onOpen}
          />
        ))}
      </div>
    </section>
  );
}

function fillSlots(players, count) {
  return Array.from({ length: count }, (_, index) => players[index] || null);
}

export default function HomeDashboard() {
  const router = useRouter();
  const { standings, dreamTeam, teamRosters, leagueDay, loaded } = useLeagueStandings();
  const [selection, setSelection] = useState(null);
  const [rankingData, setRankingData] = useState(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [manager, setManager] = useState(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [rosterViewIndex, setRosterViewIndex] = useState(0);
  const [playingTodayOnly, setPlayingTodayOnly] = useState(false);
  const touchStartRef = useRef(null);
  const suppressClickRef = useRef(false);

  const dreamPlayers = Array.isArray(dreamTeam?.players) ? dreamTeam.players : [];

  const rosterViews = useMemo(() => {
    const dream = {
      slug: "dream-team",
      name: "Dream Team",
      kind: "dream",
      players: dreamPlayers,
      fantasyPoints: Number(dreamTeam?.fantasyPoints || 0),
      totalCap: Number(dreamTeam?.totalCap || 0)
    };

    const teams = (teamRosters || []).map((team) => ({ ...team }));

    return [dream, ...teams];
  }, [dreamPlayers, dreamTeam, teamRosters]);

  const activeView = rosterViews[rosterViewIndex] || rosterViews[0];
  const allActivePlayers = Array.isArray(activeView?.players) ? activeView.players : [];
  const scheduleAvailable = leagueDay?.scheduleAvailable !== false;
  const activePlayers = playingTodayOnly && scheduleAvailable
    ? allActivePlayers.filter((player) => player.playingToday === true)
    : allActivePlayers;

  useEffect(() => {
    if (rosterViewIndex < rosterViews.length) return;
    setRosterViewIndex(0);
  }, [rosterViewIndex, rosterViews.length]);

  const lineup = useMemo(() => {
    const byFantasyPoints = (left, right) => Number(right?.fantasyPoints || 0) - Number(left?.fantasyPoints || 0);
    const forwards = fillSlots(activePlayers.filter((player) => player.rosterType === "F").sort(byFantasyPoints), 12);
    const defence = fillSlots(activePlayers.filter((player) => player.rosterType === "D").sort(byFantasyPoints), 6);
    const goalies = fillSlots(activePlayers.filter((player) => player.rosterType === "G").sort(byFantasyPoints), 2);

    return {
      forwardLines: [
        forwards.slice(0, 3),
        forwards.slice(3, 6),
        forwards.slice(6, 9),
        forwards.slice(9, 12)
      ],
      defencePairs: [
        defence.slice(0, 2),
        defence.slice(2, 4),
        defence.slice(4, 6)
      ],
      goalies
    };
  }, [activePlayers]);

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
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRankingLoading(false);
      });

    return () => { cancelled = true; };
  }, [selection?.player?.name]);

  function openRosterPlayer(player) {
    if (suppressClickRef.current) return;
    setSelection({ player, goalie: player.rosterType === "G" });
  }

  function changeRosterView(direction) {
    if (!rosterViews.length) return;
    setSelection(null);
    setRosterViewIndex((current) => (current + direction + rosterViews.length) % rosterViews.length);
  }

  function handleTouchStart(event) {
    const touch = event.touches?.[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(event) {
    const start = touchStartRef.current;
    const touch = event.changedTouches?.[0];
    touchStartRef.current = null;
    if (!start || !touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 52 || Math.abs(dx) < Math.abs(dy) * 1.15) return;

    suppressClickRef.current = true;
    changeRosterView(dx < 0 ? 1 : -1);
    window.setTimeout(() => { suppressClickRef.current = false; }, 260);
  }

  async function handleLoginAction() {
    if (!manager) {
      router.push("/login");
      return;
    }
    await fetch("/api/auth/logout", { method: "POST" });
    setManager(null);
    router.refresh();
  }

  function openLocker() {
    router.push(manager ? `/team/${manager.slug}/locker-room` : "/login");
  }

  return (
    <div className="home-scene-shell">
      <section className="home-scene home-scene-v2" aria-label="Champions League live dashboard">
        <nav className="arena-nav" aria-label="Manager navigation">
          <a href="/mini-games">MINI GAMES</a>
          <button type="button" onClick={handleLoginAction} disabled={!authLoaded}>
            {manager ? "LOG OUT" : "LOG IN"}
          </button>
          <button type="button" onClick={openLocker}>MY LOCKER</button>
        </nav>

        <div className="arena-scoreboards">
          <section className="arena-board arena-standings" aria-labelledby="arena-standings-title">
            <header className="arena-board-title">
              <h1 id="arena-standings-title">Standings</h1>
              <span>2026–27 · LIVE</span>
            </header>

            <div className="arena-standing-head" aria-hidden="true">
              <span>#</span>
              <span>TEAM</span>
              <span>FPTS</span>
              <span>TODAY</span>
              <span>DREAM</span>
            </div>

            <ol className="arena-standing-list">
              {standings.map((team) => (
                <li key={team.slug} className={team.rank === 1 ? "is-leader" : ""}>
                  <a href={`/team/${team.slug}/locker-room`}>
                    <b>{team.rank}</b>
                    <strong>{team.name}</strong>
                    <span>{loaded ? formatPoints(team.fantasyPoints) : "—"}</span>
                    <span>{loaded ? formatPoints(team.todayPoints) : "—"}</span>
                    <span>{loaded ? `${team.dreamTeamPlayers || 0}/20` : "—"}</span>
                  </a>
                </li>
              ))}
            </ol>

            <footer className="arena-scoring">
              <b>SCORING</b>
              <span>SKATERS · G 2 · A 1.5 · SOG 1 · HIT .25</span>
              <span>GOALIES · W 5 · SV .25 · GA −1 · SO 5 · A 7 · G 50</span>
            </footer>
          </section>

          <section
            className={`arena-board arena-dream arena-roster-viewer ${activeView?.slug === "dream-team" ? "is-dream-view" : "is-team-view"}${playingTodayOnly ? " is-playing-today" : ""}`}
            aria-labelledby="arena-dream-title"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <header className="arena-board-title dream-title-row dream-title-layout">
              <div className="dream-title-metric dream-title-fpts">
                <b>{loaded && activeView ? formatPoints(activeView.fantasyPoints) : "—"}</b>
                <span>FANTASY POINTS</span>
              </div>

              <div className="roster-viewer-title">
                <button className="roster-view-arrow previous" type="button" onClick={() => changeRosterView(-1)} aria-label="Previous roster">‹</button>
                <div>
                  <h2 id="arena-dream-title">{activeView?.name || "Dream Team"}</h2>
                  <button
                    className={`roster-mode-toggle${playingTodayOnly ? " is-active" : ""}`}
                    type="button"
                    onClick={() => setPlayingTodayOnly((current) => !current)}
                    disabled={!loaded || !scheduleAvailable}
                    title={scheduleAvailable ? undefined : "Today's NHL schedule is temporarily unavailable."}
                  >
                    {playingTodayOnly ? "FULL SEASON" : "PLAYING TODAY"}
                  </button>
                </div>
                <button className="roster-view-arrow next" type="button" onClick={() => changeRosterView(1)} aria-label="Next roster">›</button>
              </div>

              <div className="dream-title-metric dream-title-cap">
                <b>{activeView ? formatSalary(activeView.totalCap) : "—"} <em>/ $104M</em></b>
                <span>SALARY CAP</span>
              </div>
            </header>

            <div className="dream-lineup-board">
              <h3 className="dream-zone-title dream-zone-forwards">FORWARDS</h3>
              <div className="dream-offence-halves">
                <div className="dream-offence-half dream-offence-left">
                  <LineupGroup players={lineup.forwardLines[0]} onOpen={openRosterPlayer} />
                  <LineupGroup players={lineup.forwardLines[1]} onOpen={openRosterPlayer} />
                </div>
                <div className="dream-offence-half dream-offence-right">
                  <LineupGroup players={lineup.forwardLines[2]} onOpen={openRosterPlayer} />
                  <LineupGroup players={lineup.forwardLines[3]} onOpen={openRosterPlayer} />
                </div>
              </div>

              <h3 className="dream-zone-title dream-zone-defence">DEFENCE</h3>
              <div className="defence-pairs">
                {lineup.defencePairs.map((pair, index) => (
                  <LineupGroup
                    key={`pair-${index + 1}`}
                    players={pair}
                    onOpen={openRosterPlayer}
                  />
                ))}
              </div>

              <h3 className="dream-zone-title dream-zone-goalies">GOALIES</h3>
              <div className="goalie-pair">
                <LineupGroup players={[lineup.goalies[0]]} onOpen={openRosterPlayer} />
                <LineupGroup players={[lineup.goalies[1]]} onOpen={openRosterPlayer} />
              </div>

              {!loaded ? <p className="dream-board-message">Loading live rosters…</p> : null}
              {loaded && activePlayers.length === 0 ? (
                <p className="dream-board-message">
                  {playingTodayOnly ? "No players on this roster play today." : "Roster unavailable."}
                </p>
              ) : null}
            </div>
          </section>
        </div>

        {selection ? (
          <HockeyCardOverlay
            selection={selection}
            onClose={() => setSelection(null)}
            rankingData={rankingData}
            rankingLoading={rankingLoading}
            teamName={activeView?.name || "Dream Team"}
          />
        ) : null}
      </section>
    </div>
  );
}
