// @name 三得利
const axios = require("axios");
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');

// 强制全局禁用系统代理环境变量，避免干扰
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
delete process.env.http_proxy;
delete process.env.https_proxy;

// ===================== 配置项 =====================
// PushPlus 通知Token（青龙环境变量）
const PLUSPLUS_TOKEN = process.env.PLUSPLUS_TOKEN || "";

// 从环境变量 jywip 读取内网服务器，支持换行分隔多个IP:端口
let SERVERS = [];
if (process.env.jywip) {
    SERVERS = process.env.jywip
        .split(/\r?\n/) // 兼容Windows换行\r\n、Linux换行\n
        .map(item => item.trim())
        .filter(item => item.length > 0); // 过滤空行、纯空格行
}
// 校验服务器列表，无配置直接终止脚本
if (SERVERS.length === 0) {
    console.error("❌ 未读取到环境变量 jywip，请配置 jywip，多个地址换行填写，格式示例：");
    console.error("192.168.1.21:8088\n192.168.31.111:8088");
    process.exit(1);
}
console.log(`✅ 成功读取 ${SERVERS.length} 台内网服务器：\n${SERVERS.join("\n")}`);

// 品赞代理配置（青龙环境变量）
const PROXY_API = process.env.PROXY_API || ""; // 代理提取API链接
const PROXY_TYPE = process.env.PROXY_TYPE || "http"; // 代理类型: http 或 socks5
const PROXY_RETRY_TIMES = 3; // 单个账号代理获取重试次数
const PROXY_VALIDATE_URL = "http://httpbin.org/ip"; // 代理验证地址
// 核心开关：每个账号独立获取专属代理（true=每个账号一个新IP，false=所有账号共用一个IP）
const ENABLE_PER_ACCOUNT_PROXY = true;
// 账号间代理获取间隔（毫秒，避免频繁调用代理API被限流）
const PROXY_FETCH_INTERVAL = 3000;
// 兜底开关：代理请求失败后，自动切换直连重试
const ENABLE_DIRECT_FALLBACK = true;

// 固定配置
const APPID = "wxb33ed03c6c715482";

// UA池（随机一个）
const USER_AGENT_LIST = [
    "Mozilla/5.0 (Linux; Android 14; 2512BPNDAC Build/UKQ1.230917.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.153 Mobile Safari/537.36 XWEB/1460043 MMWEBSDK/20251006 MiniProgramEnv/android",
    "Mozilla/5.0 (Linux; Android 13; Redmi K60 Build/TKQ1.221114.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36 XWEB/1300003 MMWEBSDK/20250901 MiniProgramEnv/android",
    "Mozilla/5.0 (Linux; Android 12; MI 11 Build/SKQ1.211006.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.111 Mobile Safari/537.36 XWEB/1250002 MMWEBSDK/20250801 MiniProgramEnv/android",
    "Mozilla/5.0 (Linux; Android 14; Honor Magic6 Build/UP1.240507.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/145.0.7560.128 Mobile Safari/537.36 XWEB/1450004 MMWEBSDK/20251001 MiniProgramEnv/android"
];

// ===================== 工具函数 =====================
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function random(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getUA() {
    return USER_AGENT_LIST[Math.floor(Math.random() * USER_AGENT_LIST.length)];
}

// ====================== 品赞IP代理系统（每个账号独立获取）======================
// 解析代理API响应（支持品赞等多种格式）
function parseProxyResponse(text) {
    text = text.trim();
    if (!text) return null;

    try {
        const data = JSON.parse(text);
        let proxyObj = null;
        
        // 品赞标准格式
        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
            proxyObj = data.data[0];
        } 
        // 普通JSON格式
        else if (data.ip && data.port) {
            proxyObj = data;
        }
        // 嵌套格式
        else if (data.result && data.result.ip && data.result.port) {
            proxyObj = data.result;
        }

        if (proxyObj) {
            return {
                host: proxyObj.ip,
                port: proxyObj.port,
                username: proxyObj.user || proxyObj.username || "",
                password: proxyObj.pass || proxyObj.password || ""
            };
        }
    } catch (e) {}

    // 纯文本格式 ip:port 或 ip:port:user:pass
    if (text.includes(":")) {
        const parts = text.split(":");
        if (parts.length >= 2) {
            return {
                host: parts[0],
                port: parseInt(parts[1]),
                username: parts[2] || "",
                password: parts[3] || ""
            };
        }
    }

    return null;
}

