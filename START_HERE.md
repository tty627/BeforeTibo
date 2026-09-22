# BeforeTibo · Codex 开发交付包

这是完整的项目规格和开发输入，不是已实现的软件。目标是让 Codex 在你指定的本地目录构建 BeforeTibo，完成测试，再按确认过的目标发布到 GitHub。

## 直接使用

将交付包解压到一个专用于本项目的目录，让 Codex 打开该目录，然后把 `CODEX_BUILD_PROMPT.md` 全文发送给它。不要只交给它聊天摘要，也不要只让它做一个演示页面。

建议发送的最短指令：

```text
请完整阅读本目录的 CODEX_BUILD_PROMPT.md、AGENTS.md、SPEC.md、TASKS.md 和 ACCEPTANCE.md，按其中要求实际构建 BeforeTibo，不要停留在规划或脚手架。先跑通真实纵向闭环，再完成三个内置 Recipe、停止恢复、额度适配、报告、测试与开源文档。使用 contracts/ 和 examples/ 作为接口约定和参考输入。没有真实 Codex 联调条件时继续完成 mock 与所有可运行的测试，如实标记未联调项，不伪造结果。完成本地工作后按 GITHUB_RELEASE.md 检查；在确认 owner/repo、公开范围和许可证署名后再公开发布。
```

## 文件说明

| 文件 | 用途 |
|---|---|
| `SPEC.md` | 完整产品与技术规格，包含范围、架构、调度、三种 Recipe、计费边界和发布要求 |
| `CODEX_BUILD_PROMPT.md` | 直接给 Codex 的开工指令 |
| `AGENTS.md` | 构建过程中必须遵守的仓库级要求 |
| `TASKS.md` | 按依赖排序的实施任务和里程碑 |
| `ACCEPTANCE.md` | 必须转为测试或实测证据的验收清单 |
| `GITHUB_RELEASE.md` | 开源准备、发布权限、命令和核验步骤 |
| `SOURCES.md` | 已核验的官方资料；实现时仍需复核本机能力 |
| `contracts/` | 机器可读 schema，包括 Recipe、运行配置、候选结果、成果、事件和证据 |
| `examples/` | 与 schema 配套的三种 Recipe、skill 指令和合成数据 |
| `SPEC.html` | 主说明书的离线阅读版，正文与 Markdown 同源 |
| `HANDOFF_QA.md` | 此交付包自身的结构校验结果；不是 BeforeTibo 软件的测试报告 |

## 已替你做出的默认决策

项目叫 BeforeTibo，建议仓库和 CLI 名为 `before-tibo`；首版做本地 CLI、终端面板、离线收获报告和三个内置任务；Node.js 24、TypeScript、npm；默认固定边界、单 worker；额度读取可缺失，但不能伪造；建议 MIT 许可。

Refactor Arena、多 worker、云端服务、插件市场不进入首版。先把一个真实任务从开始做到验收和收获，再做漂亮展示。

## 发布前才需要你决定的事项

GitHub owner、仓库名是否采用默认值、MIT 的版权署名、是否立即公开、是否另外发布 npm 包。首个真实额度联调使用哪个账号、允许多少消耗，也需要你的授权。

没有这些信息不应阻止 Codex 完成本地实现、mock 测试、README 和发布草稿。不要把 API key 粘进聊天或交付包。

## 当前状态

本交付包提供说明书、开发指令、参考合同和样例。它没有替你创建 GitHub 仓库，没有运行真实 Codex 任务，也没有构建 BeforeTibo 程序。`examples/` 中的数据全部用于协议和测试设计，不能用于宣称实际运行效果。
