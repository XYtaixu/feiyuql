// @name 蜜雪冰城
const axios = require("axios");
const rs = require("jsrsasign");

// ====================== 配置项 ======================
// PushPlus 通知Token（在青龙面板环境变量中设置 PLUSPLUS_TOKEN）
const PLUSPLUS_TOKEN = process.env.PLUSPLUS_TOKEN || "";

// 从环境变量 jywip 读取内网wxcode服务，多条换行分隔
let SERVERS = [];
const envJywip = process.env.jywip || "";
if (envJywip) {
    SERVERS = envJywip
        .split(/\r?\n/)
        .map(item => item.trim())
        .filter(item => item.length > 0);
}
// 无有效地址直接退出并提示
if (SERVERS.length === 0) {
    console.error("❌ 错误：未读取到环境变量 jywip 或无有效IP端口！");
    console.error("配置示例（青龙环境变量值，每行一个）：");
    console.error("192.168.1.21:8088");
    console.error("192.168.31.111:8088");
    process.exit(1);
}
console.log(`✅ 成功读取 ${SERVERS.length} 台内网wxcode服务：`);
SERVERS.forEach(item => console.log(` - ${item}`));
console.log("----------------------------------------\n");

// 固定配置（无需修改）
const APP_ID = "d82be6bbc1da11eb9dd000163e122ecb";
const MINI_APP_ID = "wx7696c66d2245d107";
const UA = "Mozilla/5.0 (Linux; Android 15; 22061218C Build/AQ3A.250226.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.177 Mobile Safari/537.36 XWEB/1460075 MMWEBSDK/20260202 MMWEBID/6435 MicroMessenger/8.0.71.3080(0x28004761) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64 miniProgram/wx7696c66d2245d107";

