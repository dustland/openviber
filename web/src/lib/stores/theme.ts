import { writable } from "svelte/store";

export type Theme = "light" | "dark" | "system";

function getSystemDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(selectedTheme: Theme): void {
  const setColorScheme = (isDark: boolean) => {
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  };

  if (selectedTheme === "system") {
    localStorage.removeItem("theme");
    const isDark = getSystemDark();
    document.documentElement.classList.toggle("dark", isDark);
    setColorScheme(isDark);
    return;
  }

  localStorage.setItem("theme", selectedTheme);
  const isDark = selectedTheme === "dark";
  document.documentElement.classList.toggle("dark", isDark);
  setColorScheme(isDark);
}

export const themeStore = writable<Theme>("system");
