export const PREFERENCES_KEY = "uni-live.preferences.v2";

export const APPEARANCE_THEMES = [
  { id: "cool", label: "冷灰蓝", description: "冷灰黑底色，柔和蓝色点缀。" },
  { id: "warm", label: "暖黑黄", description: "暖黑底色，芥末黄色点缀。" },
] as const;

export type AppearanceTheme = (typeof APPEARANCE_THEMES)[number]["id"];

export function normalizeTheme(value: unknown): AppearanceTheme {
  return value === "warm" ? "warm" : "cool";
}

const THEME_ICON_ID = "duokan-theme-icon";

export function applyTheme(theme: AppearanceTheme) {
  document.documentElement.dataset.theme = theme;
  const icon = document.getElementById(THEME_ICON_ID) as HTMLLinkElement | null ?? document.createElement("link");
  icon.id = THEME_ICON_ID;
  icon.rel = "icon";
  icon.href = theme === "warm" ? "/duokan-warm.svg" : "/duokan.svg";
  if (!icon.isConnected) document.head.appendChild(icon);
}

// Apply saved colors before the first paint; React restores the same preference after hydration.
export const THEME_INIT_SCRIPT = `(()=>{let theme="cool";try{const saved=JSON.parse(localStorage.getItem(${JSON.stringify(PREFERENCES_KEY)})||"null");theme=saved?.theme==="warm"?"warm":"cool"}catch{}document.documentElement.dataset.theme=theme;const icon=document.getElementById(${JSON.stringify(THEME_ICON_ID)})||document.createElement("link");icon.id=${JSON.stringify(THEME_ICON_ID)};icon.rel="icon";icon.href=theme==="warm"?"/duokan-warm.svg":"/duokan.svg";if(!icon.isConnected)document.head.appendChild(icon)})();`;
