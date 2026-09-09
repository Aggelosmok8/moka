// Opens a safe Google search for the bookmaker instead of deep-linking to the
// gambling domain directly — those domains are often geo-blocked or flagged by
// browsers as "not safe", so we always send the user to a trustworthy search.
export function bookmakerUrl(name) {
  if (!name) return "https://www.google.com/search?q=sports+betting+odds";
  return `https://www.google.com/search?q=${encodeURIComponent(name + " sports betting odds")}`;
}
