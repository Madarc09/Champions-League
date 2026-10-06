"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function gameTime(value) {
  if (!value) return "Time TBA";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time TBA";
  return date.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
}

function dateLabel(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value || "Today";
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)).toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}

function TeamButton({ team, game, selected, saving, onPick }) {
  const winner = game.final && game.winner === team.abbrev;
  const loser = game.final && game.winner && game.winner !== team.abbrev;
  return (
    <button
      type="button"
      className={`pickem-team${selected ? " is-picked" : ""}${winner ? " is-winner" : ""}${loser ? " is-loser" : ""}`}
      disabled={game.locked || saving}
      onClick={() => onPick(game.gameId, team.abbrev)}
      aria-pressed={selected}
    >
      <span className="pickem-team-logo">
        {team.logo ? <img src={team.logo} alt="" /> : <b>{team.abbrev}</b>}
      </span>
      <strong>{team.abbrev}</strong>
      {game.final ? <em>{team.score ?? "—"}</em> : <small>{selected ? "YOUR PICK" : "PICK"}</small>}
    </button>
  );
}

export default function PickEm() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingGame, setSavingGame] = useState(null);
  const [status, setStatus] = useState("");

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/mini-games/pick-em", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Pick 'Em could not be loaded.");
      setSnapshot(data);
      if (!quiet) setStatus("");
    } catch (error) {
      setStatus(error.message || "Pick 'Em could not be loaded.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load({ quiet: true });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function makePick(gameId, teamAbbrev) {
    setSavingGame(String(gameId));
    setStatus("Saving pick…");
    try {
      const response = await fetch("/api/mini-games/pick-em", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, teamAbbrev })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The pick could not be saved.");
      setSnapshot(data);
      setStatus(`${teamAbbrev} locked in — you can change it until puck drop.`);
    } catch (error) {
      setStatus(error.message || "The pick could not be saved.");
    } finally {
      setSavingGame(null);
    }
  }

  const games = Array.isArray(snapshot?.games) ? snapshot.games : [];
  const pickedCount = useMemo(() => games.filter((game) => game.pick).length, [games]);
  const openCount = useMemo(() => games.filter((game) => !game.locked).length, [games]);
  const record = snapshot?.record || { wins: 0, losses: 0, pending: 0, picks: 0 };

  return (
    <section className="pickem-shell" aria-labelledby="pickem-title">
      <header className="pickem-header">
        <div>
          <span>DAILY MINI GAME</span>
          <h2 id="pickem-title">NHL Pick ’Em</h2>
          <p>Pick the winner of every NHL game. Change your mind as often as you want before puck drop.</p>
        </div>
        <div className="pickem-record" aria-label={`${record.wins} wins and ${record.losses} losses`}>
          <span>ALL-TIME RECORD</span>
          <strong>{record.wins}-{record.losses}</strong>
          <small>{record.pending} pending</small>
        </div>
      </header>

      <div className="pickem-day-bar">
        <div>
          <b>{dateLabel(snapshot?.dateKey)}</b>
          <span>{games.length} game{games.length === 1 ? "" : "s"} · {pickedCount}/{games.length} picked</span>
        </div>
        <span>{openCount ? `${openCount} still open` : games.length ? "All picks locked" : "No NHL games today"}</span>
      </div>

      {loading ? <div className="pickem-empty">Loading today’s NHL schedule…</div> : null}
      {!loading && !games.length ? <div className="pickem-empty">No NHL games are scheduled today.</div> : null}

      <div className="pickem-games">
        {games.map((game) => {
          const saving = savingGame === String(game.gameId);
          return (
            <article className={`pickem-game${game.locked ? " is-locked" : ""}${game.final ? " is-final" : ""}`} key={game.gameId}>
              <div className="pickem-game-status">
                <span>{game.final ? "FINAL" : game.locked ? (game.gameState === "LIVE" || game.gameState === "CRIT" ? "LIVE" : "LOCKED") : gameTime(game.startTimeUTC)}</span>
                {game.result ? <b className={game.result === "W" ? "is-win" : "is-loss"}>{game.result === "W" ? "WIN" : "LOSS"}</b> : null}
              </div>
              <div className="pickem-matchup">
                <TeamButton team={game.away} game={game} selected={game.pick === game.away.abbrev} saving={saving} onPick={makePick} />
                <span className="pickem-at">@</span>
                <TeamButton team={game.home} game={game} selected={game.pick === game.home.abbrev} saving={saving} onPick={makePick} />
              </div>
              <footer>
                {game.pick ? <span>Your pick: <b>{game.pick}</b></span> : <span>{game.locked ? "No pick submitted" : "Choose a winner"}</span>}
                <span>{game.locked ? "Pick locked" : "Editable until puck drop"}</span>
              </footer>
            </article>
          );
        })}
      </div>

      {status ? <p className="pickem-status" role="status">{status}</p> : null}
    </section>
  );
}
