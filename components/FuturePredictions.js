"use client";

import { useEffect, useMemo, useState } from "react";
import { NHL_TEAMS_FALLBACK } from "@/data/nhl-teams";

const PLAYER_AWARDS = [
  { key: "artRoss", label: "Art Ross", note: "Leading scorer", filter: (player) => player.rosterType !== "G" },
  { key: "hart", label: "Hart", note: "Most valuable player", filter: () => true },
  { key: "rocket", label: "Rocket", note: "Leading goal scorer", filter: (player) => player.rosterType !== "G" },
  { key: "vezina", label: "Vezina", note: "Top goaltender", filter: (player) => player.rosterType === "G" },
  {
    key: "calder",
    label: "Calder",
    note: "Rookie of the year",
    filter: (player) => Boolean(player.rookie || player.draftYear || Number(player.gamesPlayed || 0) === 0)
  },
  { key: "norris", label: "Norris", note: "Top defenceman", filter: (player) => player.rosterType === "D" }
];

const TEAM_AWARDS = [
  { key: "stanleyCup", label: "Stanley Cup", note: "League champion", conference: null },
  { key: "eastChamp", label: "East Champion", note: "Eastern Conference winner", conference: "East" },
  { key: "westChamp", label: "West Champion", note: "Western Conference winner", conference: "West" },
  { key: "presidentsTrophy", label: "Presidents' Trophy", note: "Best regular-season team", conference: null }
];

const EMPTY_PREDICTIONS = {
  playerAwards: Object.fromEntries(PLAYER_AWARDS.map((award) => [award.key, null])),
  teamAwards: Object.fromEntries(TEAM_AWARDS.map((award) => [award.key, null]))
};

function localKey(teamSlug) {
  return `champions-league:predictions:${teamSlug}:2026-27`;
}

