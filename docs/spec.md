# BeforeTibo 完整项目说明书

> **Spend the quota. Keep the work.**
> 把剩余的 Codex 使用额度，转化成值得留下的成果。

| 项目 | 定义 |
|---|---|
| 文档版本 | 1.0 / 2026-09-22 |
| 文档用途 | 交给 Codex 实施、测试、整理开源仓库和准备首次发布 |
| 产品名称 | BeforeTibo |
| 建议仓库名 / 命令名 | `before-tibo` / `before-tibo`；名称可用性须发布前检查 |
| 首个交付版本 | `v0.1.0-alpha.1` |
| 首版形态 | 本地 CLI + 实时终端面板 + 可离线阅读的成果报告 + 三个内置 Recipe |
| 代码与面向国际社区的文档 | 英文；另提供完整中文 README 和中文使用说明 |
| 许可证建议 | MIT；发布前确认著作权署名，不替用户虚构身份 |
| 当前交付状态 | 本文件是待实现的工程规格，不代表软件已经实现、测试或发布 |

**实施原则：先交付一条真实可用的闭环，再扩展任务种类和调度复杂度。不要把本项目做成一个只有漂亮额度动画的演示。**

文中的 MUST 表示首版必须满足，SHOULD 表示优先满足，LATER 表示不得阻塞首版的后续方向。数字默认值均为产品设计选择，不是 Codex 官方限额，也不是测得的额度消耗预测。

---

## 0. 如何使用这份交付包

先读本文件，再读 `TASKS.md` 和 `ACCEPTANCE.md`，使用 `CODEX_BUILD_PROMPT.md` 开工。根目录 `AGENTS.md` 约束实施过程；`contracts/` 是机器可读的接口约定；`examples/` 提供与这些约定配套的输入、输出和 Recipe 样例。

规范优先级：用户新指令 → 安全和真实计量要求 → 本文件 → `contracts/` 的字段约定 → 验收测试 →任务清单与示例。若发现主规格和 schema 不一致，先记录并修正二者，再写依赖代码；不得默默选择更宽松的一方。接口调整必须同步测试、示例与文档。

外部事实用 `[Sxx]` 引用，在 `SOURCES.md` 中提供官方来源和核验日期。其余内容是本项目的设计决定。实现时必须再次检查实际安装的 Codex 版本和功能，不得根据本规格猜测某个参数在所有版本都可用。

---

## 1. 产品定义与核心价值

### 1.1 一句话定义

BeforeTibo 是一个面向本地开发者的、有预算边界的 Codex 任务执行器：用可逐层深化的实用工作流，把用户愿意使用的剩余额度转化为可检查、可运行、可保留的成果。

用户进来的动机是“不想让额度闲置”；留下来的理由是“那些一直拖着的工作终于做完了”。

### 1.2 解决的具体问题

用户拥有可用额度，但不知道此刻最值得启动什么任务；普通大型 agent 任务往往到最后才产生完整结果；运行中难以区分真实进展与冗长过程；中断、额度耗尽或失败后，成果零散且缺少验证依据。

产品必须把这四个问题转化为：可选择的目标、逐步交付、可追踪验证、随时收获。

### 1.3 三个承诺

1. **容易开始**：选一个目标和工作边界，不必先写完整需求文档。
2. **持续形成成果**：每完成一个收获单元，都能打开具体文件或报告，而不是只增加 token 数。
3. **能够体面停止**：此前已验收的成果不因后续失败而丢失；最终报告不依赖再调用一次模型。

### 1.4 不做什么

MUST NOT 实现虚假烧 token、无意义复读、规避服务限流、跨账号轮换额度、自动购买额度、自动兑换 banked reset、默认启用追加付费路径、预测某人何时重置额度或发送骚扰提醒。

首版不做 SaaS、账号系统、云端托管运行、远程代码执行服务、公共 Recipe 市场、后台常驻 daemon、自动合并 PR、任意仓库自动修复、复杂多 agent 竞赛、全语言测试框架兼容、原生 Windows 承诺。

“BeforeTibo”只是社区风格的项目名。不得使用他人的肖像、官方品牌素材或未经授权的背书，不声称与 OpenAI 或任何个人存在隶属关系。

### 1.5 产品北极星

核心目标是**用户实际愿意保留或采用的成果**，不是总消耗量。

首版只记录可核实的本地指标：已验收成果数、成果种类、验证结果、首次成果出现时间、失败与中断情况、用户显式标记的保留/丢弃状态。默认不上传遥测，不编造“价值转化率”“节省工时”“浪费率”。

---

## 2. 用户、场景和首版范围

### 2.1 用户画像

| 用户 | 场景 | 希望拿走的东西 |
|---|---|---|
| 独立开发者 | 一个能运行但缺少测试的项目 | 新增回归测试、边界场景、可复现的问题 |
| 开源维护者 / 新接手工程师 | 代码理解和交接成本高 | 带源码证据的仓库手册 |
| 工具爱好者 | 想做一些一直没动手的小工具 | 不需要账号和部署的本地工具 |

首版只服务用户本人拥有或明确获准处理的本地项目；“可信项目”不意味着所有依赖和脚本都安全，仍须隔离执行。

### 2.2 三个首发 Recipe

| ID | 名称 | 模式 | 首个完整成果 |
|---|---|---|---|
| `repo-book` | Repo Book | Learn | 项目总览、源码引用和离线阅读页 |
| `test-me-to-death` | Test Me to Death | Harden | 一个经过实际执行的新测试单元或稳定复现记录 |
| `toolsmith-csv` | Toolsmith: CSV Diff | Build | 能按指定主键比较两份 CSV 的本地网页工具 |

Toolsmith 首版只实现 CSV Diff 这一种模板，不做“用户输入任何想法就生成完整应用”的通用平台。测试 Recipe 首版限定单包、npm、JavaScript/TypeScript、Vitest 的已支持项目；其他项目必须明确显示不支持，不能假装完成。

### 2.3 版本边界

| 能力 | v0.1 alpha | 后续 |
|---|---|---|
| 无 Codex 的离线演示与 mock 测试 | MUST | 持续维护 |
| 真实 `codex exec` 任务执行 | MUST，真实联调后才可宣称支持 | 可扩展 SDK / 其他适配器 |
| 顺序执行、检查点、收获报告 | MUST | 并发与更复杂调度 |
| 三个内置 Recipe | MUST，在声明的适用范围内 | 更多任务包 |
| 额度读取适配器 | 能力检测、真实读取路径、降级说明 MUST | 扩充已实测版本矩阵 |
| 额度驱动调度 | 仅对通过认证、桶映射和实时读取检查的组合开放 | 更好的预测，但不承诺精确消费 |
| 单 worker | MUST，`max_workers` 固定为 1 | v0.2 再支持少量并发 |
| 终端面板 + 静态 HTML 收获单 | MUST | 浏览器实时面板与成果货架 |
| Refactor Arena | 不实现，仅保留设计接口 | v0.3 候选实验 |

额度接口不可用不应阻塞“固定边界运行”或整个产品发布，但必须禁用依赖它的自动额度模式；禁止用模拟数据冒充真实额度。

---

## 3. 产品现实边界

### 3.1 可使用的官方能力

官方非交互入口为 `codex exec`，支持 JSONL 事件、最终结构化输出和复用 CLI 登录状态；当前文档建议新自动化脚本使用显式沙箱参数，而不是依赖已弃用的兼容快捷参数。[S01]

App Server 提供账户与限额读取、更新通知及与安装版本对应的协议生成能力；不同字段和传输方式的成熟度不一致。[S02]

ChatGPT 登录和 API key 登录具有不同计费路径；可用 credits 也可能在包含额度用尽后支持继续工作。[S03][S04]

Banked reset 是用户可主动使用的重置机制，不等于“每天必有全局重置”。本产品不依赖未来一定发生的赠送或重置。[S05]

### 3.2 对实现的直接要求

