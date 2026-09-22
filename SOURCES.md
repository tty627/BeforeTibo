# 官方资料与事实边界

核验日期：2026-09-22。下列资料用于确认外部工具能力；项目的架构、默认参数、命令名称、schema 和验收要求是自行制定的设计，不是 OpenAI 或 GitHub 的官方协议。

部分 `developers.openai.com/codex/...` 官方入口目前跳转到 `learn.chatgpt.com/docs/...`。保留原官方入口便于追溯。执行时以安装版本的 help、生成协议和实测结果为准，不由网页存在推断某个账户或平台必定可用。

## S01

**OpenAI — Non-interactive mode**
https://developers.openai.com/codex/noninteractive

核验内容：`codex exec`、JSONL、最终结构化输出、复用 CLI 登录，以及自动化中的显式沙箱设置。实现应隔离上游差异，不复制文档中的样例数字作为产品运行数据。正常公共 CI 不保存个人 OAuth 认证材料。

## S02

**OpenAI — Codex App Server**
https://developers.openai.com/codex/app-server

核验内容：stdio、初始化握手、按安装版本生成协议、账户与额度读取、多桶限额字段、更新通知。部分方法/字段需要实验性 capability，WebSocket 有额外成熟度与安全限制。BeforeTibo 的 observer 是本项目限定的只读适配层，不应开放整个 App Server。

## S03

**OpenAI — Authentication**
https://developers.openai.com/codex/auth

核验内容：ChatGPT 与 API key 等认证路径有区别；API key 使用标准 API 计费而非包含的 ChatGPT 使用权益。首版拒绝 API key 是产品范围决策，不是官方通用限制。

## S04

**OpenAI — Pricing**
https://developers.openai.com/codex/pricing

核验内容：token 与 credits 是不同概念；可用 credits 可能在包含额度用尽后支持继续工作。本文不抄录价格表、不预测每个 Recipe 会消耗多少百分比、不把本地阈值当账单硬上限。

## S05

**OpenAI Help Center — How banked Codex resets work**
https://help.openai.com/en/articles/20001498-how-banked-codex-resets-work

核验内容：banked reset 需要主动使用，并有适用窗口/过期等条件。BeforeTibo 不承诺未来一定赠送重置，也不代为兑换。

## S06

**OpenAI — Sandbox / Agent approvals & security**
https://learn.chatgpt.com/docs/sandboxing
https://learn.chatgpt.com/docs/agent-approvals-security

核验内容：沙箱决定技术边界，批准策略决定越界时如何处理；二者不是同一个控制。产品必须实测所用后端，不将 prompt、复制目录或配置名称当作已经生效的安全隔离。

## S07

**Git — git-worktree**
https://git-scm.com/docs/git-worktree

核验内容：多个 worktree 与仓库共享部分信息。首版选用独立快照是本项目决定；“worktree 不等于安全沙箱”是据其机制得出的工程边界判断。

## S08

**Node.js — Releases**
https://nodejs.org/en/about/previous-releases

核验内容：页面当前将 Node.js 24 列为 LTS。选择 24.x 为首版支持线，不宣称所有未来大版本未经测试也兼容。

## S09

**OpenAI — Build skills**
https://developers.openai.com/codex/build-skills

核验内容：skill 使用包含 name 和 description 的 `SKILL.md`，可附带资源与脚本。BeforeTibo 的 `recipe.json`、预算、validator 和 artifact 合同不是官方 skill 标准的一部分。

## S10

**GitHub Docs — Secure use reference**
https://docs.github.com/en/actions/reference/security/secure-use

核验内容：最小权限与锁定真实完整 commit SHA 等供应链防护建议。项目 CI 不采用虚构 SHA，不向公共 PR 运行暴露个人认证材料。

## S11

**GitHub CLI — gh repo create**
https://cli.github.com/manual/gh_repo_create

核验内容：`--source`、`--remote`、`--push`、`--public` 与明确指定 OWNER/REPO 的用法。是否允许发布和发布到谁的账号由用户授权决定，不由工具参数替代。

## S12

**GitHub CLI — gh release create**
https://cli.github.com/manual/gh_release_create

核验内容：pre-release、notes file、`--verify-tag` 的行为。发布结果需要查询核验，不以生成了命令代替成功执行。

## S13

**Choose a License — MIT License**
https://choosealicense.com/licenses/mit/

核验内容：MIT 文本、保留版权和许可声明的基本要求。建议使用 MIT 是本项目许可选择；真实著作权人和第三方材料许可仍须在发布前确认。

## S14

**OpenAI — Developer commands**
https://learn.chatgpt.com/docs/developer-commands

补充入口：实施阶段检查实际命令与参数。先使用安装版本的帮助，不凭历史记忆调用沙箱、恢复、认证或配置开关。

## 不应被写进产品承诺的内容

固定时间必有重置、一次 recipe 固定消耗 20%、某个模型永远最适合、预设保证不产生追加费用、某个 npm 名称已经归本项目所有、未实测平台全面可用。这些均未在本交付包中得到证明。
