export const THEME_STORAGE_KEY = "ai-shuang-kui:theme";

// Apply the stored theme before styling the first paint.
export const themeBootstrap = "try { if (localStorage.getItem('" + THEME_STORAGE_KEY +
  "') === 'dark') document.documentElement.dataset.theme = 'dark'; } catch {}";
