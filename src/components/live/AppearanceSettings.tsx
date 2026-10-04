"use client";

import { Broadcast, Check, Play } from "@phosphor-icons/react";
import { APPEARANCE_THEMES, type AppearanceTheme } from "@/lib/appearance";

export function AppearanceSettings({ theme, onThemeChange }: { theme: AppearanceTheme; onThemeChange: (theme: AppearanceTheme) => void }) {
  return <div className="space-y-5">
    <div><h3>界面样式</h3><p>即时切换，自动保存。</p></div>
    <fieldset className="theme-options">
      <legend className="sr-only">选择界面样式</legend>
      {APPEARANCE_THEMES.map((option) => <label key={option.id} className="theme-choice">
        <input type="radio" name="appearance-theme" className="sr-only" aria-label={option.label} value={option.id} checked={theme === option.id} onChange={() => onThemeChange(option.id)} />
        <span className="theme-preview" data-theme={option.id} aria-hidden="true">
          <span className="theme-preview-sidebar"><Broadcast size={17} weight="fill" /><span /><span /><span /></span>
          <span className="theme-preview-screen"><Play size={17} weight="fill" /></span>
        </span>
        <span className="theme-choice-heading"><span>{option.label}</span>{theme === option.id && <Check size={16} aria-hidden="true" />}</span>
        <span className="theme-choice-description">{option.description}</span>
      </label>)}
    </fieldset>
  </div>;
}
