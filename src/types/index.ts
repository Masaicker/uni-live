export type IQnType = "原画" | "蓝光" | "超清" | "高清" | "流畅";
export type IStreamType = "hls" | "flv";
export type LayoutMode = "overlap" | "equal" | "free" | "grid";
/** 弹幕显示：重合=全局一层；独立=按房间号飘在对应直播画面内 */
export type DanmakuDisplayMode = "merged" | "independent";
export type Platform = "douyu" | "bilibili" | "huya" | "direct" | "unknown";
export type VideoStatus = "idle" | "loading" | "playing" | "error";

export interface QualityOption {
  name: string;
  rate: number;
  bit?: number;
}

export interface PlaybackResult {
  stream: string;
  qualities?: QualityOption[];
  selectedQuality?: QualityOption;
  requestedRate?: number;
  warning?: string;
}

export interface RoomInfo {
  platform: Platform;
  rid: string;
  anchorName: string;
  title: string;
  liveStatus: boolean | null;
  avatarUrl?: string;
}

export interface FollowedRoom extends RoomInfo {
  id: string;
  url: string;
  followed: boolean;
  followOrder?: number;
  lastWatchedAt?: number;
  lastStatusAt?: number;
  qnName: IQnType;
  preferredRate?: number;
  danmakuEnabled: boolean;
  danmakuPreferenceSet?: boolean;
  volume: number;
  lastVolume: number;
  layout?: VideoLayout;
}

export type DanmakuStatus = "disabled" | "connecting" | "connected" | "error" | "unsupported";

export interface MonitorVideo extends FollowedRoom {
  stream: string;
  streamType: IStreamType;
  playbackKey: number;
  layout: VideoLayout;
  status: VideoStatus;
  muted: boolean;
  paused: boolean;
  followingLive: boolean;
  qualities: QualityOption[];
  selectedQuality?: QualityOption;
  warning?: string;
  errorMessage?: string;
  isRefreshing: boolean;
  recoveryKey: number;
  recoveryStopped?: boolean;
  lastPlayedKey?: number;
}

export interface ViewingSession {
  id: string;
  muted: boolean;
  volume: number;
  adjusted: boolean;
  autoAudio: boolean;
  danmakuEnabled: boolean;
  danmakuAdjusted: boolean;
  autoDanmaku: boolean;
}

export interface FocusSession extends ViewingSession {
  order: string[];
}

export interface MonitorState {
  rooms: FollowedRoom[];
  videos: MonitorVideo[];
  manual: boolean;
  focus: FocusSession | null;
  fullscreen: ViewingSession | null;
}

export interface WorkspaceSnapshot {
  version: 3;
  rooms: FollowedRoom[];
  openIds: string[];
  manual: boolean;
}

export interface VideoLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  visible: boolean;
}

/** 网格模式：单个格子（可合并跨行跨列） */
export interface GridSlot {
  id: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  videoId: string | null;
}

export interface GridLayoutState {
  rows: number;
  cols: number;
  slots: GridSlot[];
  gap: number;
}

export interface IVideo {
  id: string;
  order: number;
  url: string;
  rid: string;
  stream: string;
  qnName: IQnType;
  streamType: IStreamType;
  platform: Platform;
  playbackKey: number;
  layout: VideoLayout;
  status: VideoStatus;
  errorMessage?: string;
  isRefreshing?: boolean;
}

export interface IVideoOrder {
  id: string;
  url: string;
  qnName: IQnType;
  layout?: VideoLayout;
}

export interface IDanmaku {
  id: string;
  url: string;
  /** 归一化房间号，用于独立模式匹配直播画面 */
  rid: string;
  ws: { close?: () => void } | null;
}

export interface IHuyaChannelInfo {
  channelId: string | number;
  subChannelId: string | number;
}

export interface SharePayload {
  video: IVideoOrder[];
  danmaku: { url: string }[];
  layoutMode: LayoutMode;
  lineCount: number;
  gridLayout?: GridLayoutState;
}

declare global {
  interface Window {
    HuYaListener: (
      tid: string | number,
      sid: string | number,
      msgHandler: (data: { sContent: string; tBulletFormat: { iFontColor: number } }) => void
    ) => { close?: () => void };
  }
}