// 生成代理Agent（支持HTTP/SOCKS5）
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
            console.log(`🔧 生成SOCKS5代理：socks5://${auth}${host}:${port}`);
            return {
                httpAgent: new SocksProxyAgent(proxyUrl),
                httpsAgent: new SocksProxyAgent(proxyUrl)
            };
        } else {
            // HTTP/HTTPS代理
            const httpProxyUrl = `http://${auth}${host}:${port}`;
            const httpsProxyUrl = `http://${auth}${host}:${port}`;
            console.log(`🔧 生成HTTP代理：${httpProxyUrl}`);
            return {
                httpAgent: new HttpProxyAgent(httpProxyUrl),
                httpsAgent: new HttpsProxyAgent(httpsProxyUrl)
            };
        }
    } catch (e) {
        console.log(`❌ 生成代理Agent失败：${e.message}`);
        return null;
    }
}

// 验证代理是否可用
async function validateProxy(agent) {
    if (!agent) return false;
    try {
        const axiosConfig = {
            method: "get",
            url: PROXY_VALIDATE_URL,
            timeout: 15000,
            ...agent,
            maxRedirects: 5
        };
        const response = await axios(axiosConfig);
        const isSuccess = response.status === 200;
        if (isSuccess) {
            console.log(`✅ 代理验证通过，出口IP：${response.data?.origin || "未知"}`);
        }
        return isSuccess;
    } catch (e) {
        console.log(`⚠️ 代理验证失败，原因：${e.message}`);
        return false;
    }
}

