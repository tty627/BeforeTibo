# 给 Codex 的完整开工指令

你现在是 BeforeTibo 的实施工程师。请在用户指定的项目目录内实际完成一个可测试、可运行、可准备开源发布的 `v0.1.0-alpha.1`，不是再写一份概念方案。

## 一、先读取依据

按顺序读取 `AGENTS.md`、`SPEC.md`、`TASKS.md`、`ACCEPTANCE.md`、`GITHUB_RELEASE.md`，并检查 `contracts/` 和 `examples/`。将主规格复制或整理进最终仓库的 `docs/spec.md`，保留正式需求与设计决定的可追溯性。

已有代码、分支、远端和未提交文件属于用户资产。先检查当前目录，不覆盖未知文件、不 reset、不 stash、不删除现有仓库。如果目录不是本项目且存在冲突，使用用户授权的新目录；确认只应针对确实不能自行解决的破坏性冲突。

## 二、产品目标

BeforeTibo 把用户愿意使用的剩余 Codex 额度转换成可验证、可保留的成果。首版包含：

- 本地 CLI、无账户 demo、doctor、静态 plan、真实 run、status、stop、resume、harvest、export。
- Repo Book、Test Me to Death、Toolsmith CSV Diff 三个内置 Recipe。
- 单 worker、有界执行、独立工作区、真实验证、持久化事件、中断恢复和离线收获单。
- 真实额度观察适配器及能力检测；不可用时禁用 quota 模式，不伪造数据。
- 最小权限、真实计费提示、源码保护、CI、打包和英文/中文开源文档。

不要扩大到 SaaS、全栈登录、远程执行服务、多 agent 平台或自动推送用户成果。

## 三、实施顺序

1. 建立 Node.js 24 + TypeScript strict + npm 工程；锁定实际核验的依赖版本，提供 lint、typecheck、test、build。
2. 实现领域类型、schema 校验、语义校验、单 writer 日志、mock Codex 和离线 demo。
3. 先跑通一个 Repo Book 单元：输入快照 → worker → 候选结果 → runner 验证 → artifact → 离线 report。
4. 加入进程超时、停止、恢复、幂等晋升和固定预算；把相关故障注入测试做完。
5. 完成测试 Recipe 的基线/增量验证，以及 CSV 工具的固定功能验收。
6. 接入真实 exec；探测本机参数和协议，建立已实测版本 fixture。额度 observer 只使用受支持的只读方法。
7. 完成 TTY/JSON 展示、支持环境文档、隐私和计费说明、打包测试与 CI。
8. 对照验收清单逐项检查，修复后再整理 release draft。

每个里程碑完成后更新 `docs/implementation-status.md`，记录已完成项、实际运行的命令及结果、没有运行的测试、阻塞原因和下一步。不要为了让进度表好看而把未完成事项标为通过。

## 四、不得违背的实现约束

原仓库不直接修改；沙箱失败不退回全权限；模型产物仅为候选；runner 与固定验证器拥有验收权；恢复不重置预算、不自动重复不确定的派发；harvest 不再调用模型。

首版不接受 API key / 未知 provider 作为“剩余额度”运行路径，不创建或索取新的 API key；不自动切换计费方式、不兑换 reset、不购买 credits、不绕过服务限流。不能把本地保留阈值宣传为账单硬上限。

不得让生成代码、Recipe 或原仓库文本改写 policy、状态日志、validator 和计费授权。所有外部输入都要做 schema、路径与边界校验。正常 CI 不调用真实模型，不放入个人认证文件。

只宣称实际支持和测试过的能力。mock 数据始终显著标为 DEMO。不得编造测试成功、额度读数、性能数字、文件哈希、GitHub URL、action SHA 或 npm 发布状态。

## 五、执行与阻塞处理

对于可以自行解决的实现细节，依据规格选择最简单的可维护方案并继续；不要每完成一个文件都请求用户确认。

缺少真实 Codex 登录或额度时，继续完成所有无需账户的部分，用 mock 覆盖故障和协议路径，并把真实 smoke test 标为 NOT RUN。不能停在“需要账号才能继续开发”；同样不能为了完成而偷偷改用 API 付费路径。

在一个执行会话达到上下文或环境上限时，把剩余工作准确写入状态文件，并给出已验证的可用成果。不要把未完成实现伪装成完整发布，也不要承诺离线后会继续后台工作。

## 六、完成后必须运行

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

只有 scripts 已实现且命令实际执行成功，才能报告通过。对真实 Codex 适配器、额度读取和沙箱后端，另列实测版本与结果；不可用的环境如实标记。

## 七、GitHub 开源发布

用户希望项目开源，但目标 owner、署名或公开范围不明确时，先完成本地工程，再在最终发布阶段集中确认。读取当前 Git 状态和已授权 GitHub 身份，不猜测 owner，不覆盖已有 remote，不创建同名替代仓库。

对照 `GITHUB_RELEASE.md` 完成秘密扫描、pack 内容检查、CI 与许可证检查后，再进行用户已确认的远端创建、推送与 pre-release。不得自动发布 npm 包、用户私有源码、原始日志或整个本地状态目录。

若无 GitHub 权限或发布未获确认，保留已完成工程和 release draft，报告缺少的具体条件；不得声称已经上传。

## 八、最终报告

请用中文给维护者报告：

1. 实际实现了什么、首版故意不包含什么。
2. 每项测试的实际结果，以及 NOT RUN / BLOCKED 的项目。
3. 构建和运行命令，demo 与真实任务的区别。
4. Codex、Node、操作系统和沙箱后端的实测版本。
5. 产物路径、已知限制和风险说明。
6. Git commit、远端推送、Release 与 npm 的各自真实状态。

现在开始检查当前目录和环境，然后实施 M0 与第一个真实纵向闭环，不要只返回规划。