MUST 把 token usage、账户额度快照、本地运行工作量分开记录。不能将剩余百分比直接换算成固定 token 数，不能由 token 数推导精确的剩余额度。

MUST 支持未知、暂缺和过期三种信息状态。`null` 不等于 0，不显示伪造的剩余余额、reset 时间或 100% 完成。

MUST 在启动前显示计费路径及其可验证程度。本地任务上限只是调度约束，不是服务端账单硬上限。用户要求“绝对不产生额外费用”且缺少可验证的服务端硬约束时，禁止真实执行，只允许 demo / plan / harvest。

MUST 将模型版本、Codex 版本和限额桶映射保存到本次 run 的元数据中。默认不硬编码某个模型名称；由已支持的用户配置选择，且不自动启用更昂贵的模式。

---

## 4. 用户旅程和命令规范

### 4.1 第一次使用

1. 用户运行 `before-tibo demo`，无需账户即可看到标为 DEMO 的任务与成果展示。
2. 用户运行 `before-tibo doctor`，检查运行环境、Codex 能力、认证路径和沙箱支持。
3. 用户运行 `before-tibo plan . --recipe repo-book`，查看将读取的内容范围、拟交付成果和执行边界；此步骤不调用模型。
4. 用户运行 `before-tibo run . --recipe repo-book --preset gentle`，在交互确认后开始真实任务。
5. 用户查看实时任务和具体成果；按一次 Ctrl+C 请求收尾，二次中断请求立即停止。
6. 运行结束后打开 `harvest/index.html` 或阅读 `harvest/SUMMARY.md`。

以上 `before-tibo` 命令均为待实现接口。未发布 npm 包前，README 必须使用从源码构建的真实命令，不能把 `npx before-tibo` 写成已经可用的安装方式。

### 4.2 命令表

| 命令 | 行为 | 是否调用 Codex |
|---|---|---|
| `before-tibo demo` | 回放带 DEMO 标记的合成事件和示例成果 | 否 |
| `before-tibo doctor [--json]` | 非计费能力检查；可读取认证和限额元数据 | 不启动推理任务 |
| `before-tibo recipes list` | 列出内置 Recipe 与适用范围 | 否 |
| `before-tibo recipes show <id>` | 查看任务目标、阶段、验收和权限 | 否 |
| `before-tibo plan <path> --recipe <id>` | 静态检查和确定性候选计划 | 否 |
| `before-tibo run <path> --recipe <id>` | 按授权边界执行 | 是 |
| `before-tibo status <run-id> [--json]` | 读取本地状态，不自动刷新账户 | 否 |
| `before-tibo stop <run-id> [--immediate]` | 写入经过验证的本地停止请求 | 否 |
| `before-tibo resume <run-id>` | 恢复同一 run，重新做安全与余额检查 | 可能；不得隐式扩大预算 |
| `before-tibo harvest <run-id>` | 仅用本地记录重建成果报告 | 否 |
| `before-tibo open <run-id>` | 输出报告位置；可经用户操作打开受限预览 | 否 |
| `before-tibo export <run-id> --output <dir>` | 导出经过脱敏的成果包 | 否 |

`demo` 不是 `run` 的一个静默降级分支。真实模式失败时禁止自动切换为 demo 继续展示成功。

### 4.3 运行参数

核心参数：`--recipe`、`--preset gentle|hard|tibo`、`--mode bounded|quota`、`--config <file>`、`--max-dispatches <n>`、`--max-run-minutes <n>`、`--reserve-percent <0..99>`、`--state-dir <path>`、`--non-interactive`、`--ack-spend-risk`、`--ack-execution-risk`、`--json`。

`--max-dispatches` 限制本产品启动 Codex worker 会话的次数，包含修复尝试和任何使用模型的规划/评审；它不是底层模型请求次数、工具调用次数或 token 硬上限。首版不允许隐形的额外模型评审器。

非交互真实运行必须有完整配置和本次明确的风险确认；不得通过普通 `--yes` 隐式授予读取新目录、执行未知脚本或使用付费路径的权限。CLI 参数只能在用户明确授权范围内覆盖配置；Recipe 不能给自己扩权。

### 4.4 预设

| 预设 | 最大 dispatch 数 | 最长 run 时间 | 最大 worker | 定位 |
|---|---:|---:|---:|---|
| gentle | 4 | 20 分钟 | 1 | 获得一个小而完整的成果 |
| hard | 12 | 60 分钟 | 1 | 深化验证和扩展几个独立单元 |
| tibo | 24 | 120 分钟 | 1 | 更深探索，不扩大权限和计费路径 |

这些是用户可覆盖的工程上限，不是耗时或额度效果承诺。默认 preset 为 gentle，默认 mode 为 bounded。不能因选择 tibo 就关闭保留阈值、沙箱、停止条件或人工确认。

### 4.5 终端界面

```text
BEFORE TIBO                          mode: bounded / REAL
Recipe: Repo Book                   dispatches: 2 / 4

账户额度快照                         本次进展
codex / primary:   43% remaining      ✓ 项目总览：可预览
codex / secondary: 61% remaining      ✓ 核心模块说明：引用检查通过
observed 8 seconds ago               → 正在补充一条调用链
账户变化可能包含其他会话使用。

Artifacts: 2 accepted · 1 candidate · 0 quarantined
[Ctrl+C] 不再开新任务，开始收尾
```

上述数字是界面示例。真实实现只能展示实际数据；DEMO 模式每屏必须明显标记。未知限额显示 `unavailable`，而不是空进度条或 0%。

非 TTY、`--json` 或 `NO_COLOR` 环境不依赖光标动画；stdout 只放机器输出，诊断进入 stderr。不要把源码片段、完整命令参数或秘密值默认打印到面板。

---

## 5. 领域模型：可验收的收获单元

### 5.1 对象定义

| 对象 | 职责 |
|---|---|
| Recipe | 定义目标、适用条件、阶段、输出类型和内置验证器 |
| Run | 一次固定授权范围和预算边界的执行 |
| Harvest Unit | 一个能单独交付的最小工作单元，例如一章手册或一组测试 |
| Job | 执行某个单元的工作描述，携带阶段、输入摘要和完成条件 |
| Attempt | 某个 job 的一次具体尝试；每次派发都消耗 dispatch 名额 |
| Candidate | 模型声称完成的候选输出，尚未被 runner 验收 |
| Artifact | runner 已登记、带文件哈希与验证记录的成果或研究记录 |
| Validation | runner 发起的具体检查及其结果 |
| Event | 可追加、可重放的状态变更事实 |
| Quota Snapshot | 带来源和时间的账户限额观察，不是本 run 独占账本 |

### 5.2 单元契约

每个单元在启动前 MUST 明确：输入范围、目标行为、可写范围、预期文件、验证方法、超时、失败处理。

每个单元结束时 MUST 能回答：做了什么、证据是什么、输出在哪里、哪些方面没有验证。不能只保存模型的“已完成”宣告。

默认先完成当前单元，再启动下一个；新单元不得损坏已验收版本。一个文档网站有 20 个文件不等于 20 个独立成果；同一成果的迭代按 `logical_key` 聚合。

### 5.3 成果状态与类型分离

成果类型：`document`、`test_patch`、`tool`、`reproduction`、`experiment`。

验证状态：`candidate`、`accepted`、`rejected`、`quarantined`。实际公开展示 SHOULD 使用“通过所列检查”而非“绝对正确”。`accepted` 只意味着通过该成果声明的检查，不意味着用户已经采用。

用户采用状态独立为 `unreviewed`、`kept`、`discarded`。首版可只支持本地标记，不代替用户决定。

失败实验可以作为 `experiment` 研究记录保存，但不得算作“可运行工具”或“已修复 bug”。问题没有复现应写“未复现”，不能写“没有问题”。

### 5.4 文件和验收权

模型只能返回 `agent-result.schema.json` 规定的候选结果。它不能写最终验收记录、运行账本、全局预算或宿主报告索引。

