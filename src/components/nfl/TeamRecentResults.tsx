// src/components/nfl/TeamRecentResults.tsx
// Server component for a single team's homepage. Pass the ESPN team id
// (string, e.g. "21" for Eagles) -- this is NOT the same as your internal
// team slug/abbrev, so make sure whatever maps team pages to ESPN ids is
// wired before using this.

import { getTeamNFLGames } from "@/lib/nfl/games";

export default async function TeamRecentResults({
  espnTeamId,
  limit = 5,
}: {
  espnTeamId: string;
  limit?: number;
}) {
  const games = await getTeamNFLGames(espnTeamId, limit);

  if (games.length === 0) {
    return (
      <div className="team-recent-results team-recent-results--empty">
        <p>No completed games yet this season.</p>
      </div>
    );
  }

  return (
    <section className="team-recent-results">
      <h3 className="team-recent-results__title">§ Recent Results</h3>
      <ul className="team-recent-results__list">
        {games.map((game) => {
          const isHome = game.homeTeamId === espnTeamId;
          const teamScore = isHome ? game.homeScore : game.awayScore;
          const oppScore = isHome ? game.awayScore : game.homeScore;
          const oppAbbrev = isHome ? game.awayTeamAbbrev : game.homeTeamAbbrev;
          const result = teamScore > oppScore ? "W" : teamScore < oppScore ? "L" : "T";

          return (
            <li key={game.gameId} className="team-recent-results__item">
              <span className={`team-recent-results__result team-recent-results__result--${result}`}>
                {result}
              </span>
              <span>
                {isHome ? "vs" : "@"} {oppAbbrev}
              </span>
              <span className="team-recent-results__score">
                {teamScore}–{oppScore}
              </span>
            </li>
          );
        })}
      </ul>

      <style>{`
        .team-recent-results {
          background: #FAF8F3;
          border: 1px solid #1A1A1A;
          padding: 1.25rem;
        }
        .team-recent-results__title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.25rem;
          color: #1A1A1A;
          margin-bottom: 0.75rem;
        }
        .team-recent-results__list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .team-recent-results__item {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          font-family: 'JetBrains Mono', monospace;
          padding: 0.5rem 0;
          border-bottom: 1px solid #1A1A1A22;
        }
        .team-recent-results__result {
          display: inline-block;
          width: 1.5rem;
          height: 1.5rem;
          text-align: center;
          line-height: 1.5rem;
          font-weight: 700;
          color: #FAF8F3;
        }
        .team-recent-results__result--W { background: #1A1A1A; }
        .team-recent-results__result--L { background: #FF5722; }
        .team-recent-results__result--T { background: #6B6355; }
        .team-recent-results__score {
          margin-left: auto;
          font-weight: 700;
        }
        .team-recent-results--empty {
          padding: 1.25rem;
          font-family: Fraunces, serif;
          color: #1A1A1A99;
        }
      `}</style>
    </section>
  );
}
