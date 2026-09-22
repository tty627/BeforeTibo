# BeforeTibo v0.1.0-alpha.1 验收结果

本文件是对 [ACCEPTANCE.md](../ACCEPTANCE.md) 的逐项结果记录，不替换原验收合同。初次审查时间：2026-09-22 05:40 UTC；当日合并后的独立干净目录九项检查已全部通过。Git/发布阶段的最新事实以 [implementation-status.md](implementation-status.md) 和 [RELEASE_READINESS.md](../RELEASE_READINESS.md) 为准。

**PASS** 表示下述明确范围已有实际执行或可核对的会话操作证据；**FAIL** 表示发现未满足要求；**NOT RUN** 表示该场景缺少完整执行证据；**BLOCKED** 表示缺少必须由维护者提供的条件。测试文件存在、测试标题包含某个 AC 编号、条件分支没有被执行，都不能单独证明 PASS。模拟输入不证明真实账户联调；必需的 skipped 检查不算功能通过。

环境：macOS 26.5.2 arm64，Node **24.21.0**，Git 2.51.0，Vitest 4.1.11 / Vite 7.3.6，Playwright 1.63.0 / Chromium 153，Codex CLI 0.154.0。默认 Homebrew Node 实为 25.8.0，不作为支持线验证环境。测试中的源仓库、配额和身份均为合成 fixture；真实个人账户、真实推理与真实额度联调没有执行。

## 可追溯执行记录

下面的相对命令均从项目根目录执行；`node24` 表示本地经 `--version` 核实为 24.21.0 的 Node 可执行文件。该名称只是记录中的缩写，不是要求用户安装的命令或公开路径。

