import React from "react";
import { Globe } from "lucide-react";
import { useLang } from "../contexts/LanguageContext";

// EN / EL language switch. Default English; choice is persisted.
export default function LangToggle() {
  const { lang, setLang } = useLang();
  const next = lang === "el" ? "en" : "el";
  return (
    <button
      data-testid="lang-toggle"
      onClick={() => setLang(next)}
      title={lang === "el" ? "Switch to English" : "Αλλαγή σε Ελληνικά"}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold text-zinc-300 border border-white/10 hover:border-[#39FF14]/40 hover:text-[#39FF14] transition-colors"
    >
      <Globe className="w-4 h-4" />
      <span>{lang === "el" ? "ΕΛ" : "EN"}</span>
    </button>
  );
}
