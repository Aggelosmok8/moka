// Lightweight i18n: default English, optional Greek. UI phrases are translated
// from this dictionary (zero external calls). Dynamic data (team names, numbers,
// odds) is never translated. Unknown phrases fall back to English.
const KEY = "moka_lang";

let current = "en";
try { current = localStorage.getItem(KEY) || "en"; } catch { /* ignore */ }

const listeners = new Set();

export function getLang() { return current; }
export function setLang(l) {
  current = l === "el" ? "el" : "en";
  try { localStorage.setItem(KEY, current); } catch { /* ignore */ }
  listeners.forEach((f) => { try { f(current); } catch { /* ignore */ } });
}
export function onLang(cb) { listeners.add(cb); return () => listeners.delete(cb); }

// Navigation labels (kept separate so ambiguous words like "Home" translate
// correctly in the menu without affecting 1X2 outcome labels).
export const NAV = {
  Home: "Αρχική",
  Matches: "Αγώνες",
  Leagues: "Λίγκες",
  Teams: "Ομάδες",
  Sports: "Αθλήματα",
  Watchlist: "Λίστα",
  Portfolio: "Χαρτοφυλάκιο",
  News: "Ειδήσεις",
  Pricing: "Τιμές",
  Account: "Λογαριασμός",
};

export function navLabel(label) {
  return current === "el" ? (NAV[label] || label) : label;
}