| 证据 | 实际执行与时间（2026-09-22 UTC） | 实际结果 |
|---|---|---|
| E-CONTRACT | `vitest run tests/contract/preflight.test.ts tests/contract/contracts.test.ts tests/unit/storage.test.ts`，实现 agent 当日记录 | 当次 159 PASS：preflight 51、contracts 88、storage 20；新增多桶检查后 preflight 与 exec 独立再跑 59 PASS。最终合并版本另由 E-CLEAN 全量复验。 |
| E-FS | `vitest run tests/unit/{workspace,sandbox,vitest}.test.ts tests/integration/{vitest,runner,safety-review}.test.ts`，05:33:37 | 当次 46 PASS；执行了真实 macOS 沙箱、真实合成 Git 仓库和隔离 Vitest。 |
| E-CSV | `vitest run tests/unit/{codex-stream,codex-rpc,codex-exec,quota,codex-real-worker,csv}.test.ts tests/integration/csv.test.ts`，05:29:01 | 当次 43 PASS，含实际 Chromium 上传、比较、下载及安全探针；随后新增 usage 去重容量回归，stream 文件 7 PASS。 |
| E-OBSERVER | `vitest run tests/unit/codex-observer.test.ts tests/unit/codex-rpc.test.ts`，05:33:00 | 7 PASS；进程组清理为模拟 transport，RPC 输入为合成协议。 |
| E-WORKSPACE | `vitest run tests/unit/workspace.test.ts`，05:38:25 | 11 PASS；补充 `.git/index`、`HEAD`、`config` 字节哈希及独立总字节上限检查。相同文件 ESLint PASS。 |
| E-UNAVAILABLE | `vitest run tests/unit/sandbox-unavailable.test.ts`，05:39:51 | 2 PASS；故障注入不支持的平台值，证明拒绝宿主回退与 required skipped。不是 Linux 实机结果。相同文件 ESLint PASS。 |
| E-REFERENCES | `vitest run tests/unit/structural.test.ts`，root 当日实际运行记录 | 7 PASS：合法引用、不存在路径、错误哈希、越界行号、错误快照、缺失 symbol、虚称执行检查。 |
| E-CLI | Node 24 直接调用构建后的 `probeCodex` 与 CLI，05:39 前后 | 缺失 Codex 路径返回 unavailable；实际 Node 25 CLI 明确 exit 1；无 acknowledgement 的非交互 run 在空 Codex PATH 下明确拒绝、stdout 为空。零模型调用。 |
| E-PROBE | 本机 `codex --version`、`exec --help`、公开 protocol 生成、三个 Recipe 的 metadata-only doctor / 原生沙箱无害探针 | 配置隔离、扩展禁用、内写、外写拒绝、私读拒绝、基线写拒绝及网络拒绝实际通过；没有 `account/read`、真实额度或模型任务。详见 [codex-compatibility.md](codex-compatibility.md)。 |
| E-PACK | `npm run test:pack`，root 当日实际运行记录 | 打包后离开源码树安装与 CLI/Recipe/离线 demo 通过，当次 99 个包文件。第一次依赖下载超时失败已保留在 implementation-status；随后用 `npm ci` 缓存做 offline install 通过。 |
| E-DEMO | `npm run demo:smoke`，root 当日实际运行记录 | 移除 Codex PATH 后 Repo Book DEMO 与本地 harvest 通过；不是三个真实 Recipe 的模型联调。 |
| E-GIT | 05:37:36 实际 `git status --short`、`git remote -v`、`git log --oneline -5` | 文件尚未提交；remote 为空；log 明确返回尚无 commits。未假称已有推送或 Release。 |
| E-SHA | GitHub API 对官方 Actions tag 的读取，当日实际记录 | 完整 checkout/setup-node SHA 与 CI 一致，见 [releasing.md](releasing.md)；远端 CI 未运行。 |
| E-STOP | `vitest run tests/integration/stop.test.ts`，root 当日实际运行记录 | 5 PASS：独立repair上限、保存身份变化、部分成功分组、默认stop保留成果、二次SIGINT handler立即取消。使用直接调用已注册handler，不是向用户终端发送真实信号。 |
| E-CANCEL | `vitest run tests/integration/{safety-review,runner,vitest}.test.ts`，05:43:10 | 28 PASS；新增真实沙箱验证进程的immediate取消与保存candidate恢复：不再次dispatch；Test Recipe三阶段完整DEMO为COMPLETED、dispatch 3、artifact 3。 |
| E-WIRING | `vitest run tests/unit/real-run.test.ts tests/unit/cli-real-wiring.test.ts`，当日实现agent记录 | 14 PASS；journal写失败不吞、单调时钟quota轮询、共享inflight、终端/receipt窗口与未知值一致、授权/恢复/doctor接线。没有真实账户或模型调用。 |
| E-CLI-COLOR | Node 24 构建后 CLI，05:45前后，非TTY、`NO_COLOR=1`、`PATH=/nonexistent` | 静态 toolsmith plan 返回 model_calls=0；Repo Book DEMO COMPLETED，stdout仅一行JSON、无ANSI、stderr为空。 |
| E-CLEAN | 独立干净目录：`npm ci`、`npm run lint`、`npm run typecheck`、`npm test`、`npm run test:contracts`、`npm run test:integration`、`npm run build`、`npm run demo:smoke`、`npm run test:pack`，最终复验06:04–06:05，root实际记录 | **九项全部PASS**：全套297 PASS / 25文件；contracts140 PASS / 2文件；integration40 PASS / 5文件；其余命令exit0；包99文件。每组是分别运行的结果，不能相加成独立测试总数。 |
| E-THREE-DEMOS | 最终构建后的三个 CLI DEMO，root 当日实际运行记录 | Repo Book COMPLETED，dispatch1/artifact1；Test Recipe COMPLETED，dispatch3/artifact3；CSV STOPPED，dispatch3/accepted tool1，其后两次no_progress。CSV已有完整工具，但不把后续无进展说成完整计划成功。 |
| E-AUDIT | `npm audit --json --registry=https://registry.npmjs.org`，root 当日实际运行记录 | 最终exit0、0 vulnerabilities，覆盖193依赖；此前mirror不支持与TLS失败仍保留在implementation-status，不能据最终结果抹除。 |
| E-CLOCK | `vitest run tests/integration/safety-review.test.ts`，05:45:41 | 13 PASS；在唯一/最后活动单元中将模拟wall clock回拨60秒，至少3次真实poll仍不延长期限，原deadline不变，journal仅1条clock_jump_detected，COMPLETED/dispatch1。此新增测试与后续磁盘回归均已包含在最终 E-CLEAN；typecheck/lint也通过。 |