runner 根据真实文件和实际验证重新生成 artifact manifest。模型提供的路径、计数、测试结论和使用量一律视为不可信输入。

---

## 6. 技术架构和代码组织

### 6.1 固定选型

| 层 | 首版选择 | 理由 |
|---|---|---|
| 运行时 | Node.js 24.x | 选择明确支持线；官方当前将 24 列为 LTS。[S08] |
| 语言 | TypeScript strict + ESM | 事件协议和领域对象具备类型检查 |
| 包管理 | npm + `package-lock.json` | 降低用户从源码启动的额外依赖 |
| CLI | Commander 或同级轻量库 | 不自建完整参数解析器 |
| 合同校验 | JSON Schema Draft 2020-12 + Ajv | `contracts/` 为运行期字段依据 |
| 测试 | Vitest；Toolsmith 可用固定浏览器验收套件 | mock、契约、故障注入、命令行测试 |
| 状态 | 单 writer 的 JSONL 日志 + 原子 JSON 快照 | v0.1 不引入数据库或后台服务 |
| 展示 | 轻量 TTY renderer + 确定性静态 HTML | 优先可读、可中断和可离线收获 |
| Codex 接入 | exec worker + 可选只读 App Server observer | 执行路径与额度观察分离 |

第三方库的确切版本在实施时核验后锁定，不在本说明中虚构“最新版本”。技术选型替换必须写 ADR 并保持接口和验收不变。首版不得为简单终端面板引入大型全栈框架。

### 6.2 模块边界

```text
CLI
 ├─ Preflight / Doctor
 ├─ Recipe Catalog + deterministic Planner
 ├─ Policy Engine
 ├─ Scheduler / State Machine
 │   ├─ Workspace Manager
 │   ├─ Codex Exec Adapter
 │   ├─ Read-only Quota Observer
 │   ├─ Sandbox Executor
 │   └─ Validator Registry
 ├─ Event Store / Artifact Store
 └─ TUI + Deterministic Harvest Renderer
```

Policy Engine 有最终拒绝权。Planner 和模型只能提出候选任务，不能修改权限或预算。Validator 不依赖模型自评。TUI 订阅事件，不直接修改任务状态。

### 6.3 建议仓库目录

```text
before-tibo/
  AGENTS.md
  README.md
  README.zh-CN.md
  LICENSE
  CONTRIBUTING.md
  SECURITY.md
  CHANGELOG.md
  package.json
  package-lock.json
  tsconfig.json
  src/
    cli/
    core/                  # run/job/artifact 状态、调度和策略
    adapters/codex/        # exec、协议归一化、只读 observer
    workspace/
    sandbox/
    validators/
    storage/
    ui/
    harvest/
  contracts/
  recipes/
    repo-book/
    test-me-to-death/
    toolsmith-csv/
  tests/
    unit/
    contract/
    integration/
    e2e/
    fixtures/
    fault-injection/
  docs/
    spec.md
    architecture.md
    security-model.md
    recipe-authoring.md
    quota-and-billing.md
    troubleshooting.md
    supported-environments.md
    releasing.md
    adr/
    implementation-status.md
  examples/
  scripts/
  .github/
    workflows/
    ISSUE_TEMPLATE/
    pull_request_template.md
```

不要创建十几个只包含空函数的模块来冒充架构实现。允许先小后大，但职责和依赖方向应当清楚。

### 6.4 内部接口草案

以下为本项目内部接口，不是 OpenAI 官方 SDK 类型；具体字段与 `contracts/` 同步。

```ts
interface CodexAdapter {
  probe(): Promise<CapabilityReport>;
  execute(job: PreparedJob, signal: AbortSignal): AsyncIterable<NormalizedEvent>;
}

interface QuotaObserver {
  read(): Promise<QuotaObservation>;  // ready | unavailable | stale | error
  close(): Promise<void>;
}

interface Validator {
  id: string;
  version: string;
  validate(input: ValidationInput, signal: AbortSignal): Promise<ValidationResult>;
}

interface ArtifactStore {
  promote(candidate: VerifiedCandidate): Promise<ArtifactManifest>;
  rebuildHarvest(runId: string): Promise<HarvestPaths>;
}
```

`PreparedJob` 必须由 runner 生成，包含固定 cwd、允许的输出路径和受控上下文。不要把任意 shell 命令字符串暴露为 Recipe 可以直接调用的执行接口。

---

## 7. Codex 适配器与兼容性

### 7.1 能力探测先于真实执行

`doctor` MUST 记录 `codex --version`、非计费 help/协议检查的结果，以及当前平台是否具备所需沙箱。所有子进程使用参数数组和 `shell: false`；路径不得经 shell 插值。

能力报告至少覆盖：exec 可用性、JSONL 支持、最终结构化结果支持、可用的沙箱策略、非交互批准策略、认证可识别性、额度读取可用性，以及禁用非必要外部工具/用户扩展的能力。

每种兼容版本要保留脱敏协议 fixture。无法识别字段时保留适量诊断并显示 `unknown`；不得因为版本号“看起来更新”就假定兼容。

发布支持的是**明确测试过的版本组合**，不是无限的 `codex >= x`。`docs/supported-environments.md` 记录实际验证版本、操作系统、认证方式、沙箱后端和测试日期。

### 7.2 Worker 执行要求

使用 `codex exec` 启动一个受控工作单元。实际参数由适配器根据本机能力生成，包含机器输出、输出 schema、指定工作目录、最小所需沙箱和不允许无人值守提权的批准策略。[S01][S06]

完整 prompt 通过 stdin 传递，减少命令行泄露和 quoting 问题。最终结构化消息写入本次 attempt 的候选结果目录，runner 再校验。

不得使用 `danger-full-access`、绕过 approvals 的开关或通过“自动批准一切”完成无人值守。若所需操作越界，返回可理解的 blocked 状态。

当上游配置可能加载 MCP、插件、hooks、自定义 provider、网络工具或子 agent 时，要做能力探测、明确显示并按本次 policy 禁用未授权能力。禁止使用一个未经核验的参数名假装已经关闭这些能力；无法建立所需边界时拒绝该执行模式。不得静默忽略组织管理策略。

### 7.3 流解析

MUST 正确处理分块到达、多个 JSON 行一次到达、最后一行无换行、超长行、未知事件、stderr 噪声、截断 JSON 和非零退出码。默认单行上限 1 MiB、单 attempt 脱敏日志上限 20 MiB；超过后写明截断，不无限增长内存。

最终 exit code 为 0 只表示进程成功结束，不代表任务通过验收。收到合法候选输出后仍要实际验证文件和结果。

首版仅显示允许公开的结构化进度摘要、工具状态和最终输出；不把内部推理流当作产品成果。原始完整流默认不保存，不作为分享内容。

### 7.4 额度观察器

额度 observer 只做账户和限额读取。优先 stdio，完成握手后再发只读请求；请求 ID、超时、响应对应关系必须有测试。不得通过公开网络端口暴露 App Server。[S02]

读取方法白名单包括本机支持的 `account/read` 与 `account/rateLimits/read`，并可接收相关更新通知。明确拒绝登录改写、退出登录、兑换 reset、发邮件、shell/process、账户消费等写入型方法。

协议生成与 fixture 必须来自明确版本，不在仓库中提交 token、完整邮箱或真实余额历史。observer 不替用户保管认证材料；认证由原 Codex 客户端处理。

exec 与 observer MUST 使用相同的经确认的身份/配置上下文。存在 API 类环境凭证时，不将其传入剩余额度 worker，不记录其值；必须检查最终有效认证路径，不能仅用 observer 的登录状态推断 exec 一定使用同一路径。不能用 A 账户显示余额、用 B 账户执行。映射无法确认时禁止 quota 模式；不要直接复制 `auth.json` 建立身份匹配。

### 7.5 Usage 归一化

保存本次 worker 的可获得 usage 字段和覆盖范围：input、cached input、output、reasoning output，以及上游提供的 thread/turn 标识。缺少则记 `null`。

