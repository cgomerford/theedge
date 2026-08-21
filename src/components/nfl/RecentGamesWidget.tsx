// src/components/nfl/RecentGamesWidget.tsx
// Server component -- fetches directly from Supabase, no client-side fetch.
// Drop into the homepage or NFL sport hub. Follows brand rules: no betting
// language, leaders shown as plain stat lines (not "picks"), no Edge Score
// exposed (this widget doesn't touch scoring at all -- it's pure results).

import { getRecentNFLGames } from "@/lib/nfl/games";

export default async function RecentGamesWidget({
  limit = 6,
  seasonType = 1,
}: {
  limit?: number;
  seasonType?: number;
}) {
  const games = await getRecentNFLGames(limit, seasonType);

  if (games.length === 0) {
    // Empty state over thin/fabricated data, per brand rule
    return (
      <div className="nfl-recent-games nfl-recent-games--empty">
        <p>No completed NFL games yet.</p>
      </div>
    );
  }

  return (
    <section className="nfl-recent-games">
      <h2 className="nfl-recent-games__title">⊕ Recent NFL</h2>
      <ul className="nfl-recent-games__list">
        {games.map((game) => {
          const passLeader = game.leaders.find((l) => l.category === "passingYards");
          return (
            <li key={game.gameId} className="nfl-recent-games__item">
              <div className="nfl-recent-games__matchup">
                <span>{game.awayTeamAbbrev}</span>
                <span className="nfl-recent-games__score">
                  {game.awayScore}–{game.homeScore}
                </span>
                <span>{game.homeTeamAbbrev}</span>
              </div>
              {passLeader && (
                <p className="nfl-recent-games__leader">
                  {passLeader.athlete_name}: {passLeader.display_value}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <style>{`
        .nfl-recent-games {
          background: #FAF8F3;
          border: 1px solid #1A1A1A;
          padding: 1.5rem;
        }
        .nfl-recent-games__title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.5rem;
          color: #1A1A1A;
          margin-bottom: 1rem;
        }
        .nfl-recent-games__list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .nfl-recent-games__item {
          padding: 0.75rem 0;
          border-bottom: 1px solid #1A1A1A22;
        }
        .nfl-recent-games__matchup {
          font-family: 'JetBrains Mono', monospace;
          display: flex;
          gap: 0.75rem;
          align-items: baseline;
        }
        .nfl-recent-games__score {
          font-weight: 700;
          color: #FF5722;
        }
        .nfl-recent-games__leader {
          font-family: Fraunces, serif;
          font-size: 0.875rem;
          color: #1A1A1A99;
          margin: 0.25rem 0 0;
        }
        .nfl-recent-games--empty {
          padding: 1.5rem;
          font-family: Fraunces, serif;
          color: #1A1A1A99;
        }
        @media (max-width: 640px) {
          .nfl-recent-games__matchup { flex-wrap: wrap; }
        }
      `}</style>
    </section>
  );
}
