# 安全说明

当前版本面向个人本机部署，尚未接受独立安全审计，不适合作为多租户或公网托管服务。

请先阅读 [认证与凭证说明](AUTHENTICATION.md)。不要上传 `.env`、data、数据库、备份、QQ 网关令牌、授权回调 URL、本机 CLI 配置或真实聊天截图。`.gitignore` 不会移除曾经提交过的内容；意外提交后应先撤销/轮换相关凭证，再处理历史记录。

报告漏洞时不要在公开 Issue 中粘贴凭证、账号、聊天内容或可利用的敏感数据。若仓库启用了 GitHub 私密漏洞报告，请使用 Security → Report a vulnerability；未启用时先通过不含敏感信息的 Issue 请求维护者提供私密渠道。本项目没有声称已建立安全响应团队或响应时限。

本项目采用 MIT，第三方记录见 THIRD_PARTY_NOTICES.md。依赖扫描和安装验证有范围限制，不能替代独立安全审计。当前发布检查及限制见 [PUBLISHING.md](PUBLISHING.md)。
