"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function gameTime(value) {
  if (!value) return "Time TBA";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time TBA";
  return date.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
}

function parseDateKey(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

function dateLabel(value) {
  const date = parseDateKey(value);
  if (!date) return value || "Day";
  return date.toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" });
}

function weekLabel(start, end) {
  const startDate = parseDateKey(start);
  const endDate = parseDateKey(end);
  if (!startDate || !endDate) return "Current NHL week";
  const startText = startDate.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  const endText = endDate.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  return `${startText} – ${endText}`;
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

function PickEmGame({ game, savingGame, onPick }) {
  const saving = savingGame === String(game.gameId);
  return (
    <article className={`pickem-game${game.locked ? " is-locked" : ""}${game.final ? " is-final" : ""}`}>
      <div className="pickem-game-status">
        <span>{game.final ? "FINAL" : game.locked ? (game.gameState === "LIVE" || game.gameState === "CRIT" ? "LIVE" : "LOCKED") : gameTime(game.startTimeUTC)}</span>
        {game.result ? <b className={game.result === "W" ? "is-win" : "is-loss"}>{game.result === "W" ? "WIN" : "LOSS"}</b> : null}
      </div>
      <div className="pickem-matchup">
        <TeamButton team={game.away} game={game} selected={game.pick === game.away.abbrev} saving={saving} onPick={onPick} />
        <span className="pickem-at">@</span>
        <TeamButton team={game.home} game={game} selected={game.pick === game.home.abbrev} saving={saving} onPick={onPick} />
      </div>
      <footer>
        {game.pick ? <span>Your pick: <b>{game.pick}</b></span> : <span>{game.locked ? "No pick submitted" : "Choose a winner"}</span>}
        <span>{game.locked ? "Pick locked" : "Saved instantly · editable until puck drop"}</span>
      </footer>
    </article>
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
      setStatus(`${teamAbbrev} saved — you can change it until that game's puck drop.`);
    } catch (error) {
      setStatus(error.message || "The pick could not be saved.");
    } finally {
      setSavingGame(null);
    }
  }

  const days = Array.isArray(snapshot?.days) ? snapshot.days : [];
  const games = useMemo(() => days.flatMap((day) => day.games || []), [days]);
  const pickedCount = useMemo(() => games.filter((game) => game.pick).length, [games]);
  const openCount = useMemo(() => games.filter((game) => !game.locked).length, [games]);
  const record = snapshot?.record || { wins: 0, losses: 0, pending: 0, picks: 0 };
  const weekRecord = snapshot?.weekRecord || { wins: 0, losses: 0, pending: 0, picks: 0 };

  return (
    <section className="pickem-shell" aria-labelledby="pickem-title">
      <header className="pickem-header">
        <div>
          <span>FULL WEEK PICK BOARD</span>
          <h2 id="pickem-title">NHL Pick ’Em</h2>
          <p>Pick every game for the entire week now. Each matchup stays editable until its own scheduled puck drop.</p>
        </div>
        <div className="pickem-record" aria-label={`${record.wins} wins and ${record.losses} losses`}>
          <span>ALL-TIME RECORD</span>
          <strong>{record.wins}-{record.losses}</strong>
          <small>{record.pending} pending</small>
        </div>
      </header>

      <div className="pickem-week-bar">
        <div>
          <b>{weekLabel(snapshot?.weekStart, snapshot?.weekEnd)}</b>
          <span>{games.length} games · {pickedCount}/{games.length} picks saved</span>
        </div>
        <div>
          <b>{weekRecord.wins}-{weekRecord.losses}</b>
          <span>{openCount} game{openCount === 1 ? "" : "s"} still open</span>
        </div>
      </div>

      {loading ? <div className="pickem-empty">Loading this week’s NHL schedule…</div> : null}
      {!loading && !games.length ? <div className="pickem-empty">No NHL games are scheduled this week.</div> : null}

      {!loading ? days.map((day) => (
        <section className={`pickem-day-section${day.dateKey === snapshot?.todayKey ? " is-today" : ""}`} key={day.dateKey}>
          <div className="pickem-day-bar">
            <div>
              <b>{dateLabel(day.dateKey)}{day.dateKey === snapshot?.todayKey ? " · TODAY" : ""}</b>
              <span>{day.games?.length || 0} game{day.games?.length === 1 ? "" : "s"}</span>
            </div>
            <span>{(day.games || []).filter((game) => game.pick).length}/{day.games?.length || 0} picked</span>
          </div>
          {(day.games || []).length ? (
            <div className="pickem-games">
              {day.games.map((game) => (
                <PickEmGame key={game.gameId} game={game} savingGame={savingGame} onPick={makePick} />
              ))}
            </div>
          ) : <div className="pickem-day-empty">No games scheduled.</div>}
        </section>
      )) : null}

      {status ? <p className="pickem-status" role="status">{status}</p> : null}
    </section>
  );
}