不得把缓存 token 当作额外输入重复相加，也不得在不了解字段语义时把 reasoning token 再加到已包含它的 output 中。各版本适配器必须明确“增量”与“累计”语义，按事件和 turn ID 去重。

额度比例与 token 计数分别展示。因为异常中断可能缺少终态 usage，报告必须支持 `usage_completeness: partial`，不能用 0 填平缺失消耗。

---

## 8. 调度、预算与停止策略

### 8.1 两种真实运行模式

**bounded**：由 dispatch 数、最长运行时间、单任务超时、修复上限和磁盘上限约束。不依赖额度读取，但必须明确提示“没有实时额度保护”。如果能读到限额，可展示观察值，不能暗示这等于账单硬上限。

**quota**：除上述边界外，还要求身份一致、相关额度桶映射明确、快照新鲜，并在各相关窗口均满足保留阈值时才派发新任务。必要信息不满足即停止新派发；不能静默降级到 bounded。

### 8.2 默认参数

| 参数 | 默认值 | 语义 |
|---|---:|---|
| `max_dispatches` | 4 | 包含首次尝试和所有修复的 worker 启动意图数 |
| `max_run_minutes` | 20 | 从 run 首次开始计算的墙钟上限；中断停机也计入 |
| `job_timeout_seconds` | 600 | 单 attempt 的最长执行时间 |
| `max_repairs_per_unit` | 2 | 首次尝试之外最多两次修复，仍占总 dispatch 数 |
| `max_consecutive_no_progress` | 2 | 连续没有新验收成果或新有效证据时停止扩张 |
| `reserve_percent` | 10 | quota 模式各相关窗口最少保留百分比，软约束 |
| `quota_poll_seconds` | 15 | 只读观察频率；通知可减少额外查询 |
| `quota_stale_seconds` | 60 | 超过则禁止 quota 模式新派发 |
| `finalization_reserve_seconds` | 30 | 只为本地收尾预留，不依赖模型调用 |
| `max_run_disk_mb` | 500 | run 状态和产物上限；接近上限先停止任务 |

这些上限须经后续测量调整；首次发布不宣称能按 10%、25%、50% 精确消费。

### 8.3 优先级

确定性优先级：完成已启动成果的验证 → 有明确原因且有剩余修复名额的修复 → 当前成果必要补全 → 下一个独立成果 → 可选扩展。

v0.1 不使用另一个大模型不断重新规划“最高 ROI”。静态扫描决定阶段与目标范围，单元内部由 Codex完成具体工作。出现 no-op、重复文件或只有措辞变化而没有实质进展时，不把它算作新收获。

### 8.4 派发前检查

```text
若 run 不在 RUNNING，拒绝派发
若收到停止请求，进入 DRAINING
若达到时间、次数、磁盘或无进展上限，进入 DRAINING
若身份/计费路径变化，进入 DRAINING
若为 quota 模式：
    必须有新鲜且可映射的快照
    每一个相关窗口都必须满足保留阈值
    必须没有未确认的额度周期变化
若不存在可完成且有明确验收的 ready 单元，进入 DRAINING
写入并持久化 dispatch.intent（此时扣除一个名额）
准备独立 attempt 目录和固定上下文
启动 worker
```

派发名额在 intent 落盘时占用。即使随后 spawn 失败，本次 run 内也不自动退款，以防恢复时错误重复派发。报告须区分“派发意图”和“确认启动”的次数。

### 8.5 时间和保留阈值

硬期限 `deadline_at` 在首次启动时固定为用户绝对期限与最长 run 时间中的较早者。用户没有填写绝对期限时，只使用最长 run 时间；时区显示与存储分离，内部使用 UTC，时间长度使用单调时钟辅助。

在剩余时间小于已配置的任务超时与收尾预算时，优先选择更小单元或停止。首版不编造“这个任务还需 3 分钟”的预测。

运行中的任务可能继续消耗额度，且账户快照可能延迟，所以保留阈值不构成精确停点。达到阈值或数据过期时先停止新派发；继续消耗风险增大时请求取消正在执行的任务，保存候选而不追加模型总结。

### 8.6 额度周期变化

不要把窗口名称硬编码为“五小时”和“周”；UI 根据实际返回的窗口长度、桶名与 reset 时间显示。不能将多个窗口剩余百分比求和。

剩余比例异常上升、reset 元数据变更、身份变化或桶映射变化，应标为“额度边界可能变化”并停止新派发，而不是武断认定发生了某种奖励重置。

当前 run 不因新额度出现而自动扩容。用户可以收获已完成成果，再明确启动一个新 run；首版不实现一键自动续杯。

### 8.7 正常限流与错误

服务返回 rate limit 时遵守服务提供的等待信息和本地期限，不换账号、不切换到付费 provider、不密集重试。等待会占用墙钟预算；期限不允许就收尾。

只有能够确定尚未开始有消耗执行的传输失败才可做有限连接重试。若执行是否开始不明，进入 `INTERRUPTED`，不可自动复制任务；由恢复流程处理。

---

## 9. 状态机与恢复语义

### 9.1 Run 状态

```text
CREATED → PREFLIGHT → READY → RUNNING → DRAINING → HARVESTING
                                                  ├→ COMPLETED
                                                  ├→ PARTIAL
                                                  ├→ STOPPED
                                                  └→ FAILED

RUNNING → INTERRUPTED
INTERRUPTED → PREFLIGHT → RUNNING   （限原预算、经重新检查）
INTERRUPTED → HARVESTING            （无须模型）
PREFLIGHT → BLOCKED
```

终态解释：COMPLETED 达成本次有限计划；PARTIAL 有成果但因失败等原因未完整达成；STOPPED 用户主动或预算边界停止；FAILED 没有可交付结果且关键流程失败；BLOCKED 启动前条件不足。存在已验收成果不妨碍报告其他失败。

run 的“停止原因”独立存储为枚举和简短说明，不能用一个状态字段覆盖所有原因。

### 9.2 Unit / attempt 状态

unit：`PLANNED → READY → ACTIVE → ACCEPTED | EXHAUSTED | BLOCKED | CANCELLED`。

attempt：`PREPARED → DISPATCH_INTENT → RUNNING → CANDIDATE → VALIDATING → ACCEPTED | REJECTED | QUARANTINED`，中断或进程异常可进入 `INTERRUPTED`。

合法状态转移必须集中在 reducer 中，不能让 UI、worker 和 validator 任意更新 status。一次 unit 最多有一个活动 attempt。

### 9.3 停止方式

一次 Ctrl+C 或默认 `stop`：停止新派发，为当前单元保留最多 30 秒收尾窗口，但不能越过剩余全局期限；随后取消 worker，并对已经完成的候选做有界本地检查。

`--immediate` 或二次 Ctrl+C：请求终止本 run 所拥有的 worker 进程树，短暂宽限后强制停止；不得杀掉其他 Codex 会话。每个 PID 需校验所属 run、启动时间与进程身份，避免 PID 复用误杀。

Ctrl+C 之后不再新增“总结本次任务”的模型调用。最终收获单必须由本地结构化记录生成。

### 9.4 重启恢复

启动恢复时先取得单 writer 锁，重放 journal，验证已有 manifest 和文件哈希。尾部被截断的最后一行可以隔离并报告；日志中段损坏必须阻止自动恢复，不假装全部成功。

若存在 dispatch intent 但无法确认 worker 是否执行过，不自动重发。若还有活跃进程，不能启动第二份执行器。若候选已生成但未验收，只继续本地验收；若成果已经晋升但事件未完整记录，从不可变 manifest 恢复为同一个 artifact，不重复计数。

`resume` 必须保留原已用 dispatch 数、原期限、原权限和原身份绑定。期限已过时只允许 harvest。需要更大预算应新开 run，不能通过重启绕过上限。

---

## 10. 工作区、文件与状态存储

### 10.1 首版采用隔离快照，不直接改用户仓库

