import axios from "axios";

// 斗鱼获取真实房间号
export async function getRealRid_Douyu(rid: string): Promise<string> {
  const roomPath = encodeURIComponent(rid);
  const options = {
    proxy: false as const,
    timeout: 8000,
    headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.douyu.com/" },
  };
  try {
    const { data } = await axios.get(`https://wxapp.douyucdn.cn/Live/Room/info/${roomPath}`, { ...options, timeout: 10000 });
    const realRid = data?.data?.room_id;
    if (/^\d+$/.test(String(realRid)) && Number(realRid) > 0) return String(realRid);
  } catch { /* 小程序接口异常时，继续用网页接口验证房间。 */ }

  // 部分正常直播的房间在小程序接口返回异常文本；两次请求的超时合计低于客户端的 20 秒。
  const { data } = await axios.get(`https://www.douyu.com/betard/${roomPath}`, options);
  const realRid = data?.room?.room_id;
  if (!/^\d+$/.test(String(realRid)) || Number(realRid) <= 0) throw new Error("暂时无法验证斗鱼房间");
  return String(realRid);
}
