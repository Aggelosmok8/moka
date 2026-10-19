import React, { useState } from "react";
import { X, Plus, Trash2, AlertTriangle, PenLine } from "lucide-react";
import { toast } from "sonner";
import { usePortfolio } from "../contexts/PortfolioContext";

const blank = () => ({ match: "", selection: "", odds: "" });

// Build a ticket from scratch — any teams, any market, even ones LION does not
// cover. Nothing here is matched to our data, so the user settles it by hand.
export default function CreateTicketModal({ open, onClose }) {
  const { addManualTicket } = usePortfolio();
  const [rows, setRows] = useState([blank(), blank()]);
  const [stake, setStake] = useState("10");

  if (!open) return null;

  const set = (i, k, v) => setRows((r) => r.map((row, j) => (j === i ? { ...row, [k]: v } : row)));
  const addRow = () => setRows((r) => [...r, blank()]);
  const dropRow = (i) => setRows((r) => (r.length > 1 ? r.filter((_, j) => j !== i) : r));

  const valid = rows.filter((r) => r.match.trim() && r.selection.trim() && Number(r.odds) > 1);
  const per = Number(stake) || 0;
  const potential = valid.reduce((s, r) => s + per * Number(r.odds), 0);

  const create = () => {
    if (!valid.length) { toast.error("Fill in at least one selection (match, pick and odds above 1.00)"); return; }
    if (per <= 0) { toast.error("Enter a stake greater than 0"); return; }
    addManualTicket(valid.map((r) => ({ home: r.match.trim(), away: "", pickName: r.selection.trim(), odds: Number(r.odds) })), per);
    toast.success(`Ticket created — ${valid.length} selection${valid.length > 1 ? "s" : ""}`, {
      description: "Mark each selection Won or Lost yourself once the result is out.",
    });
    setRows([blank(), blank()]);
    setStake("10");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose} data-testid="create-ticket-modal">
      <div className="w-full max-w-lg bg-[#161b22] border border-[#30363d] rounded-2xl p-5 my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Your own ticket</div>
            <h3 className="font-display font-black uppercase tracking-tight text-white text-xl leading-tight flex items-center gap-2">
              <PenLine className="w-5 h-5 text-[#39FF14]" /> Create a ticket
            </h3>
          </div>
          <button onClick={onClose} data-testid="create-ticket-close" className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex gap-2 items-start bg-[#FFD60A]/[0.07] border border-[#FFD60A]/30 rounded-lg p-3 mb-4">
          <AlertTriangle className="w-4 h-4 text-[#FFD60A] shrink-0 mt-0.5" />
          <p className="text-[11px] text-[#FFD60A]/90 leading-snug">
            Write anything you played — any team, any market, even ones LION does not cover.
            Because these are not matched to our data, <b>they will not settle automatically</b>:
            you mark each selection <b>Won</b> or <b>Lost</b> yourself once the result is out.
          </p>
        </div>

        <div className="space-y-2 mb-3">
          {rows.map((r, i) => (
            <div key={i} className="bg-[#0d1117] border border-[#30363d] rounded-lg p-2.5" data-testid={`create-ticket-row-${i}`}>
              <div className="flex items-center gap-2">
                <input value={r.match} onChange={(e) => set(i, "match", e.target.value)} placeholder="Match (e.g. Olympiacos - PAOK)"
                  data-testid={`create-ticket-match-${i}`}
                  className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-zinc-600 focus:outline-none" />
                <button onClick={() => dropRow(i)} data-testid={`create-ticket-drop-${i}`} className="text-zinc-600 hover:text-[#FF3B30] shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
                <input value={r.selection} onChange={(e) => set(i, "selection", e.target.value)} placeholder="Your pick (e.g. Over 2.5 goals)"
                  data-testid={`create-ticket-pick-${i}`}
                  className="flex-1 min-w-0 bg-transparent text-sm text-[#39FF14] font-semibold placeholder:text-zinc-600 placeholder:font-normal focus:outline-none" />
                <input type="number" min="1" step="0.01" value={r.odds} onChange={(e) => set(i, "odds", e.target.value)} placeholder="1.85"
                  data-testid={`create-ticket-odds-${i}`}
                  className="w-20 shrink-0 bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-right text-sm font-mono-num text-white focus:outline-none focus:border-[#39FF14]" />
              </div>
            </div>
          ))}
        </div>

        <button onClick={addRow} data-testid="create-ticket-add-row"
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-white/15 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-[#39FF14] hover:border-[#39FF14]/40 transition-colors">
          <Plus className="w-4 h-4" /> Add selection
        </button>

        <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mt-4">Stake per selection (€)</label>
        <input type="number" min="0" step="1" value={stake} onChange={(e) => setStake(e.target.value)} data-testid="create-ticket-stake"
          className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white font-mono-num focus:outline-none focus:border-[#39FF14]" />

        <div className="flex items-center justify-between mt-3 text-sm">
          <span className="text-zinc-400">Total stake ({valid.length} × €{per.toFixed(2)})</span>
          <span className="font-mono-num font-bold text-white">€{(per * valid.length).toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between mt-1 text-sm">
          <span className="text-zinc-400">Potential return (all win)</span>
          <span className="font-mono-num font-bold text-[#39FF14]">€{potential.toFixed(2)}</span>
        </div>

        <button onClick={create} data-testid="create-ticket-confirm"
          className="mt-4 w-full py-2.5 rounded-lg bg-[#39FF14] text-black font-black uppercase tracking-wider text-sm hover:brightness-110 transition">
          Create ticket
        </button>
      </div>
    </div>
  );
}
