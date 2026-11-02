// Runs before first paint: apply the saved theme, or follow the system until the user picks one.
(() => {
  const root = document.documentElement;
  const query = matchMedia('(prefers-color-scheme: dark)');
  let saved = null;
  try { saved = localStorage.getItem('pod-theme'); } catch { /* storage unavailable */ }
  const apply = () => { root.dataset.theme = saved === 'light' || saved === 'dark' ? saved : (query.matches ? 'dark' : 'light'); };
  apply();
  query.addEventListener('change', () => {
    try { saved = localStorage.getItem('pod-theme'); } catch { saved = null; }
    apply();
  });
})();
