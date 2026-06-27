// @name 可口可乐
const axios = require("axios");
const { SocksProxyAgent } = require("socks-proxy-agent");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { HttpProxyAgent } = require("http-proxy-agent");

delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
delete process.env.http_proxy;
delete process.env.https_proxy;

const APPID = "wxa5811e0426a94686";

// 从环境变量 jywip 读取内网服务，多条换行分隔
let SERVERS = [];
const envJywip = process.env.jywip || "";
if (envJywip) {
    SERVERS = envJywip
        .split(/\r?\n/)
        .map(item => item.trim())
        .filter(item => item.length > 0);
}
// 校验是否存在有效地址
if (SERVERS.length === 0) {
    console.error("❌ 错误：未读取到环境变量 jywip 或无有效IP端口！");
    console.error("配置示例（变量值多条换行填写）：");
    console.error("127.0.0.1:8088");
    console.error("192.168.31.111:8088");
    process.exit(1);
}
console.log(`✅ 成功读取 ${SERVERS.length} 台内网服务：`);
SERVERS.forEach(item => console.log(` - ${item}`));
console.log("----------------------------------------\n");

const PLUSPLUS_TOKEN = process.env.PLUSPLUS_TOKEN || "";

const PROXY_API = process.env.PROXY_API || "";
const PROXY_TYPE = (process.env.PROXY_TYPE || "http").toLowerCase();
const PROXY_RETRY_TIMES = 3;
const PROXY_VALIDATE_URL = "http://httpbin.org/ip";
const PROXY_FETCH_INTERVAL = 3000;
const ENABLE_DIRECT_FALLBACK = true;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090a13) UnifiedPCWindowsWechat(0xf2541923) XWEB/19823";

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function random(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function mask(value) {
    value = String(value || "");
    if (value.length <= 12) return value;
    return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function logTitle() {
    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║ 🥤 可口可乐动态 code 签到                   ║");
    console.log(`║ 🕒 ${new Date().toLocaleString("zh-CN")}                 ║`);
    console.log(`║ 🔢 账号数量: ${SERVERS.length}                              ║`);
    console.log("╚══════════════════════════════════════════════╝\n");
}

function logAccount(index, total, server) {
    console.log("\n┌──────────────────────────────────────────────┐");
    console.log(`│ 🧩 账号 ${index} / ${total}`);
    console.log(`│ 🌍 来源 ${server}`);
    console.log("└──────────────────────────────────────────────┘");
}

function parseProxyResponse(text) {
    if (typeof text !== "string") {
        text = JSON.stringify(text);
    }

    text = text.trim();
    if (!text) return null;

    try {
        const data = JSON.parse(text);
        let proxyObj = null;

        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
            proxyObj = data.data[0];
        } else if (data.data && typeof data.data === "object") {
            proxyObj = data.data;
        } else if (data.ip && data.port) {
            proxyObj = data;
        } else if (data.result && data.result.ip && data.result.port) {
            proxyObj = data.result;
        }

        if (proxyObj) {
            return {
                host: proxyObj.ip || proxyObj.host,
                port: proxyObj.port,
                username: proxyObj.user || proxyObj.username || "",
                password: proxyObj.pass || proxyObj.password || ""
            };
        }
    } catch (e) {}

    if (text.includes(":")) {
        const parts = text.split(":");
        if (parts.length >= 2) {
            return {
                host: parts[0],
                port: Number(parts[1]),
                username: parts[2] || "",
                password: parts[3] || ""
            };
        }
    }

    return null;
}

function buildProxyAgent(proxyInfo) {
    if (!proxyInfo) return null;

    const { host, port, username, password } = proxyInfo;
    let auth = "";

    if (username && password) {
        auth = `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`;
    }

    try {
        if (PROXY_TYPE === "socks5") {
            const proxyUrl = `socks5://${auth}${host}:${port}`;
            console.log(`🛠️ [代理] 生成 SOCKS5 代理 ${host}:${port}`);
            return {
                httpAgent: new SocksProxyAgent(proxyUrl),
                httpsAgent: new SocksProxyAgent(proxyUrl)
            };
        }

        const proxyUrl = `http://${auth}${host}:${port}`;
        console.log(`🛠️ [代理] 生成 HTTP 代理 ${host}:${port}`);
        return {
            httpAgent: new HttpProxyAgent(proxyUrl),
            httpsAgent: new HttpsProxyAgent(proxyUrl)
        };
    } catch (e) {
        console.log(`❌ [代理] 生成代理失败: ${e.message}`);
        return null;
    }
}

async function validateProxy(agent) {
    if (!agent) return { ok: false, ip: "" };

    try {
        const res = await axios({
            method: "get",
            url: PROXY_VALIDATE_URL,
            timeout: 15000,
            ...agent
        });

        if (res.status === 200) {
            const ip = res.data?.origin || "未知";
            console.log(`✅ [代理] 验证通过，出口 IP: ${ip}`);
            return { ok: true, ip };
        }
    } catch (e) {
        console.log(`⚠️ [代理] 验证失败: ${e.message}`);
    }

    return { ok: false, ip: "" };
}

async function getValidProxy(accountName) {
    if (!PROXY_API) {
        console.log(`⚠️ [代理] ${accountName} 未配置 PROXY_API，使用直连`);
        return { agent: null, ip: "" };
    }

    console.log(`🌐 [代理] ${accountName} 正在获取品赞代理...`);

    for (let i = 1; i <= PROXY_RETRY_TIMES; i++) {
        try {
            const res = await axios.get(PROXY_API, {
                timeout: 15000,
                proxy: false
            });

            const proxyInfo = parseProxyResponse(res.data);

            if (!proxyInfo) {
                console.log(`⚠️ [代理] 第 ${i} 次解析失败`);
                continue;
            }

            console.log(`✅ [代理] 提取到 ${proxyInfo.host}:${proxyInfo.port}`);

            const agent = buildProxyAgent(proxyInfo);
            const valid = await validateProxy(agent);

            if (valid.ok) {
                return { agent, ip: valid.ip };
            }
        } catch (e) {
            console.log(`⚠️ [代理] 第 ${i} 次获取异常: ${e.message}`);
        }

        if (i < PROXY_RETRY_TIMES) {
            await sleep(2000);
        }
    }

    console.log("⚠️ [代理] 获取失败，使用直连");
    return { agent: null, ip: "" };
}

async function requestWithProxy(config, proxyAgent, server) {
    if (proxyAgent) {
        try {
            return await axios({
                timeout: 30000,
                ...config,
                ...proxyAgent
            });
        } catch (e) {
            console.log(`⚠️ [代理] ${server} 代理请求失败: ${e.message}`);

            if (!ENABLE_DIRECT_FALLBACK) {
                throw e;
            }

            console.log("🔁 [兜底] 切换直连重试");
        }
    }

    return await axios({
        timeout: 30000,
        proxy: false,
        ...config
    });
}

async function sendPushPlus(title, content) {
    if (!PLUSPLUS_TOKEN) {
        console.log("⚠️ [PushPlus] 未配置 PLUSPLUS_TOKEN，跳过推送");
        return;
    }

    try {
        await axios.post(
            "https://www.pushplus.plus/send",
            {
                token: PLUSPLUS_TOKEN,
                title,
                content,
                template: "txt"
            },
            {
                timeout: 10000,
                proxy: false
            }
        );

        console.log("✅ [PushPlus] 推送成功");
    } catch (e) {
        console.log(`❌ [PushPlus] 推送失败: ${e.message}`);
    }
}

async function getCode(server) {
    const url = `http://${server}/login`;

    console.log(`🔐 [授权] 请求本地 code 服务: ${url}`);

    try {
        const res = await axios.get(url, {
            params: { appId: APPID },
            timeout: 20000,
            proxy: false
        });

        if (res.data?.err !== 0 || !res.data?.code) {
            console.log(`❌ [授权] code 获取失败: ${JSON.stringify(res.data)}`);
            return null;
        }

        console.log("✅ [授权] code 获取成功");
        return res.data.code;
    } catch (e) {
        console.log(`❌ [授权] code 获取异常: ${e.message}`);
        return null;
    }
}

async function getUserToken(code, proxyAgent, server) {
    const config = {
        method: "GET",
        url: `https://member-api.icoke.cn/api/sp-portal/store/icoke/wechat/loginNoCache/${code}`,
        headers: {
            "User-Agent": UA,
            "Accept": "application/json, text/plain, */*",
            "xweb_xhr": "1",
            "Content-Type": "application/json",
            "Sec-Fetch-Site": "cross-site",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
            "Referer": "https://servicewechat.com/wxa5811e0426a94686/496/page-frame.html",
            "Accept-Language": "zh-CN,zh;q=0.9"
        }
    };

    try {
        const { data } = await requestWithProxy(config, proxyAgent, server);

        if (data?.jwtString) {
            console.log(`✅ [登录] token 获取成功: ${mask(data.jwtString)}`);
            return {
                token: data.jwtString,
                raw: data
            };
        }

        console.log(`❌ [登录] token 获取失败: ${data?.message || JSON.stringify(data)}`);
        return {
            token: null,
            raw: data
        };
    } catch (e) {
        console.log(`❌ [登录] token 请求异常: ${e.message}`);
        return {
            token: null,
            raw: null
        };
    }
}

async function getUserInfo(token, proxyAgent, server) {
    const config = {
        method: "GET",
        url: "https://member-api.icoke.cn/api/icoke-customer/icoke/mini/customer/main/points",
        headers: {
            "accept": "application/json, text/plain, */*",
            "accept-language": "zh-CN,zh;q=0.9",
            "authorization": token,
            "content-type": "application/json",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "cross-site",
            "xweb_xhr": "1",
            "Referer": "https://servicewechat.com/wxa5811e0426a94686/421/page-frame.html",
            "Referrer-Policy": "unsafe-url"
        }
    };

    try {
        const { data } = await requestWithProxy(config, proxyAgent, server);
        console.log(`💰 [积分] 当前快乐瓶: ${data?.point ?? "-"}`);
        return data;
    } catch (e) {
        console.log(`⚠️ [积分] 查询异常: ${e.message}`);
        return null;
    }
}

async function addSign(token, proxyAgent, server) {
    const config = {
        method: "GET",
        url: "https://member-api.icoke.cn/api/icoke-sign/icoke/mini/sign/main/sign",
        headers: {
            "accept": "application/json, text/plain, */*",
            "accept-language": "zh-CN,zh;q=0.9",
            "authorization": token,
            "content-type": "application/json",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "cross-site",
            "xweb_xhr": "1",
            "Referer": "https://servicewechat.com/wxa5811e0426a94686/421/page-frame.html",
            "Referrer-Policy": "unsafe-url"
        }
    };

    try {
        const { data } = await requestWithProxy(config, proxyAgent, server);

        if (data?.success === true) {
            const msg = `签到成功，获得 ${data.point ?? "-"} 快乐瓶`;
            console.log(`✅ [签到] ${msg}`);
            return {
                success: true,
                message: msg,
                raw: data
            };
        }

        const msg = data?.message || data?.msg || JSON.stringify(data);
        console.log(`❌ [签到] 签到失败: ${msg}`);

        return {
            success: false,
            message: msg,
            raw: data
        };
    } catch (e) {
        console.log(`❌ [签到] 请求异常: ${e.message}`);
        return {
            success: false,
            message: e.message,
            raw: null
        };
    }
}

async function runAccount(index, total, server) {
    const result = {
        server,
        success: false,
        proxyStatus: "未使用代理",
        proxyIp: "-",
        token: "-",
        beforePoint: "-",
        signMsg: "-",
        afterPoint: "-",
        error: ""
    };

    logAccount(index, total, server);

    const proxy = await getValidProxy(server);
    const proxyAgent = proxy.agent;
    result.proxyStatus = proxyAgent ? "使用专属代理" : "使用直连";
    result.proxyIp = proxy.ip || "-";

    await sleep(PROXY_FETCH_INTERVAL);

    const delay = random(500, 1000);
    console.log(`⏳ [延迟] 启动延迟 ${(delay / 1000).toFixed(1)}s`);
    await sleep(delay);

    const code = await getCode(server);
    if (!code) {
        result.error = "获取 code 失败";
        return result;
    }

    const login = await getUserToken(code, proxyAgent, server);
    if (!login.token) {
        result.error = "获取 token 失败";
        return result;
    }

    result.token = mask(login.token);

    const beforeInfo = await getUserInfo(login.token, proxyAgent, server);
    result.beforePoint = beforeInfo?.point ?? "-";

    await sleep(random(2000, 5000));

    const sign = await addSign(login.token, proxyAgent, server);
    result.signMsg = sign.message;

    await sleep(random(2000, 5000));

    const afterInfo = await getUserInfo(login.token, proxyAgent, server);
    result.afterPoint = afterInfo?.point ?? "-";

    result.success = sign.success || String(sign.message).includes("已") || String(sign.message).includes("重复");

    if (!result.success) {
        result.error = sign.message;
    }

    return result;
}

function buildNotify(results) {
    const successCount = results.filter(item => item.success).length;
    const failCount = results.length - successCount;

    let content = `🥤 可口可乐多账号签到结果

━━━━━━━━━━━━━━━━━━━━
🏁 总结：${successCount} 成功 / ${failCount} 失败
🕒 时间：${new Date().toLocaleString("zh-CN")}
━━━━━━━━━━━━━━━━━━━━
`;

    results.forEach((res, index) => {
        const icon = res.success ? "✅" : "❌";

        content += `
🧩 账号 ${index + 1}
🌍 来源：${res.server}
🌐 代理：${res.proxyStatus}
📡 出口IP：${res.proxyIp}
🔐 Token：${res.token}
💰 签到前快乐瓶：${res.beforePoint}
📝 签到结果：${res.signMsg}
💰 签到后快乐瓶：${res.afterPoint}
${icon} 结果：${res.success ? "成功" : "失败"}
`;

        if (!res.success) {
            content += `❌ 原因：${res.error}\n`;
        }

        content += "━━━━━━━━━━━━━━━━━━━━\n";
    });

    return content;
}

(async () => {
    logTitle();

    const results = [];

    for (let i = 0; i < SERVERS.length; i++) {
        try {
            const res = await runAccount(i + 1, SERVERS.length, SERVERS[i]);
            results.push(res);
        } catch (e) {
            console.log(`❌ [主程序] ${SERVERS[i]} 执行异常: ${e.message}`);
            results.push({
                server: SERVERS[i],
                success: false,
                proxyStatus: "-",
                proxyIp: "-",
                token: "-",
                beforePoint: "-",
                signMsg: "-",
                afterPoint: "-",
                error: e.message
            });
        }

        if (i < SERVERS.length - 1) {
            console.log("⏳ [间隔] 等待 2s 后处理下一个账号");
            await sleep(2000);
        }
    }

    const successCount = results.filter(item => item.success).length;
    const failCount = results.length - successCount;

    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║ 🏁 可口可乐任务执行完成                     ║");
    console.log(`║ ✅ 成功: ${successCount}`);
    console.log(`║ ❌ 失败: ${failCount}`);
    console.log(`║ 🕒 ${new Date().toLocaleString("zh-CN")}`);
    console.log("╚══════════════════════════════════════════════╝");

    await sendPushPlus("🥤 可口可乐多账号签到完成", buildNotify(results));
})().catch(e => {
    console.log(`❌ [全局异常] ${e.message}`);
});
