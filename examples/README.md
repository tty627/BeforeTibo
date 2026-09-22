# 参考输入、合同样例与任务指令

此目录不是已经运行过的 BeforeTibo 输出。JSON 示例与 schema 配套；`artifact.example.json` 的零哈希和零大小是显式占位，只允许用于结构测试，不能通过真实文件完整性验收。

`run-config.bounded.json` 展示固定边界；`run-config.quota.json` 中的 `codex` 只是示例桶名，真实执行必须根据当前账户与任务进行映射。`~` 由 CLI 显式展开，不能假设子进程会做 shell 展开。状态目录不得放到源目录中。

两个配置都要求每次真实运行单独确认风险，配置本身不构成授权。`require_zero_incremental_charge=false` 不是自动许可付费切换；它只表示没有提出无法保证的绝对零增量费用承诺。

三个 `recipes/` 包提供 v0.1 工作流结构和指令。单独向 Codex 提交 SKILL.md 时只能得到指令约束，不能获得运行器预算、持久化或沙箱保证；这些必须由项目代码实现。

`csv-fixture/` 是人工设计的合成测试数据：前后各三行，分别有一条 added、removed、changed、unchanged。expected-diff.json 是确定性期望，不是模型实测结果。

## 语义校验必须补充的内容

结构通过不等于可执行。必须检查 stage ID 与依赖、必需文件 glob、参数白名单、工作范围、证据路径、行号关系、artifact 哈希、验证状态以及实际配额映射。

`depends_on` 的 v1 语义：依赖阶段至少有一个 accepted 单元才可以进入依赖阶段；`max_units` 是最多尝试的不同单元数，不是必须全部完成的数量。单个单元的修复不增加单元数量，但每次 worker 启动都增加 dispatch 使用。已完成的先前成果可以作为后续单元只读输入。

执行级固定参数由 runner 提供。v1 的三个内置 Recipe 所有 validator `params` 都为空对象；任何未知参数必须拒绝，不能作为任意命令执行参数透传。