早期失败没有抹除：曾有全套 **182 PASS / 6 FAIL**（Vitest 隔离启动与浏览器启动）；后续 **246 PASS / 1 FAIL**（磁盘统计与原子 rename 竞态）。这些失败经修复和独立干净目录E-CLEAN重新运行收口。完整 Test Recipe CLI 曾接受一个patch后因storage_error停止；该失败保留，最终三阶段COMPLETED属于后续另一次真实执行。

## 工程与合同

| ID | 结果 | 实际测试路径 / 证据 | 限制与解释 |
|---|---|---|---|
| AC-01 | NOT RUN | E-GIT；[workspace.test.ts](../tests/unit/workspace.test.ts) 的既有目标保护检查通过 | 本次构建目录初始为空 Git 仓库；没有在含无关项目的目录重新执行完整 handoff 导入。测试已证明产品快照不覆盖既有目录。 |
| AC-02 | PASS | E-CLI；[sandbox-unavailable.test.ts](../tests/unit/sandbox-unavailable.test.ts) | 实际缺失 executable 返回不可用；模拟无后端拒绝执行；没有自动安装。 |
| AC-03 | PASS | E-CLEAN、E-PACK | 独立干净目录npm ci、typecheck、build及其余六项发布检查全部实际通过。 |
| AC-04 | PASS | E-CLI：实际 Node 25.8.0 执行 CLI | exit 1，提示需要 Node 24.x，stdout 为空；不假称 Node 25 受支持。 |
| AC-05 | PASS | E-CONTRACT；[contracts.test.ts](../tests/contract/contracts.test.ts) | 七类 schema 示例与有针对性的负例实际执行；不是任意 JSON 的形式证明。 |
| AC-06 | PASS | E-CONTRACT；contracts.test.ts 的 validator allowlist/params/重复声明负例 | 校验直接拒绝，不进入 worker；首版不提供任意命令 validator。 |
| AC-07 | PASS | E-CONTRACT；contracts.test.ts 的重复 ID、缺依赖、自环及多阶段环 | 有限 DAG 语义检查实际通过。 |
| AC-08 | PASS | E-CONTRACT；contracts.test.ts、[config.test.ts](../tests/unit/config.test.ts)、storage 单 worker 检查 | 无穷/非法单元与越权 writes/capabilities 被拒绝；预设只改变有界数值。 |

## 持久化与 mock

| ID | 结果 | 实际测试路径 / 证据 | 限制与解释 |
|---|---|---|---|
| AC-09 | PASS | E-CONTRACT；[storage.test.ts](../tests/unit/storage.test.ts) | 非法状态/事件/payload、降级 accepted 均拒绝，持久状态不被伪造事件改写。 |
| AC-10 | PASS | E-CONTRACT；storage.test.ts writer/stale-lock 竞态检查 | 第二 writer、锁替换与同时回收测试通过；不依赖 kill 持久 PID。 |
| AC-11 | PASS | E-CONTRACT、E-FS；storage.test.ts 与 [runner.test.ts](../tests/integration/runner.test.ts) | intent 前后故障及 sync 后错误不退还名额；恢复不自动重发。 |
| AC-12 | PASS | E-CONTRACT；storage.test.ts journal framing/recovery | 截尾隔离、中段损坏拒绝、完整无换行尾行、UTF-8 边界均覆盖。 |
| AC-13 | PASS | E-CONTRACT；storage.test.ts 重放、重复 ID、usage 与 promotion | 同 ID 同事实幂等；同 ID 不同事实拒绝；序号与 dispatch 不重置。 |
| AC-14 | PASS | E-DEMO；runner.test.ts | 无 Codex PATH、无登录的离线 DEMO 到报告闭环通过。 |
| AC-15 | PASS | E-CSV、E-DEMO；runner.test.ts、csv.test.ts、[codex-real-worker.test.ts](../tests/unit/codex-real-worker.test.ts) | 实测 DEMO 标记、origin 及真实 worker 合成 transport 路径；真实模型报告未生成。 |
| AC-16 | PASS | E-FS、E-CONTRACT；runner.test.ts invalid-json/delay；storage 与 stream 去重 | mock 与 real 使用 Worker 接口；延迟/错误走正常 runner。重复事件由协议/账本层独立验证。 |