// 获取有效代理（每个账号独立调用）
async function getValidProxy(accountName) {
    if (!PROXY_API) {
        console.log(`ℹ️ [${accountName}] 未配置代理API，使用直连`);
        return null;
    }

    console.log(`🔌 [${accountName}] 正在从品赞API获取专属代理 (${PROXY_TYPE})...`);
    
    for (let i = 0; i < PROXY_RETRY_TIMES; i++) {
        try {
            // 获取代理API用直连，避免循环依赖
            const response = await axios.get(PROXY_API, { 
                timeout: 15000,
                proxy: false
            });
            const proxyInfo = parseProxyResponse(response.data);
            
            if (!proxyInfo) {
                console.log(`⚠️ [${accountName}] 第${i+1}次获取代理失败：响应格式无法解析`);
                continue;
            }

            console.log(`✅ [${accountName}] 提取到专属代理：${proxyInfo.host}:${proxyInfo.port}`);
            
            // 生成代理Agent并验证
            const agent = buildProxyAgent(proxyInfo);
            const isValid = await validateProxy(agent);
            if (isValid) {
                return agent;
            } else {
                console.log(`⚠️ [${accountName}] 第${i+1}次获取的代理不可用，正在重试...`);
            }
        } catch (e) {
            console.log(`⚠️ [${accountName}] 第${i+1}次获取代理异常：${e.message}`);
        }
        
        if (i < PROXY_RETRY_TIMES - 1) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    console.log(`❌ [${accountName}] 连续多次获取代理失败，使用直连`);
    return null;
}

// 为业务请求添加代理配置
function addProxyToAxiosConfig(axiosConfig, proxyAgent) {
    if (!proxyAgent) return axiosConfig;
    return {
        ...axiosConfig,
        ...proxyAgent,
        timeout: axiosConfig.timeout || 20000
    };
}

// ===================== PushPlus通知函数 =====================
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

// ===================== 业务逻辑函数 =====================
// 获取code 【强制直连，不走代理】
async function getCode(server) {
    const requestUrl = `http://${server}/login`;
    console.log(`📡 [${server}] 正在请求登录服务：${requestUrl}`);
    try {
        const response = await axios.get(requestUrl, {
            params: { appId: APPID },
            timeout: 20000,
            proxy: false // 强制禁用代理
        });

        const res = response.data;
        if (res.err !== 0 || !res.code) {
            console.log(`❌ [${server}] 返回异常: ${JSON.stringify(res)}`);
            return null;
        }

        console.log(`✅ [${server}] 获取code成功`);
        return res.code;
    } catch (e) {
        console.log(`❌ [${server}] 请求异常: ${e.message}`);
        return null;
    }
}

// 登录 【走代理+直连兜底】
async function wxLogin(jsCode, UA, proxyAgent, server) {
    const baseConfig = {
        method: 'post',
        url: 'https://xiaodian.miyatech.com/api/user/login/wx-jc',
        headers: {
            'content-type': 'application/json;charset=UTF-8',
            'HH-FROM': '20230130307725',
            'HH-APP': APPID,
            'HH-VERSION': '0.6.1',
            'X-VERSION': '2.3.5',
            'HH-CI': 'saas-wechat-app',
            'appPublishType': '1',
            'componentSend': '1',
            'User-Agent': UA,
            'Referer': `https://servicewechat.com/${APPID}/72/page-frame.html`
        },
        data: {
            jsCode: jsCode,
            clientId: "saas-wechat-app",
            myUnionId: "",
            appPublishType: 1
        },
        timeout: 20000
    };

    try {
        let response = null;
        // 优先代理
        if (proxyAgent) {
            console.log(`🌐 [${server}] 正在使用专属代理发起登录请求...`);
            try {
                response = await axios(addProxyToAxiosConfig(baseConfig, proxyAgent));
            } catch (e) {
                console.log(`⚠️ [${server}] 代理登录失败，切换直连重试...`);
                response = await axios({ ...baseConfig, proxy: false });
            }
        } else {
            response = await axios({ ...baseConfig, proxy: false });
        }

        return response.data;
    } catch (e) {
        console.log(`❌ [${server}] 登录异常: ${e.message}`);
        return null;
    }
}

// 通用请求 【走代理+直连兜底】
async function commonPost(url, body, token, UA, proxyAgent, server) {
    const baseConfig = {
        method: 'post',
        url: `https://xiaodian.miyatech.com/api${url}`,
        headers: {
            'content-type': 'application/json;charset=UTF-8',
            'HH-FROM': '20230130307725',
            'HH-APP': APPID,
            'HH-VERSION': '0.6.1',
            'X-VERSION': '2.3.5',
            'HH-CI': 'saas-wechat-app',
            'appPublishType': '1',
            'componentSend': '1',
            'User-Agent': UA,
            'Referer': `https://servicewechat.com/${APPID}/72/page-frame.html`,
            'Authorization': `Bearer ${token}`
        },
        data: body,
        timeout: 20000
    };

    try {
        let response = null;
        // 优先代理
        if (proxyAgent) {
            try {
                response = await axios(addProxyToAxiosConfig(baseConfig, proxyAgent));
            } catch (e) {
                console.log(`⚠️ [${server}] 代理请求失败，切换直连重试...`);
                response = await axios({ ...baseConfig, proxy: false });
            }
        } else {
            response = await axios({ ...baseConfig, proxy: false });
        }

        return response.data;
    } catch (e) {
        console.log(`❌ [${server}] 请求异常: ${e.message}`);
        return null;
    }
}

// 单个账号执行逻辑
async function runAccount(server, globalProxyAgent) {
    let result = {
        server: server,
        success: false,
        signMsg: "",
        collectMsg: "",
        score: 0,
        error: "",
        proxyStatus: "未使用代理"
    };

    console.log(`\n===== 三得利 - ${server} 账号 =====`);
    const UA = getUA();

    // 核心逻辑：每个账号独立获取专属代理
    let proxyAgent = globalProxyAgent;
    if (ENABLE_PER_ACCOUNT_PROXY) {
        proxyAgent = await getValidProxy(server);
        result.proxyStatus = proxyAgent ? "使用专属代理" : "使用直连";
        // 代理获取后加间隔，避免频繁请求
        await sleep(PROXY_FETCH_INTERVAL);
    }

    try {
        // 启动延迟（防风控）
        let startDelay = random(2000, 6000);
        console.log(`⏳ [${server}] 启动延迟 ${startDelay / 1000}s`);
        await sleep(startDelay);

        // 1️⃣ 获取code
        let code = await getCode(server);
        if (!code) {
            result.error = "获取code失败";
            console.log(`❌ [${server}] 获取code失败`);
            return result;
        }

        // 2️⃣ 登录获取token
        let login = await wxLogin(code, UA, proxyAgent, server);
        if (!login || login.code != 200) {
            result.error = login?.msg || "登录失败";
            console.log(`❌ [${server}] 登录失败：${login?.msg || "未知错误"}`);
            return result;
        }

        let token = login.data.tokenInfo.access_token;
        console.log(`✅ [${server}] 登录成功`);
        await sleep(random(3000, 8000));

        // 3️⃣ 签到
        let sign = await commonPost('/coupon/auth/signIn', {"miniappId":159}, token, UA, proxyAgent, server);
        if (sign?.code == 200) {
            result.signMsg = `签到成功：${sign.data.integralToastText}`;
            console.log(`✅ [${server}] 签到成功：${sign.data.integralToastText}`);
        } else {
            result.signMsg = `签到失败：${sign?.msg || "未知错误"}`;
            console.log(`❌ [${server}] 签到失败：${sign?.msg || "未知错误"}`);
        }
        await sleep(random(2000, 5000));

        // 4️⃣ 收藏
        let save = await commonPost('/user/auth/user/collect/record/save', {"sceneValue":"1104"}, token, UA, proxyAgent, server);
        if (save?.code == 200) {
            result.collectMsg = `收藏成功：${save.data.integralToastText}`;
            console.log(`✅ [${server}] 收藏成功：${save.data.integralToastText}`);
        } else {
            result.collectMsg = `收藏失败：${save?.msg || "未知错误"}`;
            console.log(`❌ [${server}] 收藏失败：${save?.msg || "未知错误"}`);
        }
        await sleep(random(2000, 5000));

        // 5️⃣ 查询积分
        let info = await commonPost('/user/member/info', {}, token, UA, proxyAgent, server);
        result.score = info?.data?.currentScore || 0;
        console.log(`🎯 [${server}] 当前积分：${result.score}`);

        result.success = true;
        console.log(`✅ [${server}] 账号执行完成`);

    } catch (e) {
        result.error = e.message;
        console.log(`❌ [${server}] 执行异常：`, e.message);
    }

    return result;
}

// ===================== 主程序 =====================
(async () => {
    console.log('===== 三得利动态code签到（环境变量jywip读取内网+双端口+每个账号独立代理版）=====\n');

    // 兼容旧逻辑：如果关闭了单账号代理，就全局获取一个共用代理
    let globalProxyAgent = null;
    if (!ENABLE_PER_ACCOUNT_PROXY) {
        globalProxyAgent = await getValidProxy("全局共用");
    }

    const results = [];
    // 顺序执行所有服务器
    for (const server of SERVERS) {
        const res = await runAccount(server, globalProxyAgent);
        results.push(res);
        // 账号间间隔2秒
        await sleep(2000);
    }

    // 汇总结果并推送通知
    let notifyContent = "### 三得利多账号任务执行结果\n";
    results.forEach(res => {
        notifyContent += `\n#### ${res.server}
- 代理状态：${res.proxyStatus}
- 执行状态：${res.success ? "成功" : "失败"}
`;
        if (res.success) {
            notifyContent += `- 签到结果：${res.signMsg}
- 收藏结果：${res.collectMsg}
- 当前积分：${res.score}分
`;
        } else {
            notifyContent += `- 失败原因：${res.error}
`;
        }
    });

    await sendPlusPlusNotification("三得利多账号任务完成", notifyContent);
    console.log('\n===== 所有账号执行完成 =====');
})();
