import React, { useEffect, useState } from "react";
import { FileText, Download, Loader2 } from "lucide-react";
import { authApi } from "../contexts/AuthContext";

const TYPE = { "11.2": "Receipt", "2.1": "Invoice", "5.1": "Credit note" };

export const InvoicesCard = () => {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    authApi.get("/invoices").then((r) => setRows(r.data.invoices || [])).catch(() => setRows([]));
  }, []);

  const open = async (inv) => {
    try {
      const r = await authApi.get(`/invoices/${inv.id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      /* ignore — the list stays usable */
    }
  };

  if (rows !== null && !rows.length) return null;

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 mt-4" data-testid="invoices-card">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-4 h-4 text-[#39FF14]" />
        <h2 className="font-display font-black uppercase tracking-tight text-white text-lg">Receipts & invoices</h2>
      </div>
      {rows === null ? (
        <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
      ) : (
        <div className="divide-y divide-white/5">
          {rows.map((inv) => (
            <button key={inv.id} onClick={() => open(inv)} data-testid={`invoice-${inv.number}`}
              className="w-full flex items-center justify-between gap-3 py-2.5 text-left hover:text-[#39FF14] transition-colors">
              <span className="min-w-0">
                <span className="block text-sm text-white font-semibold">{inv.series}-{inv.number}</span>
                <span className="block text-[11px] text-zinc-500">
                  {TYPE[inv.doc_type] || inv.doc_type} · {new Date(inv.issued_at).toLocaleDateString()}
                  {inv.mark ? ` · ΜΑΡΚ ${inv.mark}` : ""}
                </span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="font-mono-num text-sm text-white">€{Number(inv.total).toFixed(2)}</span>
                <Download className="w-4 h-4 opacity-70" />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default InvoicesCard;