## 工作区与进程边界

| ID | 结果 | 实际测试路径 / 证据 | 限制与解释 |
|---|---|---|---|
| AC-17 | PASS | E-WORKSPACE、E-FS；workspace.test.ts、[safety-review.test.ts](../tests/integration/safety-review.test.ts) | 源内容、untracked 哨兵、status、HEAD，以及 `.git/index`/`HEAD`/`config` 字节哈希不变；并拒绝 source 内 state/snapshot 与 symlink 别名。未穷举所有 Git 扩展元数据。 |
| AC-18 | PASS | E-WORKSPACE；真实临时 Git dirty/unborn/symlink/gitlink fixture | 明确 blocked，未自动 stash、commit 或移除 submodule。 |
| AC-19 | PASS | E-WORKSPACE；路径排除正反例与快照内容检查 | `.env`、认证路径、node_modules、自动激活控制面文件未复制；秘密内容检测为启发式，不能识别任意人类定义秘密。 |
| AC-20 | PASS | E-WORKSPACE、E-CONTRACT；workspace 与 contract path 检查 | traversal、盘符、UNC、双重编码、symlink 祖先、相似前缀与不规范路径实际拒绝。 |
| AC-21 | PASS | E-WORKSPACE；单文件/数量上限及独立 total byte 用例 | 记录精确 included/excluded 和 total_bytes；未读取超限 blob。 |
| AC-22 | PASS | E-UNAVAILABLE、E-PROBE；sandbox-unavailable.test.ts / preflight.test.ts | 故障注入确认无沙箱不 spawn、不回退；真实可用后端只声明本机 macOS。 |
| AC-23 | PASS | E-FS、E-CSV、E-PROBE；[sandbox.test.ts](../tests/unit/sandbox.test.ts) | 外部写探针确实收到权限拒绝，目标文件未生成。 |
| AC-24 | PASS | E-FS、E-CSV；sandbox.test.ts、CSV 浏览器固定检查 | OS 外部 TCP 拒绝；Unix IPC 特许不开放 IP；浏览器 CSP/请求拦截与实际否定探针通过。 |
| AC-25 | PASS | E-FS、E-OBSERVER；sandbox.test.ts、codex-observer.test.ts | 实际超时、输出溢出、普通子进程树取消；observer 自有组退出清理为 mock。未进行 OS 真实 PID 快速复用压力测试；接口不接受持久 PID。 |

## 启动授权与适配器

| ID | 结果 | 实际测试路径 / 证据 | 限制与解释 |
|---|---|---|---|
| AC-26 | PASS | E-PROBE、E-CLI-COLOR；doctor metadata-only 三 profile | doctor 公共配置/沙箱探针实际运行，零推理、零账户读取、零依赖安装；静态plan在无Codex PATH下实际成功。 |
| AC-27 | PASS | E-CLI、E-CONTRACT；preflight.test.ts、config.test.ts | 实际无 ack 的非交互 CLI 拒绝；config 不构成同意；两项同意前不查账户。 |
| AC-28 | PASS | E-CONTRACT；preflight.test.ts；[codex-exec.test.ts](../tests/unit/codex-exec.test.ts) | 合成 API key/未知身份/provider/base URL/隐藏自定义 provider 被拒绝；不读取真实 credential。 |
| AC-29 | PASS | E-CONTRACT；preflight 与 exec 的 zero-charge 负例 | 明确 `BLOCKED_NO_HARD_BILLING_GUARD`，在账户/模型探测前结束。 |
| AC-30 | PASS | E-CSV；[codex-stream.test.ts](../tests/unit/codex-stream.test.ts) | 分块 UTF-8、合并行、尾行无换行解析实际通过。 |
| AC-31 | PASS | E-CSV、E-FS；stream 与 bounded process 检查 | 超长/损坏/非对象/总输出界限与非保留原始流已测；stdout+stderr 共享限额。 |
| AC-32 | PASS | E-CSV、E-FS；codex-exec.test.ts / runner.test.ts | exit 0 无效 schema 仍失败，未晋升成果；adapter 无验收权。 |
| AC-33 | PASS | E-CSV、E-CONTRACT；stream、usage、storage 去重测试 | 缺失保留 null；累计与单回合不相加，cached/reasoning 不双计；去重容量溢出标 partial。 |

