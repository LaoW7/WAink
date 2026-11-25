"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import { THEME_STORAGE_KEY } from "@/lib/appearance";

export function ThemeToggle() {
  useEffect(() => {
    try {
      document.documentElement.dataset.theme = localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
    } catch {
      // Keep the current theme if the browser blocks storage access.
    }
  }, []);

  function toggle() {
    const root = document.documentElement;
    const theme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The theme still works for this visit when browser storage is unavailable.
    }
  }

  return (
    <button type="button" className="button settings-button theme-toggle" onClick={toggle} title="切换黑白主题">
      <span className="switch-to-light">
        <Sun size={18} aria-hidden /><span className="sr-only">切换到白色主题</span>
      </span>
      <span className="switch-to-dark">
        <Moon size={18} aria-hidden /><span className="sr-only">切换到黑色主题</span>
      </span>
    </button>
  );
}
