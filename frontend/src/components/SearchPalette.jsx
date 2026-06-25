import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "./ui/command";
import { fetchTeams, fetchTrendingMatches } from "../lib/api";
import { Users, Swords } from "lucide-react";

export const SearchPalette = ({ open, onOpenChange }) => {
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const loaded = useRef(false);

  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    Promise.all([fetchTeams(), fetchTrendingMatches()])
      .then(([t, m]) => {
        setTeams(t);
        setMatches(m);
      })
      .catch(() => {});
  }, [open]);

  const go = (path) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command className="bg-[#0E1110] border border-white/10">
        <CommandInput
          placeholder="Search teams or matches..."
          data-testid="search-input"
          className="text-white"
        />
        <CommandList className="max-h-[420px]">
          <CommandEmpty className="text-zinc-500 py-6 text-sm">No results.</CommandEmpty>

          {matches.length > 0 && (
            <CommandGroup heading="Trending Matches">
              {matches.slice(0, 8).map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.home.name} ${m.away.name} ${m.leagueName}`}
                  onSelect={() => go(`/match/${m.id}`)}
                  data-testid={`search-match-${m.id}`}
                  className="cursor-pointer"
                >
                  <Swords className="w-4 h-4 mr-2 text-[#39FF14]" />
                  <span className="flex-1 truncate">
                    {m.home.name} <span className="text-zinc-500">vs</span> {m.away.name}
                  </span>
                  <span className="ml-2 text-[10px] uppercase tracking-wider font-bold text-zinc-500">
                    {m.leagueName}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {teams.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Teams">
                {teams.slice(0, 60).map((t) => (
                  <CommandItem
                    key={t.id}
                    value={`${t.name} ${t.short} ${t.leagueName}`}
                    onSelect={() => go(`/team/${t.id}`)}
                    data-testid={`search-team-${t.id}`}
                    className="cursor-pointer"
                  >
                    <Users className="w-4 h-4 mr-2 text-zinc-500" />
                    {t.logoUrl ? (
                      <img src={t.logoUrl} alt="" className="w-4 h-4 mr-2 object-contain" />
                    ) : null}
                    <span className="flex-1 truncate">{t.name}</span>
                    <span className="ml-2 text-[10px] uppercase tracking-wider font-bold text-zinc-500">
                      {t.leagueName}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
};

export default SearchPalette;