## 文档和成果存储

| ID | 结果 | 实际测试路径 / 证据 | 限制与解释 |
|---|---|---|---|
| AC-34 | PASS | E-REFERENCES、E-DEMO；structural.test.ts / runner.test.ts | 合成指定快照 overview 有真实文件哈希/行引用与限制；解释语义及作者意图仍需人工审查。 |
| AC-35 | PASS | E-REFERENCES；structural.test.ts 六类负例 | 不存在路径、错误 hash、越界行、错误 snapshot、缺失 symbol 均失败。 |
| AC-36 | PASS | E-REFERENCES、E-CONTRACT；structural / contract evidence semantics | 没有 runner 证据的 executed_check 被拒绝；推断必须写限制；不能自动证明所有自然语言命题诚实。 |
| AC-37 | PASS | E-FS、E-CONTRACT；workspace、sandbox、storage、safety-review | runner 文件外写拒绝，伪造 journal 不属于候选；验证与晋升之间修改候选会被隔离。 |
| AC-38 | PASS | E-DEMO；runner.test.ts 的多文件单逻辑成果 | 实际三个文件聚合一个artifact；receipt以logical_key统计。promotion/recovery已测；同一logical_key多版本连续升级未另做完整模型运行。 |
| AC-39 | PASS | E-DEMO、E-FS；demo-smoke.mjs / safety-review.test.ts | 无 Codex PATH 的 harvest 成功；完成后的恢复不调用 worker 或 executable prepare。 |
| AC-40 | PASS | E-FS、E-CONTRACT；runner 与 safety-review 的 promotion 故障点 | 崩溃恢复相同成果、无追加模型 dispatch；验证后改字节不能沿用先前验收。 |

## 调度与恢复

| ID | 结果 | 实际测试路径 / 证据 | 限制与解释 |
|---|---|---|---|
| AC-41 | PASS | E-FS；runner.test.ts、[budget.test.ts](../tests/unit/budget.test.ts) | 首次/修复按 durable intent 计数，达到 max_dispatches 不继续。首版无模型 reviewer 旁路。 |
| AC-42 | PASS | E-CANCEL、E-CLEAN；budget/sandbox timeout 与 safety-review 验证取消 | 审查发现的validator signal缺口已修复并执行回归；job/global/recovery期限传到有界执行进程，已有成果保留。没有等待完整20分钟做墙钟实测。 |
| AC-43 | PASS | E-FS；runner.test.ts no-progress；budget.test.ts | 连续 no_progress 达阈值收尾，dispatch 保留。 |
| AC-44 | PASS | E-STOP、E-CLEAN；stop.test.ts 独立repair上限 | dispatch上限6、无进展上限5、repair上限1，实际仅2次尝试，FAILED且无新增派发。最初试验无进展10越过schema上限，已修正输入后重跑通过。 |
| AC-45 | PASS | E-STOP、E-FS；stop.test.ts 默认stop与慢observer回归 | 默认stop允许当前短任务完成验收、保存artifact、状态STOPPED；没有再派发或模型收尾。handler逻辑实测，不向用户会话发送SIGINT。 |
| AC-46 | PASS | E-STOP、E-CANCEL、E-OBSERVER | 二次SIGINT handler立即取消；真实沙箱验证进程收到immediate取消；保留candidate，随后本地恢复且dispatch仍1。此前signal缺口已修复并回归。 |
| AC-47 | PASS | E-FS；runner.test.ts after-intent fault | 恢复标 INTERRUPTED，名额仍为 1，不自动重发可能计费任务。 |
| AC-48 | PASS | E-FS；runner.test.ts after-candidate fault | 保存候选后恢复本地校验；worker 被设为一旦调用即失败，实际未再调用。 |
| AC-49 | PASS | E-FS；runner.test.ts recovery、safety-review 过期恢复 | dispatch 不清零，使用原 deadline；停机时间不会重新开始预算。 |
| AC-50 | PASS | E-STOP、E-WIRING、E-FS | 过期经锁内恢复只harvest；合成保存身份变化拒绝且worker零调用；模型/配置hash也绑定resume身份。真实账户切换未执行。 |

