"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaretLeft, CaretRight, Plus, MagnifyingGlass, GearSix, SquaresFour, SpeakerSlash, Play, Stop, Star, Trash, ArrowsClockwise, ClockCounterClockwise, Broom, CornersIn, List, DotsSixVertical, DotsThree, Check, ArrowUp, ArrowDown, XSquare } from "@phosphor-icons/react";
import type { FollowedRoom, MonitorVideo } from "@/types";
import { platformNames, roomLabel } from "@/lib/room-identity";
import { isPlatformEnabled } from "@/lib/platform-support";
import { followedRooms, watchingHistory } from "@/features/monitor/library";
import { IconButton } from "./IconButton";
import { RoomAvatar } from "./RoomAvatar";
import { RoomAvatarButton } from "./RoomAvatarButton";
import { FollowButton } from "./FollowButton";
import { useRoomSortDrag } from "./useRoomSortDrag";

interface Props {
  rooms: FollowedRoom[];
  videos: MonitorVideo[];
  hoveredId: string | null;
  collapsed: boolean;
  adding: boolean;
  focused: boolean;
  view: "list" | "avatars";
  onViewChange: (view: "list" | "avatars") => void;
  onReorder: (from: string, to: string) => void;
  onCollapse: (value: boolean) => void;
  onAdd: (url: string) => Promise<"history" | "layout" | false>;
  onOpen: (id: string) => void;
  onClose: (id: string) => void;
  onCloseAll: () => void;
  onFollow: (id: string, followed: boolean) => void;
  onForget: (id: string) => void;
  onClearHistory: () => void;
  refreshingAll: boolean;
  onRefreshAll: () => void;
  onArrange: () => void;
  onMuteAll: () => void;
  onClean: () => void;
  onExitFocus: () => void;
  onSettings: () => void;
}

