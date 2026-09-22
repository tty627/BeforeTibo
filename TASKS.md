# BeforeTibo 实施任务清单

所有任务初始为 TODO。下表是执行顺序，不是已经完成的工作。每项应能独立验证；有外部阻塞时继续其他不依赖该阻塞的任务。

## 任务依赖表

| ID | 里程碑 | 任务 | 前置 | 主要验收 |
|---|---|---|---|---|
| B01 | M0 | 检查目录、工具链、现有 Git 状态并建立实现状态文件 | 无 | AC-01, AC-02 |
| B02 | M0 | npm / TypeScript / build / lint / test 工程 | B01 | AC-03, AC-04 |
| B03 | M0 | 合同加载、Recipe schema 与语义校验 | B02 | AC-05..AC-08 |
| B04 | M0 | 核心状态 reducer、事件模型和单 writer 存储 | B02 | AC-09..AC-13 |
| B05 | M0 | mock Codex、合成事件、离线 demo | B03,B04 | AC-14..AC-16 |
| B06 | M1 | 工作区快照、敏感文件排除、路径边界 | B03,B04 | AC-17..AC-21 |
| B07 | M1 | sandbox probe 和统一执行器 | B02 | AC-22..AC-25 |
| B08 | M1 | doctor、静态 plan、运行配置与同意流程 | B03,B06,B07 | AC-26..AC-29 |
| B09 | M1 | Codex exec adapter、流解析和兼容性 fixture | B04,B07 | AC-30..AC-33 |
| B10 | M1 | Repo Book 单元与只读验证器 | B06,B08,B09 | AC-34..AC-36 |
| B11 | M1 | artifact 晋升、manifest 和离线 harvest | B04,B10 | AC-37..AC-40 |
| B12 | M2 | 有界调度、dispatch 计数、无进展停止 | B08,B11 | AC-41..AC-44 |
| B13 | M2 | stop、进程树取消、resume、崩溃恢复 | B04,B09,B11,B12 | AC-45..AC-50 |
| B14 | M3 | 测试 Recipe 基线、增量 patch 和复现路径 | B07,B11,B12 | AC-51..AC-55 |
| B15 | M3 | CSV Diff 工具 Recipe 与固定浏览器验收 | B07,B11,B12 | AC-56..AC-59 |
| B16 | M4 | 只读 quota observer、认证匹配和桶归一化 | B08,B09 | AC-60..AC-64 |
| B17 | M4 | quota 模式软边界、stale/reset/限流处理 | B12,B13,B16 | AC-65..AC-69 |
| B18 | M4 | TTY、JSON、脱敏导出与成果状态展示 | B11,B13,B17 | AC-70..AC-73 |
| B19 | M5 | 安全与错误回归、完整 fault injection | B14,B15,B18 | AC-74..AC-77 |
| B20 | M5 | npm pack 安装测试和资源定位 | B18 | AC-78, AC-79 |
| B21 | M5 | 英文/中文 README、指南、CI 和贡献文档 | B19,B20 | AC-80..AC-83 |
| B22 | M5 | 用户授权的真实 Codex smoke 与兼容记录 | B09,B10,B14,B15,B16 | AC-84..AC-86 |
| B23 | M5 | 发布预检、秘密审查和 release draft | B19,B20,B21,B22 | AC-87..AC-89 |
| B24 | M5 | 经确认的 GitHub 创建、推送与 pre-release | B23 + 发布授权 | AC-90..AC-92 |

`AC-05..AC-08` 表示这个闭区间内的所有验收项。没有真实 Codex 条件时 B22 可标 BLOCKED，但 B01—B21 仍须继续完成。发布物必须明确说明真实联调状态，不把 BLOCKED 视作通过。

## 每项任务的执行要求

### M0：让工程可以被验证

B01 检查目录是否已存在其他项目；记录 Node、Git、Codex 和平台状态，不读取秘密。建立 `docs/implementation-status.md`，只填事实。

B02 提供可从干净目录复现的工程脚本，lockfile 提交。最初可以只输出版本和帮助，但不要宣称主功能可用。

B03 引入随包合同，生成或维护与其一致的 TypeScript 类型。写正例、反例和语义级验证；未知 validator、重复 stage、越界路径必须在任务启动前被拒绝。