## 测试 Recipe

| ID | 结果 | 实际测试路径 / 证据 | 限制与解释 |
|---|---|---|---|
| AC-51 | PASS | E-FS；[vitest.test.ts](../tests/integration/vitest.test.ts) | 缺依赖/monorepo 明确 blocked，不安装；只声明已测 single npm + Vitest 4.1.11。 |
| AC-52 | PASS | E-FS；unit/integration vitest.test.ts | 真实失败基线、无法发现新测试、0 tests、报告异常、timeout/overflow 均不通过。 |
| AC-53 | PASS | E-FS；workspace、runner、Vitest 候选源码修改检查 | 原测试/源码/config/lockfile受同一源文件哈希集合保护；runner 只构造新增文件 patch，实际 git apply --check 通过。 |
| AC-54 | PASS | E-FS；实际 skipped、无运行断言、discovery 排除用例 | 不以 exit 0 单独判定新增保障；新测试必须被发现且运行断言。 |
| AC-55 | PASS | E-FS；unit/integration reproduction 检查 | 同一差异在两个隔离副本实际复现；不稳定/缺期望依据分开；仅称 reproduced_difference，不自动宣称 bug 或已修复。 |

## CSV 工具

| ID | 结果 | 实际测试路径 / 证据 | 限制与解释 |
|---|---|---|---|
| AC-56 | PASS | E-CSV；[csv.test.ts](../tests/integration/csv.test.ts)、[CSV 单测](../tests/unit/csv.test.ts) | 实际文件选择、显式 key、四类数量、真实下载 JSON 与固定样例一致。 |
| AC-57 | PASS | E-CSV；CSV 18 个 unit 场景与浏览器边界检查 | BOM、escaped quote、逗号、字段换行、LF/CRLF 按规格处理。 |
| AC-58 | PASS | E-CSV；CSV unit/browser 固定检查 | 空/重复 key、列集合差异、前导零、字符串语义、5 MiB 与 20,000 行边界覆盖。 |
| AC-59 | PASS | E-CSV、E-UNAVAILABLE | HTML 输入使用 inert text；真实浏览器与 OS 否定网络探针；损坏工具不通过，后端不可用时 required skipped。浏览器在外层 Seatbelt，见 [csv-validation.md](csv-validation.md)。 |

## 额度与账户

以下 PASS 均为合成协议、纯策略与状态逻辑验证，不是个人账户额度联调。

| ID | 结果 | 实际测试路径 / 证据 | 限制与解释 |
|---|---|---|---|
| AC-60 | PASS | E-CONTRACT、E-CSV；preflight/exec/[quota.test.ts](../tests/unit/quota.test.ts) | observer/worker不匹配、缺身份、成员变化与实际 attempt config 变化均拒绝；真实绑定未测。 |
| AC-61 | PASS | E-CSV、E-FS；quota.test.ts、safety-review quota report | 独立桶/窗口和实际 duration/reset 被保留，不相加、不把 secondary 假设为一周；未知协议结构不推断映射。 |
| AC-62 | PASS | E-CSV、E-FS；quota.test.ts / safety-review | null、缺失、非法百分比、stale 保留 unknown；receipt 不补零。 |
| AC-63 | PASS | E-OBSERVER；[codex-rpc.test.ts](../tests/unit/codex-rpc.test.ts) | runtime 绕过 TS 的 reset/logout/credit/email/exec 请求均被白名单拒绝；拒绝服务端写请求。 |
| AC-64 | PASS | E-CONTRACT、E-CSV；exec version gate/preflight mapping/协议 fixtures | 仅实查 0.154.0；不兼容版本、缺映射或不认识结构禁用依赖能力。真实未来版本未测。 |
| AC-65 | PASS | E-CSV；quota.test.ts reserve/service-denial checks | 任一相关窗口触阈值返回 dispatch=false/cancelActive=true；账户级真实监控不在本次测试范围。 |
| AC-66 | PASS | E-CSV；quota.test.ts；[quota-monitor.test.ts](../tests/unit/quota-monitor.test.ts) | stale/observer 异常停止；没有隐式转 bounded。 |
| AC-67 | PASS | E-CSV；quota.test.ts 的比例上升/reset/period/bucket 变化 | 标 boundary possibly changed 并停派发，不扩大预算。 |
| AC-68 | PASS | E-CSV、E-FS；quota attribution 与实际 harvest receipt | 报告明确账户差值可含其他会话；没有模拟真实其他会话消费。 |
| AC-69 | PASS | E-CSV；quota.test.ts rateLimitDecision/service-denial | 合成限流信息不会触发账号切换或付费回退，等待不得越过deadline；未触发真实服务限流。 |