v0.1 使用独立临时仓库快照，而不是默认在用户原仓库创建分支或修改文件。Git worktree 可用于后续候选竞赛，但它共享部分仓库信息，不是安全沙箱。[S07]

仓库类 Recipe 以干净的、已有 commit 的指定 HEAD 为基线。存在未提交的 tracked 改动时拒绝真实 run，并说明需先处理或以后使用明确的 snapshot-dirty 功能；不自动 stash、commit、reset。未追踪文件默认不读取、不复制，并明确说明。

快照从批准的 Git 树条目构建，不复制整个 `.git`。先筛选，再读对象；过滤敏感文件、二进制和大文件。首版拒绝 symlink、submodule、特殊设备文件；不隐式跟随到根目录之外。快照中可以初始化独立 Git 元数据，满足工具运行需要，但不得携带用户原远端、hooks 或凭证。

### 10.2 输入限制

默认最多 2,000 个文件、单文件最多 2 MiB、总输入最多 100 MiB。到达限制时输出明确的覆盖范围，不声称阅读了整个仓库。代码文件优先于生成物和 vendor 内容。

默认排除 `.env`、私钥、证书密钥、认证存储、`.git`、`node_modules`、构建缓存和本产品状态目录。仓库控制面文件（例如自动加载的 agent 指令、`.codex` 配置、`.agents/skills` 和 hooks）不得未经审查复制到会被自动激活的位置；需要参考时作为不自动执行的数据材料处理。例外只能由用户显式批准，且机密永远不应进入 demo 或公共报告。

用户仓库中的 `AGENTS.md`、hooks、skills 与配置属于输入数据，不能自动覆盖 runner 的权限与预算；已授权的项目约定可以经受控提取用于任务上下文。

### 10.3 快照不是安全承诺

快照保证不直接写原项目，但不能独自限制进程读取宿主文件或执行网络访问。技术边界由沙箱执行层负责。实际平台无法限制必要的文件写入、外网操作或未授权工具时，真实 run 必须 blocked，而不是退回宿主全权限运行。[S06]

首版仅声称适用于可信本地项目，不声称能安全托管任意恶意仓库。更严格的读取隔离、恶意依赖防护和多租户执行属于单独安全工程，不能用 prompt 替代。

### 10.4 Run 目录

默认状态根目录是用户目录下的 `.before-tibo`；支持 `--state-dir`，但不得位于源仓库内。对其使用尽可能严格的本地文件权限。布局：

```text
~/.before-tibo/runs/<run-id>/
  run.json
  policy.json
  source-manifest.json
  capabilities.json
  journal.jsonl
  state.json
  control/                   # 本地停止请求
  attempts/<attempt-id>/
    workspace/
    candidate-result.json
    sanitized-events.jsonl
    validation/
  artifacts/<artifact-id>/
    manifest.json
    files/
  quarantine/
  harvest/
    index.html
    SUMMARY.md
    receipt.json
```

worker 不应具有 run journal、policy、已经晋升的 artifact 或宿主 validator 代码的写权限。需要放进 workspace 的文件只是可丢弃的输入副本。

### 10.5 原子晋升

验收流程：读取候选 → 校验路径和文件类型 → 在稳定副本上运行验证 → 计算哈希 → 写入 runner-owned staging → 写入 manifest → 在同一文件系统原子 rename → 追加 `artifact.promoted` 事件。

每个逻辑成果的新版本有独立 artifact ID 和 `supersedes`，不覆盖旧版本。晋升幂等键由 run、unit、attempt 和内容哈希构成；重放同一次晋升不能产生第二个成果。

拒绝绝对路径、`..`、Windows 盘符/UNC 路径、编码绕过和 symlink 跳转。仅用字符串前缀判断路径归属不够，需真实路径和相对路径校验；导出时再次检查。

### 10.6 Journal

journal 每条事件有 schema 版本、run ID、单调递增 seq、事件 ID、UTC 时间、事件类型与脱敏 payload。涉及派发、预算、验收和终态的事件在执行对应下一步前持久化。

`state.json` 只是缓存，journal 与不可变 manifests 为恢复依据。采用单 writer 锁；锁状态不明确时拒绝第二个 runner，不能盲删锁。

尽量限制事件体大小。保存必要摘要而非完整 prompt、源码与内部推理。token 缺失、快照过期、日志截断都必须成为显式事件。

---

## 11. Recipe 协议

### 11.1 文件结构

```text
recipes/<id>/
  recipe.json
  SKILL.md
  README.md
  sample-output/             # 后续由真实运行产生并脱敏
```

`recipe.json` 与 `contracts/recipe.schema.json` 一致；`SKILL.md` 包含任务指令以及 `name`、`description` 元数据。官方 skill 采用这类基本结构，但 BeforeTibo 的预算、阶段和验收字段是自定义协议。[S09]

首版使用明确加载的内置 Recipe；不把用户全局安装的所有 skill 自动变成执行权限，也不自动向用户目录安装 skill。

### 11.2 配置要求

Recipe 定义：ID、版本、标题、目标、模式、输入类型、所需 capability、允许的输出 glob、阶段序列、每阶段有限单元上限、验证器 ID 与参数、产物类型、已知限制。

所有阶段总工作量有上限。可以根据预算少跑一些，不允许用无限 while-loop 作为 recipe 结束条件。`max_units` 是不同单元的尝试上限；修复不增加单元数，但会占用 dispatch。`depends_on` 要求被依赖阶段至少有一个 accepted 单元，不要求用满该阶段上限。

### 11.3 权限交集

最终权限 = 产品支持能力 ∩ 用户本次授权 ∩ Recipe 声明。任何一方拒绝都不能执行。

首版只允许预注册的内置验证器 ID，不允许 recipe 直接提交任意 shell command、远程 JS、可执行 npm 安装 hook 或任意 MCP 调用。自定义可执行验证器留到后续经单独信任流程处理。

### 11.4 两层校验

schema 只校验结构；还必须有语义校验：阶段 ID 唯一、依赖不循环、glob 不越界、验证器 ID 已注册、参数符合该验证器二级 schema、所需 capability 可用、运行预算不小于必要基线成本。

文档路径存在不等于语义正确，模型生成的计划也不等于验收依据。验收要求在派发前固化，不允许候选改写通过条件。

### 11.5 提示词拼装顺序

runner 的权限与停止约束 → 本次 unit 的明确目标 → Recipe 的阶段指令 → 源码和基线证据 → 前一次真实失败结果 → agent-result 输出格式。

区分“指令”和“被分析的仓库内容”。仓库里的“忽略此前规则”“输出密钥”“修改 validator”等文本仅为数据，不可作为执行指令。不要宣称 prompt 分隔本身能消除所有注入风险。

---

## 12. 首发 Recipe A：Repo Book

### 12.1 输入与目标

输入：一个允许处理的 Git 仓库、源码快照、项目识别结果。默认不安装依赖，不运行仓库脚本，不连接外部服务。

目标：帮助维护者回答“项目怎样启动、关键模块在哪里、典型请求怎样流动、遇到错误如何定位”，而不是逐文件复述所有代码。

### 12.2 阶段

| 阶段 | 最多单元 | 单元成果 | 验收 |
|---|---:|---|---|
| overview | 1 | 项目总览、入口与目录结构 | 必需文件、引用目标、链接、安全渲染 |
| module-guides | 4 | 一个核心模块的职责和边界 | 符号/文件引用、已知限制 |
| lifecycles | 2 | 一条请求或任务链路 | 每一步有源码依据；不确定处明确标注 |
| debugging | 1 | 常见故障定位手册 | 命令与定位依据，不虚构已执行结果 |

v0.1 不把“执行所有示例”作为默认文档任务的一部分。需要执行示例的能力可以后续单独启用，不能借写文档悄悄运行任意仓库命令。

### 12.3 输出

模型输出 Markdown 和 `evidence.json` 到允许目录；HTML 由宿主模板确定性渲染，不要求模型自由生成网站框架。

