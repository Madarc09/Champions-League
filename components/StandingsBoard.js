"use client";

import useLeagueStandings from "@/components/useLeagueStandings";

export default function StandingsBoard() {
  const { standings, loaded } = useLeagueStandings();

  return (
    <div className="table-wrap">
      <table className="standings-table fantasy-standings-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Team</th>
            <th>Fantasy Points <small>2026–27</small></th>
            <th>Dream Team <small>players / 20</small></th>
          </tr>
        </thead>
        <tbody>
          {standings.map((team) => (
            <tr key={team.slug}>
              <td><span className="rank-badge">{team.rank}</span></td>
              <td>
                <a className="team-link" href={`/team/${team.slug}/locker-room`}>
                  <span className="team-avatar">{team.name.slice(0, 1)}</span>
                  <span>
                    <strong>{team.name}</strong>
                    <small>Locked roster →</small>
                  </span>
                </a>
              </td>
              <td className="standings-fantasy-points">
                <strong>{loaded ? team.fantasyPoints.toFixed(1) : "—"}</strong>
                <small>FPTS</small>
              </td>
              <td className="standings-fantasy-points standings-projected-points">
                <strong>{loaded ? `${team.dreamTeamPlayers || 0}/20` : "—"}</strong>
                <small>DREAM</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
