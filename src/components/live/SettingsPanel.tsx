"use client";
import { useEffect, useRef, useState } from "react";
import { X, SlidersHorizontal, ChatCircleText, UserCircle, Keyboard, GithubLogo, ShareNetwork } from "@phosphor-icons/react";
import { DouyuAccountPanel } from "./DouyuAccountPanel";
import { IconButton } from "./IconButton";
import type { IQnType } from "@/types";
import { qualities } from "@/features/monitor/storage";
import type { RecoveryPreferences } from "@/features/video/playback-watchdog";
export interface DanmakuPreferences { opacity: number; density: number; speed: number; fontSize: number; thumbnailFontSize: number }
export const DEFAULT_DANMAKU_PREFERENCES: DanmakuPreferences = { opacity: 90, density: 20, speed: 120, fontSize: 20, thumbnailFontSize: 12 };
type Tab = "video" | "danmaku" | "account" | "help" | "project";
export type SettingsFocus = { tab?: Tab; subTab?: "add" | "settings" };
interface Props { open: boolean; onClose: () => void; quality: IQnType; onQualityChange: (value: IQnType) => void; danmaku: DanmakuPreferences; onDanmakuChange: (value: DanmakuPreferences) => void; autoFocusAudio: boolean; onAutoFocusAudioChange: (value: boolean) => void; autoFocusDanmaku: boolean; onAutoFocusDanmakuChange: (value: boolean) => void; recovery: RecoveryPreferences; onRecoveryChange: (value: RecoveryPreferences) => void; onShare: () => void; hasVideos: boolean }
export function SettingsPanel({ open, onClose, quality, onQualityChange, danmaku, onDanmakuChange, autoFocusAudio, onAutoFocusAudioChange, autoFocusDanmaku, onAutoFocusDanmakuChange, recovery, onRecoveryChange, onShare, hasVideos }: Props) {
  const [tab, setTab] = useState<Tab>("video");
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus();
  }, [open]);
  if (!open) return null;
  return <div className="settings-backdrop" onClick={onClose}>
    <div ref={dialog} className="settings-dialog" role="dialog" aria-modal="true" aria-label="设置" tabIndex={-1} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "Tab") {
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, summary, a[href], [tabindex="0"]') ?? []);
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }}>
      <header><h2>设置</h2><IconButton label="关闭设置" onClick={onClose}><X size={18} /></IconButton></header>
      <nav className="settings-tabs" aria-label="设置分类">{([{ id: "video", label: "播放", Icon: SlidersHorizontal }, { id: "danmaku", label: "弹幕", Icon: ChatCircleText }, { id: "account", label: "账号", Icon: UserCircle }, { id: "help", label: "快捷操作", Icon: Keyboard }, { id: "project", label: "项目", Icon: GithubLogo }] as const).map(({ id, label, Icon }) => <button key={id} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}><Icon size={17} />{label}</button>)}</nav>
      <div className="settings-content">
        {tab === "video" && <div className="space-y-6"><div><h3>默认画质偏好</h3><p>各房间可在画面中单独调整。</p><div className="quality-options">{qualities.map((name) => <button key={name} className={quality === name ? "is-active" : ""} onClick={() => onQualityChange(name)}>{name === "原画" ? "最高可用" : name}</button>)}</div></div>
          <div><div className="settings-switch"><span>聚焦／全屏时自动开声</span><button type="button" className="toggle-switch" role="switch" aria-label="聚焦／全屏时自动开声" aria-checked={autoFocusAudio} onClick={() => onAutoFocusAudioChange(!autoFocusAudio)}><span /></button></div><p>退出时恢复原状态，手动调整会保留。</p></div>
          <div><div className="settings-switch"><span>卡流自动恢复</span><button type="button" className="toggle-switch" role="switch" aria-label="卡流自动恢复" aria-checked={recovery.enabled} onClick={() => onRecoveryChange({ ...recovery, enabled: !recovery.enabled })}><span /></button></div><p>卡流时尝试重连；暂停、后台或离线时不触发。</p></div>
          <div className="space-y-4"><Range label="卡流判定时间" value={recovery.stallSeconds} min={10} max={120} suffix="秒" onChange={(stallSeconds) => onRecoveryChange({ ...recovery, stallSeconds })} />
            <Range label="基础重试间隔" value={recovery.retrySeconds} min={5} max={300} suffix="秒" onChange={(retrySeconds) => onRecoveryChange({ ...recovery, retrySeconds })} />
            <Range label="最多连续重试" value={recovery.maxAttempts} min={1} max={10} suffix="次" onChange={(maxAttempts) => onRecoveryChange({ ...recovery, maxAttempts })} />
            <p>连续失败会延长重试间隔，达到上限后停止，可手动刷新。</p></div>
          <div className="settings-note">支持约三分钟回看，以实际缓存为准。刷新、重连、换画质或关闭房间会清空缓存。</div></div>}
        {tab === "danmaku" && <div className="space-y-6"><div><h3>房间弹幕</h3><p>新房间默认关闭，可在画面中单独开关并保存。</p></div>
          <div><div className="settings-switch"><span>聚焦／全屏时自动开弹幕</span><button type="button" className="toggle-switch" role="switch" aria-label="聚焦／全屏时自动开弹幕" aria-checked={autoFocusDanmaku} onClick={() => onAutoFocusDanmakuChange(!autoFocusDanmaku)}><span /></button></div><p>退出时恢复原状态，手动开关会保留。</p></div>
          <div className="danmaku-preview" aria-label="弹幕预览"><span style={{ fontSize: danmaku.fontSize, opacity: danmaku.opacity / 100 }}>这是一条弹幕预览</span></div>
          <Range label="字体大小" value={danmaku.fontSize} min={12} max={40} suffix="px" onChange={(fontSize) => onDanmakuChange({ ...danmaku, fontSize })} />
          <Range label="聚焦小窗字号" value={danmaku.thumbnailFontSize} min={10} max={24} suffix="px" onChange={(thumbnailFontSize) => onDanmakuChange({ ...danmaku, thumbnailFontSize })} />
          <Range label="不透明度" value={danmaku.opacity} min={0} max={100} suffix="%" onChange={(opacity) => onDanmakuChange({ ...danmaku, opacity })} />
          <Range label="弹幕间距" value={danmaku.density} min={0} max={300} suffix="px" onChange={(density) => onDanmakuChange({ ...danmaku, density })} />
          <Range label="滚动速度" value={danmaku.speed} min={40} max={400} suffix="px/s" onChange={(speed) => onDanmakuChange({ ...danmaku, speed })} />
          <button className="subtle-button" onClick={() => onDanmakuChange({ ...DEFAULT_DANMAKU_PREFERENCES })}>恢复弹幕默认设置</button>
        </div>}
        {tab === "account" && <div className="space-y-6"><DouyuAccountPanel /></div>}
        {tab === "help" && <div className="shortcut-list"><Shortcut keys="Alt + 左键" text="开关房间声音" /><Shortcut keys="Shift + 左键" text="播放／暂停房间" /><Shortcut keys="Ctrl + 左键" text="刷新直播间" /><Shortcut keys="双击画面" text="进入／退出全屏" /><Shortcut keys="中键点画面" text="聚焦房间" /><Shortcut keys="再次中键 / Esc" text="退出聚焦" /><Shortcut keys="左键点头像" text="打开／关闭画面" /><Shortcut keys="右键／长按头像" text="关注与历史操作" /><Shortcut keys="R" text="布局区域内整理全部" /><Shortcut keys="↑ / ↓" text="音量增减 5%" /><Shortcut keys="← / →" text="回退／前进 5 秒，长按预览后松开跳转" /><Shortcut keys="空格" text="播放／暂停当前房间" /><Shortcut keys="长按星标 1.25 秒" text="取消关注，提前松开中止" /><Shortcut keys="拖动标题栏" text="移动画面" /><Shortcut keys="拖动边缘或角落" text="调整大小" /><p>快捷键控制全屏、聚焦或最后点击的房间；聚焦时可点击小窗切换。</p></div>}
        {tab === "project" && <div className="space-y-6"><div><h3>分享当前布局</h3><p>包含房间与布局，不含账号 Cookie。</p><button type="button" className="subtle-button mt-3" disabled={!hasVideos} onClick={onShare}><ShareNetwork size={17} />复制布局分享链接</button></div>
          <div><h3>多看</h3><p>把喜欢的直播，放在一起。</p><a className="subtle-button mt-3" href="https://github.com/Masaicker/uni-live" target="_blank" rel="noreferrer"><GithubLogo size={17} />GitHub 项目</a></div></div>}
      </div>
    </div>
  </div>;
}
function Range({ label, value, min, max, suffix = "", onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="settings-range"><span>{label}<span>{value}{suffix}</span></span><input aria-label={label} type="range" value={value} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}
function Shortcut({ keys, text }: { keys: string; text: string }) { return <div><span>{text}</span><kbd>{keys}</kbd></div>; }