function readLocal(teamSlug) {
  try {
    const raw = window.localStorage.getItem(localKey(teamSlug));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function newerPrediction(shared, local) {
  if (!shared) return local;
  if (!local) return shared;
  const sharedTime = Date.parse(shared.updatedAt || 0) || 0;
  const localTime = Date.parse(local.updatedAt || 0) || 0;
  return localTime > sharedTime ? local : shared;
}

function normalizedPredictions(value) {
  return {
    playerAwards: { ...EMPTY_PREDICTIONS.playerAwards, ...(value?.playerAwards || {}) },
    teamAwards: { ...EMPTY_PREDICTIONS.teamAwards, ...(value?.teamAwards || {}) },
    updatedAt: value?.updatedAt || null
  };
}

function playerOptionLabel(player) {
  const position = player.rosterType === "G" ? "G" : player.rosterType === "D" ? "D" : "F";
  return `${player.name} — ${player.team || "NHL"} (${position})`;
}

function SelectedPlayer({ player }) {
  if (!player) {
    return (
      <div className="prediction-selected prediction-selected-empty">
        <img src="/empty-slot-silhouette.svg" alt="" />
        <div><strong>No prediction yet</strong><span>Select a player below</span></div>
      </div>
    );
  }

  return (
    <div className="prediction-selected">
      <img src={player.headshot || "/player-silhouette.svg"} alt="" />
      <div>
        <strong>{player.name}</strong>
        <span>{player.team || "NHL"} · {player.rosterType || player.position || "Player"}</span>
      </div>
      {player.teamLogo ? <img className="prediction-mini-logo" src={player.teamLogo} alt="" /> : null}
    </div>
  );
}

function SelectedTeam({ team }) {
  if (!team) {
    return (
      <div className="prediction-selected prediction-selected-empty team-prediction-selected">
        <div className="prediction-empty-shield">?</div>
        <div><strong>No team selected</strong><span>Choose an NHL club below</span></div>
      </div>
    );
  }

  return (
    <div className="prediction-selected team-prediction-selected">
      <img src={team.logo} alt="" />
      <div><strong>{team.name}</strong><span>{team.conference} · {team.division}</span></div>
    </div>
  );
}

export default function FuturePredictions({ team }) {
  const [players, setPlayers] = useState([]);
  const [nhlTeams, setNhlTeams] = useState(NHL_TEAMS_FALLBACK);
  const [predictions, setPredictions] = useState(EMPTY_PREDICTIONS);
  const [loading, setLoading] = useState(true);
  const [poolLoading, setPoolLoading] = useState(true);
  const [status, setStatus] = useState("Loading predictions…");
  const [persistence, setPersistence] = useState("private");

  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([
      fetch("/api/players?mode=predictions", { cache: "no-store" }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Player list could not be loaded.");
        return data.players || [];
      }),
      fetch("/api/nhl-teams", { cache: "no-store" }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "NHL teams could not be loaded.");
        return data.teams || NHL_TEAMS_FALLBACK;
      })
    ]).then(([playerResult, teamResult]) => {
      if (cancelled) return;
      if (playerResult.status === "fulfilled") setPlayers(playerResult.value);
      else setStatus(playerResult.reason?.message || "The player list could not be loaded.");
      if (teamResult.status === "fulfilled" && teamResult.value.length) setNhlTeams(teamResult.value);
      setPoolLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPredictions() {
      const legacyLocal = readLocal(team.slug);

      try {
        const response = await fetch(`/api/predictions/${team.slug}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "The private predictions could not be loaded.");
        if (cancelled) return;

        if (data.predictions) {
          setPredictions(normalizedPredictions(data.predictions));
          setPersistence("private");
          window.localStorage.removeItem(localKey(team.slug));
          setStatus(`Private predictions loaded · ${new Date(data.predictions.updatedAt).toLocaleString()}`);
        } else if (legacyLocal) {
          const legacyPredictions = normalizedPredictions(legacyLocal);
          setPredictions(legacyPredictions);
          setStatus("Moving the predictions previously saved in this browser into your private account…");

          const migrateResponse = await fetch(`/api/predictions/${team.slug}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(legacyPredictions)
          });
          const migrateData = await migrateResponse.json();
          if (!migrateResponse.ok) throw new Error(migrateData.error || "The old browser predictions could not be moved to Upstash.");
          if (cancelled) return;

          setPredictions(normalizedPredictions(migrateData.predictions));
          setPersistence("private");
          window.localStorage.removeItem(localKey(team.slug));
          setStatus(`Predictions moved into your private account · ${new Date(migrateData.predictions.updatedAt).toLocaleString()}`);
        } else {
          setPredictions(normalizedPredictions(null));
          setPersistence("private");
          setStatus("No private predictions saved yet. Make selections and save when ready.");
        }
      } catch (error) {
        if (cancelled) return;
        if (legacyLocal) {
          setPredictions(normalizedPredictions(legacyLocal));
          setStatus(`${error.message} Your older browser copy is still available on this device and has not been deleted.`);
        } else {
          setStatus(error.message || "The private predictions could not be loaded.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPredictions();
    return () => { cancelled = true; };
  }, [team.slug]);

  const sortedPlayers = useMemo(() => (
    [...players].sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base" }))
  ), [players]);

  const sortedTeams = useMemo(() => (
    [...nhlTeams].sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base" }))
  ), [nhlTeams]);

  function choosePlayer(awardKey, playerId) {
    const player = sortedPlayers.find((item) => String(item.playerId) === String(playerId)) || null;
    setPredictions((current) => ({
      ...current,
      playerAwards: { ...current.playerAwards, [awardKey]: player }
    }));
  }

  function chooseTeam(awardKey, abbrev) {
    const selected = sortedTeams.find((item) => item.abbrev === abbrev) || null;
    setPredictions((current) => ({
      ...current,
      teamAwards: { ...current.teamAwards, [awardKey]: selected }
    }));
  }

  async function savePredictions() {
    const snapshot = {
      team: team.slug,
      playerAwards: predictions.playerAwards,
      teamAwards: predictions.teamAwards,
      updatedAt: new Date().toISOString()
    };
    setStatus("Saving privately to your account…");

    try {
      const response = await fetch(`/api/predictions/${team.slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot)
      });
      const data = await response.json();
      if (!response.ok) {
        setStatus(data.error || "The private predictions could not be saved.");
        return;
      }
      setPredictions(normalizedPredictions(data.predictions));
      setPersistence("private");
      window.localStorage.removeItem(localKey(team.slug));
      setStatus(`Private predictions saved · ${new Date(data.predictions.updatedAt).toLocaleString()}`);
    } catch {
      setStatus("The private predictions could not be saved. Check the Upstash connection and try again.");
    }
  }

  const pickedCount = [
    ...Object.values(predictions.playerAwards),
    ...Object.values(predictions.teamAwards)
  ].filter(Boolean).length;

  return (
    <section className="prediction-room" aria-label={`${team.name}'s future predictions`}>
      <header className="prediction-room-header">
        <div>
          <p className="eyebrow">2026–27 forecast</p>
          <h1>{team.name}&apos;s Future Predictions</h1>
          <p>Choose award winners and team outcomes. Every selection remains editable until the prediction deadline is added.</p>
        </div>
        <div className="prediction-progress">
          <strong>{pickedCount}/10</strong>
          <span>predictions made</span>
        </div>
      </header>

      <div className="prediction-stage">
        <section className="prediction-column prediction-team-column">
          <header>
            <span>Left side</span>
            <h2>Team Predictions</h2>
          </header>
          <div className="prediction-choice-list">
            {TEAM_AWARDS.map((award) => {
              const options = award.conference
                ? sortedTeams.filter((club) => club.conference === award.conference)
                : sortedTeams;
              const selected = predictions.teamAwards[award.key];

              return (
                <article className="prediction-choice" key={award.key}>
                  <div className="prediction-choice-title">
                    <div><h3>{award.label}</h3><p>{award.note}</p></div>
                    {award.conference ? <span>{award.conference}</span> : null}
                  </div>
                  <SelectedTeam team={selected} />
                  <label>
                    <span>Select NHL team</span>
                    <select value={selected?.abbrev || ""} onChange={(event) => chooseTeam(award.key, event.target.value)}>
                      <option value="">Choose a team…</option>
                      {options.map((club) => (
                        <option key={club.abbrev} value={club.abbrev}>{club.name}</option>
                      ))}
                    </select>
                  </label>
                </article>
              );
            })}
          </div>
        </section>

        <div className="prediction-centre-mark" aria-hidden="true">
          <img src="/champions-league-logo.png" alt="" />
          <strong>Call Your Shot</strong>
          <span>Selections can be changed until the deadline</span>
        </div>

        <section className="prediction-column prediction-player-column">
          <header>
            <span>Right side</span>
            <h2>Player Predictions</h2>
          </header>
          <div className="prediction-choice-list prediction-player-grid">
            {PLAYER_AWARDS.map((award) => {
              const options = sortedPlayers.filter(award.filter);
              const selected = predictions.playerAwards[award.key];

              return (
                <article className="prediction-choice" key={award.key}>
                  <div className="prediction-choice-title">
                    <div><h3>{award.label}</h3><p>{award.note}</p></div>
                  </div>
                  <SelectedPlayer player={selected} />
                  <label>
                    <span>Select NHL player</span>
                    <select
                      value={selected?.playerId || ""}
                      onChange={(event) => choosePlayer(award.key, event.target.value)}
                      disabled={poolLoading}
                    >
                      <option value="">{poolLoading ? "Loading players…" : "Choose a player…"}</option>
                      {options.map((player) => (
                        <option key={player.playerId} value={player.playerId}>{playerOptionLabel(player)}</option>
                      ))}
                    </select>
                  </label>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <footer className="prediction-save-bar">
        <div>
          <strong>{persistence === "private" ? "Private Upstash predictions" : "Predictions unavailable"}</strong>
          <span>{status}</span>
        </div>
        <button className="primary-button" type="button" onClick={savePredictions} disabled={loading || poolLoading}>
          Save predictions
        </button>
      </footer>
    </section>
  );
}
