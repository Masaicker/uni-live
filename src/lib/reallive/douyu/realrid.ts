import axios from "axios";

// 斗鱼获取真实房间号
export function getRealRid_Douyu(rid: string): Promise<string> {
  return new Promise((resolve, reject) => {
    axios.get("https://wxapp.douyucdn.cn/Live/Room/info/" + rid, {
      // 直连斗鱼，避免环境代理将 HTTPS 请求错误转发为 HTTP。
      proxy: false,
      timeout: 15000,
    })
      .then((ret) => {
        const realRid = ret.data?.data?.room_id;
        if (!/^\d+$/.test(String(realRid)) || Number(realRid) <= 0) throw new Error("暂时无法验证斗鱼房间");
        resolve(String(realRid));
      })
      .catch((err) => {
        reject(err);
      });
  });
}