const privateKeyString = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQCtypUdHZJKlQ9L
L6lIJSphnhqjke7HclgWuWDRWvzov30du235cCm13mqJ3zziqLCwstdQkuXo9sOP
Ih94t6nzBHTuqYA1whrUnQrKfv9X4/h3QVkzwT+xWflE+KubJZoe+daLKkDeZjVW
nUku8ov0E5vwADACfntEhAwiSZUALX9UgNDTPbj5ESeII+VztZ/KOFsRHMTfDb1G
IR/dAc1mL5uYbh0h2Fa/fxRPgf7eJOeWGiygesl3CWj0Ue13qwX9PcG7klJXfToI
576MY+A7027a0aZ49QhKnysMGhTdtFCksYG0lwPz3bIR16NvlxNLKanc2h+ILTFQ
bMW/Y3DRAgMBAAECggEBAJGTfX6rE6zX2bzASsu9HhgxKN1VU6/L70/xrtEPp4SL
SpHKO9/S/Y1zpsigr86pQYBx/nxm4KFZewx9p+El7/06AX0djOD7HCB2/+AJq3iC
5NF4cvEwclrsJCqLJqxKPiSuYPGnzji9YvaPwArMb0Ff36KVdaHRMw58kfFys5Y2
HvDqh4x+sgMUS7kSEQT4YDzCDPlAoEFgF9rlXnh0UVS6pZtvq3cR7pR4A9hvDgX9
wU6zn1dGdy4MEXIpckuZkhwbqDLmfoHHeJc5RIjRP7WIRh2CodjetgPFE+SV7Sdj
ECmvYJbet4YLg+Qil0OKR9s9S1BbObgcbC9WxUcrTgECgYEA/Yj8BDfxcsPK5ebE
9N2teBFUJuDcHEuM1xp4/tFisoFH90JZJMkVbO19rddAMmdYLTGivWTyPVsM1+9s
tq/NwsFJWHRUiMK7dttGiXuZry+xvq/SAZoitgI8tXdDXMw7368vatr0g6m7ucBK
jZWxSHjK9/KVquVr7BoXFm+YxaECgYEAr3sgVNbr5ovx17YriTqe1FLTLMD5gPrz
ugJj7nypDYY59hLlkrA/TtWbfzE+vfrN3oRIz5OMi9iFk3KXFVJMjGg+M5eO9Y8m
14e791/q1jUuuUH4mc6HttNRNh7TdLg/OGKivE+56LEyFPir45zw/dqwQM3jiwIz
yPz/+bzmfTECgYATxrOhwJtc0FjrReznDMOTMgbWYYPJ0TrTLIVzmvGP6vWqG8rI
S8cYEA5VmQyw4c7G97AyBcW/c3K1BT/9oAj0wA7wj2JoqIfm5YPDBZkfSSEcNqqy
5Ur/13zUytC+VE/3SrrwItQf0QWLn6wxDxQdCw8J+CokgnDAoehbH6lTAQKBgQCE
67T/zpR9279i8CBmIDszBVHkcoALzQtU+H6NpWvATM4WsRWoWUx7AJ56Z+joqtPK
G1WztkYdn/L+TyxWADLvn/6Nwd2N79MyKyScKtGNVFeCCJCwoJp4R/UaE5uErBNn
OH+gOJvPwHj5HavGC5kYENC1Jb+YCiEDu3CB0S6d4QKBgQDGYGEFMZYWqO6+LrfQ
ZNDBLCI2G4+UFP+8ZEuBKy5NkDVqXQhHRbqr9S/OkFu+kEjHLuYSpQsclh6XSDks
5x/hQJNQszLPJoxvGECvz5TN2lJhuyCupS50aGKGqTxKYtiPHpWa8jZyjmanMKnE
dOGyw/X4SFyodv8AEloqd81yGg==
-----END PRIVATE KEY-----`;

// ====================== 工具函数 ======================
function ts13() {
    return Date.now();
}

// RSA签名
function getSHA256withRSA(content) {
    const key = rs.KEYUTIL.getKey(privateKeyString);
    const sig = new rs.KJUR.crypto.Signature({ alg: "SHA256withRSA" });
    sig.init(key);
    sig.updateString(content);
    return rs.hextob64u(sig.sign());
}

// PushPlus通知函数
async function sendPlusPlusNotification(title, content) {
    if (!PLUSPLUS_TOKEN) return;
    try {
        await axios.post("https://www.pushplus.plus/send", {
            token: PLUSPLUS_TOKEN,
            title: title,
            content: content,
            template: "txt"
        }, { timeout: 5000 });
        console.log("✅ 通知推送成功");
    } catch (e) {
        console.log("❌ 通知推送失败：", e.message);
    }
}

// 查询雪王币
async function getUserPoint(token) {
    try {
        const t = ts13();
        const sign = getSHA256withRSA(`appId=${APP_ID}&t=${t}`);
        const { data } = await axios.get("https://mxsa.mxbc.net/api/v1/customer/info", {
            params: { t, appId: APP_ID, sign },
            headers: {
                "Access-Token": token,
                "version": "2.8.27",
                "User-Agent": UA
            },
            timeout: 8000
        });
        return data.code === 0 ? parseInt(data.data.customerPoint) : 0;
    } catch (e) {
        return 0;
    }
}

// 魔法铺任务
async function doMagicShop(token) {
    try {
        const t = ts13();
        const sign = getSHA256withRSA(`appId=${APP_ID}&t=${t}`);
        await axios.get("https://mxsa.mxbc.net/api/v1/duiba/getLoginUrl", {
            params: { appId: APP_ID, t, sign, dbredirect: "" },
            headers: { "Access-Token": token, "version": "2.8.27", "User-Agent": UA },
            timeout: 10000
        });
        return true;
    } catch (e) {
        return false;
    }
}

// 单个服务器执行逻辑
async function runServer(server) {
    let result = {
        server: server,
        success: false,
        before: 0,
        after: 0,
        gain: 0,
        error: ""
    };

    console.log(`\n==============================`);
    console.log(`蜜雪冰城 - ${server} 账号任务`);
    console.log(`==============================`);

    try {
        // 1. 获取登录code
        const code = (await axios.get(`http://${server}/login?appId=${MINI_APP_ID}`)).data.code;

        // 2. code换session
        const t1 = ts13();
        const session = await axios.post("https://mxsa.mxbc.net/api/v1/app/code2Session", {
            code, miniAppId: MINI_APP_ID, t: t1, appId: APP_ID,
            sign: getSHA256withRSA(`appId=${APP_ID}&code=${code}&miniAppId=${MINI_APP_ID}&t=${t1}`)
        }, { headers: { version: "2.8.27" } });

        const { openid, unionid } = session.data.data;

        // 3. 登录获取token
        const t2 = ts13();
        const loginRes = await axios.post("https://mxsa.mxbc.net/api/v2/app/loginByAuthCode", {
            authCode: code, openId: openid, unionid, third: "wxmini", miniAppId: MINI_APP_ID,
            t: t2, appId: APP_ID,
            sign: getSHA256withRSA(`appId=${APP_ID}&authCode=${code}&miniAppId=${MINI_APP_ID}&openId=${openid}&t=${t2}&third=wxmini&unionid=${unionid}`)
        }, { headers: { version: "2.8.27", "x-ssos-cid": unionid } });

        const token = loginRes.data.data.accessToken;
        const before = await getUserPoint(token);
        console.log(`✅ ${server} 登录成功 | 当前雪王币：${before}`);

        // 4. 执行任务
        console.log(`\n执行任务：访问魔法铺...`);
        await doMagicShop(token);
        await new Promise(r => setTimeout(r, 1500));

        // 5. 结果展示
        const after = await getUserPoint(token);
        const gain = Math.max(0, after - before);

        console.log(`\n======================================`);
        console.log(`💎 ${server} 执行前：${before} 雪王币`);
        console.log(`✅ ${server} 本次获得：${gain} 雪王币`);
        console.log(`💎 ${server} 执行后：${after} 雪王币`);
        console.log(`======================================`);

        result.success = true;
        result.before = before;
        result.after = after;
        result.gain = gain;

    } catch (e) {
        result.error = e.message;
        console.log(`❌ ${server} 执行失败：`, e.message);
    }
    return result;
}

// ====================== 主逻辑 ======================
async function run() {
    const results = [];
    // 顺序执行所有服务器
    for (const server of SERVERS) {
        const res = await runServer(server);
        results.push(res);
        // 账号间间隔2秒，避免请求过快
        await new Promise(r => setTimeout(r, 2000));
    }

    // 汇总结果并推送通知
    let notifyContent = "### 蜜雪冰城多账号任务执行结果\n";
    results.forEach(res => {
        if (res.success) {
            notifyContent += `\n#### ${res.server}
- 执行状态：成功
- 执行前雪王币：${res.before}
- 本次获得：${res.gain}
- 执行后雪王币：${res.after}
`;
        } else {
            notifyContent += `\n#### ${res.server}
- 执行状态：失败
- 失败原因：${res.error}
`;
        }
    });

    await sendPlusPlusNotification("蜜雪冰城多账号任务完成", notifyContent);
}

// 启动
(async () => {
    console.log("🚀 蜜雪冰城 魔法铺多账号任务");
    await run();
    console.log("\n🏁 所有账号任务执行完成！");
})();
