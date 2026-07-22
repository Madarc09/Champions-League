"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const FALLBACK_HEADSHOT = "/player-silhouette.svg";

function money(value) {
  if (value == null || Number.isNaN(Number(value))) return "No 2026–27 contract";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value));
}

function compactMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Unsigned";
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${Math.round(amount)}`;
}

function actualFantasyPoints(player) {
  const value = player?.fantasyPoints;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function projectedFantasyPoints(player) {
  const value = player?.projection?.fantasyPoints;
  return Number.isFinite(Number(value)) ? Number(value) : actualFantasyPoints(player);
}

function projectedStat(player, key) {
  const value = player?.projection?.[key];
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function isProjectionOnlyPlayer(player) {
  return Number(player?.gamesPlayed || 0) === 0;
}

function draftBoardStat(player, key) {
  if (isProjectionOnlyPlayer(player)) return projectedStat(player, key);
  const value = player?.[key];
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function playerAge(player) {
  const birthDate = player?.birthDate ? new Date(`${String(player.birthDate).slice(0, 10)}T00:00:00Z`) : null;
  if (!birthDate || Number.isNaN(birthDate.getTime())) return null;
  const seasonDate = new Date("2026-10-01T00:00:00Z");
  let age = seasonDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday = seasonDate.getUTCMonth() < birthDate.getUTCMonth()
    || (seasonDate.getUTCMonth() === birthDate.getUTCMonth() && seasonDate.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function actualFantasyPointsPerGame(player) {
  const games = Number(player?.gamesPlayed || 0);
  return games > 0 ? actualFantasyPoints(player) / games : 0;
}

function projectedFantasyPointsPerGame(player) {
  const games = Number(player?.projection?.gamesPlayed || 0);
  return games > 0 ? projectedFantasyPoints(player) / games : 0;
}

function projectionRangeValue(player, scenario) {
  const value = player?.projection?.range?.[scenario]?.fantasyPoints;
  return Number.isFinite(Number(value)) ? Number(value) : projectedFantasyPoints(player);
}

function salaryMillions(player) {
  const capHit = Number(player?.capHit);
  return Number.isFinite(capHit) && capHit > 0 ? capHit / 1_000_000 : Infinity;
}

function projectedValuePerMillion(player) {
  const salary = salaryMillions(player);
  return Number.isFinite(salary) && salary > 0 ? projectedFantasyPoints(player) / salary : 0;
}

function localRosterKey(team) {
  return `champions-league:roster:${team}:2026-27`;
}

function loadJson(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function handleHeadshotError(event) {
  const image = event.currentTarget;
  if (!image.src.endsWith(FALLBACK_HEADSHOT)) {
    image.src = FALLBACK_HEADSHOT;
  }
}

function PlayerHeadshot({ player, className = "", alt = null }) {
  return (
    <img
      className={className}
      src={player?.headshot || FALLBACK_HEADSHOT}
      alt={alt == null ? `${player?.name || "NHL player"} headshot` : alt}
      loading="lazy"
      decoding="async"
      onError={handleHeadshotError}
    />
  );
}

function playerMeta(player) {
  if (Number(player.gamesPlayed || 0) === 0) {
    return player.draftYear
      ? `${player.draftYear} draft pick · 0 NHL GP`
      : "Rookie · 0 NHL GP";
  }
  if (player.rosterType === "G") {
    return `${player.gamesPlayed} GP · ${player.saves || 0} SV · ${player.goalsAgainst || 0} GA · ${player.wins || 0} W · ${player.shutouts || 0} SO`;
  }
  return `${player.gamesPlayed} GP`;
}

function SortButton({ label, column, sort, onSort, compact = false }) {
  const active = sort.column === column;
  const direction = active ? sort.direction : null;
  const arrow = direction === "asc" ? "▲" : direction === "desc" ? "▼" : "↕";

  return (
    <button
      className={`sort-header-button ${active ? "active" : ""} ${compact ? "compact" : ""}`}
      type="button"
      onClick={() => onSort(column)}
      title={`Sort by ${label}`}
    >
      <span>{label}</span>
      <span aria-hidden="true">{arrow}</span>
    </button>
  );
}

function sortValue(player, column) {
  switch (column) {
    case "name": return String(player.name || "");
    case "salary": return player.capHit == null ? null : Number(player.capHit);
    case "position": return String(player.rosterType || "");
    case "goals": return Number(player.goals || 0);
    case "assists": return Number(player.assists || 0);
    case "hits": return player.rosterType === "G" ? null : Number(player.hits || 0);
    case "shots": return player.rosterType === "G" ? null : Number(player.shots || 0);
    case "fantasyPoints": return actualFantasyPoints(player);
    case "projectedFantasyPoints": return projectedFantasyPoints(player);
    default: return 0;
  }
}

function DraftTable({ players, roster, rosterLimits, salaryCap, totalCap, onDraft, onPreview, onHoverPreview, onHoverEnd, previewPlayerId }) {
  const [sort, setSort] = useState({ column: "fantasyPoints", direction: "desc" });

  const counts = roster.reduce((acc, player) => {
    acc[player.rosterType] = (acc[player.rosterType] || 0) + 1;
    return acc;
  }, { F: 0, D: 0, G: 0 });

  const sortedPlayers = useMemo(() => {
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...players].sort((a, b) => {
      const left = sortValue(a, sort.column);
      const right = sortValue(b, sort.column);
      const leftMissing = left == null || left === "";
      const rightMissing = right == null || right === "";

      if (leftMissing && rightMissing) return actualFantasyPoints(b) - actualFantasyPoints(a);
      if (leftMissing) return 1;
      if (rightMissing) return -1;

      if (typeof left === "string" || typeof right === "string") {
        const result = String(left).localeCompare(String(right), "en", { sensitivity: "base" });
        return result === 0 ? actualFantasyPoints(b) - actualFantasyPoints(a) : result * direction;
      }

      const result = Number(left) - Number(right);
      return result === 0 ? actualFantasyPoints(b) - actualFantasyPoints(a) : result * direction;
    });
  }, [players, sort]);

  function changeSort(column) {
    setSort((current) => ({
      column,
      direction: current.column === column && current.direction === "desc" ? "asc" : "desc"
    }));
  }

  function disabledReason(player) {
    if (roster.some((item) => item.playerId === player.playerId)) return "Already drafted";
    if (player.capHit == null) return "Unsigned";
    if (counts[player.rosterType] >= rosterLimits[player.rosterType]) return "Position full";
    if (totalCap + Number(player.capHit) > salaryCap) return "Over cap";
    return "";
  }

  return (
    <div className="draft-table-scroll champions-player-table-scroll">
      <table className="draft-table champions-player-table">
        <thead>
          <tr>
            <th aria-sort={sort.column === "position" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
              <SortButton label="Pos" column="position" sort={sort} onSort={changeSort} compact />
            </th>
            <th><span className="visually-hidden">Player image</span></th>
            <th className="player-sort-heading" aria-sort={sort.column === "name" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
              <SortButton label="Player" column="name" sort={sort} onSort={changeSort} />
            </th>
            <th aria-sort={sort.column === "goals" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
              <SortButton label="G" column="goals" sort={sort} onSort={changeSort} compact />
            </th>
            <th aria-sort={sort.column === "assists" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
              <SortButton label="A" column="assists" sort={sort} onSort={changeSort} compact />
            </th>
            <th aria-sort={sort.column === "shots" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
              <SortButton label="SOG" column="shots" sort={sort} onSort={changeSort} compact />
            </th>
            <th aria-sort={sort.column === "hits" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
              <SortButton label="HIT" column="hits" sort={sort} onSort={changeSort} compact />
            </th>
            <th aria-sort={sort.column === "fantasyPoints" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
              <SortButton label="FPTS" column="fantasyPoints" sort={sort} onSort={changeSort} compact />
            </th>
            <th aria-sort={sort.column === "projectedFantasyPoints" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
              <SortButton label="P-FPTS" column="projectedFantasyPoints" sort={sort} onSort={changeSort} compact />
            </th>
            <th><span className="visually-hidden">Draft player</span></th>
          </tr>
        </thead>
        <tbody>
          {sortedPlayers.map((player) => {
            const reason = disabledReason(player);
            const drafted = reason === "Already drafted";
            const active = previewPlayerId === player.playerId;

            return (
              <tr
                key={player.playerId}
                className={`${drafted ? "drafted-row" : ""} ${active ? "preview-row" : ""}`}
              >
                <td className="draft-position-cell">
                  <span className={`position-chip position-${player.rosterType.toLowerCase()}`}>{player.rosterType}</span>
                </td>
                <td className="draft-player-image-cell">
                  <button
                    className="player-headshot-preview-button"
                    type="button"
                    onClick={() => onPreview(player)}
                    onMouseEnter={(event) => onHoverPreview(player, event)}
                    onMouseMove={(event) => onHoverPreview(player, event)}
                    onMouseLeave={onHoverEnd}
                    title={`Open ${player.name}'s projection card`}
                  >
                    <PlayerHeadshot player={player} className="draft-player-headshot" alt="" />
                  </button>
                </td>
                <td className="champions-player-cell">
                  <button
                    className="player-preview-button"
                    type="button"
                    onClick={() => onPreview(player)}
                    title={`Open ${player.name}'s projection card`}
                  >
                    <span className="champions-player-copy">
                      <strong>{player.name}</strong>
                      <small className="champions-player-meta">
                        <span>{compactMoney(player.capHit)}</span>
                        <span className="inline-team-meta">
                          {player.teamLogo ? (
                            <img
                              src={player.teamLogo}
                              alt=""
                              loading="lazy"
                              onError={(event) => { event.currentTarget.style.display = "none"; }}
                            />
                          ) : null}
                          <b>{player.team || "NHL"}</b>
                        </span>
                      </small>
                      {reason && !drafted ? <em>{reason}</em> : null}
                    </span>
                  </button>
                </td>
                <td className={`draft-stat-cell ${isProjectionOnlyPlayer(player) ? "projected-only-stat" : ""}`} title={isProjectionOnlyPlayer(player) ? "Projected — no NHL games played" : "Last-season goals"}>{draftBoardStat(player, "goals")}</td>
                <td className={`draft-stat-cell ${isProjectionOnlyPlayer(player) ? "projected-only-stat" : ""}`} title={isProjectionOnlyPlayer(player) ? "Projected — no NHL games played" : "Last-season assists"}>{draftBoardStat(player, "assists")}</td>
                <td className={`draft-stat-cell ${isProjectionOnlyPlayer(player) ? "projected-only-stat" : ""}`} title={isProjectionOnlyPlayer(player) ? "Projected — no NHL games played" : "Last-season shots"}>{player.rosterType === "G" ? "—" : draftBoardStat(player, "shots")}</td>
                <td className={`draft-stat-cell ${isProjectionOnlyPlayer(player) ? "projected-only-stat" : ""}`} title={isProjectionOnlyPlayer(player) ? "Projected — no NHL games played" : "Last-season hits"}>{player.rosterType === "G" ? "—" : draftBoardStat(player, "hits")}</td>
                <td className={`fantasy-points-cell actual-fantasy-points-cell ${isProjectionOnlyPlayer(player) ? "projected-only-stat" : ""}`} title={isProjectionOnlyPlayer(player) ? "Projected FPTS — no NHL games played" : "Last-season fantasy points"}>{(isProjectionOnlyPlayer(player) ? projectedFantasyPoints(player) : actualFantasyPoints(player)).toFixed(1)}</td>
                <td className="fantasy-points-cell projected-fantasy-points-cell">{projectedFantasyPoints(player).toFixed(1)}</td>
                <td className="draft-action-cell">
                  <button
                    className="champions-draft-button"
                    type="button"
                    onClick={() => onDraft(player)}
                    disabled={Boolean(reason)}
                    title={reason || `Draft ${player.name}`}
                  >
                    {drafted ? "ON TEAM" : reason || "DRAFT"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LineupPlayerCard({ player, onRemove }) {
  return (
    <div className={`lineup-player-card image-only ${player ? "filled" : "empty"}`}>
      {player ? (
        <button
          className="lineup-player-image-button"
          type="button"
          onClick={() => onRemove(player.playerId)}
          title={`Remove ${player.name} from the roster`}
          aria-label={`Remove ${player.name} from the roster`}
        >
          <span className="lineup-player-name" title={player.name}>{player.name}</span>
          <PlayerHeadshot player={player} className="lineup-player-headshot" alt="" />
          <span className="lineup-player-quick-stats">
            <strong>{compactMoney(player.capHit)}</strong>
            <span>{projectedFantasyPoints(player).toFixed(1)} PROJ</span>
          </span>
        </button>
      ) : (
        <div className="empty-lineup-face" aria-label="Open roster slot">
          <span className="lineup-player-name">Open spot</span>
          <img src={FALLBACK_HEADSHOT} alt="" />
          <span>Available</span>
        </div>
      )}
    </div>
  );
}

function ForwardLine({ number, players, onRemove }) {
  const slots = [players[0] || null, players[1] || null, players[2] || null];
  return (
    <div className="lineup-row">
      <span className="line-number">Line {number}</span>
      <div className="lineup-row-cards three-up">
        {slots.map((player, index) => (
          <LineupPlayerCard key={player?.playerId || `forward-open-${number}-${index}`} player={player} onRemove={onRemove} />
        ))}
      </div>
    </div>
  );
}

function DefencePair({ number, players, onRemove }) {
  const slots = [players[0] || null, players[1] || null];
  return (
    <div className="lineup-row">
      <span className="line-number">Pair {number}</span>
      <div className="lineup-row-cards two-up">
        {slots.map((player, index) => (
          <LineupPlayerCard key={player?.playerId || `defence-open-${number}-${index}`} player={player} onRemove={onRemove} />
        ))}
      </div>
    </div>
  );
}

function paddedSlots(players, limit) {
  return Array.from({ length: limit }, (_, index) => players[index] || null);
}

function CompactRosterSlot({ player, slotLabel, onRemove, onPreview }) {
  if (!player) {
    return (
      <div className="compact-roster-slot empty">
        <span className="compact-roster-position">{slotLabel}</span>
        <span className="compact-roster-empty-name">Open spot</span>
      </div>
    );
  }

  return (
    <div className="compact-roster-slot filled">
      <button
        className="compact-roster-player"
        type="button"
        onClick={() => onPreview(player)}
        title={`View ${player.name}'s projection`}
      >
        <PlayerHeadshot player={player} className="compact-roster-headshot" alt="" />
        <span>
          <strong>{player.name}</strong>
          <small>{compactMoney(player.capHit)} · {projectedFantasyPoints(player).toFixed(1)} PTS</small>
        </span>
      </button>
      <button
        className="compact-roster-remove"
        type="button"
        onClick={() => onRemove(player.playerId)}
        title={`Remove ${player.name}`}
        aria-label={`Remove ${player.name}`}
      >×</button>
    </div>
  );
}

function CompactRosterGroup({ title, players, limit, slotLabel, onRemove, onPreview }) {
  return (
    <section className="compact-roster-group">
      <h3>{title}<span>{players.length}/{limit}</span></h3>
      <div className="compact-roster-grid">
        {paddedSlots(players, limit).map((player, index) => (
          <CompactRosterSlot
            key={player?.playerId || `${slotLabel}-${index}`}
            player={player}
            slotLabel={slotLabel}
            onRemove={onRemove}
            onPreview={onPreview}
          />
        ))}
      </div>
    </section>
  );
}

function LineupCard({
  players,
  onRemove,
  onPreview,
  salaryCap,
  totalCap,
  capRemaining,
  totalFantasyPoints,
  rosterComplete,
  scoring,
  goalieScoring
}) {
  const forwards = players.filter((player) => player.rosterType === "F");
  const defence = players.filter((player) => player.rosterType === "D");
  const goalies = players.filter((player) => player.rosterType === "G");

  return (
    <section className="panel champions-projected-roster compact-projected-roster">
      <header className="compact-roster-header">
        <div>
          <p className="eyebrow">Your draft build</p>
          <h2>Projected Roster</h2>
        </div>
        <strong className={rosterComplete && capRemaining >= 0 ? "legal" : "building"}>
          {rosterComplete && capRemaining >= 0 ? "LEGAL ✓" : `${players.length}/20`}
        </strong>
      </header>

      <div className="compact-roster-summary">
        <span><small>Cap remaining</small><strong className={capRemaining < 0 ? "summary-red" : "summary-green"}>{money(capRemaining)}</strong></span>
        <span><small>Cap used</small><strong>{money(totalCap)}</strong></span>
        <span><small>Projected FPTS</small><strong className="summary-blue">{totalFantasyPoints.toFixed(1)}</strong></span>
      </div>

      <div className="roster-scoring-breakdown" aria-label="Fantasy point scoring">
        <strong>FPTS Breakdown</strong>
        <span>Skaters: G × {scoring.goals} · A × {scoring.assists} · SOG × {scoring.shots} · HIT × {scoring.hits}</span>
        <span>Goalies: W × {goalieScoring.wins} · SO × {goalieScoring.shutouts} · SV × {goalieScoring.saves} · GA × {goalieScoring.goalsAgainst} · G × {goalieScoring.goals} · A × {goalieScoring.assists}</span>
      </div>

      <div className="compact-roster-groups">
        <CompactRosterGroup title="Forwards" players={forwards} limit={12} slotLabel="F" onRemove={onRemove} onPreview={onPreview} />
        <CompactRosterGroup title="Defence" players={defence} limit={6} slotLabel="D" onRemove={onRemove} onPreview={onPreview} />
        <CompactRosterGroup title="Goalies" players={goalies} limit={2} slotLabel="G" onRemove={onRemove} onPreview={onPreview} />
      </div>

      <footer className="compact-roster-cap-limit">Salary cap: {money(salaryCap)}</footer>
    </section>
  );
}

function signedDelta(value) {
  const number = Number(value || 0);
  if (number === 0) return "±0";
  return `${number > 0 ? "+" : ""}${number}`;
}

function ProjectionComparisonStat({ label, previous, projected, accent = false, lowerIsBetter = false }) {
  const last = Number(previous || 0);
  const next = Number(projected || 0);
  const delta = next - last;
  const favourable = delta === 0 ? "neutral" : (lowerIsBetter ? delta < 0 : delta > 0) ? "positive" : "negative";

  return (
    <div className={`projection-stat comparison ${accent ? "accent" : ""}`}>
      <small>{label}</small>
      <div className="projection-stat-values">
        <span><em>LAST</em><strong>{last}</strong></span>
        <span><em>PROJ</em><strong>{next}</strong></span>
      </div>
      <b className={`projection-delta ${favourable}`}>{signedDelta(delta)}</b>
    </div>
  );
}

function projectionReasoning(player) {
  const projection = player?.projection;
  if (!projection) return [];

  const categoryReasons = Object.values(projection.statReasons || {}).filter(Boolean);
  if (categoryReasons.length) return categoryReasons;
  if (Array.isArray(projection.reasons) && projection.reasons.length) return projection.reasons;

  const gpDelta = Number(projection.gamesPlayed || 0) - Number(player.gamesPlayed || 0);
  return [
    Math.abs(gpDelta) >= 3
      ? `${Math.abs(gpDelta)} ${gpDelta > 0 ? "more" : "fewer"} games are projected from recent durability.`
      : "The projected workload is close to last season.",
    "The category forecast combines three-season production, expected-stat inputs, role/environment and a bounded consensus check."
  ];
}

function ProjectionRange({ player, projection }) {
  const range = projection?.range;
  if (!range) return null;

  return (
    <div className="projection-range-strip">
      <span><small>Floor</small><strong>{Number(range.floor?.fantasyPoints || 0).toFixed(1)}</strong></span>
      <span className="balanced"><small>Balanced</small><strong>{Number(range.balanced?.fantasyPoints || 0).toFixed(1)}</strong></span>
      <span><small>Upside</small><strong>{Number(range.upside?.fantasyPoints || 0).toFixed(1)}</strong></span>
    </div>
  );
}

function ProjectedPerformancePanel({ player, projectionData, players, query, onQuery, onSelect }) {
  const projection = player?.projection || null;
  const isGoalie = player?.rosterType === "G";
  const reviewed = Boolean(projection?.reviewed);
  const editorial = projection?.reviewLevel === "editorial";

  return (
    <section className="panel projected-performance-panel compact-performance-panel">
      <header>
        <div>
          <p className="eyebrow">Public projections · search any NHL player</p>
          <h2>Projected Performance</h2>
        </div>
        <span className={`projection-status ${reviewed ? "reviewed" : "fallback"}`}>
          {editorial ? "EDITORIAL REVIEW" : reviewed ? "STATIC REVIEW" : "MODEL"}
        </span>
      </header>

      <div className="projection-player-search">
        <span>⌕</span>
        <input
          type="search"
          list="champions-projection-player-options"
          placeholder="Search every player projection…"
          value={query}
          onChange={(event) => {
            const next = event.target.value;
            onQuery(next);
            const exact = players.find((candidate) => candidate.name.toLowerCase() === next.trim().toLowerCase());
            if (exact) onSelect(exact);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            const normalized = query.trim().toLowerCase();
            const match = players.find((candidate) => candidate.name.toLowerCase() === normalized)
              || players.find((candidate) => candidate.name.toLowerCase().includes(normalized));
            if (match) {
              onSelect(match);
              onQuery(match.name);
            }
          }}
        />
        <datalist id="champions-projection-player-options">
          {players.map((candidate) => <option key={`projection-option-${candidate.playerId}`} value={candidate.name}>{candidate.team}</option>)}
        </datalist>
      </div>

      {player && projection ? (
        <article className={`hockey-projection-card compact-projection-card ${isGoalie ? "goalie" : "skater"}`}>
          {player.teamLogo ? <img className="projection-card-watermark" src={player.teamLogo} alt="" /> : null}
          <div className="projection-player-hero">
            <PlayerHeadshot player={player} className="projection-card-headshot" alt="" />
            <div className="projection-player-copy">
              <small>{player.team || "NHL"} · {player.position || player.rosterType}</small>
              <h3>{player.name}</h3>
              <span>{compactMoney(player.capHit)} cap hit</span>
            </div>
            <div className="projection-fpts-badge projection-fpts-comparison">
              <span><small>LAST</small><strong>{actualFantasyPoints(player).toFixed(1)}</strong></span>
              <span><small>PROJ</small><strong>{projectedFantasyPoints(player).toFixed(1)}</strong></span>
              <b className={projectedFantasyPoints(player) >= actualFantasyPoints(player) ? "positive" : "negative"}>
                {projectedFantasyPoints(player) === actualFantasyPoints(player)
                  ? "±0.0"
                  : `${projectedFantasyPoints(player) > actualFantasyPoints(player) ? "+" : ""}${(projectedFantasyPoints(player) - actualFantasyPoints(player)).toFixed(1)}`}
              </b>
            </div>
          </div>

          <ProjectionRange player={player} projection={projection} />

          <div className={`projection-stat-grid comparison-grid ${isGoalie ? "goalie-grid" : "skater-grid"}`}>
            <ProjectionComparisonStat label="GP" previous={player.gamesPlayed} projected={projectedStat(player, "gamesPlayed")} />
            {isGoalie ? (
              <>
                <ProjectionComparisonStat label="W" previous={player.wins} projected={projectedStat(player, "wins")} accent />
                <ProjectionComparisonStat label="SV" previous={player.saves} projected={projectedStat(player, "saves")} />
                <ProjectionComparisonStat label="GA" previous={player.goalsAgainst} projected={projectedStat(player, "goalsAgainst")} lowerIsBetter />
                <ProjectionComparisonStat label="SO" previous={player.shutouts} projected={projectedStat(player, "shutouts")} accent />
              </>
            ) : (
              <>
                <ProjectionComparisonStat label="G" previous={player.goals} projected={projectedStat(player, "goals")} accent />
                <ProjectionComparisonStat label="A" previous={player.assists} projected={projectedStat(player, "assists")} accent />
                <ProjectionComparisonStat label="SOG" previous={player.shots} projected={projectedStat(player, "shots")} />
                <ProjectionComparisonStat label="HIT" previous={player.hits} projected={projectedStat(player, "hits")} />
              </>
            )}
          </div>

          <div className="projection-reasoning compact-reasoning">
            <strong>Why this projection</strong>
            <ul>
              {projectionReasoning(player).slice(0, 2).map((reason, index) => <li key={`${player.playerId}-reason-${index}`}>{reason}</li>)}
            </ul>
          </div>

          <p className="projection-method-note">
            Every player is covered by the static 2026–27 board. Editorial overrides are used for the top reviewed tier; the remaining pool uses the frozen full-board review rules documented in the README.
          </p>
        </article>
      ) : (
        <div className="performance-empty">Click a player image to pin a projection here.</div>
      )}

      <footer className="projection-source-footer compact-source-footer">
        <span>{projectionData?.staticBoard?.reviewedPlayers || "Full pool"} players covered · {projectionData?.staticBoard?.editorialOverrides || 0} editorial overrides</span>
        <small>Hover over any player image for a quick projection preview.</small>
      </footer>
    </section>
  );
}

function HoverProjectionCard({ hoverPreview }) {
  const player = hoverPreview?.player;
  const projection = player?.projection;
  if (!player || !projection) return null;
  const isGoalie = player.rosterType === "G";

  return (
    <div
      className="hover-projection-card"
      style={{ left: `${hoverPreview.x}px`, top: `${hoverPreview.y}px` }}
      role="status"
      aria-live="polite"
    >
      <div className="hover-projection-player">
        <PlayerHeadshot player={player} className="hover-projection-headshot" alt="" />
        <span>
          <strong>{player.name}</strong>
          <small>{player.team || "NHL"} · {projection.reviewLevel === "editorial" ? "Editorial" : "Static review"}</small>
        </span>
        <b>{projectedFantasyPoints(player).toFixed(1)}</b>
      </div>
      <div className="hover-projection-stats">
        {isGoalie ? (
          <>
            <span><small>GP</small><strong>{projectedStat(player, "gamesPlayed")}</strong></span>
            <span><small>W</small><strong>{projectedStat(player, "wins")}</strong></span>
            <span><small>SV</small><strong>{projectedStat(player, "saves")}</strong></span>
            <span><small>GA</small><strong>{projectedStat(player, "goalsAgainst")}</strong></span>
            <span><small>SO</small><strong>{projectedStat(player, "shutouts")}</strong></span>
          </>
        ) : (
          <>
            <span><small>G</small><strong>{projectedStat(player, "goals")}</strong></span>
            <span><small>A</small><strong>{projectedStat(player, "assists")}</strong></span>
            <span><small>SOG</small><strong>{projectedStat(player, "shots")}</strong></span>
            <span><small>HIT</small><strong>{projectedStat(player, "hits")}</strong></span>
          </>
        )}
      </div>
      <small className="hover-projection-hint">Click the image to pin the full card</small>
    </div>
  );
}


const ROSTER_GENERATOR_STYLES = [
  { value: "balanced", label: "Balanced", description: "Spreads cap and projection strength across all three positions." },
  { value: "stars-rookies", label: "High-End + Rookie Fillers", description: "Pays for elite players, then hunts low-cost young upside." },
  { value: "forward-heavy", label: "Forward Heavy", description: "Directs the largest share of cap toward the 12 forward spots." },
  { value: "defence-heavy", label: "Defence Heavy", description: "Builds around premium offensive defencemen." },
  { value: "goalie-heavy", label: "Goalie Heavy", description: "Spends aggressively on the two goalie spots." },
  { value: "projection-max", label: "Highest Projected FPTS", description: "Prioritizes the balanced projected total above everything else." },
  { value: "fpg-max", label: "Highest Projected FPG", description: "Targets the strongest projected per-game production." },
  { value: "value", label: "Best Value", description: "Maximizes projected fantasy points per $1 million." },
  { value: "rookie-upside", label: "Young Upside", description: "Leans toward rookies and young players with large upside ranges." },
  { value: "safe-floor", label: "Safe Veterans", description: "Favours reliable floor projections and proven NHL production." },
  { value: "boom-bust", label: "Boom or Bust", description: "Chases the largest gap between balanced and upside outcomes." },
  { value: "chaos", label: "Random Chaos", description: "Creates a legal cap roster with maximum variety every click." }
];

function styleBudgetShares(style) {
  const shares = {
    balanced: { F: .60, D: .27, G: .13 },
    "stars-rookies": { F: .63, D: .25, G: .12 },
    "forward-heavy": { F: .69, D: .21, G: .10 },
    "defence-heavy": { F: .51, D: .38, G: .11 },
    "goalie-heavy": { F: .52, D: .24, G: .24 },
    "projection-max": { F: .61, D: .27, G: .12 },
    "fpg-max": { F: .61, D: .27, G: .12 },
    value: { F: .58, D: .27, G: .15 },
    "rookie-upside": { F: .60, D: .27, G: .13 },
    "safe-floor": { F: .59, D: .27, G: .14 },
    "boom-bust": { F: .61, D: .27, G: .12 },
    chaos: { F: .60, D: .27, G: .13 }
  };
  return shares[style] || shares.balanced;
}

function playerGeneratorScore(player, style) {
  const projection = projectedFantasyPoints(player);
  const projectedFpg = projectedFantasyPointsPerGame(player);
  const value = projectedValuePerMillion(player);
  const floor = projectionRangeValue(player, "floor");
  const upside = projectionRangeValue(player, "upside");
  const age = playerAge(player);
  const rookie = isProjectionOnlyPlayer(player) || Number(player?.draftYear || 0) >= 2024 || (age != null && age <= 21);
  const proven = Number(player?.gamesPlayed || 0) >= 60;
  const salary = salaryMillions(player);
  const star = Number.isFinite(salary) && salary >= 8;
  const upsideGap = Math.max(0, upside - projection);
  const random = Math.random();

  switch (style) {
    case "stars-rookies": return projection * .48 + value * 2.2 + (star ? 95 : 0) + (rookie ? 80 : 0) + random * 18;
    case "forward-heavy": return projection + (player.rosterType === "F" ? 75 : 0) + value * .55 + random * 12;
    case "defence-heavy": return projection + (player.rosterType === "D" ? 105 : 0) + value * .45 + random * 12;
    case "goalie-heavy": return projection + (player.rosterType === "G" ? 125 : 0) + projectedFpg * 8 + random * 12;
    case "projection-max": return projection + random * 8;
    case "fpg-max": return projectedFpg * 90 + projection * .18 + random * 8;
    case "value": return value * 12 + projection * .15 + random * 10;
    case "rookie-upside": return upside * .55 + upsideGap * 1.6 + (rookie ? 115 : 0) + value * .8 + random * 18;
    case "safe-floor": return floor * .78 + projection * .22 + (proven ? 45 : 0) + random * 7;
    case "boom-bust": return upside * .45 + upsideGap * 2.2 + (rookie ? 35 : 0) + random * 24;
    case "chaos": return random * 250 + value * 1.2 + projection * .05;
    default: return projection * .72 + floor * .16 + value * 1.3 + random * 10;
  }
}

function cheapestReserve(players, count) {
  return [...players]
    .filter((player) => Number.isFinite(Number(player.capHit)))
    .sort((a, b) => Number(a.capHit) - Number(b.capHit))
    .slice(0, count)
    .reduce((sum, player) => sum + Number(player.capHit), 0);
}

function choosePositionGroup(players, count, budget, style) {
  const remaining = players
    .filter((player) => Number.isFinite(Number(player.capHit)) && Number(player.capHit) > 0)
    .map((player) => ({ player, score: playerGeneratorScore(player, style) }));
  const selected = [];
  let spent = 0;

  while (selected.length < count && remaining.length) {
    const slotsAfter = count - selected.length - 1;
    const remainingPlayers = remaining.map((entry) => entry.player);
    const eligible = remaining.filter((entry) => {
      const others = remainingPlayers.filter((candidate) => candidate.playerId !== entry.player.playerId);
      const reserve = cheapestReserve(others, slotsAfter);
      return spent + Number(entry.player.capHit) + reserve <= budget;
    });
    const pool = eligible.length ? eligible : remaining;
    pool.sort((a, b) => b.score - a.score || Number(a.player.capHit) - Number(b.player.capHit));
    const shortlist = pool.slice(0, Math.min(style === "chaos" ? 18 : 7, pool.length));
    const index = style === "projection-max" || style === "safe-floor" ? 0 : Math.floor(Math.random() * Math.min(4, shortlist.length));
    const chosen = shortlist[index] || shortlist[0];
    if (!chosen) break;
    if (spent + Number(chosen.player.capHit) > budget) {
      const cheapest = [...remaining].sort((a, b) => Number(a.player.capHit) - Number(b.player.capHit))[0];
      if (!cheapest || spent + Number(cheapest.player.capHit) > budget) break;
      selected.push(cheapest.player);
      spent += Number(cheapest.player.capHit);
      remaining.splice(remaining.indexOf(cheapest), 1);
      continue;
    }
    selected.push(chosen.player);
    spent += Number(chosen.player.capHit);
    remaining.splice(remaining.indexOf(chosen), 1);
  }

  return { players: selected, spent };
}

function generateRosterSimulation(poolPlayers, style, salaryCap, rosterLimits) {
  const signed = poolPlayers.filter((player) => Number.isFinite(Number(player.capHit)) && Number(player.capHit) > 0);
  const shares = styleBudgetShares(style);
  const groups = {};
  let generated = [];

  for (const type of ["F", "D", "G"]) {
    const candidates = signed.filter((player) => player.rosterType === type);
    const group = choosePositionGroup(candidates, Number(rosterLimits[type] || 0), salaryCap * shares[type], style);
    groups[type] = group;
    generated = generated.concat(group.players);
  }

  // Fill any rare shortfall with the cheapest legal player at that position.
  for (const type of ["F", "D", "G"]) {
    const needed = Number(rosterLimits[type] || 0) - generated.filter((player) => player.rosterType === type).length;
    if (needed <= 0) continue;
    const used = new Set(generated.map((player) => String(player.playerId)));
    const currentSpent = generated.reduce((sum, player) => sum + Number(player.capHit || 0), 0);
    const cheapest = signed
      .filter((player) => player.rosterType === type && !used.has(String(player.playerId)))
      .sort((a, b) => Number(a.capHit) - Number(b.capHit));
    for (const player of cheapest) {
      if (generated.filter((item) => item.rosterType === type).length >= Number(rosterLimits[type] || 0)) break;
      const newSpent = generated.reduce((sum, item) => sum + Number(item.capHit || 0), 0) + Number(player.capHit || 0);
      if (newSpent <= salaryCap) generated.push(player);
    }
    if (currentSpent > salaryCap) break;
  }

  const totalCap = generated.reduce((sum, player) => sum + Number(player.capHit || 0), 0);
  const projected = generated.reduce((sum, player) => sum + projectedFantasyPoints(player), 0);
  const actual = generated.reduce((sum, player) => sum + actualFantasyPoints(player), 0);
  const rookies = generated.filter((player) => isProjectionOnlyPlayer(player) || Number(player?.draftYear || 0) >= 2024 || (playerAge(player) != null && playerAge(player) <= 21)).length;
  return {
    id: `${Date.now()}-${Math.random()}`,
    style,
    players: generated,
    totalCap,
    projected,
    actual,
    rookies,
    valid: generated.length === Object.values(rosterLimits).reduce((sum, value) => sum + Number(value || 0), 0) && totalCap <= salaryCap
  };
}

function assistantComparator(mode) {
  return (a, b) => {
    const salaryDiff = Number(a.capHit || Infinity) - Number(b.capHit || Infinity);
    if (mode === "salary-fpg") return salaryDiff || projectedFantasyPointsPerGame(b) - projectedFantasyPointsPerGame(a);
    if (mode === "salary-actual-fpg") return salaryDiff || actualFantasyPointsPerGame(b) - actualFantasyPointsPerGame(a);
    if (mode === "salary-projection") return salaryDiff || projectedFantasyPoints(b) - projectedFantasyPoints(a);
    if (mode === "actual-fpg") return actualFantasyPointsPerGame(b) - actualFantasyPointsPerGame(a) || salaryDiff;
    if (mode === "fpg") return projectedFantasyPointsPerGame(b) - projectedFantasyPointsPerGame(a) || salaryDiff;
    if (mode === "value") return projectedValuePerMillion(b) - projectedValuePerMillion(a) || salaryDiff;
    return projectedFantasyPoints(b) - projectedFantasyPoints(a) || salaryDiff;
  };
}

function buildAssistantPackage(candidates, slots, budget, mode) {
  const selected = [];
  let remainingBudget = budget;
  let available = [...candidates];
  while (selected.length < slots && available.length) {
    const remainingSlots = slots - selected.length - 1;
    const eligible = available.filter((player) => {
      const others = available.filter((candidate) => candidate.playerId !== player.playerId);
      return Number(player.capHit) + cheapestReserve(others, remainingSlots) <= remainingBudget;
    });
    if (!eligible.length) break;
    eligible.sort(assistantComparator(mode));
    let chosen = eligible[0];
    if (mode === "balanced") {
      const target = remainingBudget / (remainingSlots + 1);
      chosen = [...eligible].sort((a, b) => {
        const scoreA = projectedFantasyPoints(a) - Math.abs(Number(a.capHit) - target) / 120000;
        const scoreB = projectedFantasyPoints(b) - Math.abs(Number(b.capHit) - target) / 120000;
        return scoreB - scoreA;
      })[0];
    }
    selected.push(chosen);
    remainingBudget -= Number(chosen.capHit);
    available = available.filter((player) => player.playerId !== chosen.playerId);
  }
  return {
    players: selected,
    totalCap: selected.reduce((sum, player) => sum + Number(player.capHit || 0), 0),
    projected: selected.reduce((sum, player) => sum + projectedFantasyPoints(player), 0),
    projectedFpg: selected.reduce((sum, player) => sum + projectedFantasyPointsPerGame(player), 0)
  };
}

function RosterAssistant({ poolPlayers, roster, rosterLimits, capRemaining, onDraft, onPreview }) {
  const currentCounts = roster.reduce((acc, player) => {
    acc[player.rosterType] = (acc[player.rosterType] || 0) + 1;
    return acc;
  }, { F: 0, D: 0, G: 0 });
  const initialType = ["F", "D", "G"].find((type) => currentCounts[type] < rosterLimits[type]) || "F";
  const [type, setType] = useState(initialType);
  const [slots, setSlots] = useState(Math.max(1, Math.min(3, rosterLimits[initialType] - currentCounts[initialType])));
  const [budgetMillions, setBudgetMillions] = useState(Math.max(1, Math.round(capRemaining / 1_000_000)));
  const [sortMode, setSortMode] = useState("salary-fpg");

  useEffect(() => {
    const remaining = Math.max(1, rosterLimits[type] - currentCounts[type]);
    setSlots((value) => Math.min(Math.max(1, value), remaining));
  }, [type, rosterLimits.F, rosterLimits.D, rosterLimits.G, currentCounts.F, currentCounts.D, currentCounts.G]);

  const available = useMemo(() => {
    const rosterIds = new Set(roster.map((player) => String(player.playerId)));
    const totalBudget = Math.max(0, Number(budgetMillions || 0) * 1_000_000);
    return poolPlayers
      .filter((player) => player.rosterType === type)
      .filter((player) => !rosterIds.has(String(player.playerId)))
      .filter((player) => Number.isFinite(Number(player.capHit)) && Number(player.capHit) <= totalBudget)
      .sort(assistantComparator(sortMode));
  }, [poolPlayers, roster, type, budgetMillions, sortMode]);

  const packages = useMemo(() => {
    const budget = Math.max(0, Number(budgetMillions || 0) * 1_000_000);
    const count = Math.max(1, Number(slots || 1));
    const definitions = [
      ["Projected Ceiling", "projection"],
      ["Best Projected FPG", "fpg"],
      ["Best Last-Season FPG", "actual-fpg"],
      ["Best Value", "value"],
      ["Balanced Spend", "balanced"]
    ];
    const seen = new Set();
    return definitions.map(([label, mode]) => ({ label, mode, ...buildAssistantPackage(available, count, budget, mode) }))
      .filter((option) => option.players.length === count)
      .filter((option) => {
        const key = option.players.map((player) => player.playerId).sort().join("-");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [available, slots, budgetMillions]);

  function useCurrentNeed() {
    const nextType = ["F", "D", "G"].find((candidate) => currentCounts[candidate] < rosterLimits[candidate]) || "F";
    setType(nextType);
    setSlots(Math.max(1, rosterLimits[nextType] - currentCounts[nextType]));
    setBudgetMillions(Math.max(0, Math.floor(capRemaining / 100000) / 10));
  }

  return (
    <section className="ai-tool-card roster-assistant-card">
      <header className="ai-tool-heading">
        <div><p className="eyebrow">Cap problem solver</p><h2>Roster Assister</h2></div>
        <button type="button" className="ai-secondary-button" onClick={useCurrentNeed}>Use my remaining needs</button>
      </header>
      <p className="ai-tool-intro">Choose the position, number of open spots and total budget. The tool returns several legal ways to spend it.</p>
      <div className="assistant-controls">
        <label><span>Position</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="F">Forwards</option><option value="D">Defence</option><option value="G">Goalies</option></select></label>
        <label><span>Spots needed</span><input type="number" min="1" max={Math.max(1, rosterLimits[type] - currentCounts[type])} value={slots} onChange={(event) => setSlots(Math.max(1, Number(event.target.value || 1)))} /></label>
        <label><span>Total budget ($M)</span><input type="number" min="0.5" step="0.1" value={budgetMillions} onChange={(event) => setBudgetMillions(event.target.value)} /></label>
        <label><span>Affordable list sort</span><select value={sortMode} onChange={(event) => setSortMode(event.target.value)}><option value="salary-fpg">Salary → highest projected FPG</option><option value="salary-actual-fpg">Salary → highest last-season FPG</option><option value="salary-projection">Salary → highest projection</option><option value="actual-fpg">Highest last-season FPG</option><option value="fpg">Highest projected FPG</option><option value="projection">Highest projected FPTS</option><option value="value">Best FPTS per $1M</option></select></label>
      </div>

      <div className="assistant-package-grid">
        {packages.length ? packages.map((option) => (
          <article className="assistant-package" key={option.label}>
            <header><strong>{option.label}</strong><span>{compactMoney(option.totalCap)} · {option.projected.toFixed(1)} P-FPTS</span></header>
            <div className="assistant-player-list">
              {option.players.map((player) => (
                <div className="assistant-player" key={`${option.label}-${player.playerId}`}>
                  <button type="button" className="assistant-player-preview" onClick={() => onPreview(player)}>
                    <PlayerHeadshot player={player} className="assistant-player-headshot" alt="" />
                    <span><strong>{player.name}</strong><small>{compactMoney(player.capHit)} · {actualFantasyPointsPerGame(player).toFixed(2)} FPG · {projectedFantasyPointsPerGame(player).toFixed(2)} P-FPG · {projectedFantasyPoints(player).toFixed(1)} P-FPTS</small></span>
                  </button>
                  <button type="button" className="assistant-draft-button" onClick={() => onDraft(player)}>DRAFT</button>
                </div>
              ))}
            </div>
          </article>
        )) : <div className="ai-empty-state">No complete {slots}-player package fits inside {compactMoney(Number(budgetMillions || 0) * 1_000_000)}. Increase the budget or reduce the number of spots.</div>}
      </div>

      <div className="affordable-board">
        <header><strong>Affordable player board</strong><span>{available.length} options · first 12 shown</span></header>
        <div className="affordable-list">
          {available.slice(0, 12).map((player) => (
            <button type="button" key={`affordable-${player.playerId}`} onClick={() => onPreview(player)}>
              <span>{player.name}<small>{player.team} · {compactMoney(player.capHit)}</small></span>
              <b>{actualFantasyPointsPerGame(player).toFixed(2)}<small>FPG</small></b>
              <b>{projectedFantasyPointsPerGame(player).toFixed(2)}<small>P-FPG</small></b>
              <b>{projectedFantasyPoints(player).toFixed(1)}<small>P-FPTS</small></b>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function GeneratedRosterTable({ simulation, onPreview, salaryCap }) {
  if (!simulation) return <div className="ai-empty-state generated-roster-empty">Choose a roster style and generate a private simulation. It will not replace your actual draft roster.</div>;
  const groups = [
    ["Forwards", simulation.players.filter((player) => player.rosterType === "F")],
    ["Defence", simulation.players.filter((player) => player.rosterType === "D")],
    ["Goalies", simulation.players.filter((player) => player.rosterType === "G")]
  ];
  return (
    <div className="generated-roster-result">
      <div className="generated-roster-summary">
        <span><small>Status</small><strong className={simulation.valid ? "summary-green" : "summary-red"}>{simulation.valid ? "LEGAL" : "INCOMPLETE"}</strong></span>
        <span><small>Cap used</small><strong>{money(simulation.totalCap)}</strong></span>
        <span><small>Cap remaining</small><strong>{money(salaryCap - simulation.totalCap)}</strong></span>
        <span><small>Projected FPTS</small><strong className="summary-blue">{simulation.projected.toFixed(1)}</strong></span>
        <span><small>Last-season FPTS</small><strong>{simulation.actual.toFixed(1)}</strong></span>
        <span><small>Young / rookies</small><strong>{simulation.rookies}</strong></span>
      </div>
      <div className="generated-roster-groups">
        {groups.map(([label, players]) => (
          <section key={label}>
            <h3>{label}<span>{players.length}</span></h3>
            <div className="generated-roster-player-grid">
              {players.map((player) => (
                <button type="button" key={`generated-${player.playerId}`} onClick={() => onPreview(player)}>
                  <PlayerHeadshot player={player} className="generated-player-headshot" alt="" />
                  <span><strong>{player.name}</strong><small>{player.team} · {compactMoney(player.capHit)}</small></span>
                  <b>{projectedFantasyPoints(player).toFixed(1)}</b>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function RandomRosterGenerator({ poolPlayers, salaryCap, rosterLimits, onPreview }) {
  const [style, setStyle] = useState("balanced");
  const [simulation, setSimulation] = useState(null);
  const selectedStyle = ROSTER_GENERATOR_STYLES.find((item) => item.value === style) || ROSTER_GENERATOR_STYLES[0];
  return (
    <section className="ai-tool-card roster-generator-card">
      <header className="ai-tool-heading"><div><p className="eyebrow">Private computer simulation</p><h2>Random Roster Generator</h2></div><span className="ai-simulation-badge">DOES NOT CHANGE YOUR TEAM</span></header>
      <p className="ai-tool-intro">Pick a construction style. Every click creates a different legal 12F / 6D / 2G roster under the cap using the static projections.</p>
      <div className="generator-controls">
        <label><span>Roster style</span><select value={style} onChange={(event) => setStyle(event.target.value)}>{ROSTER_GENERATOR_STYLES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        <div className="generator-style-description"><strong>{selectedStyle.label}</strong><span>{selectedStyle.description}</span></div>
        <button type="button" className="generate-roster-button" onClick={() => setSimulation(generateRosterSimulation(poolPlayers, style, salaryCap, rosterLimits))}>GENERATE RANDOM ROSTER</button>
      </div>
      <GeneratedRosterTable simulation={simulation} onPreview={onPreview} salaryCap={salaryCap} />
    </section>
  );
}

function AiGeneratedTab({ poolPlayers, roster, rosterLimits, salaryCap, capRemaining, onDraft, onPreview }) {
  return (
    <div className="ai-generated-tab-content">
      <RosterAssistant poolPlayers={poolPlayers} roster={roster} rosterLimits={rosterLimits} capRemaining={capRemaining} onDraft={onDraft} onPreview={onPreview} />
      <RandomRosterGenerator poolPlayers={poolPlayers} salaryCap={salaryCap} rosterLimits={rosterLimits} onPreview={onPreview} />
    </div>
  );
}


function parseSalaryInput(value) {
  const text = String(value || "").trim().toLowerCase().replaceAll(",", "").replaceAll("$", "");
  if (!text) return null;
  const multiplier = text.endsWith("m") ? 1_000_000 : text.endsWith("k") ? 1_000 : 1;
  const numeric = Number(text.replace(/[mk]$/, ""));
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * multiplier);
}

function SalaryAdminPanel({ players, salaryData, onSalarySaved }) {
  const [query, setQuery] = useState("");
  const [unresolvedOnly, setUnresolvedOnly] = useState(true);
  const [values, setValues] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [status, setStatus] = useState("");

  const visiblePlayers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...players]
      .filter((player) => !unresolvedOnly || player.capHit == null)
      .filter((player) => !normalized
        || String(player.name || "").toLowerCase().includes(normalized)
        || String(player.team || "").toLowerCase().includes(normalized))
      .sort((left, right) => {
        const unresolvedDifference = Number(left.capHit != null) - Number(right.capHit != null);
        return unresolvedDifference || String(left.name).localeCompare(String(right.name), "en", { sensitivity: "base" });
      });
  }, [players, query, unresolvedOnly]);

  const unresolvedCount = useMemo(
    () => players.filter((player) => player.capHit == null).length,
    [players]
  );

  async function save(player) {
    const rawValue = values[String(player.playerId)] ?? (player.capHit == null ? "" : String(player.capHit));
    const capHit = parseSalaryInput(rawValue);
    if (!Number.isFinite(capHit) || capHit < 500_000 || capHit > 30_000_000) {
      setStatus(`Enter a valid NHL cap hit for ${player.name}, such as 12000000 or 12m.`);
      return;
    }

    setSavingId(player.playerId);
    setStatus(`Saving ${player.name}…`);
    try {
      const response = await fetch("/api/salaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: player.playerId,
          name: player.name,
          capHit,
          source: "manual"
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Salary could not be saved.");

      onSalarySaved(player, capHit, data.record || null);
      setValues((current) => ({ ...current, [String(player.playerId)]: String(capHit) }));
      setStatus(`${player.name} is now ${money(capHit)} for every manager.`);
      window.dispatchEvent(new CustomEvent("champions-league:salary-updated", {
        detail: { playerId: player.playerId, capHit }
      }));
    } catch (error) {
      setStatus(error.message || "Salary could not be saved.");
    } finally {
      setSavingId(null);
    }
  }


  return (
    <section className="panel salary-admin-panel">
      <div className="salary-admin-heading">
        <div>
          <p className="eyebrow">Nick only · league-wide control</p>
          <h2>Salary Admin</h2>
          <p>Corrections saved here override the static SALARY CAP SPACE file for every manager.</p>
        </div>
        <div className="salary-admin-summary">
          <span><small>SALARY CAP SPACE players</small><strong>{Number(salaryData?.recordCount || 0).toLocaleString("en-CA")}</strong></span>
          <span><small>Unresolved pool players</small><strong>{unresolvedCount}</strong></span>
        </div>
      </div>

      <div className="salary-admin-actions">
        <div className="search-box draft-search-box">
          <span>⌕</span>
          <input
            type="search"
            placeholder="Search a player or team…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <label className="salary-admin-toggle">
          <input
            type="checkbox"
            checked={unresolvedOnly}
            onChange={(event) => setUnresolvedOnly(event.target.checked)}
          />
          <span>Show unresolved only</span>
        </label>
        <a className="salary-admin-link" href="/api/salaries/export">Download SALARY CAP SPACE CSV</a>
      </div>

      <p className="salary-admin-status" aria-live="polite">{status || "The static SALARY CAP SPACE file supplies every normal salary. Use this editor only for a later signing or a rare missed contract."}</p>

      <div className="salary-admin-table-wrap">
        <table className="salary-admin-table">
          <thead>
            <tr><th>Player</th><th>Team</th><th>Position</th><th>Current</th><th>New salary</th><th>Save</th></tr>
          </thead>
          <tbody>
            {visiblePlayers.map((player) => (
              <tr key={player.playerId} className={player.capHit == null ? "unresolved" : ""}>
                <td><strong>{player.name}</strong><small>ID {player.playerId}</small></td>
                <td>{player.team || "—"}</td>
                <td>{player.position || player.rosterType || "—"}</td>
                <td>{compactMoney(player.capHit)}</td>
                <td>
                  <input
                    inputMode="decimal"
                    aria-label={`New salary for ${player.name}`}
                    placeholder={player.capHit == null ? "e.g. 1.2m" : String(player.capHit)}
                    value={values[String(player.playerId)] ?? ""}
                    onChange={(event) => setValues((current) => ({
                      ...current,
                      [String(player.playerId)]: event.target.value
                    }))}
                    onKeyDown={(event) => { if (event.key === "Enter") save(player); }}
                  />
                </td>
                <td>
                  <button type="button" onClick={() => save(player)} disabled={savingId === player.playerId}>
                    {savingId === player.playerId ? "Saving…" : "Save"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visiblePlayers.length === 0 ? <div className="empty-state">No players match this salary view.</div> : null}
    </section>
  );
}

export default function RosterBuilder({ team, salaryCap, rosterLimits, scoring, goalieScoring }) {
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("ALL");
  const [nhlTeam, setNhlTeam] = useState("ALL");
  const [previewPlayerId, setPreviewPlayerId] = useState(null);
  const [hoverPreview, setHoverPreview] = useState(null);
  const [poolPlayers, setPoolPlayers] = useState([]);
  const [poolReloadVersion, setPoolReloadVersion] = useState(0);
  const [projectionQuery, setProjectionQuery] = useState("");
  const [activeDraftView, setActiveDraftView] = useState("pool");
  const [players, setPlayers] = useState([]);
  const [loadingPool, setLoadingPool] = useState(true);
  const [poolError, setPoolError] = useState("");
  const [salaryData, setSalaryData] = useState(null);
  const [projectionData, setProjectionData] = useState(null);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [saveStatus, setSaveStatus] = useState("Loading roster…");
  const rosterReadyRef = useRef(false);
  const lastSavedRosterRef = useRef("");
  const remoteUpdatedAtRef = useRef(0);
  const saveTimerRef = useRef(null);
  const savingRef = useRef(false);
  const saveQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    let cancelled = false;

    async function loadPool() {
      setLoadingPool(true);
      setPoolError("");
      try {
        const response = await fetch("/api/players?mode=leaderboard", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Player pool could not be loaded.");
        if (!cancelled) {
          setPoolPlayers(data.players || []);
          setSalaryData(data.salaryData || null);
          setProjectionData(data.projectionData || null);
        }
      } catch (error) {
        if (!cancelled) setPoolError(error.message || "Player pool could not be loaded.");
      } finally {
        if (!cancelled) setLoadingPool(false);
      }
    }

    loadPool();
    return () => { cancelled = true; };
  }, [poolReloadVersion]);

  useEffect(() => {
    let cancelled = false;

    async function loadRoster() {
      const legacyLocal = loadJson(localRosterKey(team.slug), null);

      try {
        const response = await fetch(`/api/rosters/${team.slug}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "The private roster could not be loaded.");
        if (cancelled) return;

        if (data.roster?.players) {
          setPlayers(data.roster.players);
          lastSavedRosterRef.current = JSON.stringify(data.roster.players);
          remoteUpdatedAtRef.current = Date.parse(data.roster.updatedAt || 0) || 0;
          window.localStorage.removeItem(localRosterKey(team.slug));
          setSaveStatus(`Private roster loaded${data.roster.updatedAt ? ` · updated ${new Date(data.roster.updatedAt).toLocaleString()}` : ""}. Changes save automatically.`);
        } else if (legacyLocal?.players) {
          // One-time migration from the pre-login browser save into the manager's
          // private Upstash record. The browser copy is deleted only after success.
          setPlayers(legacyLocal.players);
          setSaveStatus("Moving the roster previously saved in this browser into your private account…");

          const migrateResponse = await fetch(`/api/rosters/${team.slug}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ players: legacyLocal.players })
          });
          const migrateData = await migrateResponse.json();
          if (!migrateResponse.ok) throw new Error(migrateData.error || "The old browser roster could not be moved to Upstash.");
          if (cancelled) return;

          setPlayers(migrateData.roster.players || legacyLocal.players);
          lastSavedRosterRef.current = JSON.stringify(migrateData.roster.players || legacyLocal.players);
          remoteUpdatedAtRef.current = Date.parse(migrateData.roster.updatedAt || 0) || 0;
          window.localStorage.removeItem(localRosterKey(team.slug));
          window.dispatchEvent(new CustomEvent("champions-league:roster-updated", { detail: { team: team.slug } }));
          setSaveStatus(`Roster moved into your private account · ${new Date(migrateData.roster.updatedAt).toLocaleString()}`);
        } else {
          setPlayers([]);
          lastSavedRosterRef.current = JSON.stringify([]);
          remoteUpdatedAtRef.current = 0;
          setSaveStatus("No private roster saved yet. Changes save automatically.");
        }
      } catch (error) {
        if (cancelled) return;
        if (legacyLocal?.players) {
          setPlayers(legacyLocal.players);
          setSaveStatus(`${error.message} Your older browser copy is still available on this device and has not been deleted.`);
        } else {
          setSaveStatus(error.message || "The private roster could not be loaded.");
        }
      } finally {
        if (!cancelled) {
          rosterReadyRef.current = true;
          setLoadingRoster(false);
        }
      }
    }

    loadRoster();
    return () => { cancelled = true; };
  }, [team.slug]);

  // Replace older saved stats, salaries, teams and photos with the current snapshots.
  useEffect(() => {
    if (loadingRoster || poolPlayers.length === 0 || players.length === 0) return;
    const liveById = new Map(poolPlayers.map((player) => [String(player.playerId), player]));

    setPlayers((current) => {
      let changed = false;
      const next = current.map((saved) => {
        const live = liveById.get(String(saved.playerId));
        if (!live) return saved;

        const merged = { ...saved, ...live };
        if (
          Number(saved.capHit) !== Number(merged.capHit) ||
          Number(saved.fantasyPoints) !== Number(merged.fantasyPoints) ||
          Number(saved.projection?.fantasyPoints) !== Number(merged.projection?.fantasyPoints) ||
          saved.team !== merged.team ||
          saved.position !== merged.position ||
          saved.headshot !== merged.headshot ||
          saved.teamLogo !== merged.teamLogo
        ) {
          changed = true;
        }
        return merged;
      });

      return changed ? next : current;
    });
  }, [loadingRoster, poolPlayers, players.length]);

  const teamOptions = useMemo(() => (
    Array.from(new Set(poolPlayers.map((player) => String(player.team || "").trim()).filter(Boolean)))
      .sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }))
  ), [poolPlayers]);

  const filteredPlayers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return poolPlayers.filter((player) => {
      const matchesPosition = position === "ALL" || player.rosterType === position;
      const matchesTeam = nhlTeam === "ALL" || String(player.team || "") === nhlTeam;
      const matchesQuery = !normalizedQuery
        || player.name.toLowerCase().includes(normalizedQuery)
        || String(player.team || "").toLowerCase().includes(normalizedQuery);
      return matchesPosition && matchesTeam && matchesQuery;
    });
  }, [poolPlayers, position, nhlTeam, query]);


  const poolPlayerIds = useMemo(
    () => poolPlayers.map((player) => String(player.playerId)).filter(Boolean).join(","),
    [poolPlayers]
  );

  function applySalaryUpdate(player, capHit, record = null) {
    const updatedAt = record?.updatedAt || new Date().toISOString();
    const update = (item) => String(item.playerId) === String(player.playerId)
      ? {
          ...item,
          capHit,
          salarySource: record?.source || "manual",
          salaryUpdatedAt: updatedAt,
          salaryState: "signed"
        }
      : item;

    setPoolPlayers((current) => current.map(update));
    setPlayers((current) => current.map(update));
  }

  useEffect(() => {
    if (!poolPlayerIds) return undefined;
    let cancelled = false;

    async function syncSalaryOverrides() {
      const ids = poolPlayerIds.split(",").filter(Boolean);
      const chunks = [];
      for (let index = 0; index < ids.length; index += 100) chunks.push(ids.slice(index, index + 100));

      try {
        const responses = await Promise.all(chunks.map(async (chunk) => {
          const response = await fetch(`/api/salaries?ids=${encodeURIComponent(chunk.join(","))}`, { cache: "no-store" });
          if (!response.ok) return {};
          const data = await response.json();
          return data.records || {};
        }));
        if (cancelled) return;

        const records = Object.assign({}, ...responses);
        if (Object.keys(records).length === 0) return;
        const update = (item) => {
          const record = records[String(item.playerId)];
          if (!record || !Number.isFinite(Number(record.capHit))) return item;
          const capHit = Number(record.capHit);
          if (Number(item.capHit) === capHit && item.salarySource === record.source) return item;
          return {
            ...item,
            capHit,
            salarySource: record.source || "manual",
            salaryUpdatedAt: record.updatedAt || item.salaryUpdatedAt || null,
            salaryState: "signed"
          };
        };
        setPoolPlayers((current) => current.map(update));
        setPlayers((current) => current.map(update));
      } catch {
        // A brief background sync failure should not interrupt the draft room.
      }
    }

    const interval = window.setInterval(syncSalaryOverrides, 30_000);
    const onSalaryUpdated = () => syncSalaryOverrides();
    window.addEventListener("champions-league:salary-updated", onSalaryUpdated);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("champions-league:salary-updated", onSalaryUpdated);
    };
  }, [poolPlayerIds]);

  const previewPlayer = useMemo(() => (
    poolPlayers.find((player) => player.playerId === previewPlayerId)
      || filteredPlayers[0]
      || null
  ), [poolPlayers, filteredPlayers, previewPlayerId]);

  const counts = useMemo(() => players.reduce((acc, player) => {
    acc[player.rosterType] = (acc[player.rosterType] || 0) + 1;
    return acc;
  }, { F: 0, D: 0, G: 0 }), [players]);

  const totalCap = useMemo(
    () => players.reduce((sum, player) => sum + Number(player.capHit || 0), 0),
    [players]
  );
  const capRemaining = salaryCap - totalCap;
  const rosterComplete = Object.entries(rosterLimits).every(([type, limit]) => counts[type] === limit);
  const totalFantasyPoints = players.reduce((sum, player) => sum + projectedFantasyPoints(player), 0);

  function showHoverPreview(player, event) {
    const width = 250;
    const height = 150;
    const x = Math.max(10, Math.min(event.clientX + 16, window.innerWidth - width - 12));
    const y = Math.max(10, Math.min(event.clientY + 16, window.innerHeight - height - 12));
    setHoverPreview({ player, x, y });
  }

  function addPlayer(player) {
    if (players.some((item) => item.playerId === player.playerId)) return;
    if (player.capHit == null) {
      setSaveStatus(`${player.name} does not currently have a 2026–27 NHL cap hit and cannot be added yet.`);
      return;
    }
    if (counts[player.rosterType] >= rosterLimits[player.rosterType]) {
      setSaveStatus(`The ${player.rosterType === "G" ? "goalie" : player.rosterType === "D" ? "defence" : "forward"} section is already full.`);
      return;
    }
    if (totalCap + Number(player.capHit) > salaryCap) {
      setSaveStatus(`${player.name} would put this roster over the salary cap.`);
      return;
    }

    setPlayers((current) => [...current, player]);
    setSaveStatus(`${player.name} added · saving automatically…`);
  }

  function removePlayer(playerId) {
    const removed = players.find((player) => player.playerId === playerId);
    setPlayers((current) => current.filter((player) => player.playerId !== playerId));
    setSaveStatus(`${removed?.name || "Player"} removed · saving automatically…`);
  }

  useEffect(() => {
    if (!rosterReadyRef.current || loadingRoster) return undefined;

    const serialized = JSON.stringify(players);
    if (serialized === lastSavedRosterRef.current) return undefined;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus("Saving roster automatically…");

    saveTimerRef.current = setTimeout(() => {
      const rosterToSave = players;
      saveQueueRef.current = saveQueueRef.current.catch(() => undefined).then(async () => {
        savingRef.current = true;
        try {
          const response = await fetch(`/api/rosters/${team.slug}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ players: rosterToSave })
          });
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || "The private roster could not be saved.");
          }

          lastSavedRosterRef.current = JSON.stringify(data.roster.players || rosterToSave);
          remoteUpdatedAtRef.current = Date.parse(data.roster.updatedAt || 0) || Date.now();
          window.localStorage.removeItem(localRosterKey(team.slug));
          window.dispatchEvent(new CustomEvent("champions-league:roster-updated", { detail: { team: team.slug } }));
          setSaveStatus(`Saved automatically · ${new Date(data.roster.updatedAt).toLocaleTimeString()}`);
        } catch (error) {
          setSaveStatus(error.message || "Automatic save failed. Check the Upstash connection.");
        } finally {
          savingRef.current = false;
        }
      });
    }, 250);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [players, loadingRoster, team.slug]);

  useEffect(() => {
    if (loadingRoster) return undefined;

    async function syncFromUpstash() {
      if (document.visibilityState !== "visible" || savingRef.current) return;
      if (JSON.stringify(players) !== lastSavedRosterRef.current) return;

      try {
        const response = await fetch(`/api/rosters/${team.slug}?sync=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!data.roster?.players) return;

        const remoteTime = Date.parse(data.roster.updatedAt || 0) || 0;
        if (remoteTime <= remoteUpdatedAtRef.current) return;

        const remotePlayers = data.roster.players;
        lastSavedRosterRef.current = JSON.stringify(remotePlayers);
        remoteUpdatedAtRef.current = remoteTime;
        setPlayers(remotePlayers);
        setSaveStatus(`Synced from another device · ${new Date(data.roster.updatedAt).toLocaleTimeString()}`);
        window.dispatchEvent(new CustomEvent("champions-league:roster-updated", { detail: { team: team.slug } }));
      } catch {
        // Keep the current local view if a background sync briefly fails.
      }
    }

    const interval = window.setInterval(syncFromUpstash, 3000);
    const onFocus = () => syncFromUpstash();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadingRoster, players, team.slug]);

  const salaryNote = useMemo(() => {
    if (loadingPool) return "Loading the static 2026–27 SALARY CAP SPACE file before opening the draft table…";
    if (salaryData?.error) return `SALARY CAP SPACE warning: ${salaryData.error}`;
    if (!salaryData?.recordCount) return "SALARY CAP SPACE is unavailable right now.";

    const generated = salaryData.updatedAt
      ? new Date(salaryData.updatedAt).toLocaleString()
      : "during deployment";
    const zeroCount = Number(salaryData.zeroSalaryCount || 0);
    return `${Number(salaryData.recordCount).toLocaleString("en-CA")} pool players loaded exclusively from SALARY CAP SPACE, generated ${generated}. ${zeroCount} player${zeroCount === 1 ? " has" : "s have"} a $0 salary and ${zeroCount === 1 ? "is" : "are"} blocked for salary review.`;
  }, [loadingPool, salaryData]);

  return (
    <div className="draft-page-stack champions-draft-page compact-draft-page">
      <div className="draft-workspace-grid compact-draft-workspace">
        <main className="draft-left-column">
          <div className="draft-room-subtabs" role="tablist" aria-label="Draft room tools">
            <button type="button" className={activeDraftView === "pool" ? "active" : ""} onClick={() => setActiveDraftView("pool")} role="tab" aria-selected={activeDraftView === "pool"}>PLAYER POOL</button>
            <button type="button" className={activeDraftView === "ai" ? "active" : ""} onClick={() => setActiveDraftView("ai")} role="tab" aria-selected={activeDraftView === "ai"}>AI GENERATED</button>
            {team.slug === "nick" ? (
              <button type="button" className={activeDraftView === "salary" ? "active" : ""} onClick={() => setActiveDraftView("salary")} role="tab" aria-selected={activeDraftView === "salary"}>SALARY ADMIN</button>
            ) : null}
          </div>

          {activeDraftView === "pool" ? (
            <>
              <ProjectedPerformancePanel
                player={previewPlayer}
                projectionData={projectionData}
                players={poolPlayers}
                query={projectionQuery}
                onQuery={setProjectionQuery}
                onSelect={(player) => setPreviewPlayerId(player.playerId)}
              />

              <section className="panel champions-player-pool compact-player-pool">
          <div className="player-pool-heading">
            <div>
              <p className="eyebrow">2025–26 actual statistics</p>
              <h2>Player Pool</h2>
            </div>
            <span>{filteredPlayers.length} players shown</span>
          </div>

          <div className="champions-draft-controls compact-draft-controls">
            <div className="search-box draft-search-box">
              <span>⌕</span>
              <input
                id="player-search"
                type="search"
                placeholder="Search players…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <label className="team-filter-select compact-select">
              <span>Position</span>
              <select value={position} onChange={(event) => setPosition(event.target.value)}>
                <option value="ALL">All positions</option>
                <option value="F">Forwards</option>
                <option value="D">Defence</option>
                <option value="G">Goalies</option>
              </select>
            </label>
            <label className="team-filter-select compact-select">
              <span>NHL team</span>
              <select value={nhlTeam} onChange={(event) => setNhlTeam(event.target.value)}>
                <option value="ALL">All teams</option>
                {teamOptions.map((teamCode) => (
                  <option key={teamCode} value={teamCode}>{teamCode}</option>
                ))}
              </select>
            </label>
            <div className="cap-follow-chip">
              <small>Cap remaining</small>
              <strong className={capRemaining < 0 ? "over" : ""}>{money(capRemaining)}</strong>
            </div>
          </div>

          {loadingPool ? <div className="empty-state">Loading NHL players, headshots and 2026–27 salaries…</div> : null}
          {!loadingPool && poolError ? <div className="empty-state error-state">{poolError}</div> : null}
          {!loadingPool && !poolError && filteredPlayers.length === 0 ? (
            <div className="empty-state">No players match that search.</div>
          ) : null}
          {!loadingPool && !poolError && filteredPlayers.length > 0 ? (
            <DraftTable
              players={filteredPlayers}
              roster={players}
              rosterLimits={rosterLimits}
              salaryCap={salaryCap}
              totalCap={totalCap}
              onDraft={addPlayer}
              onPreview={(player) => setPreviewPlayerId(player.playerId)}
              onHoverPreview={showHoverPreview}
              onHoverEnd={() => setHoverPreview(null)}
              previewPlayerId={previewPlayer?.playerId || null}
            />
          ) : null}
                <p className={`salary-data-note ${salaryData?.error ? "error-state" : ""}`}>{salaryNote}</p>
              </section>
            </>
          ) : activeDraftView === "ai" ? (
            <AiGeneratedTab
              poolPlayers={poolPlayers}
              roster={players}
              rosterLimits={rosterLimits}
              salaryCap={salaryCap}
              capRemaining={capRemaining}
              onDraft={addPlayer}
              onPreview={(player) => { setPreviewPlayerId(player.playerId); setActiveDraftView("pool"); }}
            />
          ) : team.slug === "nick" ? (
            <SalaryAdminPanel
              players={poolPlayers}
              salaryData={salaryData}
              onSalarySaved={applySalaryUpdate}
            />
          ) : null}
        </main>

        <aside className="draft-right-rail">
          <LineupCard
            players={players}
            onRemove={removePlayer}
            onPreview={(player) => setPreviewPlayerId(player.playerId)}
            salaryCap={salaryCap}
            totalCap={totalCap}
            capRemaining={capRemaining}
            totalFantasyPoints={totalFantasyPoints}
            rosterComplete={rosterComplete}
            scoring={scoring}
            goalieScoring={goalieScoring}
          />
        </aside>
      </div>

      <HoverProjectionCard hoverPreview={hoverPreview} />
    </div>
  );
}
