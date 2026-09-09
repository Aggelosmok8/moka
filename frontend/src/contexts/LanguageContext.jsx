import React, { createContext, useContext, useEffect, useState } from "react";
import { getLang, setLang as setLangGlobal, onLang } from "../lib/i18n";

const Ctx = createContext({ lang: "en", setLang: () => {} });

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(getLang());
  useEffect(() => onLang((l) => setLangState(l)), []);
  const setLang = (l) => setLangGlobal(l);
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);