## 报告、错误、安全回归

| ID | 结果 | 实际测试路径 / 证据 | 限制与解释 |
|---|---|---|---|
| AC-70 | PASS | E-CLI-COLOR、E-WIRING | 非TTY/NO_COLOR=1实际DEMO只输出一行JSON、无ANSI；恶意控制字符被去除，候选/隔离/接受和独立quota窗口已测。未进行终端截图/人工TTY视觉验收。 |
| AC-71 | PASS | E-STOP；stop.test.ts 部分成功报告 | 第1阶段成果accepted、后续失败被列为rejected，3个unfinished与已接受单元分离，HTML包含失败区。 |
| AC-72 | PASS | E-FS；runner HTML/CSP 检查、safety-review Markdown 恶意 metadata | 宿主报告将源码作为转义文本；不注入生成 HTML；CSP禁脚本与外部图片。工具是另行审阅的文件。 |
| AC-73 | PASS | E-DEMO；runner exportSummary 检查 | 分享导出无源文件名、绝对路径、内容、身份或日志；生成源码并未偷偷作为 export 内容发布。 |
| AC-74 | PASS | E-CONTRACT、E-FS；agent contract 越权字段、source mutation、sandbox policy 写探针 | 数据中的验收/预算指令不获得 runner 写权限；验证失败可见。不是所有 prompt injection 文本的完备检测。 |
| AC-75 | PASS | E-CONTRACT、E-FS；storage ENOSPC/rename/atomic write 与 safety-review rename race | 注入 ENOSPC 保持已同步事实并 poison writer；真实 snapshot rename 失败不虚报完成；没有填满用户真实磁盘。 |
| AC-76 | PASS | E-CONTRACT、E-CSV；storage redaction、exec 环境/原始流、export allowlist | 已知 credential 格式与敏感键脱敏；原始推理/终端输出不持久化或分享。不能识别未标记的任意私人字符串，local state仍属私有数据。 |
| AC-77 | PASS | E-CLOCK、E-CLEAN中的budget数学检查、E-WIRING quota轮询 | 活动期漏记已修复；模拟回拨60秒、真实poll与journal一次性异常记录实际通过；未修改用户系统时钟。 |

## 打包、实测、开源

