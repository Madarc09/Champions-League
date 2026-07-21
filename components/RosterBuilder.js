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
    case "fantasyPoints": return Number(player.fantasyPoints || 0);
    default: return 0;
  }
}

function DraftTable({ players, roster, rosterLimits, salaryCap, totalCap, onDraft }) {
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

      if (leftMissing && rightMissing) return Number(b.fantasyPoints || 0) - Number(a.fantasyPoints || 0);
      if (leftMissing) return 1;
      if (rightMissing) return -1;

      if (typeof left === "string" || typeof right === "string") {
        const result = String(left).localeCompare(String(right), "en", { sensitivity: "base" });
        return result === 0
          ? Number(b.fantasyPoints || 0) - Number(a.fantasyPoints || 0)
          : result * direction;
      }

      const result = Number(left) - Number(right);
      return result === 0
        ? Number(b.fantasyPoints || 0) - Number(a.fantasyPoints || 0)
        : result * direction;
    });
  }, [players, sort]);

  function changeSort(column) {
    setSort((current) => ({
      column,
      direction: current.column === column && current.direction === "desc" ? "asc" : "desc"
    }));
  }

  function disabledReason(player) {
    if (roster.some((item) => item.playerId === player.playerId)) return "Already on roster";
    if (player.capHit == null) return "No 2026–27 contract";
    if (counts[player.rosterType] >= rosterLimits[player.rosterType]) return "Position full";
    if (totalCap + Number(player.capHit) > salaryCap) return "Would exceed cap";
    return "";
  }

  return (
    <div className="draft-table-scroll">
      <table className="draft-table compact-draft-table headshot-draft-table">
        <thead>
          <tr>
            <th className="photo-heading"><span className="visually-hidden">Player photo</span></th>
            <th className="player-sort-heading" aria-sort={sort.column === "name" || sort.column === "salary" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
              <SortButton label="Player" column="name" sort={sort} onSort={changeSort} />
            </th>
            <th aria-sort={sort.column === "position" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
              <SortButton label="Pos" column="position" sort={sort} onSort={changeSort} />
            </th>
            <th aria-sort={sort.column === "goals" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
              <SortButton label="Goals" column="goals" sort={sort} onSort={changeSort} />
            </th>
            <th aria-sort={sort.column === "assists" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
              <SortButton label="Assists" column="assists" sort={sort} onSort={changeSort} />
            </th>
            <th aria-sort={sort.column === "hits" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
              <SortButton label="Hits" column="hits" sort={sort} onSort={changeSort} />
            </th>
            <th aria-sort={sort.column === "shots" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
              <SortButton label="SOG" column="shots" sort={sort} onSort={changeSort} />
            </th>
            <th aria-sort={sort.column === "fantasyPoints" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
              <SortButton label="FPTS" column="fantasyPoints" sort={sort} onSort={changeSort} />
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedPlayers.map((player) => {
            const reason = disabledReason(player);
            const drafted = reason === "Already on roster";

            return (
              <tr key={player.playerId} className={drafted ? "drafted-row" : ""}>
                <td className="draft-headshot-cell">
                  <PlayerHeadshot player={player} className="draft-player-headshot" />
                </td>
                <td className="draft-player-cell">
                  <button
                    className="draft-player-button"
                    type="button"
                    onClick={() => onDraft(player)}
                    disabled={Boolean(reason)}
                    title={reason || `Draft ${player.name}`}
                  >
                    {player.name}
                  </button>
                  <span className={`draft-player-salary ${player.capHit == null ? "salary-unsigned" : ""}`}>
                    {money(player.capHit)}
                  </span>
                  <span className="draft-team-line">
                    {player.teamLogo ? (
                      <img
                        className="draft-team-logo"
                        src={player.teamLogo}
                        alt=""
                        loading="lazy"
                        onError={(event) => { event.currentTarget.style.display = "none"; }}
                      />
                    ) : null}
                    <strong>{player.team || "NHL"}</strong>
                    <small>{playerMeta(player)}</small>
                  </span>
                  {reason ? <small className="draft-player-warning">{reason}</small> : null}
                </td>
                <td>
                  <span className={`position-chip position-${player.rosterType.toLowerCase()}`}>
                    {player.rosterType}
                  </span>
                </td>
                <td className="stat-number">{player.goals || 0}</td>
                <td className="stat-number">{player.assists || 0}</td>
                <td className="stat-number">{player.rosterType === "G" ? "—" : player.hits || 0}</td>
                <td className="stat-number">{player.rosterType === "G" ? "—" : player.shots || 0}</td>
                <td className="fantasy-points-cell">
                  {player.fantasyPoints == null ? "—" : Number(player.fantasyPoints).toFixed(1)}
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
          <PlayerHeadshot player={player} className="lineup-player-headshot" alt="" />
          <span className="lineup-player-quick-stats">
            <strong>{compactMoney(player.capHit)}</strong>
            <span>{Number(player.fantasyPoints || 0).toFixed(1)} FPTS</span>
          </span>
        </button>
      ) : (
        <div className="empty-lineup-face" aria-label="Open roster slot">
          <img src={FALLBACK_HEADSHOT} alt="" />
          <span>Open</span>
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

function LineupCard({ players, onRemove, salaryCap, totalCap, capRemaining }) {
  const forwards = players.filter((player) => player.rosterType === "F");
  const defence = players.filter((player) => player.rosterType === "D");
  const goalies = players.filter((player) => player.rosterType === "G");

  return (
    <div className="panel lineup-board">
      <div className="lineup-board-header">
        <div>
          <p className="eyebrow">Daily lineup card</p>
          <h2>Projected roster</h2>
          <small>Click a player&apos;s face to remove him.</small>
        </div>
        <div className={`lineup-cap-summary ${capRemaining < 0 ? "over" : ""}`}>
          <small>Cap remaining</small>
          <strong>{money(capRemaining)}</strong>
          <span>{money(totalCap)} used · {players.length}/20</span>
          <span>{money(salaryCap)} limit</span>
        </div>
      </div>

      <section className="lineup-group">
        <h3>Forwards</h3>
        {[0, 1, 2, 3].map((line) => (
          <ForwardLine
            key={line}
            number={line + 1}
            players={forwards.slice(line * 3, line * 3 + 3)}
            onRemove={onRemove}
          />
        ))}
      </section>

      <section className="lineup-group">
        <h3>Defence</h3>
        {[0, 1, 2].map((pair) => (
          <DefencePair
            key={pair}
            number={pair + 1}
            players={defence.slice(pair * 2, pair * 2 + 2)}
            onRemove={onRemove}
          />
        ))}
      </section>

      <section className="lineup-group goalie-group">
        <h3>Goalies</h3>
        <div className="lineup-row-cards two-up">
          <LineupPlayerCard player={goalies[0] || null} onRemove={onRemove} />
          <LineupPlayerCard player={goalies[1] || null} onRemove={onRemove} />
        </div>
      </section>
    </div>
  );
}

export default function RosterBuilder({ team, salaryCap, rosterLimits, scoring, goalieScoring }) {
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("ALL");
  const [nhlTeam, setNhlTeam] = useState("ALL");
  const [poolPlayers, setPoolPlayers] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loadingPool, setLoadingPool] = useState(true);
  const [poolError, setPoolError] = useState("");
  const [salaryData, setSalaryData] = useState(null);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [saveStatus, setSaveStatus] = useState("Loading roster…");
  const [persistence, setPersistence] = useState("private");
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
          setPersistence("private");
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
          setPersistence("private");
          window.localStorage.removeItem(localRosterKey(team.slug));
          window.dispatchEvent(new CustomEvent("champions-league:roster-updated", { detail: { team: team.slug } }));
          setSaveStatus(`Roster moved into your private account · ${new Date(migrateData.roster.updatedAt).toLocaleString()}`);
        } else {
          setPlayers([]);
          lastSavedRosterRef.current = JSON.stringify([]);
          remoteUpdatedAtRef.current = 0;
          setPersistence("private");
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
  const totalFantasyPoints = players.reduce((sum, player) => sum + Number(player.fantasyPoints || 0), 0);

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
          setPersistence("private");
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
    <>
      <div className="panel cap-dashboard">
        <div className="cap-main">
          <div>
            <p className="eyebrow">Salary cap</p>
            <strong>{money(totalCap)}</strong>
            <span>of {money(salaryCap)}</span>
          </div>
          <div className={capRemaining < 0 ? "cap-remaining over" : "cap-remaining"}>
            <small>Remaining</small>
            <strong>{money(capRemaining)}</strong>
          </div>
        </div>
        <div className="cap-track" aria-label={`${Math.max(0, Math.min(100, totalCap / salaryCap * 100)).toFixed(1)} percent of cap used`}>
          <span style={{ width: `${Math.max(0, Math.min(100, totalCap / salaryCap * 100))}%` }} />
        </div>
        <div className="dashboard-stats">
          <span><strong>{players.length}/20</strong> rostered</span>
          <span><strong>{totalFantasyPoints.toFixed(1)}</strong> 2025–26 FP</span>
          <span><strong>{persistence === "private" ? "Private Upstash" : "Unavailable"}</strong> storage</span>
          <span className={rosterComplete ? "legal-status complete" : "legal-status"}>
            <strong>{rosterComplete && capRemaining >= 0 ? "Legal" : "Building"}</strong> roster status
          </span>
        </div>
        <div className="save-row auto-save-row">
          <p>{loadingRoster ? "Loading…" : saveStatus}</p>
          <span className="auto-save-badge">Auto-save · cross-device sync</span>
        </div>
      </div>

      <div className="builder-grid draft-builder-grid">
        <section className="panel draft-room-panel">
          <div className="draft-room-heading">
            <div>
              <p className="eyebrow">2025–26 player leaderboard</p>
              <h2>Draft room</h2>
              <p>Click a player&apos;s name to add him. NHL headshots and current teams appear directly on the board, and every stat column can be sorted.</p>
            </div>
            <div className="scoring-badge scoring-badge-wide">
              <strong>Skaters</strong>
              <span>G {scoring.goals} · A {scoring.assists} · HIT {scoring.hits} · SOG {scoring.shots}</span>
              <strong>Goalies</strong>
              <span>SV {goalieScoring.saves} · GA {goalieScoring.goalsAgainst} · W {goalieScoring.wins} · G {goalieScoring.goals} · A {goalieScoring.assists}</span>
            </div>
          </div>

          <div className="draft-controls">
            <div className="search-box draft-search-box">
              <span>⌕</span>
              <input
                id="player-search"
                type="search"
                placeholder="Search McDavid, Makar, TOR…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="draft-filter-group">
              <div className="filter-tabs draft-filter-tabs" role="group" aria-label="Position filter">
                {[["ALL", "All"], ["F", "Forwards"], ["D", "Defence"], ["G", "Goalies"]].map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={position === value ? "active" : ""}
                    onClick={() => setPosition(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="team-filter-select">
                <span>NHL team</span>
                <select value={nhlTeam} onChange={(event) => setNhlTeam(event.target.value)}>
                  <option value="ALL">All teams</option>
                  {teamOptions.map((teamCode) => (
                    <option key={teamCode} value={teamCode}>{teamCode}</option>
                  ))}
                </select>
              </label>
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
            />
          ) : null}
          <p className={`salary-data-note ${salaryData?.error ? "error-state" : ""}`}>{salaryNote}</p>
        </section>

        <LineupCard
          players={players}
          onRemove={removePlayer}
          salaryCap={salaryCap}
          totalCap={totalCap}
          capRemaining={capRemaining}
        />
      </div>
    </>
  );
}