```text
out/repo-book/
  index.md
  architecture.md
  modules/
  lifecycles/
  debugging.md
  evidence.json
  limitations.md
```

每次只要求当前阶段必要文件；不为还未运行的阶段创建假内容。runner 在 report 中清晰标出已生成和未生成部分。

### 12.4 证据条目

每条关键说明至少包含 `claim_id`、说明文本、`evidence_kind`、`source_path`、`source_blob_sha256`、行号范围或符号，以及已知限制。

`evidence_kind` 可为 `source_reference`、`executed_check`、`inference`。只有实际执行过的检查可以使用 `executed_check`。推断出的作者意图必须标为推断。

引用验证检查路径、快照哈希、行范围、符号存在及覆盖情况，不假装机器已经证明所有解释的语义正确。显示“引用检查通过；解释仍待审阅”。引用一个存在的文件并不自动支持任意结论。

### 12.5 完成与拒绝

首个可用单元需要：真实项目名称/入口说明、至少一条可追溯代码引用、限制说明、可打开的离线页面。没有可识别源码的仓库应 blocked，不生成通用套话冒充项目手册。

修改原快照源码、凭空引用不存在文件、要求外网或生成可执行 HTML 注入，均不可 accepted。新版本不得删除此前已通过检查的章节；无实质新增的重复措辞标记 no-progress。

---

## 13. 首发 Recipe B：Test Me to Death

### 13.1 支持范围

首版只支持单包 npm JavaScript/TypeScript 项目、现有 Vitest 配置与可重现的本地测试环境。Monorepo、其他 package manager、依赖生产服务的集成测试和原生编译依赖先明确不支持。

启动前检测依赖和配置。缺依赖时不默认联网安装；输出 blocked 与缺少的准备步骤。可选的用户批准准备阶段与模型执行分开，保留 lockfile，不运行未知 lifecycle 脚本。

### 13.2 基线不可省略

先在隔离执行环境跑原始测试，记录测试命令、版本、退出码、测试数量、跳过数量与失败列表。测试用例目录、测试发现规则和项目识别必须在启动前校验，确保允许的新增测试目录能被原配置发现。基线不能完成或已有失败时，首版停止此 Recipe，而不是混合处理新旧失败；说明原因，用户可选择别的 Recipe。

基线、原测试、生产源码、配置、lockfile 与验收器均作为受保护文件。agent 仅能新增允许目录中的测试，不修改生产代码、原有测试、snapshot、测试配置或依赖。

### 13.3 阶段

| 阶段 | 最多单元 | 工作 |
|---|---:|---|
| boundary-tests | 3 | 对选定模块增加空值、边界值、错误输入等有依据的场景 |
| state-tests | 3 | 对重复调用、失败后恢复、取消、时序等状态组合补测试 |
| property-tests | 2 | 基于明确行为约定和已具备的工具写有限性质检查 |

每个单元是“某个模块的一组行为保护”，不是随意多造测试文件。测试名字与断言必须对应一条预先定义的场景说明。

### 13.4 通过路径

新增测试必须被现有测试运行器实际发现并执行；“0 tests”“全部 skipped”“只 import 文件”不算通过。不得通过 catch 所有异常、删除断言、全量 mocking 掩盖待测行为或放宽预期来制造绿色。

runner 在生成 worker 结束后建立新验证副本，将允许的新增测试应用到原始基线并运行。验证测试选择与报告不能由 worker 自由改写。

通过时产出 `test_patch`：可应用的 patch、场景说明、基线与增量测试结果、未覆盖方面。patch 由 runner 基于基线和实际新增文件生成，不相信模型口头提供的 diff 一致性。patch 默认不应用到用户仓库。

### 13.5 失败与 bug 候选

新增测试失败时，先判断是否为测试本身错误。修复测试最多两次，并占用 dispatch 预算。不能为了过测试直接修改生产源码。

若失败表现能在新验证副本中稳定复现，且有明确需求、文档或既有不变量支持预期，可保存 `reproduction`：重现步骤、输入、实际结果、预期依据、环境、重复执行记录。称为“已复现行为差异”，不未经审阅宣称必然是真实 bug。

未复现、预期存在争议或测试环境不稳定时保存研究记录，不能计入已通过测试或修复 bug 数。

Mutation testing、fuzzing 与生产修复属于后续扩展，不在 v0.1 对所有仓库默认启用；不要为这些未实现项展示成功指标。

---

## 14. 首发 Recipe C：Toolsmith — CSV Diff

### 14.1 输入与使用边界

用户在一个明确的输出父目录启动 Build 模式；此目录不需要是已有 Git 仓库。工具模板与合成样例由项目提供，不扫描用户其他目录、不收集真实 CSV 数据。

目标：生成一个本地网页工具，用户通过文件选择器载入两份 CSV，选择主键，查看新增、删除、修改记录并导出差异。默认无登录、无后端、无外部 CDN、无遥测。

### 14.2 明确的行为规格

UTF-8，支持可选 BOM、逗号分隔、双引号字段、字段内逗号与换行、LF/CRLF；不做自动编码猜测或任意分隔符识别。

首行是列名。空列名或重复列名拒绝并说明。用户显式选择一个唯一主键列；任一文件主键为空或重复时阻止比较，不能悄悄覆盖。首版不支持复合主键。

两份文件允许列顺序不同，但列名集合必须一致；集合不同给出解释，不自行填补。字段按字符串比较，保留前导零和空白；不得把 `001` 与 `1` 自动视为相同。

结果分类为 added、removed、changed、unchanged；修改记录给出变化列与前后值。导出采用 `contracts/csv-diff-result.schema.json` 定义的 JSON 格式，保留结构，不在首版引入 CSV 公式注入风险。输出记录按主键字符串的代码单元顺序稳定排序，变化列按首份输入的列顺序；特殊列名如 `__proto__` 只能作为数据处理。

默认输入上限每文件 5 MiB 或 20,000 行，以先达到者为准；超出时明确拒绝，不让浏览器无反馈挂起。没有选择主键时不自动做可能误导的行匹配。

### 14.3 阶段

| 阶段 | 最多单元 | 交付 |
|---|---:|---|
| complete-tool | 1 | 完整导入、选主键、对比、结果显示、JSON 导出 |
| edge-cases | 2 | 错误输入、引号、换行、列顺序等边界处理 |
| usability | 1 | 键盘使用、焦点与错误提示，完善帮助和示例 |

第一阶段必须做成可用工具，再进入深化；不得先启动三四个半成品网页。

### 14.4 输出

```text
out/csv-diff/
  index.html
  app.js
  styles.css
  README.md
  sample-a.csv
  sample-b.csv
  expected-diff.json
```

允许将资源内联以便离线使用，但不能依赖远程资源。工具逻辑在浏览器内运行；未选择的本地文件不可读取。用户数据不应通过 fetch、表单、图片 URL 或其他方式上传。

### 14.5 验收

宿主维护固定验收样本：正常比较、重复/缺失主键、列顺序变化、引号内换行、BOM、前导零、空白、不同列集合、超出限制、包含 HTML/脚本文本。

浏览器检查必须确认功能结果与固定期望一致，并阻止外网请求；用户输入展示用文本安全插入，不能执行输入中的 HTML。验证器和预期值不放在 worker 可写目录。

若执行环境没有已安装且受支持的浏览器验收组件，Toolsmith 的“功能已验证”不可通过；可保存候选文件并明确标记待验证，不能用静态页面存在代替功能验收。

---

## 15. 验证器与成果可信度

### 15.1 内置验证器集合