| ID | 结果 | 实际测试路径 / 证据 | 限制与解释 |
|---|---|---|---|
| AC-78 | PASS | E-PACK；[pack-smoke.mjs](../scripts/pack-smoke.mjs) | npm pack 离开源码树安装；CLI symlink、schemas、三 Recipe、模板定位和离线 demo 实测通过。 |
| AC-79 | PASS | E-PACK；pack-smoke.mjs 文件白名单/禁用路径断言 | 当次 99 个打包文件不含 node_modules、runs、认证文件、日志；最终构建后重新列出并人工复查99个打包文件。 |
| AC-80 | PASS | E-PACK、E-DEMO；[README.md](../README.md) 源码安装步骤人工核对 | 明确 local build/unpublished，不诱导执行未知同名 npx 包；可执行后端需维护者显式准备。 |
| AC-81 | NOT RUN | [.github/workflows/ci.yml](../.github/workflows/ci.yml)；[真实push CI](https://github.com/tty627/BeforeTibo/actions/runs/35699251338) | Linux/macOS push CI已全部通过，最小权限、无个人凭证和模型调用；合同指定的fork PR事件仍未实际运行，不能用push事件替代。 |
| AC-82 | PASS | E-SHA；releasing.md 和 ci.yml | 使用经官方 GitHub API 实查的完整 40 字符 SHA；不是虚构值或漂移 tag。 |
| AC-83 | PASS | [LICENSE](../LICENSE)、[supported-environments.md](supported-environments.md) | 维护者确认推荐署名 tty627，LICENSE 已为标准 MIT © 2026 tty627；平台/框架限制如实记录，不重授用户成果许可。 |
| AC-84 | NOT RUN | [codex-compatibility.md](codex-compatibility.md) | 真实 exec 模型 smoke 未授权/未执行；公共帮助、配置和沙箱探针不能替代。 |
| AC-85 | NOT RUN | 三 Recipe 的 DEMO/固定 validator 证据分列于本表 | Repo Book 真实模型：NOT RUN；Test Recipe 真实模型：NOT RUN；CSV真实模型：NOT RUN。一个合成闭环不证明其他真实联调。 |
| AC-86 | NOT RUN | quota/preflight 合成 fixture 通过 | 没有真实账户 read、bucket mapping、更新时间及worker身份一致联调；运行时不满足gate则禁用quota，不作真实支持声明。 |
| AC-87 | PASS | [publication-review.md](publication-review.md)、实际index/worktree/history扫描与staged diff审查 | 最终161文件暂存审查及首次实际commit历史扫描PASS；仅上传已审查项目内容和合成DEMO截图。后续commit仍需逐次扫描。 |
| AC-88 | PASS | 维护者本次明确答复；[GITHUB_RELEASE.md](../GITHUB_RELEASE.md) | 已确认 tty627/BeforeTibo、public、MIT © 2026 tty627、已审查公开范围及 alpha.1 预发布；不包含 npm 发布或真实账户消费授权。 |
| AC-89 | PASS | [RELEASE_READINESS.md](../RELEASE_READINESS.md)、[release-notes.md](../release-notes.md)、[verification-results.json](verification-results.json) | 九项本地检查全部PASS；已准备真实结果、限制与发布草稿，公开目标已授权，未把准备完成称为发布成功。 |
| AC-90 | NOT RUN | E-GIT：当前remote为空 | 未尝试冲突的同名仓库/已有remote发布；没有替换remote或force-push。 |
| AC-91 | NOT RUN | 仓库已创建并push；[首轮CI](https://github.com/tty627/BeforeTibo/actions/runs/35698635470) | 已核对public/master与3566070提交；初次安装包失败已修复，第二轮Linux/macOS CI均成功；tag和Release尚未执行。 |
| AC-92 | PASS | E-GIT、E-PACK、E-CONTRACT/RPC权限检查 | 本会话仅本地pack/install，未npm publish、未上传用户产物；产品无publisher入口且禁止网络/扩展越权。未来发布仍需单独授权。 |

## 保留的未测与发布条件

- validator取消信号、默认stop/二次SIGINT、单独repair上限、resume身份变化、部分成功报告和活动期时钟异常记录已实际回归通过。
- 干净目录九项发布检查已全部通过；暂存内容/现有历史已审查，发布草稿已完成；不能由本地测试通过推断已公开发布。
- 真实exec、三个真实Recipe及真实quota仍为NOT RUN；没有账单/账户授权时继续保留该状态。
- owner/repo、许可证署名与公开范围已确认；远端push CI已通过；tag/Release仍待执行。fork PR事件未运行，npm发布不在本次授权范围。

当前计数：85 PASS、7 NOT RUN、0 BLOCKED、0 FAIL。NOT RUN 分别为 AC-01 未触发的非空构建目录场景、AC-81 远端 CI、AC-84–86 真实联调、AC-90 远端冲突流程及 AC-91 实际发布。原先 AC-83/88 的署名和公开授权阻塞已由维护者答复解决。

补充磁盘证据：`tests/integration/safety-review.test.ts` 实际隔离51 MiB写入触发50 MiB预算取消且零成果；`tests/integration/csv.test.ts` 实际长路径浏览器验收与临时目录清理通过。浏览器数据均计入run预算，短Unix socket路径仅为可信alias，参见csv-validation.md。

最终路径回归已收口：将readableRoots限定到固定CSV样例目录，并以runner-owned CommonJS package边界阻止Node读取上层配置；源码内scratch和两种CLI保存位置均实际通过。最后E-CLEAN全套297、contracts140、integration40，九项命令exit0。此前零成果失败记录保留于implementation-status。