B04 实现唯一状态转移入口、journal、快照、锁和恢复。先对 reducer 做无外部依赖的单元测试。

B05 建立 mock 正常/失败/截断/重复/延迟事件，demo 从同一事件消费接口驱动，而非写死一个无关动画。合成 usage 和配额始终标 DEMO。

### M1：一条真正闭合的工作链

B06 从已确认 commit 的允许条目创建独立快照。生成 source manifest；保护原项目。禁止无界复制、跟随符号链接或把 `.git`、凭证一起复制。

B07 分离纯结构验证与执行型验证。平台/后端不支持所需保护时 blocked。先用无害探针确认工作区外写入和外网访问的拒绝行为；不要靠配置名推断生效。

B08 实现静态 plan 和明示风险确认。plan 不消耗额度；真实 run 不从配置文件自动接受风险。

B09 先写 fixture 和 parser 测试，再对接本机实际 CLI。argv 使用明确参数，不继承未经授权的 provider 或工具。无法确定某参数时核查 help 和官方来源，不创造参数。

B10 先实现 overview 一个收获单元，确认引用可追溯且源码不被修改；再加入后续模块和链路阶段。

B11 让 manifest 来自 runner 验收，成果不可变、可去重。报告由结构化记录生成；移除 Codex 后仍能收获既有成果。

**M1 演示门槛：一个真实或明确标注 mock 的 unit，从输入到 artifact 和 HTML 都能走通；两种运行状态绝不混淆。**

### M2：不会越跑越失控

B12 实现固定 dispatch、墙钟、单任务、磁盘、修复和无进展上限。所有用模型的阶段都要经过同一个派发入口，不能有绕过计数的“免费评审”。

B13 做 fault injection：dispatch 前后退出、候选保存前后退出、晋升前后退出、journal 末行截断、锁残留、quota 缺失、用户中断。恢复时保留原预算，绝不默认重复不明任务。

### M3：让项目值得安装

B14 只支持已声明 Vitest 单包组合。基线不过就 blocked；新增测试必须执行；不修改生产源码或既有断言；保存真实可应用的 patch 与验证记录。

B15 只做 CSV Diff 一个完整小工具。先固定 fixture 与期望，再让生成逻辑工作。禁止把“页面打开了”作为功能正确的唯一依据。

### M4：让消耗和成果都看得清楚

B16 只读 observer 与 exec 身份一致。处理多桶、缺字段、未知认证、不支持协议与更新时间；不调用 reset 或账户写入方法。

B17 显式 quota mode 才启用基于限额的派发检查。缺失、过期、桶映射不明、周期可能变化都先停新任务。不得将“quota 不可用”变成“继续烧到结束”。

B18 终端与 JSON 复用同一状态源。报告展示不同验证维度、研究失败和部分 usage；导出不含私有路径和凭证。

### M5：从本地工程到可审查开源版本

B19 完整运行 ACCEPTANCE 中的错误、边界与攻击性输入测试。不是单纯追求测试覆盖率数值。

B20 `npm pack` 后安装到临时项目，检查 bin、schemas、recipes、skill 和 report 模板；包中不得有 run 数据、真实日志、凭证或 node_modules。

B21 补齐实际可用命令、已知限制、兼容表、贡献流程和 CI。action SHA 必须来自已核实上游，不能填假哈希。

B22 用户授权后做少量真实联调。每个 Recipe 的功能支持声明和 quota 支持声明分别有证据；不因为 exec 成功就宣称全部 Recipe 已验证。

B23 生成 `RELEASE_READINESS.md`，列明各项 PASS / FAIL / NOT RUN / BLOCKED。署名或远端未确认时不创建公共仓库。

B24 依 GITHUB_RELEASE 检查身份、owner、同名仓库和 remote，按确认内容创建、推送并核验。默认发布 pre-release；npm 仍是单独授权。

## 状态文件模板

```markdown
# Implementation status

## Environment
- Node / OS / Git / Codex: 实际值或 unavailable

## Completed
- Bxx: 实现内容与证据文件

## Commands actually run
- 命令 / 退出码 / 结果 / 日志位置

## Failed, not run, or blocked
- 项目 / 原因 / 影响的支持声明

## Next work
- 下一个任务编号与所需条件

## Publication
- local commit / remote / release / npm 各自真实状态
```
