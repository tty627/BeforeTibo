# BeforeTibo v1 合同

这些 schema 是本项目定义的运行期接口，不是 Codex 官方协议。Draft 2020-12；除事件 payload 和预留 validator params 外，字段采用显式白名单。协议变化应版本化并同步示例与测试。

| 文件 | 权威写入方 | 用途 |
|---|---|---|
| recipe.schema.json | 经审查的任务包 | 定义阶段、权限需求、成果和验收器 |
| run-config.schema.json | 用户配置，随后由 runner 固化 | 设置工作边界；不单独授予执行/计费同意 |
| agent-result.schema.json | 不可信模型 | 仅提交候选；没有 accepted、usage 或 verified 字段 |
| artifact.schema.json | runner | 登记实际文件、哈希、验证与采用状态 |
| event.schema.json | 单 writer runner | 持久化事件包络；payload 还需按事件做二级校验 |
| evidence.schema.json | 模型候选 + runner 核验 | 为 Repo Book 声明提供可检查的来源 |
| csv-diff-result.schema.json | 生成工具；独立验收器核验 | 明确 CSV 工具 JSON 导出格式 |

## 必须实现的语义约束

1. 相对路径经过 realpath/边界/文件类型检查；正则不是完整安全边界。对不存在的目标，先验证最近的已存在父目录并禁止 symlink 逃逸。
2. stage ID 唯一、依赖存在且无环；只有依赖阶段至少一个 accepted 单元后才解锁。每个阶段的 `max_units` 是上限。
3. v1 validator params 必须是空对象；注册表需拒绝未知键，后续扩展建立各自二级 schema。
4. mode=quota 的桶必须真实存在且与执行身份/任务匹配；stale 必须大于等于 poll；全局期限还须给收尾留下空间。
5. candidate 不可自行将 status 改为 accepted。artifact accepted 必须满足该 kind 的全部 required 验证，并指向哈希一致的文件。
6. source_reference 必须有真实 path/hash 和有效行范围或可定位符号；executed_check 必须有 runner 生成的证据；inference 明确标注未证明部分。
7. journal 的 seq 在同一 run 内单调连续；事件 ID、dispatch 与 artifact 晋升幂等；只靠 schema 不能证明时序合法。
8. CSV 导出行数守恒、summary 与数组长度一致，key 唯一、row 的列集合匹配 columns，changed_columns 与实际差异一致。输出行按主键字符串的代码单元顺序稳定排序；changed_columns 按首份输入的列顺序。
9. 所有摘要、log 和 payload 先脱敏再持久化。模型结果中的 observations 不是自动可信证据。
10. 上游 `--output-schema` 若只接受 schema 子集，adapter 可以生成语义等价的兼容投影用于模型输出约束，但本地必须继续执行完整 schema 和语义校验；不能为迁就上游而放松验收。

## 测试样例警告

examples 里的 demo manifest 使用零哈希，只有结构有效，没有文件完整性保证。真实 artifact 的文件哈希必须由 runner 从实际内容计算；任何 placeholder 都应被功能验收拒绝。
