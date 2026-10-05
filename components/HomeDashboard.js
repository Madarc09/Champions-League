"use client";

import { useEffect, useMemo, useState } from "react";
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

function DreamPlayerCard({ player, onOpen }) {
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

function LineupGroup({ label = null, players, onOpen, className = "" }) {
  return (
    <section className={`lineup-group ${className}`.trim()}>
      {label ? <h3>{label}</h3> : null}
      <div className="lineup-group-players">
        {players.map((player, index) => (
          <DreamPlayerCard
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
  const { standings, dreamTeam, loaded } = useLeagueStandings();
  const [selection, setSelection] = useState(null);
  const [rankingData, setRankingData] = useState(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [manager, setManager] = useState(null);
  const [authLoaded, setAuthLoaded] = useState(false);

  const dreamPlayers = Array.isArray(dreamTeam?.players) ? dreamTeam.players : [];
  const lineup = useMemo(() => {
    const forwards = fillSlots(dreamPlayers.filter((player) => player.rosterType === "F"), 12);
    const defence = fillSlots(dreamPlayers.filter((player) => player.rosterType === "D"), 6);
    const goalies = fillSlots(dreamPlayers.filter((player) => player.rosterType === "G"), 2);

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
  }, [dreamPlayers]);

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

  function openDreamPlayer(player) {
    setSelection({ player, goalie: player.rosterType === "G" });
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
              <span>DREAM</span>
            </div>

            <ol className="arena-standing-list">
              {standings.map((team) => (
                <li key={team.slug} className={team.rank === 1 ? "is-leader" : ""}>
                  <a href={`/team/${team.slug}/locker-room`}>
                    <b>{team.rank}</b>
                    <strong>{team.name}</strong>
                    <span>{loaded ? formatPoints(team.fantasyPoints) : "—"}</span>
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

          <section className="arena-board arena-dream" aria-labelledby="arena-dream-title">
            <header className="arena-board-title dream-title-row">
              <div>
                <h2 id="arena-dream-title">Dream Team</h2>
                <span>{dreamTeam?.weekKey || "CURRENT WEEK"}</span>
              </div>
              <div className="dream-board-metrics">
                <span><b>{loaded && dreamTeam ? formatPoints(dreamTeam.fantasyPoints) : "—"}</b> FPTS</span>
                <span><b>{dreamTeam ? formatSalary(dreamTeam.totalCap) : "—"}</b> / $104M</span>
              </div>
            </header>

            <div className="dream-lineup-board">
              <h3 className="dream-zone-title dream-zone-forwards">FORWARDS</h3>
              <div className="dream-offence-halves">
                <div className="dream-offence-half dream-offence-left">
                  <LineupGroup players={lineup.forwardLines[0]} onOpen={openDreamPlayer} />
                  <LineupGroup players={lineup.forwardLines[1]} onOpen={openDreamPlayer} />
                </div>
                <div className="dream-offence-half dream-offence-right">
                  <LineupGroup players={lineup.forwardLines[2]} onOpen={openDreamPlayer} />
                  <LineupGroup players={lineup.forwardLines[3]} onOpen={openDreamPlayer} />
                </div>
              </div>

              <h3 className="dream-zone-title dream-zone-defence">DEFENCE</h3>
              <div className="defence-pairs">
                {lineup.defencePairs.map((pair, index) => (
                  <LineupGroup
                    key={`pair-${index + 1}`}
                    players={pair}
                    onOpen={openDreamPlayer}
                  />
                ))}
              </div>

              <h3 className="dream-zone-title dream-zone-goalies">GOALIES</h3>
              <div className="goalie-pair">
                <LineupGroup players={[lineup.goalies[0]]} onOpen={openDreamPlayer} />
                <LineupGroup players={[lineup.goalies[1]]} onOpen={openDreamPlayer} />
              </div>

              {!loaded ? <p className="dream-board-message">Loading weekly Dream Team…</p> : null}
              {loaded && dreamPlayers.length === 0 ? <p className="dream-board-message">Generating weekly Dream Team…</p> : null}
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
