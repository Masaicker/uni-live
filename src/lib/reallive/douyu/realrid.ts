import axios from "axios";

type DouyuRoom = {
  room_id: string | number;
  vipId?: string | number;
  owner_name?: string;
  room_name?: string;
  owner_avatar?: string;
  show_status?: string | number;
  videoLoop?: string | number;
};

function readRoom(value: unknown): DouyuRoom | undefined {
  if (!value || typeof value !== "object") return;
  const room = value as DouyuRoom;
  if (/^\d+$/.test(String(room.room_id)) && Number(room.room_id) > 0) return room;
}

function findPageRoom(value: unknown, rid: string): DouyuRoom | undefined {
  if (!value || typeof value !== "object") return;
  const item = value as { roomInfo?: { room?: unknown } };
  const room = readRoom(item.roomInfo?.room);
  if (room && String(room.owner_name ?? "").trim()) {
    const id = rid.replace(/^0+(?=\d)/, "");
    if (!/^\d+$/.test(id) || String(room.room_id) === id || String(room.vipId) === id) return room;
  }
  for (const child of Object.values(value)) {
    const found = findPageRoom(child, rid);
    if (found) return found;
  }
}

function readPageRoom(html: unknown, rid: string): DouyuRoom | undefined {
  if (typeof html !== "string") return;
  let payload = "";
  // 只解码官网嵌入的 JSON 数据，不执行页面脚本；短号的映射在 roomInfo 中。
  for (const match of html.matchAll(/self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g)) {
    try { payload += JSON.parse(match[1]); } catch { /* Ignore incomplete data chunks. */ }
  }
  for (const row of payload.split("\n")) {
    const separator = row.indexOf(":");
    if (separator < 0) continue;
    try {
      const room = findPageRoom(JSON.parse(row.slice(separator + 1)), rid);
      if (room) return room;
    } catch { /* Other page records are not room JSON. */ }
  }
}

export async function getDouyuRoom(rid: string): Promise<DouyuRoom> {
  const roomPath = encodeURIComponent(rid);
  const options = {
    proxy: false as const,
    timeout: 8000,
    maxContentLength: 2 * 1024 * 1024,
    headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.douyu.com/" },
  };
  try {
    const { data } = await axios.get<{ room?: unknown }>(`https://www.douyu.com/betard/${roomPath}`, options);
    const room = readRoom(data?.room);
    if (room) return room;
  } catch { /* Try the official room page when the metadata endpoint fails. */ }

  // betard 不接受部分短号；官网页面会解析短号，并直接包含房间号和主播信息。
  const { data } = await axios.get(`https://www.douyu.com/${roomPath}`, options);
  const room = readPageRoom(data, rid);
  if (!room) throw new Error("暂时无法验证斗鱼房间");
  return room;
}

export async function getRealRid_Douyu(rid: string): Promise<string> {
  return String((await getDouyuRoom(rid)).room_id);
}
