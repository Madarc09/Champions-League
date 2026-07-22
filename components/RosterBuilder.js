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
    return `${player.gamesPlayed} GP · ${player.saves || 0} SV · ${player.goalsAgainst || 0} GA · ${player.wins || 0} W`;
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
    default: return 0;
  }
}

function DraftTable({ players, roster, rosterLimits, salaryCap, totalCap, onDraft, onPreview, previewPlayerId }) {
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
                <td className="draft-stat-cell">{Number(player.goals || 0)}</td>
                <td className="draft-stat-cell">{Number(player.assists || 0)}</td>
                <td className="draft-stat-cell">{player.rosterType === "G" ? "—" : Number(player.shots || 0)}</td>
                <td className="draft-stat-cell">{player.rosterType === "G" ? "—" : Number(player.hits || 0)}</td>
                <td className="fantasy-points-cell">{actualFantasyPoints(player).toFixed(1)}</td>
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

function RosterStrip({ title, players, limit, slotLabel, onRemove, className = "" }) {
  return (
    <section className={`projected-roster-group ${className}`}>
      <h3>{title} <span>({players.length} / {limit})</span></h3>
      <div className="projected-roster-card-grid">
        {paddedSlots(players, limit).map((player, index) => (
          <div className={`projected-mini-card ${player ? "filled" : "empty"}`} key={player?.playerId || `${title}-${index}`}>
            {player ? (
              <button type="button" onClick={() => onRemove(player.playerId)} title={`Remove ${player.name}`}>
                <PlayerHeadshot player={player} className="projected-mini-headshot" alt="" />
                <strong title={player.name}>{player.name}</strong>
                <span><b>{player.rosterType}</b><em>{compactMoney(player.capHit)}</em></span>
                <small>{projectedFantasyPoints(player).toFixed(1)} PROJ</small>
              </button>
            ) : (
              <div className="projected-open-slot">
                <img src="/empty-slot-silhouette.svg" alt="" />
                <strong>Open spot</strong>
                <span>{slotLabel}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function LineupCard({
  players,
  onRemove,
  salaryCap,
  totalCap,
  capRemaining,
  totalFantasyPoints,
  rosterComplete
}) {
  const forwards = players.filter((player) => player.rosterType === "F");
  const defence = players.filter((player) => player.rosterType === "D");
  const goalies = players.filter((player) => player.rosterType === "G");

  return (
    <section className="panel champions-projected-roster">
      <header className="projected-roster-summary">
        <h2>Projected Roster</h2>
        <div><small>Cap limit</small><strong>{money(salaryCap)}</strong></div>
        <div><small>Cap used</small><strong className="summary-blue">{money(totalCap)}</strong></div>
        <div><small>Cap remaining</small><strong className={capRemaining < 0 ? "summary-red" : "summary-green"}>{money(capRemaining)}</strong></div>
        <div><small>Players rostered</small><strong>{players.length} / 20</strong></div>
        <div><small>Total team FPTS</small><strong>{totalFantasyPoints.toFixed(1)}</strong></div>
        <div><small>Roster status</small><strong className={rosterComplete && capRemaining >= 0 ? "summary-green" : "summary-gold"}>{rosterComplete && capRemaining >= 0 ? "LEGAL ✓" : "BUILDING"}</strong></div>
      </header>

      <RosterStrip title="Forwards" players={forwards} limit={12} slotLabel="F" onRemove={onRemove} className="forwards-strip" />

      <div className="projected-roster-lower-grid">
        <RosterStrip title="Defence" players={defence} limit={6} slotLabel="D" onRemove={onRemove} className="defence-strip" />
        <RosterStrip title="Goalies" players={goalies} limit={2} slotLabel="G" onRemove={onRemove} className="goalie-strip" />
      </div>
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

function ProjectedPerformancePanel({ player, players, onSelect, projectionData }) {
  const [projectionQuery, setProjectionQuery] = useState("");

  const searchResults = useMemo(() => {
    const normalized = projectionQuery.trim().toLowerCase();
    return [...players]
      .filter((item) => !normalized
        || String(item.name || "").toLowerCase().includes(normalized)
        || String(item.team || "").toLowerCase().includes(normalized))
      .sort((a, b) => projectedFantasyPoints(b) - projectedFantasyPoints(a))
      .slice(0, normalized ? 12 : 8);
  }, [players, projectionQuery]);

  const projection = player?.projection || null;
  const isGoalie = player?.rosterType === "G";

  return (
    <aside className="panel projected-performance-panel">
      <header>
        <div>
          <p className="eyebrow">Champions draft assistant</p>
          <h2>Projected Performance</h2>
        </div>
        <span className="projection-status">MODEL 2.0</span>
      </header>

      <div className="projection-finder">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={projectionQuery}
          onChange={(event) => setProjectionQuery(event.target.value)}
          placeholder="Search any player projection…"
          aria-label="Search every player projection"
        />
      </div>

      {player && projection ? (
        <article className={`hockey-projection-card ${isGoalie ? "goalie" : "skater"}`}>
          {player.teamLogo ? <img className="projection-card-watermark" src={player.teamLogo} alt="" /> : null}
          <div className="projection-card-topline">
            <span>{projection.season} projection</span>
            <strong>{projection.confidence} confidence</strong>
          </div>
          <div className="projection-player-hero">
            <PlayerHeadshot player={player} className="projection-card-headshot" alt="" />
            <div className="projection-player-copy">
              <small>{player.team || "NHL"} · {player.position || player.rosterType}</small>
              <h3>{player.name}</h3>
              <span>{compactMoney(player.capHit)} cap hit</span>
            </div>
            <div className="projection-fpts-badge projection-fpts-comparison">
              <span><small>LAST FPTS</small><strong>{actualFantasyPoints(player).toFixed(1)}</strong></span>
              <span><small>PROJ FPTS</small><strong>{projectedFantasyPoints(player).toFixed(1)}</strong></span>
              <b className={projectedFantasyPoints(player) >= actualFantasyPoints(player) ? "positive" : "negative"}>
                {projectedFantasyPoints(player) === actualFantasyPoints(player)
                  ? "±0.0"
                  : `${projectedFantasyPoints(player) > actualFantasyPoints(player) ? "+" : ""}${(projectedFantasyPoints(player) - actualFantasyPoints(player)).toFixed(1)}`}
              </b>
            </div>
          </div>

          <div className={`projection-stat-grid comparison-grid ${isGoalie ? "goalie-grid" : "skater-grid"}`}>
            <ProjectionComparisonStat label="GP" previous={player.gamesPlayed} projected={projectedStat(player, "gamesPlayed")} />
            {isGoalie ? (
              <>
                <ProjectionComparisonStat label="W" previous={player.wins} projected={projectedStat(player, "wins")} accent />
                <ProjectionComparisonStat label="SV" previous={player.saves} projected={projectedStat(player, "saves")} />
                <ProjectionComparisonStat label="GA" previous={player.goalsAgainst} projected={projectedStat(player, "goalsAgainst")} lowerIsBetter />
                <ProjectionComparisonStat label="G" previous={player.goals} projected={projectedStat(player, "goals")} />
                <ProjectionComparisonStat label="A" previous={player.assists} projected={projectedStat(player, "assists")} />
              </>
            ) : (
              <>
                <ProjectionComparisonStat label="G" previous={player.goals} projected={projectedStat(player, "goals")} accent />
                <ProjectionComparisonStat label="A" previous={player.assists} projected={projectedStat(player, "assists")} accent />
                <ProjectionComparisonStat label="HIT" previous={player.hits} projected={projectedStat(player, "hits")} />
                <ProjectionComparisonStat label="SOG" previous={player.shots} projected={projectedStat(player, "shots")} />
              </>
            )}
          </div>

          <div className="projection-reasoning">
            <strong>Why each category moved</strong>
            <ul>
              {projectionReasoning(player).map((reason, index) => <li key={`${player.playerId}-reason-${index}`}>{reason}</li>)}
            </ul>
          </div>

          <div className="projection-advanced-strip">
            {isGoalie ? (
              <>
                <span><small>xGA input</small><strong>{projection.advanced?.expectedGoalsAgainst ?? "—"}</strong></span>
                <span><small>GSAx input</small><strong>{projection.advanced?.goalsSavedAboveExpected ?? "—"}</strong></span>
                <span><small>Consensus rank</small><strong>{projection.consensusRank ?? "—"}</strong></span>
              </>
            ) : (
              <>
                <span><small>Talent xG</small><strong>{projection.advanced?.shootingTalentAdjustedXGoals ?? projection.advanced?.xGoals ?? "—"}</strong></span>
                <span><small>Line xGF/60</small><strong>{projection.context?.lineXGoalsForPer60 ?? "—"}</strong></span>
                <span><small>Team xGF/60</small><strong>{projection.context?.teamXGoalsForPer60 ?? "—"}</strong></span>
                <span><small>Consensus rank</small><strong>{projection.consensusRank ?? "—"}</strong></span>
              </>
            )}
          </div>

          <p className="projection-method-note">
            Model 2.0 is a category-by-category ensemble: three NHL seasons, three MoneyPuck seasons, role/linemate and team-coach environment, plus a small public-rank sanity check. Projected numbers never replace the actual FPTS shown in the draft table.
          </p>
        </article>
      ) : (
        <div className="performance-empty">Select a player name to open his projection card.</div>
      )}

      <div className="projection-search-results-heading">
        <span>{projectionQuery ? "Search results" : "Top projected players"}</span>
        <small>{searchResults.length} shown</small>
      </div>
      <div className="projection-search-results">
        {searchResults.map((item) => (
          <button
            type="button"
            key={item.playerId}
            className={player?.playerId === item.playerId ? "active" : ""}
            onClick={() => onSelect(item)}
          >
            <PlayerHeadshot player={item} className="projection-result-headshot" alt="" />
            <span>
              <strong>{item.name}</strong>
              <small>{item.team || "NHL"} · {item.rosterType} · {compactMoney(item.capHit)}</small>
            </span>
            <em>{projectedFantasyPoints(item).toFixed(1)}</em>
          </button>
        ))}
      </div>

      <footer className="projection-source-footer">
        <span>{projectionData?.warning ? "Advanced feed fallback active" : "Four-source ensemble active"}</span>
        <small>These are Champions League estimates, not official NHL projections.</small>
      </footer>
    </aside>
  );
}

export default function RosterBuilder({ team, salaryCap, rosterLimits, scoring, goalieScoring }) {
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("ALL");
  const [nhlTeam, setNhlTeam] = useState("ALL");
  const [previewPlayerId, setPreviewPlayerId] = useState(null);
  const [poolPlayers, setPoolPlayers] = useState([]);
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
  }, []);

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
          if (!response.ok) throw new Error(data.error || "The private roster could not be saved.");

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
    if (loadingPool) return "Loading the complete 2026–27 salary list before opening the draft table…";
    if (salaryData?.error) return `Salary refresh warning: ${salaryData.error}`;
    if (!salaryData?.recordCount) return "Salary data is unavailable right now.";

    const refreshed = salaryData.updatedAt
      ? new Date(salaryData.updatedAt).toLocaleString()
      : "recently";
    const failed = salaryData.failedTeamCount
      ? ` · ${salaryData.failedTeamCount} team page${salaryData.failedTeamCount === 1 ? "" : "s"} could not refresh`
      : "";
    const stale = salaryData.stale ? " · using the most recent saved snapshot" : "";
    return `2026–27 cap hits refreshed from CapSpace ${refreshed}${failed}${stale}. Players without a signed contract are marked unsigned.`;
  }, [loadingPool, salaryData]);

  return (
    <div className="draft-page-stack champions-draft-page">
      <LineupCard
        players={players}
        onRemove={removePlayer}
        salaryCap={salaryCap}
        totalCap={totalCap}
        capRemaining={capRemaining}
        totalFantasyPoints={totalFantasyPoints}
        rosterComplete={rosterComplete}
      />

      <div className="champions-draft-banner">
        <div className="draft-banner-status">
          <strong>Build your roster</strong>
          <span>Click DRAFT to add a player</span>
        </div>
        <div className="draft-banner-title">
          <span>NHL</span>
          <strong>DRAFT</strong>
          <small>CHAMPIONS LEAGUE · 2026–27</small>
        </div>
        <div className="draft-banner-rules">
          <span>Skaters: G {scoring.goals} · A {scoring.assists} · HIT {scoring.hits} · SOG {scoring.shots}</span>
          <span>Goalies: SV {goalieScoring.saves} · GA {goalieScoring.goalsAgainst} · W {goalieScoring.wins}</span>
        </div>
      </div>

      <div className="draft-workspace-grid">
        <section className="panel champions-player-pool">
          <div className="player-pool-heading">
            <div>
              <p className="eyebrow">2025–26 leaderboard</p>
              <h2>Player Pool</h2>
            </div>
            <span>{filteredPlayers.length} players shown</span>
          </div>

          <div className="champions-draft-controls">
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
              previewPlayerId={previewPlayer?.playerId || null}
            />
          ) : null}
          <p className={`salary-data-note ${salaryData?.error ? "error-state" : ""}`}>{salaryNote}</p>
        </section>

        <ProjectedPerformancePanel
          player={previewPlayer}
          players={poolPlayers}
          projectionData={projectionData}
          onSelect={(player) => setPreviewPlayerId(player.playerId)}
        />
      </div>
    </div>
  );
}
