import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Header from "../components/Header";
import { fetchValueMatches } from "../lib/catalogApi";
import { adaptValueMatches } from "../lib/valueEngine";

export default function OddsComparisonPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchValueMatches()
      .then((d) => active && setRows(adaptValueMatches(d)))
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="font-display font-black uppercase tracking-tight text-3xl text-white mb-1">Odds Comparison</h1>
        <p className="text-zinc-500 text-sm mb-6">Best available bookmaker odds vs the Moka fair price.</p>
        {loading ? (
          <div className="h-64 bg-[#161b22] border border-[#30363d] rounded-xl animate-pulse" />
        ) : (
          <div className="overflow-x-auto border border-[#30363d] rounded-xl" data-testid="odds-table">
            <table className="w-full text-sm">
              <thead className="bg-[#161b22] text-zinc-500 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="text-left p-3">Match</th>
                  <th className="text-left p-3">League</th>
                  <th className="p-3">Pick</th>
                  <th className="p-3">Best Odds</th>
                  <th className="p-3">Bookmaker</th>
                  <th className="p-3">Moka%</th>
                  <th className="p-3">Market%</th>
                  <th className="p-3">Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ match, value }) => (
                  <tr key={match.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <td className="p-3">
                      <Link to={`/analysis/${match.id}`} className="text-white hover:text-[#39FF14] font-semibold">
                        {match.home && match.home.name} v {match.away && match.away.name}
                      </Link>
                    </td>
                    <td className="p-3 text-zinc-400">{match.leagueName}</td>
                    <td className="p-3 text-center text-zinc-300">{value.pickName}</td>
                    <td className="p-3 text-center text-white font-bold font-mono-num">{value.bestOdds}</td>
                    <td className="p-3 text-center text-zinc-300">{value.bookmaker}</td>
                    <td className="p-3 text-center text-[#39FF14]">{Math.round(value.mokaProb * 100)}%</td>
                    <td className="p-3 text-center text-zinc-300">{Math.round(value.bookProb * 100)}%</td>
                    <td className="p-3 text-center">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${value.level.cls}`}>
                        {value.level.emoji} {value.level.label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
