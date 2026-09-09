import { useEffect } from "react";
import { useLang } from "../contexts/LanguageContext";
import { DICT, PLACEHOLDERS } from "../lib/i18n";

// Blanket UI translator. When Greek is active it walks the DOM and swaps known
// English phrases for Greek, keeping in sync with React re-renders via a
// MutationObserver. Dynamic data (team names, numbers, odds) is never in the
// dictionary, so it stays untouched. Switching back restores the originals.
const ORIG = new Map(); // text node -> original English string
const PH_ORIG = new Map(); // element -> original placeholder

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"]);

function translateTextNode(node) {
  const raw = node.nodeValue;
  if (!raw) return;
  const key = raw.trim();
  if (!key) return;
  const val = DICT[key];
  if (val && val !== key) {
    if (!ORIG.has(node)) ORIG.set(node, raw);
    const next = raw.replace(key, val);
    if (node.nodeValue !== next) node.nodeValue = next;
  }
}

function translatePlaceholders() {
  document.querySelectorAll("[placeholder]").forEach((el) => {
    const cur = el.getAttribute("placeholder");
    const val = PLACEHOLDERS[cur];
    if (val && val !== cur) {
      if (!PH_ORIG.has(el)) PH_ORIG.set(el, cur);
      el.setAttribute("placeholder", val);
    }
  });
}

function sweep(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const p = n.parentNode;
      if (!p || SKIP_TAGS.has(p.nodeName)) return NodeFilter.FILTER_REJECT;
      if (p.closest && p.closest("[data-no-translate]")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(translateTextNode);
  translatePlaceholders();
}

function restore() {
  ORIG.forEach((raw, node) => { try { node.nodeValue = raw; } catch { /* gone */ } });
  ORIG.clear();
  PH_ORIG.forEach((raw, el) => { try { el.setAttribute("placeholder", raw); } catch { /* gone */ } });
  PH_ORIG.clear();
}

export default function AutoTranslate() {
  const { lang } = useLang();
  useEffect(() => {
    if (lang !== "el") { restore(); return; }
    let raf = null;
    const run = () => { raf = null; sweep(document.body); };
    const schedule = () => { if (raf == null) raf = requestAnimationFrame(run); };
    schedule();
    const obs = new MutationObserver(schedule);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { obs.disconnect(); if (raf != null) cancelAnimationFrame(raf); };
  }, [lang]);
  return null;
}