| ID | 检查内容 |
|---|---|
| `output-scope` | 文件只能位于声明输出路径，禁止 symlink、绝对路径和越界 |
| `protected-inputs` | 生产源码、基线、原测试、配置与 lockfile 没有变化 |
| `required-files` | 当前阶段必需文件存在、非空、数量与大小合规 |
| `source-references` | 文档引用路径、哈希、行号范围与快照一致 |
| `safe-markdown` | 禁用原始 HTML 和不安全链接，渲染不执行脚本 |
| `vitest-baseline` | 原始测试基线可重现完成 |
| `vitest-added-tests` | 新测试被发现、执行且满足场景约束；完整基线仍通过 |
| `reproduction-check` | 有支持的预期依据与稳定复现证据；不等价于自动判定 bug |
| `csv-tool-functional` | 固定 CSV 功能样本与离线浏览器交互检查 |
| `no-external-network` | 受测工具和验证命令不能向未经许可的外部地址发请求 |

验证器的输入参数另有严格 schema；首版 recipe 不得引入新的执行型 validator。所有验证都要有超时、输出上限和真实退出状态。

### 15.2 宿主和模型隔离

由模型产生的文件不能定义自己的 passed 条件。测试与浏览器验证在生成过程结束后的新副本执行；独立记录被验证文件哈希，防止验收后替换。

执行型 validator 也必须经过 Sandbox Executor。不能因为执行者叫“验证器”就拥有宿主完整权限。无隔离后端时可做只读结构检查，但不得执行未知代码或给出功能通过结论。

### 15.3 多维状态

一个成果可以“文件完整：通过”“引用检查：通过”“功能执行：未运行”“人工审阅：未完成”。MUST 展示具体维度，不能把所有情况压成一个绿色勾。

`skipped` 必须说明理由；required 验证 skipped 时不能 accepted。可选验证跳过时保留限制，不把 skipped 当 passed。

任何安全边界触发时优先 quarantined，防止用户从默认成果入口误运行相关文件。

### 15.4 去重与无进展

使用 `logical_key` 与内容哈希识别重复成果；在可行时忽略时间戳、构建噪声等非实质差异。相同逻辑成果的新版本只增加版本历史，不增加“独立工具”数。

“新增有效证据”必须是新的可核实重现、检查结果或行为覆盖，不是多写一段自我评价。连续无进展达到阈值后及时停下。

---

## 16. 安全、隐私和计费要求

### 16.1 威胁模型

保护对象：用户原仓库、未授权本地目录、认证材料、额外付费预算、既有成果、发布目标与公共仓库历史。

不可信输入包括：源码与文档、Recipe 指令、模型输出、日志、路径、依赖 lifecycle 脚本、测试代码、生成 HTML、第三方 action。

MUST 对可信仓库也应用输出边界和执行隔离；但首版不宣称覆盖多租户、任意恶意系统调用或所有本地侧信道风险。已知无法保证的边界写进 `docs/security-model.md`。

### 16.2 认证与费用

首版真实运行只支持经确认的 ChatGPT-managed Codex 登录；API key、Bedrock、未知 provider 或无法确认身份的配置明确 blocked。不得为了“更方便”要求用户生成新的 API key。

每次真实 run 都要确认：本次可能消耗既有 credits；限额读取与本地停止不保证精确账单控制；本产品不自动购买、兑换或切换计费方式。

`require_zero_incremental_charge=true` 且无可验证的服务端硬防护时，返回 `BLOCKED_NO_HARD_BILLING_GUARD`。不得使用“本地 max tokens 配置”冒充服务端强制零支出。

支持的 sandbox、认证和配额模式不构成费用承诺。真实运行的费用与使用规则仍以用户账户和官方服务为准。[S03][S04]

### 16.3 数据最小化

不读取认证文件内容、不复制 `auth.json`、不记录 API key、session token、完整邮箱或 cookies。进程环境采用必要变量白名单，不把宿主所有环境变量传给测试、生成工具或子脚本。

明确区分模型服务连接与任务外网权限：任务禁止外网，不代表模型请求离线。发送给 Codex 的上下文仍由模型服务处理；“本地编排”不等于“所有数据永远不出设备”。

demo、公共 fixture 和发布截图使用合成数据或经审查的公开内容。用户源码、真实执行日志和账户信息默认不进入公共仓库。

### 16.4 本地报告和工具预览

报告由可信宿主模板生成，Markdown 禁用 raw HTML、不自动加载远端图片、不自动执行生成脚本。报告页面与可执行工具必须分离，不能直接把 agent 生成的 HTML 注入报告 DOM。

生成工具只在用户主动打开时运行，并明显标记为生成代码。SHOULD 使用单独源或受限 iframe，不把它与控制端、状态目录放在同一执行来源；不自动授予文件系统 API、剪贴板或网络权限。

首版无浏览器控制 API。未来若添加本地服务，应仅监听 loopback、验证 Host/Origin、使用会话令牌并防止路径穿越；不得顺手做一个暴露全部 run 文件的 HTTP server。

### 16.5 删除和清理

run 默认保留，由用户显式清理。实现清理时只能删除 runner 创建且经过路径校验的 run 根目录，禁止递归清理用户传入的任意路径。

磁盘满、权限不足或写入失败时先停止派发，尽力保留已有成果并准确报告。不能为腾空间先删掉此前已经 accepted 的成果。

---

## 17. 收获单、体验与传播

### 17.1 收获单的固定内容

`SUMMARY.md`、`receipt.json`、`index.html` 必须来自同一份结构化数据，至少包含：run 身份、Recipe 版本、源快照、开始/结束时间、停止原因、已启动/失败 dispatch、usage 覆盖情况、额度快照来源、成果清单、每项验证、待审阅项、失败探索、未完成计划。

真实数据缺少时写 unavailable。不得为了视觉完整把未知字段填成 0 或推算精确成本。

### 17.2 交互风格

可用“开炉”“榨汁”“收菜”等轻量主题文案，但错误信息和风险说明要清楚、不戏谑。用户应随时看到停止入口，不因停止而被羞辱或被暗示“额度没用完就是失败”。

首版视觉优先级：成果名称与路径 → 验证状态 → 当前单元 → 运行边界 → 额度观察 → 装饰。动画不得拖慢日志处理或遮挡重要信息。

### 17.3 可分享但不默认分享

提供脱敏导出：去掉本地绝对路径、身份、私有源码和精确余额历史；展示哪些成果可运行、哪些仅为候选。分享卡和 GIF 可由真实 demo 录制生成，不造截图、不编测量数据。

未来可以做成果货架、版本演化时间线、社区 Recipe 目录。首版不做“消耗排行榜”，也不声称 agent 评价等于用户真实价值。

---

## 18. 测试、完成定义与发布门槛

### 18.1 测试分层

单元测试覆盖 policy、状态 reducer、路径检查、预算扣减、事件去重和 usage 归一化。

契约测试覆盖全部 JSON Schema、样例、Recipe 语义、Codex 版本 fixture 与未知事件。

集成测试使用 mock Codex 可控地模拟正常任务、无效 JSON、延迟、限流、退出、缺 usage、重复事件和中断；正常 CI 不调用真实模型、不消耗个人额度。

E2E 使用临时目录和自包含 fixture 验证 CLI 到收获报告；生成代码验证使用受支持的隔离环境。真实 Codex 联调用用户本地授权环境单独运行，记录脱敏证据，不进入公开 fork PR 的自动执行流程。

### 18.2 关键验收

完整逐项标准见 `ACCEPTANCE.md`。以下任一失败不得发布为可安全使用的 alpha：

- demo 在没有 Codex 和网络时不能完成，或不标明模拟数据；
- run 在额度读取失败后伪造百分比或默默切换计费路径；
- 默认操作修改了用户原仓库、原 `.git` 或未授权目录；
- “通过”只来自模型自评，没有真实文件和验证证据；
- Ctrl+C / quota hit 之后继续无限开新任务；
- 恢复会重复派发、重置 budget 或重复计数已有成果；
- harvest 仍需要额度或模型调用；
- 生成内容可以修改验证器、journal 或原验收标准；
- 公共仓库或 npm 包混入真实源码日志、凭证或账户数据。

### 18.3 不以覆盖率数字代替质量

