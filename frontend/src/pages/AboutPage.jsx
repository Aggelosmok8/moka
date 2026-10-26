import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ShieldCheck, BarChart3, Target, Wallet, Eye, Newspaper, Scale, Languages,
  ExternalLink, Sparkles, ArrowRight, AlertTriangle, Users, RefreshCw, PenLine,
} from "lucide-react";
import Header from "../components/Header";
import { useLang } from "../contexts/LanguageContext";
import { bookmakerUrl } from "../lib/bookmakers";

const BOOKS = ["Stoiximan", "Novibet", "bwin", "Pame Stoixima", "Elabet", "bet365", "Superbet"];

const COPY = {
  en: {
    kicker: "About us",
    title: "We are not a bookmaker.",
    titleAccent: "We are your statistics desk.",
    lead: "LION.STATS takes no bets, holds no money and promises no certain winnings. "
      + "We are a new, independent team with one job: to put every piece of information you need in "
      + "front of you before you place a bet — so the decision is yours, and it is an informed one.",
    disclaimerTop: "No scam, no betting shop, no \"sure tips\". Just statistics, clearly presented.",
    sections: [
      {
        icon: BarChart3,
        title: "Everything you need, in one place",
        body: "News, team statistics, player statistics, head-to-head team compare and a full analysis of "
          + "each match built on the numbers — form, goals, expected goals, defence, discipline, home and "
          + "away splits. You read the match before you bet on it.",
      },
      {
        icon: Target,
        title: "The best price for every possible outcome",
        body: "For each outcome we scan the Greek-licensed bookmakers and show you the highest available "
          + "price, with the bookmaker's name on it. Same bet, more profit — that is the whole point. "
          + "You then place it at that bookmaker yourself: we only point at the best price, we never take "
          + "your stake.",
      },
      {
        icon: Sparkles,
        title: "Specific Bets",
        body: "Beyond 1X2 we calculate dozens of markets per match — both teams to score, goals over/under, "
          + "correct score, cards, corners, fouls, offsides, saves, shots, team goals, double chance, "
          + "handicap, first half and player markets. Each line shows LION's probability next to the best "
          + "available price, so you can see where the value is. Picks you like go to your slip, and you "
          + "place them at the bookmaker shown.",
      },
      {
        icon: Wallet,
        title: "Your portfolio — play under control",
        body: "Every bet you place can live in LION.STATS. Add a pick to your slip with the odds you "
          + "actually got, or create your own ticket from scratch for anything we don't cover. "
          + "Press Refresh results and your tickets settle against real scores, feeding your win rate, "
          + "profit/loss and performance graph. Knowing exactly where you stand is the first step to "
          + "betting responsibly.",
      },
      {
        icon: Eye,
        title: "Watchlist",
        body: "Spotted a match for later? Save it to your watchlist and come back to it when the lineups "
          + "and the prices are out.",
      },
    ],
    plansTitle: "What each account can see",
    free: {
      title: "Free",
      items: [
        "All leagues except the big competitions (Premier League, Champions / Europa / Conference League — there you see the fixture and the date)",
        "Full match analysis for every available match",
        "One Specific Bets category: Both Teams To Score",
        "All player statistics, team statistics and team compare",
        "Up to 10 tickets kept in history, stats and graph",
        "Watchlist and football news",
      ],
    },
    pro: {
      title: "Pro",
      items: [
        "Every league AND the big competitions",
        "Full analysis + every Specific Bets category",
        "Best odds proposal on every outcome",
        "LION Tickets — ready-built tickets at the best available odds",
        "Full tickets history, stats and performance graph",
        "Full player and team statistics, unlimited compare, news, watchlist",
      ],
    },
    responsibleTitle: "Play responsibly",
    responsible: [
      "Bet only what you can afford to lose. A statistic is not a guarantee.",
      "Set your limit before you start, not after a loss.",
      "Never chase losses — the next bet does not owe you the previous one.",
      "Use your portfolio honestly: the numbers only help you if they are true.",
      "21+. If betting stops being fun, take a break or ask for help (KETHEA: 210 9237777).",
    ],
    legalTitle: "What we do and what we don't",
    legal: "LION.STATS performs statistical analysis and produces outcome predictions based on team and "
      + "player data. We do not know the future, we do not sell certainties and no result is guaranteed. "
      + "Our aim is for you to bet thoughtfully and with information, not at random. Odds change constantly "
      + "at the bookmakers — always confirm the price before you place your bet.",
    booksTitle: "The bookmakers we read prices from",
    booksBody: "These are the Greek-licensed operators whose prices appear in LION.STATS. You need an "
      + "account with them to place the bet we point you to — open one directly:",
    booksNote: "We are not affiliated with these companies and we do not receive your stake. Every link "
      + "goes to their official Greek site.",
    cta: "Start with today's matches",
  },
  el: {
    kicker: "Σχετικά με εμάς",
    title: "Δεν είμαστε στοιχηματική.",
    titleAccent: "Είμαστε το στατιστικό σου γραφείο.",
    lead: "Το LION.STATS δεν δέχεται στοιχήματα, δεν κρατάει χρήματα και δεν υπόσχεται σίγουρα κέρδη. "
      + "Είμαστε μια νέα, ανεξάρτητη ομάδα με έναν σκοπό: να έχεις μπροστά σου κάθε πληροφορία που "
      + "χρειάζεσαι πριν παίξεις — ώστε η απόφαση να είναι δική σου και να είναι ενημερωμένη.",
    disclaimerTop: "Καμία απάτη, κανένα πρακτορείο, κανένα «σίγουρο tip». Μόνο στατιστικά, καθαρά.",
    sections: [
      {
        icon: BarChart3,
        title: "Όλα όσα χρειάζεσαι, σε ένα σημείο",
        body: "Ειδήσεις, στατιστικά ομάδων, στατιστικά παικτών, σύγκριση ομάδων και πλήρης ανάλυση κάθε "
          + "αγώνα βασισμένη στα νούμερα — φόρμα, γκολ, αναμενόμενα γκολ, άμυνα, πειθαρχία, εντός και εκτός "
          + "έδρας. Διαβάζεις τον αγώνα πριν τον παίξεις.",
      },
      {
        icon: Target,
        title: "Η καλύτερη απόδοση για κάθε πιθανό αποτέλεσμα",
        body: "Για κάθε πιθανό αποτέλεσμα σαρώνουμε τις αδειοδοτημένες στην Ελλάδα στοιχηματικές και σου "
          + "δείχνουμε την υψηλότερη διαθέσιμη απόδοση, με το όνομα της εταιρείας. Ίδιο στοίχημα, "
          + "μεγαλύτερο κέρδος — αυτός είναι όλος ο σκοπός. Το στοίχημα το παίζεις εσύ στη συγκεκριμένη "
          + "στοιχηματική: εμείς απλώς σου δείχνουμε πού είναι η καλύτερη τιμή.",
      },
      {
        icon: Sparkles,
        title: "Specific Bets",
        body: "Πέρα από το 1X2 υπολογίζουμε δεκάδες αγορές ανά αγώνα — να σκοράρουν και οι δύο, "
          + "over/under γκολ, ακριβές σκορ, κάρτες, κόρνερ, φάουλ, οφσάιντ, αποκρούσεις, σουτ, γκολ ομάδας, "
          + "διπλή ευκαιρία, χάντικαπ, πρώτο ημίχρονο και αγορές παικτών. Κάθε γραμμή δείχνει την "
          + "πιθανότητα του LION δίπλα στην καλύτερη διαθέσιμη απόδοση, για να βλέπεις πού υπάρχει αξία. "
          + "Ό,τι σου αρέσει πάει στο δελτίο σου και το παίζεις στη στοιχηματική που εμφανίζεται.",
      },
      {
        icon: Wallet,
        title: "Το πορτοφόλι σου — παίξε ελεγχόμενα",
        body: "Κάθε στοίχημα που παίζεις μπορεί να ζει μέσα στο LION.STATS. Πρόσθεσε μια επιλογή στο δελτίο "
          + "με την απόδοση που πραγματικά έπιασες, ή φτιάξε δικό σου ticket από την αρχή για οτιδήποτε δεν "
          + "καλύπτουμε. Πατάς «Refresh results» και τα δελτία σου κλείνουν με βάση τα πραγματικά σκορ, "
          + "τροφοδοτώντας ποσοστό επιτυχίας, κέρδος/ζημιά και γράφημα απόδοσης. Το να ξέρεις ακριβώς πού "
          + "βρίσκεσαι είναι το πρώτο βήμα για υπεύθυνο παιχνίδι.",
      },
      {
        icon: Eye,
        title: "Watchlist",
        body: "Είδες έναν αγώνα για αργότερα; Αποθήκευσέ τον στη watchlist και γύρνα όταν βγουν οι "
          + "συνθέσεις και οι αποδόσεις.",
      },
    ],
    plansTitle: "Τι βλέπει ο κάθε λογαριασμός",
    free: {
      title: "Free",
      items: [
        "Όλα τα πρωταθλήματα εκτός από τις μεγάλες διοργανώσεις (Premier League, Champions / Europa / Conference League — εκεί βλέπεις τον αγώνα και την ημερομηνία)",
        "Πλήρης ανάλυση σε κάθε διαθέσιμο αγώνα",
        "Μία κατηγορία Specific Bets: να σκοράρουν και οι δύο ομάδες",
        "Όλα τα στατιστικά παικτών, ομάδων και σύγκριση ομάδων",
        "Έως 10 δελτία σε ιστορικό, στατιστικά και γράφημα",
        "Watchlist και ειδήσεις",
      ],
    },
    pro: {
      title: "Pro",
      items: [
        "Όλα τα πρωταθλήματα ΚΑΙ οι μεγάλες διοργανώσεις",
        "Πλήρης ανάλυση + όλες οι κατηγορίες Specific Bets",
        "Πρόταση καλύτερης απόδοσης σε κάθε αποτέλεσμα",
        "LION Tickets — έτοιμα δελτία στις καλύτερες διαθέσιμες αποδόσεις",
        "Πλήρες ιστορικό δελτίων, στατιστικά και γράφημα απόδοσης",
        "Πλήρη στατιστικά παικτών και ομάδων, απεριόριστη σύγκριση, ειδήσεις, watchlist",
      ],
    },
    responsibleTitle: "Παίξε υπεύθυνα",
    responsible: [
      "Παίζε μόνο ό,τι αντέχεις να χάσεις. Ένα στατιστικό δεν είναι εγγύηση.",
      "Βάλε το όριό σου πριν ξεκινήσεις, όχι μετά από μια ήττα.",
      "Ποτέ κυνήγι ζημιάς — το επόμενο στοίχημα δεν σου χρωστάει το προηγούμενο.",
      "Χρησιμοποίησε το πορτοφόλι σου με ειλικρίνεια: τα νούμερα βοηθούν μόνο αν είναι αληθινά.",
      "21+. Αν το στοίχημα πάψει να είναι διασκέδαση, κάνε διάλειμμα ή ζήτα βοήθεια (ΚΕΘΕΑ: 210 9237777).",
    ],
    legalTitle: "Τι κάνουμε και τι δεν κάνουμε",
    legal: "Το LION.STATS κάνει στατιστική ανάλυση και παράγει προβλέψεις αποτελεσμάτων με βάση δεδομένα "
      + "ομάδων και παικτών. Δεν γνωρίζουμε το μέλλον, δεν πουλάμε βεβαιότητες και κανένα αποτέλεσμα δεν "
      + "είναι εγγυημένο. Σκοπός μας είναι να παίζεις σκεπτόμενος και με πληροφόρηση, όχι στην τύχη. "
      + "Οι αποδόσεις αλλάζουν συνεχώς στις στοιχηματικές — επιβεβαίωσε πάντα την τιμή πριν παίξεις.",
    booksTitle: "Οι στοιχηματικές από τις οποίες διαβάζουμε αποδόσεις",
    booksBody: "Αυτές είναι οι αδειοδοτημένες στην Ελλάδα εταιρείες των οποίων οι αποδόσεις εμφανίζονται "
      + "στο LION.STATS. Χρειάζεσαι λογαριασμό σε αυτές για να παίξεις το στοίχημα που σου προτείνουμε — "
      + "κάνε εγγραφή απευθείας:",
    booksNote: "Δεν έχουμε σχέση συνεργασίας με αυτές τις εταιρείες και δεν λαμβάνουμε το ποντάρισμά σου. "
      + "Κάθε σύνδεσμος οδηγεί στην επίσημη ελληνική τους σελίδα.",
    cta: "Ξεκίνα από τους σημερινούς αγώνες",
  },
};