export function RoomSidebar(props: Props) {
  const [tab, setTab] = useState<"followed" | "history">("followed");
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");
  const [avatarMenu, setAvatarMenu] = useState<{ id: string; left: number; top: number } | null>(null);
  const [compactTools, setCompactTools] = useState(false);
  const [toolsMenu, setToolsMenu] = useState<{ left: number; top: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement | null>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const toolsButtonRef = useRef<HTMLButtonElement>(null);
  const followed = followedRooms(props.rooms, !editing);
  const liveCount = followed.filter((room) => room.liveStatus === true).length;
  const history = watchingHistory(props.rooms);
  const source = tab === "followed" ? followed : history;
  const visible = source.filter((room) => `${roomLabel(room)} ${room.title} ${room.rid} ${platformNames[room.platform]}`.toLowerCase().includes(query.toLowerCase()));
  const avatarView = !editing && props.view === "avatars";
  const { dragged, dropTarget, begin: beginDrag, cancel: clearDrag } = useRoomSortDrag(editing && !props.collapsed && tab === "followed", listRef, visible.map((room) => room.id), props.onReorder);
  const selected = props.rooms.find((room) => room.id === avatarMenu?.id);
  const draggedRoom = props.rooms.find((room) => room.id === dragged);

  useEffect(() => { setAvatarMenu(null); setToolsMenu(null); setEditing(false); }, [tab, props.view, props.collapsed]);
  useEffect(() => {
    const height = window.matchMedia("(max-height: 640px)");
    const update = () => { setCompactTools(height.matches); setToolsMenu(null); };
    update();
    height.addEventListener("change", update);
    return () => height.removeEventListener("change", update);
  }, []);
  useLayoutEffect(() => {
    if (!toolsMenu || !toolsMenuRef.current) return;
    const bounds = toolsMenuRef.current.getBoundingClientRect();
    const left = Math.max(12, Math.min(toolsMenu.left, window.innerWidth - bounds.width - 12));
    const top = Math.max(12, Math.min(toolsMenu.top, window.innerHeight - bounds.height - 12));
    if (left !== toolsMenu.left || top !== toolsMenu.top) setToolsMenu({ left, top });
  }, [toolsMenu]);
  useEffect(() => {
    if (!toolsMenu) return;
    const outside = (event: PointerEvent) => { if (!toolsMenuRef.current?.contains(event.target as Node) && !toolsButtonRef.current?.contains(event.target as Node)) setToolsMenu(null); };
    const resize = () => setToolsMenu(null);
    const scroll = (event: Event) => { if (!toolsMenuRef.current?.contains(event.target as Node)) setToolsMenu(null); };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", resize);
    document.addEventListener("scroll", scroll, true);
    toolsMenuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return () => { document.removeEventListener("pointerdown", outside, true); window.removeEventListener("resize", resize); document.removeEventListener("scroll", scroll, true); };
  }, [toolsMenu]);
  useLayoutEffect(() => {
    if (!avatarMenu || !menuRef.current) return;
    const bounds = menuRef.current.getBoundingClientRect();
    const left = Math.max(12, Math.min(avatarMenu.left, window.innerWidth - bounds.width - 12));
    const top = Math.max(12, Math.min(avatarMenu.top, window.innerHeight - bounds.height - 12));
    if (left !== avatarMenu.left || top !== avatarMenu.top) setAvatarMenu({ ...avatarMenu, left, top });
  }, [avatarMenu]);
  useEffect(() => {
    if (!avatarMenu) return;
    const outside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node) && !menuButton.current?.contains(event.target as Node)) setAvatarMenu(null); };
    const resize = () => setAvatarMenu(null);
    const scroll = (event: Event) => { if (!menuRef.current?.contains(event.target as Node)) setAvatarMenu(null); };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", resize);
    document.addEventListener("scroll", scroll, true);
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { document.removeEventListener("pointerdown", outside, true); window.removeEventListener("resize", resize); document.removeEventListener("scroll", scroll, true); };
  }, [avatarMenu]);

  const submit = async () => { if (!url.trim()) return; const result = await props.onAdd(url); if (result) { setUrl(""); if (result === "history") setTab("history"); } };
  const toggleAvatarRoom = (id: string) => {
    if (editing) return;
    setAvatarMenu(null);
    if (props.videos.some((video) => video.id === id)) props.onClose(id); else props.onOpen(id);
  };
  const openAvatarMenu = (button: HTMLButtonElement, room: FollowedRoom) => {
    if (editing) return;
    setToolsMenu(null);
    if (avatarMenu?.id === room.id) { setAvatarMenu(null); return; }
    const rect = button.getBoundingClientRect();
    menuButton.current = button;
    setAvatarMenu({ id: room.id, left: rect.right + 6, top: rect.top });
  };
  const sortKeys = (event: React.KeyboardEvent, room: FollowedRoom) => {
    if (!editing || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const index = visible.findIndex((peer) => peer.id === room.id);
    const next = visible[index + (["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1)];
    if (next) props.onReorder(room.id, next.id);
  };
  const secondaryTools = [
    { label: "刷新全部直播间", Icon: ArrowsClockwise, disabled: props.refreshingAll || !props.rooms.some((room) => isPlatformEnabled(room.platform)), onClick: props.onRefreshAll, spinning: props.refreshingAll },
    { label: "整理全部", Icon: SquaresFour, onClick: props.onArrange },
    { label: "全部静音", Icon: SpeakerSlash, onClick: props.onMuteAll },
    { label: "清理临时房间并整理", Icon: Broom, disabled: !props.videos.some((video) => !video.followed), onClick: props.onClean },
  ];
  const toolButtons = secondaryTools.map(({ label, Icon, disabled, onClick, spinning }) => <IconButton key={label} label={label} disabled={disabled} onClick={onClick}><Icon size={18} className={spinning ? "animate-spin" : ""} /></IconButton>);
  const persistentTools = <>
    <IconButton label="关闭全部画面" disabled={!props.videos.length} onClick={props.onCloseAll} className="bulk-close-button"><XSquare size={18} /></IconButton>
    <IconButton label="设置" onClick={props.onSettings}><GearSix size={18} /></IconButton>
  </>;
  const tools = <>{toolButtons}{persistentTools}</>;
  const sidebar = props.collapsed ? <aside className="sidebar-rail" aria-label="直播工具栏">
    <IconButton label="展开房间列表" onClick={() => props.onCollapse(false)}><CaretRight size={18} /></IconButton>
    <span className="rail-live-count" title={`${liveCount} 个关注正在直播`} aria-label={`${liveCount} 个关注正在直播`}><span className={`status-dot ${liveCount > 0 ? "is-live" : ""}`} />{liveCount}</span>
    <div className="rail-live-avatars" aria-label="正在直播的关注">{followed.filter((room) => room.liveStatus === true).map((room) => <div key={room.id} className={`room-avatar-item is-live ${props.hoveredId === room.id ? "is-room-hovered" : ""}`} data-library-room={room.id} data-live-status="true">
      <RoomAvatarButton room={room} watching={props.videos.some((video) => video.id === room.id)} menuOpen={avatarMenu?.id === room.id} status="直播中" onToggle={() => toggleAvatarRoom(room.id)} onMenu={(button) => openAvatarMenu(button, room)} />
    </div>)}</div>
    {props.focused && <IconButton label="退出聚焦" onClick={props.onExitFocus}><CornersIn size={18} /></IconButton>}
    {compactTools ? <button ref={toolsButtonRef} type="button" className={`icon-button ${toolsMenu ? "is-active" : ""}`} aria-label="更多操作" title="更多操作" aria-haspopup="menu" aria-expanded={Boolean(toolsMenu)} onClick={() => {
      setAvatarMenu(null);
      const rect = toolsButtonRef.current!.getBoundingClientRect();
      setToolsMenu(toolsMenu ? null : { left: rect.right + 8, top: rect.top });
    }}><DotsThree size={18} /></button> : toolButtons}
    {persistentTools}
  </aside> : <aside className="room-sidebar" aria-label="房间列表">
    <header className="sidebar-header"><div className="brand-mark"><SquaresFour size={20} /><span>多看</span></div><IconButton label="收起房间列表" onClick={() => props.onCollapse(true)}><CaretLeft size={18} /></IconButton></header>
    <div className="sidebar-inputs">
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="flex gap-2">
        <input aria-label="直播间地址" className="text-input min-w-0 flex-1" placeholder="粘贴直播间地址" value={url} onChange={(event) => setUrl(event.target.value)} autoComplete="off" />
        <button type="submit" className="add-room-button" aria-label="添加直播间" title="验证并添加房间" disabled={props.adding || !url.trim()}><Plus size={18} className={props.adding ? "animate-spin" : ""} /></button>
      </form>
      <label className="search-input"><MagnifyingGlass size={16} /><input aria-label="搜索房间" placeholder="搜索主播或房间" value={query} onChange={(event) => { setQuery(event.target.value); setEditing(false); clearDrag(); }} /></label>
    </div>
    <nav className="library-tabs" aria-label="房间分类">
      <button aria-current={tab === "followed" ? "page" : undefined} onClick={() => setTab("followed")}><Star size={14} />关注<span>{followed.length}</span></button>
      <button aria-current={tab === "history" ? "page" : undefined} onClick={() => setTab("history")}><ClockCounterClockwise size={14} />历史<span>{history.length}</span></button>
    </nav>
    <div className="sidebar-section-label"><span>{tab === "followed" ? "关注房间" : "最近访问"}</span>
      <div className="library-view-tools">
        {tab === "followed" ? <button type="button" className={`sort-mode-button ${editing ? "is-active" : ""}`} aria-pressed={editing} disabled={!editing && (Boolean(query) || followed.length < 2)} onClick={() => { setEditing(!editing); setAvatarMenu(null); clearDrag(); }}>{editing ? <Check size={13} /> : <DotsSixVertical size={13} />}{editing ? "完成排序" : "编辑排序"}</button>
          : history.length > 0 && <button onClick={props.onClearHistory}>清空记录</button>}
        {tab === "followed" && <IconButton label={props.view === "avatars" ? "切换为列表视图" : "切换为头像视图"} disabled={editing} onClick={() => props.onViewChange(props.view === "avatars" ? "list" : "avatars")}>{props.view === "avatars" ? <List size={16} /> : <SquaresFour size={16} />}</IconButton>}
      </div>
    </div>
    {editing && <p className="sort-mode-hint">拖动时可用滚轮，靠近边缘加速滚动；也可用方向键或上下按钮，Esc 取消拖动。</p>}
    <div ref={listRef} className="room-list" data-sorting={editing} data-dragging={Boolean(dragged)}>
      {visible.length === 0 ? <div className="sidebar-empty">{tab === "followed" ? <Star size={24} /> : <ClockCounterClockwise size={24} />}<p>{query ? "没有找到这个房间" : tab === "followed" ? "把常看的主播留在这里" : "最近添加或观看的房间会在这里"}</p><span>{query ? "尝试主播名或房间号" : tab === "followed" ? "点击画面标题栏的星标，添加关注" : "确认房间存在后自动记录，未开播也可关注"}</span></div>
      : <div className={avatarView ? "room-avatar-grid" : undefined}>{visible.map((room) => {
          const video = props.videos.find((item) => item.id === room.id);
          const liveStatus = room.liveStatus === true ? "直播中" : room.liveStatus === false ? "未开播" : "状态未知";
          const playbackStatus = video?.status === "error" ? "连接失败" : video?.status === "loading" || video?.isRefreshing ? "连接中" : video ? video.paused ? "已暂停" : "在布局中" : "";
          const dropEdge = dropTarget?.id === room.id ? dropTarget.edge : undefined;
          const dragClass = dragged === room.id ? "is-dragging" : "";
          if (avatarView) return <div key={room.id} data-library-room={room.id} data-live-status={String(room.liveStatus)} className={`room-avatar-item ${props.hoveredId === room.id ? "is-room-hovered" : ""} ${room.liveStatus === true ? "is-live" : ""} ${video ? "is-watching" : ""}`}>
            <RoomAvatarButton room={room} watching={Boolean(video)} menuOpen={avatarMenu?.id === room.id} status={`${liveStatus}${playbackStatus ? ` · ${playbackStatus}` : ""}`} onToggle={() => toggleAvatarRoom(room.id)} onMenu={(button) => openAvatarMenu(button, room)} />
          </div>;
          return <div key={room.id} data-library-room={room.id} data-live-status={String(room.liveStatus)} data-drop-edge={dropEdge} className={`room-list-item ${props.hoveredId === room.id ? "is-room-hovered" : ""} ${video ? "is-watching" : ""} ${dragClass}`}>
            <div className="flex items-center gap-2">
              {editing && <button type="button" className="sort-handle" data-sort-handle aria-label={`拖动排序：${roomLabel(room)}`} title="拖动时可用滚轮；方向键排序" onPointerDown={(event) => beginDrag(event, room.id)} onKeyDown={(event) => sortKeys(event, room)}><DotsSixVertical size={15} /></button>}
              <button type="button" className="room-open-button" onClick={() => { if (!editing) props.onOpen(room.id); }} title={room.title || roomLabel(room)}><RoomAvatar url={room.avatarUrl} platform={room.platform} /><span className="min-w-0 flex-1"><span className="room-name">{roomLabel(room)}</span></span></button>
              {editing ? <div className="sort-move-buttons">
                <IconButton label={`上移：${roomLabel(room)}`} disabled={visible[0]?.id === room.id} onClick={() => props.onReorder(room.id, visible[visible.indexOf(room) - 1].id)}><ArrowUp size={14} /></IconButton>
                <IconButton label={`下移：${roomLabel(room)}`} disabled={visible[visible.length - 1]?.id === room.id} onClick={() => props.onReorder(room.id, visible[visible.indexOf(room) + 1].id)}><ArrowDown size={14} /></IconButton>
              </div> : <>
                <FollowButton followed={room.followed} size={15} onChange={(followed) => props.onFollow(room.id, followed)} />
                <IconButton label={video ? "关闭画面" : "打开直播"} onClick={() => video ? props.onClose(room.id) : props.onOpen(room.id)}>{video ? <Stop size={16} weight="fill" /> : <Play size={16} />}</IconButton>
                {tab === "history" && <IconButton label="删除历史记录" danger onClick={() => props.onForget(room.id)}><Trash size={15} /></IconButton>}
              </>}
            </div>
            <div className="room-subtitle"><span className={`status-dot ${room.liveStatus === true ? "is-live" : ""}`} /><span>{platformNames[room.platform]} · {liveStatus}</span>{playbackStatus && <span>· {playbackStatus}</span>}</div>
          </div>;
        })}</div>}
    </div>
    {editing && <span className="sr-only" role="status">{draggedRoom ? `正在拖动${roomLabel(draggedRoom)}${dropTarget ? "，松开可放到标记位置" : ""}` : "排序模式已开启"}</span>}
    <footer className="sidebar-footer">{props.focused && <button className="sidebar-exit-focus" onClick={props.onExitFocus}><CornersIn size={15} />退出聚焦<span>Esc</span></button>}<div className="flex items-center justify-between">{tools}</div></footer>
  </aside>;
  return <>{sidebar}{props.collapsed && compactTools && toolsMenu && createPortal(<div ref={toolsMenuRef} className="room-avatar-menu sidebar-tools-menu" role="menu" aria-label="全局操作" style={{ left: toolsMenu.left, top: toolsMenu.top }} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setToolsMenu(null); toolsButtonRef.current?.focus(); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
      }
      if (event.key === "Tab") { setToolsMenu(null); toolsButtonRef.current?.focus(); }
    }}>
      {secondaryTools.map(({ label, Icon, disabled, onClick, spinning }) => <button key={label} type="button" role="menuitem" disabled={disabled} onClick={() => { setToolsMenu(null); toolsButtonRef.current?.focus(); onClick(); }}><Icon size={18} className={spinning ? "animate-spin" : ""} /><span>{label}</span></button>)}
    </div>, document.body)}{avatarMenu && selected && createPortal(<div ref={menuRef} className="room-avatar-menu" role="menu" aria-label={`${roomLabel(selected)}房间操作`} style={{ left: avatarMenu.left, top: avatarMenu.top }} onKeyDown={(event) => {
      if (event.key === "Escape") { event.stopPropagation(); setAvatarMenu(null); menuButton.current?.focus(); }
      if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")], index = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(index + (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : buttons.length - 1)) % buttons.length]?.focus(); }
    }}>
      <div className="avatar-menu-actions">
        <FollowButton followed={selected.followed} size={19} menuItem onChange={(followed) => { props.onFollow(selected.id, followed); setAvatarMenu(null); }} />
        <button type="button" role="menuitem" className="icon-button is-danger" aria-label="删除历史记录" title="删除历史记录" disabled={selected.lastWatchedAt === undefined} onClick={() => { props.onForget(selected.id); setAvatarMenu(null); }}><Trash size={19} /></button>
      </div>
    </div>, document.body)}</>;
}
