# 认证与凭证流转

本文对应 0.9.0-alpha.1 源码和锁定的 Pi AI 1.4.0。管理登录、模型授权、消息入口认证相互独立；GitHub 连接不替代其中任何一种授权。

## 组件

| 组件 | 代码 | 作用 |
| --- | --- | --- |
| 初始密钥 | scripts/setup.mjs、src/config.ts | 生成独立管理密码和 32 字节加密密钥；默认只监听本机 |
| 管理请求 | src/server.ts | 密码登录、会话 Cookie、Host/Origin 校验、CSRF、限流 |
| OAuth 编排 | src/oauth.ts | 开始/取消授权、展示链接与输入提示、超时、退出 |
| 模型适配 | src/ai.ts | Pi AI provider、CredentialStore、模型请求和权限错误 |
| 持久化 | src/store.ts | SQLite、AES-256-GCM 加密、刷新串行锁 |
| 消息入口 | src/weixin.ts、src/qq.ts、src/onebot.ts | 平台认证、账号绑定、白名单 |
| 独立生图登录 | src/codex-images.ts | 使用本机 Codex CLI 已登录的 ChatGPT 账号 |
| 本地语音认证 | scripts/local-tts-server.py、scripts/voice-engine.py | 本机工作进程 Bearer 令牌 |

## 管理网页请求

1. 浏览器 POST `/api/login`，提交 `.env` 中的 `ADMIN_PASSWORD`。该密码不是 SnowLuma 控制台密码，也不是 QQ 访问令牌。
2. 服务核对 Host 与 PUBLIC_ORIGIN，写请求核对 Origin。密码通过 SHA-256 后做等长、恒定时间比较；没有密码数据库或找回流程。初始化生成高熵密码，不应改成容易猜测的口令。
3. 成功后随机生成 32 字节会话 ID。浏览器仅保存 `bridge_session`，设 HttpOnly、SameSite=Strict、8 小时有效期；Secure 由 COOKIE_SECURE 控制。
4. 会话和 CSRF 令牌只在服务内存中，重启失效。登录后 GET `/api/state` 返回 CSRF 令牌；后续 API 写请求必须携带 `X-CSRF-Token`。
5. `/api/` 下除登录外的请求需要有效会话。退出删除服务端会话并清 Cookie。静态管理页面和 `/health` 不要求登录；健康接口不返回凭证。

远程管理要求 HTTPS 与 COOKIE_SECURE=true，优先使用 SSH 转发。本地 HTTP 依赖回环网络和本机安全，不应改成公网明文服务。

## ChatGPT 订阅 OAuth

1. 已登录管理员 POST `/api/oauth/start` 指定 `openai`。OAuthManager 调用 `ai.models.login(provider, 'oauth', ...)`，向页面返回 SDK 的通知和输入提示。
2. Pi AI 的 `dist/auth/oauth/openai-chatgpt.js` 生成 PKCE verifier/challenge 和随机 state，在 `127.0.0.1:1455/auth/callback` 临时监听；浏览器前往 OpenAI 授权站点登录。项目不收取 ChatGPT 密码。
3. SDK 检查回调中的 state、code、issued client_id，通过 HTTPS 以授权码及 code_verifier 换取令牌；验证返回 scope 包含 `chatgpt.tokens.use.direct`。若回调无法自动到达，可按管理页提示提交完整回调 URL，仅提交给自己的后台。
4. SDK 返回 access/refresh、有效期、clientId、scopes；SqlCredentials 将其交给 Store 加密保存。管理页面只显示是否保存和有效期，不返回这些令牌。
5. 对话调用 `completeSimple`。Pi AI 获取鉴权，必要时刷新；CredentialStore.modify 在本进程按 provider 串行执行并保存轮换后的令牌。src/main.ts 还限制一个数据目录只能由一个桥接进程持有。
6. 退出调用 SDK logout，删除本地凭证并清短期聊天历史。**这不保证撤销供应商已颁发的令牌，也不自动清除长期角色记忆或备份。** 需要彻底撤权时还应使用供应商账号的授权管理。

SDK 回调成功页表示已收到授权码，后台仍可能在换取令牌时失败；必须以后台已保存授权和真实模型测试结果为准。保存授权也不等于拥有目录中所有模型的调用权。

Docker compose 在容器内设置 PI_OAUTH_CALLBACK_HOST=0.0.0.0，并仅向主机回环发布 1455，供 SDK 临时监听。原生部署仍默认 127.0.0.1。不要为公网回调直接暴露该端口。

旧 `openai-codex` provider 有独立 OAuth 记录，不和 `openai` 混用。AI 的 authContext 显式关闭环境 API Key 和外部凭证文件回退；刷新失败要求重新授权，不悄悄切换付费 API。

## QQ、微信、生图、语音

- 普通 QQ：管理员保存 OneBot access_token，桥接仅连接 `ws://127.0.0.1`。当前令牌放在 WebSocket 握手查询参数中，网关访问日志可能记录它；禁止共享完整握手地址或网关日志。SnowLuma 登录密码与这个令牌不是一回事。连接后核对托管账号，白名单为空时不处理聊天；群聊还需群白名单与 @。
- 官方 QQ：App ID/App Secret 加密保存在本项目，QQ 官方 SDK 管理平台 access token 和连接；这不是普通 QQ 密码登录。
- 微信 iLink：扫码取得 bot token，加密保存在服务端；请求带 Bearer 令牌。消息的 context_token 用于回复路由，不是 ChatGPT OAuth。
- 生图：`codex-subscription` 单独检查 `codex login status`，必须为 ChatGPT 登录。CLI 自己管理账号与凭证，**不存于本项目 SQLite，不保证与 Pi OAuth 是同一账号**。CLI 的退出/撤权也需单独处理。OpenRouter 是另一条显式选择、独立计费的路径。
- 本地 Qwen 语音：只监听 127.0.0.1:8790，以 data/local-tts/worker-token 的随机令牌校验 Bearer 头。此工作令牌是本机文件，不是数据库加密记录；不可共享 data。在线 Edge 语音会把合成文字发往 Microsoft；Whisper 本地识别后的文字会交给 GPT。

## 存储与边界

SQLite 的 secrets 与 history 内容使用 AES-256-GCM：每次随机 12 字节 IV，16 字节认证标签，以记录键作为 AAD 防止密文换行替换。模型授权、入口凭证和角色记忆使用 secrets；普通配置、白名单、部分状态与事件元数据不加密。加密密钥保存在 `.env`，与数据库一同泄漏时不能提供保护。

服务尝试设置目录/数据库权限；Windows 仍依赖目录继承的 ACL，不应声称已设置专用 Windows 访问控制。删除记录不是磁盘安全擦除，旧备份和 SQLite 残留仍需按敏感数据处理。限制后台访问者、保护 Windows 账号、分别保护密钥和备份是部署者的责任。

日志使用经过清理的固定错误信息，不主动记录原始上游响应、凭证和聊天正文；外部 CLI、网关、代理及操作系统有自己的日志策略。媒体和文档是非可信输入，提示词约束不能等同于完整的沙箱或提示注入防护。

## 可重复验证

`npm test` 包括密码/Host/Origin/CSRF 边界、退出失效、凭证不回显、加密完整性、刷新串行化、刷新失败不回退，以及白名单和账号绑定测试。模型和网关自动测试使用模拟对象；真实 OAuth、手机送达与 Linux/Docker 状态见 ACCEPTANCE.md。GitHub Actions 配置不是已经在线通过的证明。