const Card = ({ children, className = "", testId }) => (
  <div data-testid={testId}
    className={`bg-[#161b22] border border-[#30363d] rounded-2xl p-6 ${className}`}>{children}</div>
);

export default function AboutPage() {
  const { lang } = useLang();
  const [local, setLocal] = useState(lang === "el" ? "el" : "en");
  const t = COPY[local];

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-10" data-testid="about-page">
        <div className="flex justify-end mb-4">
          <button onClick={() => setLocal((l) => (l === "en" ? "el" : "en"))}
            data-testid="about-lang-toggle"
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:text-[#39FF14] border border-white/10 rounded-full px-3 py-1.5 transition-colors">
            <Languages className="w-3.5 h-3.5" /> {local === "en" ? "Ελληνικά" : "English"}
          </button>
        </div>

        <div className="flex items-start gap-5">
          <img src="/lion-crest.png" alt="LION.STATS" className="w-16 h-16 shrink-0 hidden sm:block" />
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#39FF14]">{t.kicker}</span>
            <h1 className="font-display font-black text-4xl sm:text-5xl text-white leading-[1.05] mt-2">
              {t.title}<br />
              <span className="text-[#39FF14]">{t.titleAccent}</span>
            </h1>
          </div>
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#39FF14]/30 bg-[#39FF14]/[0.06] p-5"
          data-testid="about-disclaimer-top">
          <ShieldCheck className="w-5 h-5 text-[#39FF14] shrink-0 mt-0.5" />
          <p className="text-white font-semibold text-base md:text-lg leading-snug">{t.disclaimerTop}</p>
        </div>

        <p className="text-zinc-300 text-base leading-relaxed mt-6 max-w-3xl">{t.lead}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-10">
          {t.sections.map((s, i) => (
            <Card key={s.title} testId={`about-section-${i}`}
              className={i === 0 ? "md:col-span-2" : ""}>
              <div className="flex items-center gap-2.5 mb-2">
                <s.icon className="w-5 h-5 text-[#39FF14]" />
                <h2 className="font-display font-bold text-white text-lg">{s.title}</h2>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed">{s.body}</p>
            </Card>
          ))}
        </div>

        <h2 className="font-display font-black uppercase tracking-tight text-2xl text-white mt-12 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-[#39FF14]" /> {t.plansTitle}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[t.free, t.pro].map((p, idx) => (
            <Card key={p.title} testId={`about-plan-${idx}`}
              className={idx === 1 ? "border-[#39FF14]/40" : ""}>
              <div className="text-[10px] uppercase tracking-[0.22em] font-bold mb-3"
                style={{ color: idx === 1 ? "#39FF14" : "#a1a1aa" }}>{p.title}</div>
              <ul className="space-y-2">
                {p.items.map((it) => (
                  <li key={it} className="flex items-start gap-2 text-sm text-zinc-300">
                    <span className="text-[#39FF14] mt-0.5">▪</span> {it}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <Card testId="about-responsible" className="mt-10 border-[#FFD60A]/30">
          <div className="flex items-center gap-2.5 mb-3">
            <Scale className="w-5 h-5 text-[#FFD60A]" />
            <h2 className="font-display font-bold text-white text-lg">{t.responsibleTitle}</h2>
          </div>
          <ul className="space-y-2">
            {t.responsible.map((r) => (
              <li key={r} className="flex items-start gap-2 text-sm text-zinc-300">
                <span className="text-[#FFD60A] mt-0.5">▪</span> {r}
              </li>
            ))}
          </ul>
        </Card>

        <Card testId="about-legal" className="mt-4">
          <div className="flex items-center gap-2.5 mb-2">
            <AlertTriangle className="w-5 h-5 text-zinc-300" />
            <h2 className="font-display font-bold text-white text-lg">{t.legalTitle}</h2>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">{t.legal}</p>
        </Card>

        <h2 className="font-display font-black uppercase tracking-tight text-2xl text-white mt-12 mb-2 flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-[#39FF14]" /> {t.booksTitle}
        </h2>
        <p className="text-sm text-zinc-400 mb-4 max-w-3xl">{t.booksBody}</p>
        <div className="flex flex-wrap gap-2.5" data-testid="about-books">
          {BOOKS.map((b) => {
            const url = bookmakerUrl(b);
            return !url ? null : (
              <a key={b} href={url} target="_blank" rel="noopener noreferrer"
                data-testid={`about-book-${b.toLowerCase().replace(/\s+/g, "-")}`}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-[#39FF14]/30 bg-[#39FF14]/[0.06] text-white text-sm font-bold hover:bg-[#39FF14]/15 transition-colors">
                {b} <ExternalLink className="w-3.5 h-3.5 text-[#39FF14]" />
              </a>
            );
          })}
        </div>
        <p className="text-xs text-zinc-500 mt-3">{t.booksNote}</p>

        <div className="mt-12 flex flex-wrap items-center gap-3">
          <Link to="/matches" data-testid="about-cta-matches"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-[#39FF14] text-black font-black uppercase tracking-wider text-sm hover:brightness-110 transition">
            {t.cta} <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/portfolio" data-testid="about-cta-portfolio"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-white/20 text-white font-bold uppercase tracking-wider text-sm hover:bg-white/5 transition">
            <Wallet className="w-4 h-4 text-[#39FF14]" /> {local === "en" ? "My portfolio" : "Το πορτοφόλι μου"}
          </Link>
        </div>

        <div className="mt-10 flex flex-wrap gap-4 text-xs text-zinc-600">
          <span className="inline-flex items-center gap-1.5"><PenLine className="w-3.5 h-3.5" /> {local === "en" ? "Create your own tickets" : "Φτιάξε δικά σου δελτία"}</span>
          <span className="inline-flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> {local === "en" ? "Refresh results any time" : "Ανανέωσε αποτελέσματα όποτε θες"}</span>
          <span className="inline-flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> 21+</span>
        </div>
      </main>
    </div>
  );
}
