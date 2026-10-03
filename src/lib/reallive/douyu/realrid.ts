import axios from "axios";

type DouyuRoom = {
  room_id: string | number;
  owner_name?: string;
  room_name?: string;
  owner_avatar?: string;
  show_status?: string | number;
  videoLoop?: string | number;
};

export async function getDouyuRoom(rid: string): Promise<DouyuRoom> {
  const { data } = await axios.get<{ room?: DouyuRoom }>(`https://www.douyu.com/betard/${encodeURIComponent(rid)}`, {
    proxy: false as const,
    timeout: 10000,
    headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.douyu.com/" },
  });
  const room = data?.room;
  if (!room || !/^\d+$/.test(String(room.room_id)) || Number(room.room_id) <= 0) throw new Error("暂时无法验证斗鱼房间");
  return room;
}

export async function getRealRid_Douyu(rid: string): Promise<string> {
  return String((await getDouyuRoom(rid)).room_id);
}