// EN -> EL phrase dictionary for the blanket UI translator.
export const DICT = {
  // Home / hero
  "Today's Best Opportunities": "Οι κορυφαίες ευκαιρίες σήμερα",
  "The strongest opportunities Moka has identified today.": "Οι ισχυρότερες ευκαιρίες που εντόπισε η Moka σήμερα.",
  "Before every decision, there is data": "Πριν από κάθε απόφαση, υπάρχουν δεδομένα",
  "Make them your tool": "Κάν' τα εργαλείο σου",
  "Make your own decision": "Πάρε τη δική σου απόφαση",
  "Study every detail": "Μελέτησε κάθε λεπτομέρεια",
  "The Moka Journey": "Το ταξίδι της Moka",
  "See the opportunities": "Δες τις ευκαιρίες",
  "Ready to see today's opportunities?": "Έτοιμος να δεις τις σημερινές ευκαιρίες;",
  // Tabs / filters
  "Strong": "Ισχυρές",
  "Worth Watching": "Αξίζει προσοχή",
  "All Matches": "Όλοι οι αγώνες",
  "Live": "Ζωντανά",
  "All competitions": "Όλες οι διοργανώσεις",
  "All sports": "Όλα τα αθλήματα",
  "Sort by": "Ταξινόμηση κατά",
  "🟢 Strong": "🟢 Ισχυρές",
  "🟡 Worth Watching": "🟡 Αξίζει προσοχή",
  "Live Now": "Ζωντανά τώρα",
  "Live now": "Ζωντανά τώρα",
  "Interesting opportunities that are not as strong as the top picks.": "Ενδιαφέρουσες ευκαιρίες, όχι τόσο ισχυρές όσο οι κορυφαίες.",
  "Browse every available match.": "Περιήγηση σε όλους τους διαθέσιμους αγώνες.",
  "Start your": "Ξεκίνα τη",
  "7-day free trial": "δωρεάν δοκιμή 7 ημερών",
  "— full Pro access, no card required.": "— πλήρης πρόσβαση Pro, χωρίς κάρτα.",
  "Start free trial": "Έναρξη δωρεάν δοκιμής",
  "Upgrade to Pro to unlock more value opportunities": "Αναβάθμισε σε Pro για περισσότερες ευκαιρίες αξίας",
  "Upgrade to Pro to unlock every opportunity": "Αναβάθμισε σε Pro για κάθε ευκαιρία",
  "Upgrade to Pro to unlock more value opportunities.": "Αναβάθμισε σε Pro για περισσότερες ευκαιρίες αξίας.",
  // Opportunity levels
  "Strong Opportunity": "Ισχυρή ευκαιρία",
  "No Clear Opportunity": "Χωρίς σαφή ευκαιρία",
  // Sports
  "Football": "Ποδόσφαιρο",
  "Basketball": "Μπάσκετ",
  // Cards / analysis
  "Best Odds": "Καλύτερες αποδόσεις",
  "Best odds": "Καλύτερες αποδόσεις",
  "Available Odds": "Διαθέσιμες αποδόσεις",
  "Moka pick": "Επιλογή Moka",
  "Moka Lean": "Κλίση Moka",
  "Moka Analysis": "Ανάλυση Moka",
  "Moka Prediction": "Πρόβλεψη Moka",
  "AI Match Analysis": "Ανάλυση αγώνα με AI",
  "AI Summary": "Σύνοψη AI",
  "Quick AI Summary": "Γρήγορη σύνοψη AI",
  "Why Moka": "Γιατί η Moka",
  "Why Moka likes it": "Γιατί την προτιμά η Moka",
  "Possible outcome": "Πιθανό αποτέλεσμα",
  "Live outcome": "Ζωντανό αποτέλεσμα",
  "Live Analysis": "Ζωντανή ανάλυση",
  "Live Prediction": "Ζωντανή πρόβλεψη",
  "Prediction": "Πρόβλεψη",
  "Prediction unavailable.": "Η πρόβλεψη δεν είναι διαθέσιμη.",
  "See Analysis": "Δες ανάλυση",
  "Show Advanced Analysis": "Εμφάνιση προχωρημένης ανάλυσης",
  "Hide Advanced Analysis": "Απόκρυψη προχωρημένης ανάλυσης",
  "Advanced statistics": "Προχωρημένα στατιστικά",
  "Back to matches": "Πίσω στους αγώνες",
  "Confidence": "Εμπιστοσύνη",
  "Confidence Score": "Δείκτης εμπιστοσύνης",
  "Value": "Αξία",
  "Value Rating": "Βαθμολογία αξίας",
  "Value Matches": "Αγώνες αξίας",
  "Goal Markets": "Αγορές γκολ",
  "Over / Under 2.5": "Over / Under 2.5",
  "Both teams to score": "Να σκοράρουν και οι δύο",
  "Risk Level": "Επίπεδο ρίσκου",
  "Favorite": "Φαβορί",
  "Your pick": "Η επιλογή σου",
  "Pick": "Επιλογή",
  "Odds": "Αποδόσεις",
  "Odds Comparison": "Σύγκριση αποδόσεων",
  "Bookmaker": "Στοιχηματική",
  "No odds available.": "Δεν υπάρχουν διαθέσιμες αποδόσεις.",
  "AI analysis is temporarily unavailable — the Moka model prediction is shown below.":
    "Η ανάλυση AI δεν είναι προσωρινά διαθέσιμη — παρακάτω φαίνεται η πρόβλεψη του μοντέλου Moka.",
  // Outcomes (1X2) — used as short labels
  "Home": "Έδρα",
  "Draw": "Ισοπαλία",
  "Away": "Εκτός",
  // Teams / leagues / squads
  "Team": "Ομάδα",
  "Match": "Αγώνας",
  "Match Profile": "Προφίλ αγώνα",
  "Match not found.": "Ο αγώνας δεν βρέθηκε.",
  "Team not found.": "Η ομάδα δεν βρέθηκε.",
  "League": "Λίγκα",
  "League Pos.": "Θέση λίγκας",
  "Kickoff": "Έναρξη",
  "Recent Form": "Πρόσφατη φόρμα",
  "Recent Matches": "Πρόσφατοι αγώνες",
  "Head to Head History": "Ιστορικό αναμετρήσεων",
  "Head to Head Stats": "Στατιστικά αναμετρήσεων",
  "Performance Comparison": "Σύγκριση απόδοσης",
  "Performance Radar": "Ραντάρ απόδοσης",
  "Strength Radar": "Ραντάρ δύναμης",
  "Strengths": "Δυνατά σημεία",
  "Weaknesses": "Αδύνατα σημεία",
  "Season output": "Απόδοση σεζόν",
  "Season stats": "Στατιστικά σεζόν",
  "Recent Form ": "Πρόσφατη φόρμα ",
  "Compare": "Σύγκριση",
  "Players": "Παίκτες",
  "Played": "Αγώνες",
  "Scored": "Σκόραρε",
  "Conceded": "Δέχτηκε",
  "Goal Diff": "Διαφορά τερμ.",
  "Points": "Πόντοι",
  "Stats": "Στατιστικά",
  "Stat": "Στατ.",
  "Form": "Φόρμα",
  "Browse leagues, teams and full squads.": "Περιήγηση σε λίγκες, ομάδες και ρόστερ.",
  "Could not load this league.": "Αδυναμία φόρτωσης της λίγκας.",
  "No teams available for this league.": "Δεν υπάρχουν διαθέσιμες ομάδες για αυτή τη λίγκα.",
  "No upcoming fixtures.": "Δεν υπάρχουν προσεχείς αγώνες.",
  "No recent results.": "Δεν υπάρχουν πρόσφατα αποτελέσματα.",
  "No results.": "Χωρίς αποτελέσματα.",
  "Squad data not available for this team.": "Δεν υπάρχουν δεδομένα ρόστερ για αυτή την ομάδα.",
  "Normalised across the top 5 leagues": "Κανονικοποιημένο στις 5 κορυφαίες λίγκες",
  // Portfolio / slip
  "Bet Slip": "Δελτίο στοιχήματος",
  "My Portfolio": "Το χαρτοφυλάκιό μου",
  "Total odds": "Συνολική απόδοση",
  "Potential return": "Πιθανή απόδοση",
  "Stake": "Ποντάρισμα",
  "Won": "Κερδισμένο",
  "Lost": "Χαμένο",
  "Void": "Άκυρο",
  "Mark Won": "Σήμανση ως κερδισμένο",
  "Mark Lost": "Σήμανση ως χαμένο",
  "Reset to pending": "Επαναφορά σε εκκρεμές",
  "No tickets yet": "Κανένα δελτίο ακόμα",
  "No bets in this category.": "Δεν υπάρχουν στοιχήματα σε αυτή την κατηγορία.",
  "Your portfolio is empty": "Το χαρτοφυλάκιό σου είναι άδειο",
  "Your watchlist is empty": "Η λίστα σου είναι άδεια",
  "Free plan shows your latest 5 tickets": "Το δωρεάν πλάνο δείχνει τα τελευταία 5 δελτία",
  "Add to slip": "Προσθήκη στο δελτίο",
  "In slip": "Στο δελτίο",
  "Add to Watchlist": "Προσθήκη στη λίστα",
  "Add to Chart": "Προσθήκη στη λίστα",
  "Add to Portfolio": "Προσθήκη στο χαρτοφυλάκιο",
  "Added to bet slip": "Προστέθηκε στο δελτίο",
  "Go to slip": "Στο δελτίο",
  // News
  "No news found for these filters.": "Δεν βρέθηκαν ειδήσεις για αυτά τα φίλτρα.",
  // Pricing / plan
  "Current plan": "Τρέχον πλάνο",
  "Moka Pro": "Moka Pro",
  "Free": "Δωρεάν",
  "Pro active": "Ενεργό Pro",
  "Upgrade to Pro": "Αναβάθμιση σε Pro",
  "Trial ended.": "Η δοκιμή έληξε.",
  "Confirming payment...": "Επιβεβαίωση πληρωμής...",
  "Maybe later": "Ίσως αργότερα",
  // Generic controls
  "Search": "Αναζήτηση",
  "Clear": "Καθαρισμός",
  "Close": "Κλείσιμο",
  "Open": "Άνοιγμα",
  "Remove": "Αφαίρεση",
  "More": "Περισσότερα",
  "More pages": "Περισσότερες σελίδες",
  "Next": "Επόμενο",
  "Previous": "Προηγούμενο",
  "Next slide": "Επόμενη διαφάνεια",
  "Previous slide": "Προηγούμενη διαφάνεια",
  "Results": "Αποτελέσματα",
  "Sign In": "Σύνδεση",
  "Sign in": "Σύνδεση",
  // Nav (also used in mobile menu text nodes)
  "Matches": "Αγώνες",
  "Leagues": "Λίγκες",
  "Teams": "Ομάδες",
  "Sports": "Αθλήματα",
  "Portfolio": "Χαρτοφυλάκιο",
  "News": "Ειδήσεις",
  "Pricing": "Τιμές",
  "Account": "Λογαριασμός",
  "Watchlist": "Λίστα",
  "Charts": "Λίστα",
};

// Search-box placeholders.
export const PLACEHOLDERS = {
  "Search teams or leagues...": "Αναζήτηση ομάδων ή λιγκών...",
  "Search teams or matches...": "Αναζήτηση ομάδων ή αγώνων...",
  "Search team…": "Αναζήτηση ομάδας…",
  "Search team...": "Αναζήτηση ομάδας...",
};