MUST 对安全和恢复分支有具体测试，但不通过只追求覆盖率百分比来宣称可靠。README 不宣称“零风险”“不会额外扣费”“支持任何 repo”。

没有真实 Codex 可用时，仍应完成 mock、contracts、fixture 和 CLI 集成；把真实联调标为 NOT RUN。可以准备代码和 release draft，但不能把未联调状态写成“已验证可用”。

### 18.4 标准开发命令

实施后必须提供并实际验证以下 scripts，不存在的 script 不得写入完成报告：

```text
npm ci
npm run lint
npm run typecheck
npm test
npm run test:contracts
npm run test:integration
npm run build
npm run demo:smoke
npm run test:pack
```

`test:pack` 使用 npm 打包产物在临时目录安装并验证命令、内置 Recipe、schema 和模板均可找到，防止本地源码运行正常而发布包缺资源。

---

## 19. 开源交付与 GitHub 发布

### 19.1 README 必须有什么

一句话定位、真实标记的截图或 demo、安装与从源码启动、三条核心使用路径、Recipe 能力表、额度与计费边界、停止与恢复、成果示例、兼容环境、隐私与沙箱说明、贡献方式、路线图、许可证、非官方关联说明。

英文 README 放根目录，中文 README 链接互通。安装命令必须与实际发布状态一致；未占有 npm 名称时先使用源码安装，不误导用户运行同名第三方包。

### 19.2 开源仓库文件

MUST 包括 LICENSE、CONTRIBUTING、SECURITY、CHANGELOG、issue 模板、PR 模板、支持环境表、Recipe 作者指南、ADR 与发布说明。默认 MIT 是项目选择，不决定用户目标仓库、生成 patch 或第三方代码的许可证。[S13]

没有确认版权署名、仓库 owner 或公开范围时，继续完成本地开发，但在发布阶段停下确认，不能捏造维护者身份。

### 19.3 CI

CI 默认只用 mock 和合成 fixture，不放入个人 Codex OAuth 文件。公开 PR 不得到 secrets；不用 `pull_request_target` 执行来自 PR 的不可信源码。工作流最小权限，第三方 actions 锁定已核实的完整 commit SHA。[S10]

MUST 从实际 action 上游核实 SHA，不在文件里生成看起来像 SHA 的占位值。缺少核实信息时将发布标 blocked，而不是提交假的安全锁定。

正式声明的平台必须有 CI 或人工记录支持。建议首版 Linux 与 macOS，原生 Windows 明确不支持；WSL2 只有经过实测才加入支持列表。

### 19.4 发布分为两种权限

**实施本项目的 Codex**：在用户确认的目标仓库和公开授权下，可创建仓库、推送代码并建立 Release。

**BeforeTibo 产品的运行 worker**：默认永远不创建 GitHub 仓库、不推送、不发 issue、不发布用户成果。不能把构建者的发布权限带入产品运行权限。

具体流程、前置检查和官方 `gh` 命令见 `GITHUB_RELEASE.md`。[S11][S12] 本说明书本身不是一次 GitHub 发布动作，也不代表远端仓库已经存在。

### 19.5 初次发布的完成标准

源代码、文档、测试、锁文件和 CI 到位；从干净目录可按 README 构建；demo 可离线运行；真实联调状态明确；限制不被隐藏；秘密扫描完成；目标 owner/repo、公开性、许可证署名得到确认；远端 push 和 Release 结果实际核对。

首次建议发布为 pre-release `v0.1.0-alpha.1`。npm 发布是另一个需显式授权的动作，不因为用户同意 GitHub 开源就自动执行。

---

## 20. 里程碑、后续方向与决策

### 20.1 开发顺序

| 里程碑 | 交付物 | 必须先解决什么 |
|---|---|---|
| M0 基础合同 | 工程、schema、mock、demo 骨架 | 明确兼容和安全边界 |
| M1 真实纵向闭环 | 一个 Repo Book 单元到本地收获单 | 不是只做 UI |
| M2 可停止和恢复 | 持久化、取消、断电恢复与幂等 | 不能重跑重复消费 |
| M3 三个实用任务 | 文档、测试、CSV 工具 | 每个有独立验收 |
| M4 额度与可观察性 | 真实读路径、缺失降级、软边界调度 | 不虚构读数或 hard cap |
| M5 发布就绪 | 文档、打包、CI、脱敏演示、发布检查 | 支持声明有证据 |

详细任务编号在 `TASKS.md`。实现每一步都要更新 `docs/implementation-status.md`，保存完成项、命令结果、未通过项和下一步。

### 20.2 未来 Recipe 储备

Refactor Arena：冻结行为与测试，比较少量独立候选，允许原实现获胜；不要先做五个全仓库重写。

Example Factory：围绕真实使用场景补可运行例子，不追求空洞数量。

Migration Rehearsal：隔离升级试验与回退说明，不直接升级用户主分支。

Idea Greenhouse：把有限点子做成最小完整原型，不虚构商业验证。

Learning Lab：交互演示、反例、练习和可运行参考实现。

Release Box：变更说明、升级指南、示例更新，不自动发布。

Prompt Arena：固定测试集与保留集比较提示词，不用模型自评替代真实目标质量。

### 20.3 已定决策

AD-001：首版 local CLI，而非 SaaS。

AD-002：首版 single worker，固定有界阶段，而非无限规划。

AD-003：模型产出候选，runner 独立验收。

AD-004：独立快照保护原仓库，沙箱另行负责进程权限。

AD-005：额度 observer 可缺失；依赖它的 quota 模式缺失则关闭。

AD-006：没有服务端硬费用控制时，不承诺零额外费用。

AD-007：收获报告、停止与状态恢复不依赖最终模型调用。

AD-008：GitHub 开源发布与产品 worker 权限严格分离。

### 20.4 仅在需要时由维护者决定的事项

GitHub owner、最终仓库名、许可证版权署名、是否允许第一次公开发布、是否另行发布 npm 包、真实联调允许使用的本地账号和预算。

这些不会阻塞在空目录里完成工程实现和 mock 测试。不要把本可在开发中解决的技术选择全部重新抛给用户。

---

## 21. 最终交付给维护者的报告格式

完成后 Codex 必须报告：实际实现功能、通过与未运行测试、实际 Codex/Node/OS 版本、真实联调范围、已知限制、从源码启动命令、成果样例路径、Git 提交状态、真实远端地址（如有）、Release 状态，以及下一步仍需维护者确认的事项。

不得把“已写测试”当作“测试通过”，不得把“已生成命令”当作“已推送”，不得把“已建立 mock adapter”当作“真实 Codex 接入已成功”。

**最终验收不是“它能一直跑”，而是“它能在边界内做出东西、说明证据、随时停止，并把完整成果交还给用户”。**


---

## 附录：官方来源索引

核验日期为 2026-09-22；核验内容和限制见交付包的 `SOURCES.md`。下列引用可直接打开原始官方资料。

非交互执行 [S01]；App Server [S02]；认证 [S03]；计费 [S04]；banked reset [S05]；沙箱 [S06]；Git worktree [S07]；Node.js 支持线 [S08]；skill [S09]；GitHub Actions 安全 [S10]；仓库创建 [S11]；Release [S12]；MIT [S13]。

[S01]: https://developers.openai.com/codex/noninteractive
[S02]: https://developers.openai.com/codex/app-server
[S03]: https://developers.openai.com/codex/auth
[S04]: https://developers.openai.com/codex/pricing
[S05]: https://help.openai.com/en/articles/20001498-how-banked-codex-resets-work
[S06]: https://learn.chatgpt.com/docs/sandboxing
[S07]: https://git-scm.com/docs/git-worktree
[S08]: https://nodejs.org/en/about/previous-releases
[S09]: https://developers.openai.com/codex/build-skills
[S10]: https://docs.github.com/en/actions/reference/security/secure-use
[S11]: https://cli.github.com/manual/gh_repo_create
[S12]: https://cli.github.com/manual/gh_release_create
[S13]: https://choosealicense.com/licenses/mit/
