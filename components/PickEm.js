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

function shortDate(value) {
  const date = parseDateKey(value);
  if (!date) return value || "—";
  return date.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

function weekLabel(start, end) {
  const startDate = parseDateKey(start);
  const endDate = parseDateKey(end);
  if (!startDate || !endDate) return "Current NHL week";
  const startText = startDate.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  const endText = endDate.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  return `${startText} – ${endText}`;
}

function gameStatusLabel(game) {
  if (game.final) return "FINAL";
  const live = game.gameState === "LIVE" || game.gameState === "CRIT" || (game.started && !game.final);
  if (live) {
    if (game.inIntermission) return game.periodNumber ? `LIVE · INT after P${game.periodNumber}` : "LIVE · INTERMISSION";
    if (game.periodNumber && game.timeRemaining) return `LIVE · P${game.periodNumber} · ${game.timeRemaining}`;
    if (game.periodNumber) return `LIVE · P${game.periodNumber}`;
    return "LIVE";
  }
  if (game.locked) return "LOCKED";
  return gameTime(game.startTimeUTC);
}

function TeamButton({ team, game, selected, saving, onPick }) {
  const winner = game.final && game.winner === team.abbrev;
  const loser = game.final && game.winner && game.winner !== team.abbrev;
  const showScore = Boolean(game.started || game.final || game.gameState === "LIVE" || game.gameState === "CRIT");

  return (
    <button
      type="button"
      className={`pickem-team${selected ? " is-picked" : ""}${winner ? " is-winner" : ""}${loser ? " is-loser" : ""}`}
      disabled={game.locked || saving}
      onClick={() => onPick(game.gameId, team.abbrev)}
      aria-pressed={selected}
      title={team.name || team.abbrev}
    >
      <span className="pickem-team-logo">
        {team.logo ? <img src={team.logo} alt="" /> : <b>{team.abbrev}</b>}
      </span>
      <span className="pickem-team-copy">
        <strong>{team.abbrev}</strong>
        <small>{team.record || "Record —"}</small>
      </span>
      {showScore ? <em>{team.score ?? "—"}</em> : <small className="pickem-pick-label">{selected ? "YOUR PICK" : "PICK"}</small>}
    </button>
  );
}

function PickEmGame({ game, savingGame, onPick, onMatchupInfo }) {
  const saving = savingGame === String(game.gameId);
  const live = game.gameState === "LIVE" || game.gameState === "CRIT" || (game.started && !game.final);
  return (
    <article className={`pickem-game${game.locked ? " is-locked" : ""}${game.final ? " is-final" : ""}${live ? " is-live" : ""}`}>
      <div className="pickem-game-status">
        <span>{gameStatusLabel(game)}</span>
        {game.result ? <b className={game.result === "W" ? "is-win" : "is-loss"}>{game.result === "W" ? "WIN" : "LOSS"}</b> : null}
      </div>
      <div className="pickem-matchup">
        <TeamButton team={game.away} game={game} selected={game.pick === game.away.abbrev} saving={saving} onPick={onPick} />
        <span className="pickem-at">@</span>
        <TeamButton team={game.home} game={game} selected={game.pick === game.home.abbrev} saving={saving} onPick={onPick} />
      </div>
      <footer>
        <div className="pickem-game-pick-copy">
          {game.pick ? <span>Your pick: <b>{game.pick}</b></span> : <span>{game.locked ? "No pick submitted" : "Choose a winner"}</span>}
          <span>{game.locked ? "Pick locked" : "Saved instantly · editable until puck drop"}</span>
        </div>
        <button type="button" className="pickem-matchup-info-button" onClick={() => onMatchupInfo(game)}>
          Matchup Info
        </button>
      </footer>
    </article>
  );
}

function recordText(personal) {
  if (!personal?.picks) return "No picks yet";
  const settled = Number(personal.wins || 0) + Number(personal.losses || 0);
  if (!settled) return `${personal.pending || personal.picks} pending`;
  const percentage = personal.accuracy == null ? "" : ` · ${personal.accuracy}%`;
  const pending = personal.pending ? ` · ${personal.pending} pending` : "";
  return `${personal.wins}-${personal.losses}${percentage}${pending}`;
}

function TeamMatchupCard({ abbrev, data, personal, side }) {
  if (!data) {
    return (
      <section className="pickem-matchup-team-card">
        <strong>{abbrev}</strong>
        <p>Current team stats are temporarily unavailable.</p>
      </section>
    );
  }
  const venueRecord = side === "away" ? data.roadRecord : data.homeRecord;
  const venueLabel = side === "away" ? "Road" : "Home";
  const streak = data.streakCode && data.streakCount ? `${data.streakCode}${data.streakCount}` : "—";
  return (
    <section className="pickem-matchup-team-card">
      <header>
        {data.logo ? <img src={data.logo} alt="" /> : null}
        <div>
          <span>{abbrev}</span>
          <strong>{data.record}</strong>
        </div>
      </header>
      <div className="pickem-matchup-stat-grid">
        <div><span>Last 10</span><b>{data.l10Record}</b></div>
        <div><span>{venueLabel}</span><b>{venueRecord}</b></div>
        <div><span>GF / GA</span><b>{data.goalFor} / {data.goalAgainst}</b></div>
        <div><span>Goal Diff</span><b>{data.goalDifferential > 0 ? "+" : ""}{data.goalDifferential}</b></div>
        <div><span>Points</span><b>{data.points}</b></div>
        <div><span>Streak</span><b>{streak}</b></div>
      </div>
      <div className="pickem-personal-team-record">
        <span>YOUR RECORD PICKING {abbrev}</span>
        <strong>{recordText(personal)}</strong>
      </div>
    </section>
  );
}

function MatchupInfoModal({ game, info, loading, error, onClose }) {
  useEffect(() => {
    if (!game) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [game, onClose]);

  if (!game) return null;
  const away = game.away.abbrev;
  const home = game.home.abbrev;
  const h2h = info?.headToHead;
  const awayH2h = h2h?.summary?.[away];
  const homeH2h = h2h?.summary?.[home];

  return (
    <div className="pickem-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="pickem-matchup-modal" role="dialog" aria-modal="true" aria-label={`${away} at ${home} matchup information`}>
        <header className="pickem-matchup-modal-header">
          <div>
            <span>MATCHUP INFO</span>
            <h3>{away} @ {home}</h3>
            <p>{game.final ? "Final" : game.started ? gameStatusLabel(game) : gameTime(game.startTimeUTC)}{game.venue ? ` · ${game.venue}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close matchup info">×</button>
        </header>

        {loading ? <div className="pickem-matchup-loading">Loading team history and your Pick ’Em data…</div> : null}
        {error ? <div className="pickem-matchup-loading is-error">{error}</div> : null}
        {!loading && !error && info ? (
          <>
            <div className="pickem-matchup-team-grid">
              <TeamMatchupCard abbrev={away} data={info.teams?.[away]} personal={info.personalRecords?.[away]} side="away" />
              <TeamMatchupCard abbrev={home} data={info.teams?.[home]} personal={info.personalRecords?.[home]} side="home" />
            </div>

            <section className="pickem-h2h-summary">
              <div>
                <span>LAST {h2h?.count || 0} HEAD-TO-HEAD</span>
                <strong>{away} {awayH2h?.wins || 0}-{awayH2h?.losses || 0}</strong>
                <small>{awayH2h ? `${awayH2h.avgGoalsFor} GF/G · ${awayH2h.avgGoalsAgainst} GA/G` : "No history available"}</small>
              </div>
              <b>VS</b>
              <div>
                <span>LAST {h2h?.count || 0} HEAD-TO-HEAD</span>
                <strong>{home} {homeH2h?.wins || 0}-{homeH2h?.losses || 0}</strong>
                <small>{homeH2h ? `${homeH2h.avgGoalsFor} GF/G · ${homeH2h.avgGoalsAgainst} GA/G` : "No history available"}</small>
              </div>
            </section>

            <section className="pickem-h2h-list">
              <header><strong>Recent meetings</strong><span>Most recent first</span></header>
              {(h2h?.games || []).length ? (h2h.games || []).map((meeting) => (
                <div className="pickem-h2h-row" key={meeting.gameId || `${meeting.date}-${meeting.away}-${meeting.home}`}>
                  <span>{shortDate(meeting.date)}</span>
                  <b className={meeting.winner === meeting.away ? "is-winner" : ""}>{meeting.away}</b>
                  <strong>{meeting.awayScore}–{meeting.homeScore}</strong>
                  <b className={meeting.winner === meeting.home ? "is-winner" : ""}>{meeting.home}</b>
                  <small>{meeting.periodType && meeting.periodType !== "REG" ? meeting.periodType : ""}</small>
                </div>
              )) : <p>No completed head-to-head games were found in the available recent seasons.</p>}
            </section>
          </>
        ) : null}
      </section>
    </div>
  );
}

export default function PickEm() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingGame, setSavingGame] = useState(null);
  const [status, setStatus] = useState("");
  const [collapsedDays, setCollapsedDays] = useState(() => new Set());
  const [matchupGame, setMatchupGame] = useState(null);
  const [matchupInfo, setMatchupInfo] = useState(null);
  const [matchupLoading, setMatchupLoading] = useState(false);
  const [matchupError, setMatchupError] = useState("");

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
    }, 30_000);
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

  function toggleDay(dateKey) {
    setCollapsedDays((current) => {
      const next = new Set(current);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  }

  async function openMatchupInfo(game) {
    setMatchupGame(game);
    setMatchupInfo(null);
    setMatchupError("");
    setMatchupLoading(true);
    try {
      const response = await fetch(`/api/mini-games/pick-em/matchup?gameId=${encodeURIComponent(game.gameId)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Matchup information could not be loaded.");
      setMatchupInfo(data);
    } catch (error) {
      setMatchupError(error.message || "Matchup information could not be loaded.");
    } finally {
      setMatchupLoading(false);
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

      {!loading ? days.map((day) => {
        const collapsed = collapsedDays.has(day.dateKey);
        return (
          <section className={`pickem-day-section${day.dateKey === snapshot?.todayKey ? " is-today" : ""}${collapsed ? " is-collapsed" : ""}`} key={day.dateKey}>
            <button type="button" className="pickem-day-bar pickem-day-toggle" onClick={() => toggleDay(day.dateKey)} aria-expanded={!collapsed}>
              <div>
                <b>{dateLabel(day.dateKey)}{day.dateKey === snapshot?.todayKey ? " · TODAY" : ""}</b>
                <span>{day.games?.length || 0} game{day.games?.length === 1 ? "" : "s"}</span>
              </div>
              <span className="pickem-day-toggle-right">
                <span>{(day.games || []).filter((game) => game.pick).length}/{day.games?.length || 0} picked</span>
                <b aria-hidden="true">{collapsed ? "+" : "−"}</b>
              </span>
            </button>
            {!collapsed ? ((day.games || []).length ? (
              <div className="pickem-games">
                {day.games.map((game) => (
                  <PickEmGame key={game.gameId} game={game} savingGame={savingGame} onPick={makePick} onMatchupInfo={openMatchupInfo} />
                ))}
              </div>
            ) : <div className="pickem-day-empty">No games scheduled.</div>) : null}
          </section>
        );
      }) : null}

      {status ? <p className="pickem-status" role="status">{status}</p> : null}

      <MatchupInfoModal
        game={matchupGame}
        info={matchupInfo}
        loading={matchupLoading}
        error={matchupError}
        onClose={() => { setMatchupGame(null); setMatchupInfo(null); setMatchupError(""); }}
      />
    </section>
  );
}
