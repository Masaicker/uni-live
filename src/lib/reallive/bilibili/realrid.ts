import axios from "axios";

export async function getRealRid_Bilibili(rid: string): Promise<string> {
  let data;
  try {
    const response = await axios.get("https://api.live.bilibili.com/room/v1/Room/room_init", {
      params: { id: rid }, proxy: false, timeout: 10000,
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://live.bilibili.com/" },
    });
    data = response.data;
  } catch { throw new Error("哔哩哔哩房间接口连接失败或超时"); }
  const realRid = String(data?.data?.room_id ?? "");
  if (data?.code !== 0 || !/^\d+$/.test(realRid) || realRid === "0") throw new Error("无法获取哔哩哔哩房间号，请确认地址正确");
  return realRid;
}
