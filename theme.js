// Theme preference: 'auto' follows the system, 'light' / 'dark' override it.
// Loaded in <head> (not deferred) so the first paint already uses the chosen colours.
// The choice is a per-device convenience, so localStorage is fine; it falls back to 'auto' when storage is unavailable.
(function (root) {
  const KEY = 'qqll-theme';
  const ORDER = ['auto', 'light', 'dark'];
  const LABELS = { auto:'跟随系统', light:'浅色', dark:'深色' };
  const THEME_COLORS = { light:'#f3f2fa', dark:'#17161f' };
  function nextTheme(preference) { return ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length]; }
  function resolveTheme(preference, systemDark) { return preference === 'light' || preference === 'dark' ? preference : (systemDark ? 'dark' : 'light'); }

  const api = { ORDER, LABELS, nextTheme, resolveTheme };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }

  const media = root.matchMedia('(prefers-color-scheme: dark)');
  function preference() { try { const value = root.localStorage.getItem(KEY); return ORDER.includes(value) ? value : 'auto'; } catch { return 'auto'; } }
  function apply(choice) {
    const theme = resolveTheme(choice, media.matches);
    root.document.documentElement.dataset.theme = theme;
    root.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
  }
  function set(choice) { try { root.localStorage.setItem(KEY, choice); } catch { /* storage unavailable: applies for this visit only */ } apply(choice); }
  if (media.addEventListener) media.addEventListener('change', () => apply(preference()));
  // Backstop for the system switching while the home-screen app sat in the background.
  root.document.addEventListener('visibilitychange', () => { if (!root.document.hidden) apply(preference()); });
  apply(preference());
  root.QQLLTheme = { ...api, preference, set };
})(this);
