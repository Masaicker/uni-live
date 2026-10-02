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
      <header><div><h2>设置</h2><p>让工作台适合你的观看习惯</p></div><IconButton label="关闭设置" onClick={onClose}><X size={18} /></IconButton></header>
      <nav className="settings-tabs" aria-label="设置分类">{([{ id: "video", label: "播放", Icon: SlidersHorizontal }, { id: "danmaku", label: "弹幕", Icon: ChatCircleText }, { id: "account", label: "账号", Icon: UserCircle }, { id: "help", label: "快捷操作", Icon: Keyboard }, { id: "project", label: "项目", Icon: GithubLogo }] as const).map(({ id, label, Icon }) => <button key={id} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}><Icon size={17} />{label}</button>)}</nav>
      <div className="settings-content">
        {tab === "video" && <div className="space-y-6"><div><h3>默认画质偏好</h3><p>斗鱼优先使用房间返回的完整画质列表，也可在画面中单独选择。</p><div className="quality-options">{qualities.map((name) => <button key={name} className={quality === name ? "is-active" : ""} onClick={() => onQualityChange(name)}>{name === "原画" ? "最高可用" : name}</button>)}</div></div>
          <div><div className="settings-switch"><span>聚焦／全屏时自动开声</span><button type="button" className="toggle-switch" role="switch" aria-label="聚焦／全屏时自动开声" aria-checked={autoFocusAudio} onClick={() => onAutoFocusAudioChange(!autoFocusAudio)}><span /></button></div><p>开启后临时播放该房间声音，其他房间不变。退出恢复原状态；期间主动调音或静音的结果会保留。</p></div>
          <div><div className="settings-switch"><span>卡流自动恢复</span><button type="button" className="toggle-switch" role="switch" aria-label="卡流自动恢复" aria-checked={recovery.enabled} onClick={() => onRecoveryChange({ ...recovery, enabled: !recovery.enabled })}><span /></button></div><p>默认关闭。开启后，只在已播放的直播长时间停止推进时尝试重新连接；正常播放、主动暂停、后台和离线时不触发。</p></div>
          <div className="space-y-4"><Range label="卡流判定时间" value={recovery.stallSeconds} min={10} max={120} suffix="秒" onChange={(stallSeconds) => onRecoveryChange({ ...recovery, stallSeconds })} />
            <Range label="基础重试间隔" value={recovery.retrySeconds} min={5} max={300} suffix="秒" onChange={(retrySeconds) => onRecoveryChange({ ...recovery, retrySeconds })} />
            <Range label="最多连续重试" value={recovery.maxAttempts} min={1} max={10} suffix="次" onChange={(maxAttempts) => onRecoveryChange({ ...recovery, maxAttempts })} />
            <p>首次判定卡流后尝试恢复，后续间隔逐步拉长。连续失败达到上限会停止，仍可手动刷新；重新取流会清空当前回看缓存。</p></div>
          <div className="settings-note">直播支持约三分钟内存回看，以实际缓存为准。暂停和回看期间继续接收；较早位置过期后会提示并移到可播位置。刷新、换画质、关闭房间或重启后重新积累。</div>
          <div className="settings-note">每次打开工作台先静音播放，聚焦／全屏自动开声默认开启。点击星标关注，长按 0.75 秒取消。确认存在的房间立即进入历史，未开播只保存、不占画布；最多保留 50 条历史。</div></div>}
        {tab === "danmaku" && <div className="space-y-6"><div><h3>每个房间，自己的弹幕</h3><p>新房间默认关闭弹幕。画面里的按钮可独立开关，选择会按房间保存，重新载入后恢复。</p></div>
          <div><div className="settings-switch"><span>聚焦／全屏时自动开弹幕</span><button type="button" className="toggle-switch" role="switch" aria-label="聚焦／全屏时自动开弹幕" aria-checked={autoFocusDanmaku} onClick={() => onAutoFocusDanmakuChange(!autoFocusDanmaku)}><span /></button></div><p>临时开启目标房间弹幕，退出恢复原状态。期间手动开关会保留并保存；其他房间不变。</p></div>
          <div className="danmaku-preview" aria-label="弹幕预览"><span style={{ fontSize: danmaku.fontSize, opacity: danmaku.opacity / 100 }}>这是一条弹幕预览</span></div>
          <Range label="字体大小" value={danmaku.fontSize} min={12} max={40} suffix="px" onChange={(fontSize) => onDanmakuChange({ ...danmaku, fontSize })} />
          <Range label="聚焦缩略窗口弹幕字号" value={danmaku.thumbnailFontSize} min={10} max={24} suffix="px" onChange={(thumbnailFontSize) => onDanmakuChange({ ...danmaku, thumbnailFontSize })} />
          <p>仅用于聚焦时周边的小画面，主画面和全屏使用上面的字体大小。</p>
          <Range label="不透明度" value={danmaku.opacity} min={0} max={100} suffix="%" onChange={(opacity) => onDanmakuChange({ ...danmaku, opacity })} />
          <Range label="弹幕间距" value={danmaku.density} min={0} max={300} suffix="px" onChange={(density) => onDanmakuChange({ ...danmaku, density })} />
          <Range label="滚动速度" value={danmaku.speed} min={40} max={400} suffix="px/s" onChange={(speed) => onDanmakuChange({ ...danmaku, speed })} />
          <div className="settings-note"><p>默认：字号 {DEFAULT_DANMAKU_PREFERENCES.fontSize}px · 缩略字号 {DEFAULT_DANMAKU_PREFERENCES.thumbnailFontSize}px · 不透明度 {DEFAULT_DANMAKU_PREFERENCES.opacity}% · 间距 {DEFAULT_DANMAKU_PREFERENCES.density}px · 速度 {DEFAULT_DANMAKU_PREFERENCES.speed}px/s</p><button className="subtle-button mt-3" onClick={() => onDanmakuChange({ ...DEFAULT_DANMAKU_PREFERENCES })}>恢复弹幕默认设置</button></div>
        </div>}
        {tab === "account" && <DouyuAccountPanel />}
        {tab === "help" && <div className="shortcut-list"><Shortcut keys="Alt + 左键" text="开启或关闭该房间声音" /><Shortcut keys="Shift + 左键" text="播放或暂停该房间" /><Shortcut keys="Ctrl + 左键" text="刷新当前直播间" /><Shortcut keys="双击画面" text="进入或退出该直播间全屏" /><Shortcut keys="中键点画面" text="聚焦房间，开声遵循播放设置" /><Shortcut keys="再次中键 / Esc" text="退出聚焦，恢复原布局与声音" /><Shortcut keys="中键点头像" text="添加到布局，或关闭已有画面" /><Shortcut keys="R" text="焦点在布局区域时整理全部" /><Shortcut keys="↑ / ↓" text="当前房间音量增减 5%" /><Shortcut keys="← / →" text="回看增减 5 秒，长按预览后松开跳转" /><Shortcut keys="空格" text="播放或暂停当前房间，长按只执行一次" /><Shortcut keys="长按星标 0.75 秒" text="取消关注，提前松开可中止" /><Shortcut keys="拖动标题栏" text="自由移动直播画面" /><Shortcut keys="拖动边缘或角落" text="调整画面大小" /><p>全屏控制全屏房间；聚焦默认控制主窗，点击小窗可控制小窗；普通布局控制最后点击的窗口。悬停时对应侧栏格子轻微提亮，直播窗口显示标题栏与播放栏；离开后恢复，不切换操作目标。Tab 进入播放组件后方向键和空格仍控制所属房间，Enter 保留组件原操作；输入、设置、菜单与排序不受房间快捷键影响。绿色边框表示正在播放且声音已开启，红色边框表示暂停。聚焦与全屏互斥，可直接切换；退出回到普通布局。聚焦期间锁定移动和缩放，主动调整的声音会保留。悬停显示标题与播放条；全屏播放时闲置 3 秒隐藏控件和鼠标。整理全部按当前位置恢复整齐排列；手动调整后新增房间优先找空位，放不下时添加浮窗。Ctrl 刷新只作用于画面，按钮与菜单仍执行自身操作。</p></div>}
        {tab === "project" && <div className="space-y-6"><div><h3>分享当前布局</h3><p>复制当前打开房间与布局的链接，不包含账号 Cookie。</p><button type="button" className="subtle-button mt-3" disabled={!hasVideos} onClick={onShare}><ShareNetwork size={17} />复制布局分享链接</button></div>
          <div><h3>多看</h3><p>把喜欢的直播，放在一起。</p><a className="subtle-button mt-3" href="https://github.com/Masaicker/uni-live" target="_blank" rel="noreferrer"><GithubLogo size={17} />GitHub 项目</a></div></div>}
      </div>
    </div>
  </div>;
}
function Range({ label, value, min, max, suffix = "", onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="settings-range"><span>{label}<span>{value}{suffix}</span></span><input aria-label={label} type="range" value={value} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}
function Shortcut({ keys, text }: { keys: string; text: string }) { return <div><span>{text}</span><kbd>{keys}</kbd></div>; }
