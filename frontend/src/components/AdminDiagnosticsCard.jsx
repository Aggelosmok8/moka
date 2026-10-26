import React, { useState } from "react";
import { authApi } from "../contexts/AuthContext";
import { Stethoscope, Loader2 } from "lucide-react";

// Admin-only. Surfaces the exact provider errors (Stripe prices, myDATA, email)
// that otherwise only exist in the production logs.
const CHECKS = [
  { id: "prices", label: "Stripe prices", run: () => authApi.get("/billing/admin/price-check") },
  { id: "mydata", label: "myDATA connection", run: () => authApi.get("/invoices/admin/mydata-check") },
  { id: "failed", label: "Retry documents / get ΜΑΡΚ", run: () => authApi.get("/invoices/admin/failed") },
  { id: "email", label: "Send test email", run: () => authApi.post("/invoices/admin/email-test", {}) },
  { id: "backup", label: "Download data backup", run: () => authApi.get("/admin/backup"), download: "backup" },
];

export default function AdminDiagnosticsCard() {
  const [busy, setBusy] = useState("");
  const [out, setOut] = useState(null);

  const run = async (c) => {
    setBusy(c.id);
    setOut(null);
    try {
      const r = await c.run();
      if (c.download) {
        const url = URL.createObjectURL(new Blob([JSON.stringify(r.data)], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `lionstats-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        setOut({ title: c.label, data: {
          saved: a.download,
          users: r.data.users_count, portfolios: r.data.user_portfolios_count, invoices: r.data.invoices_count,
        } });
      } else {
        setOut({ title: c.label, data: r.data });
      }
    } catch (e) {
      setOut({ title: c.label, data: e?.response?.data || { error: String(e) } });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 mt-4" data-testid="admin-diagnostics-card">
      <div className="flex items-center gap-2 mb-1">
        <Stethoscope className="w-4 h-4 text-[#39FF14]" />
        <h2 className="text-white font-bold">Diagnostics</h2>
      </div>
      <p className="text-zinc-500 text-sm mb-4">Admin only — checks the live configuration and shows the provider's own error.</p>
      <div className="flex flex-wrap gap-2">
        {CHECKS.map((c) => (
          <button key={c.id} onClick={() => run(c)} disabled={!!busy}
            data-testid={`diag-${c.id}-btn`}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-200 hover:text-[#39FF14] border border-white/10 rounded-md px-3 py-1.5 disabled:opacity-50 transition-colors">
            {busy === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}{c.label}
          </button>
        ))}
      </div>
      {out && (
        <pre className="mt-4 max-h-80 overflow-auto rounded-lg bg-black/50 border border-white/10 p-3 text-[11px] leading-relaxed text-zinc-300 whitespace-pre-wrap break-all"
          data-testid="diag-output">{`${out.title}\n${JSON.stringify(out.data, null, 2)}`}</pre>
      )}
    </div>
  );
}
