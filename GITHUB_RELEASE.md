# BeforeTibo GitHub 开源与首次发布流程

本文件指导构建本项目的 Codex 或维护者发布 BeforeTibo 本身。它不授予产品内的 worker 发布用户源码、开 issue、购买额度或推送成果的权限。

## 1. 发布前要确认什么

目标 owner/repository、public 可见性、MIT 著作权署名、当前分支、将推送的内容范围、首个 pre-release tag。读取已有 Git 和已授权 GitHub 身份来解决可读取的信息；多个身份或目标不明时集中询问一次，不能猜测。

用户当前提出的是“让 Codex 构建并开源”的目标，不代表本交付包已经执行过远端操作。缺 GitHub 权限不阻碍本地开发。

## 2. 本地发布门槛

执行并保存实际结果：

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

另外检查真实 Codex 联调状态、兼容版本、三个 Recipe 的结果、quota 模式支持范围。未测能力明确标未测；不能在 Release 文案中宣称已经验证。

检查 LICENSE 的真实署名、README 安装路径、截图的 DEMO/REAL 标记、非官方关联说明和功能限制。准备 `RELEASE_READINESS.md` 与 `release-notes.md`，对未完成项目如实说明。

## 3. 秘密和内容审查

禁止上传：`.env`、认证材料、API key、cookies、SSH key、`auth.json`、用户真实源码快照、未经脱敏的日志、个人余额历史、`.before-tibo` 状态目录、node_modules、临时 run 结果和包含私有路径的分享图。

需要检查待提交文件和整个待推送历史，而不仅是 `.gitignore`。已进入 commit 的秘密不能靠增加 ignore 规则解决；发现后停止发布并报告，不擅自重写用户既有历史。

使用项目实际配置的秘密扫描工具与人工 staged diff 检查。扫描工具不可用时如实记录，不用空脚本返回 0 冒充通过。`npm pack --dry-run` 的文件列表也必须审查。

默认 `.gitignore` 至少排除运行数据、认证文件、node_modules、临时文件和环境变量文件。允许提交明确的 `.env.example` 时确保只有占位值，不能机械允许全部 `.env.*`。

## 4. GitHub 身份和目标检查

以下命令供已授权终端使用；先检查可用性，不自动安装/登录、不展示 token：

```bash
git status --short
git remote -v
git branch --show-current
gh auth status
gh api user --jq .login
```

不要以 `gh api user` 的登录名代替用户指定的 organization owner。远端已经存在时用其具体地址核对；只有明确属于同一项目才继续。

示例变量必须由用户确认或可靠读取后赋值，不得原样把占位符当真实目标：

```bash
OWNER="<confirmed-owner>"
REPO="before-tibo"
TAG="v0.1.0-alpha.1"
```

## 5. 首次创建并推送

只在目标确认、同名仓库不存在、当前目录为正确项目、提交内容审查通过后执行。官方 `gh repo create` 支持从本地 source 创建并推送；未提供 OWNER 时可能默认当前登录用户，因此本流程要求显式 owner。[S11](SOURCES.md#s11)

先明确 stage 哪些文件，查看 staged diff，再创建本地 commit；不要用 `git add .` 无审查地把整个工作目录加入。

```bash
git diff --cached --stat
git diff --cached
# 审查通过后执行本次明确批准的 commit。
# 仅在无目标同名仓库、无冲突 remote 且已获公开授权时：
gh repo create "$OWNER/$REPO" \
  --public \
  --source=. \
  --remote=origin \
  --push \
  --description "Turn remaining Codex usage into validated, lasting artifacts."
```

该示例不是可盲目运行的全自动脚本。`origin` 已存在时先核对，不覆盖；仓库已存在时使用正常 push 流程，不再创建替代仓库。任何情况下禁止默认 force-push 或自动切换可见性。

## 6. 核对推送和 CI

```bash
gh repo view "$OWNER/$REPO" --json nameWithOwner,url,visibility,defaultBranchRef
git rev-parse HEAD
git ls-remote origin HEAD
gh run list --repo "$OWNER/$REPO"
```

比较实际默认分支和预期提交。CI 尚未跑完就写“待完成”，失败就记录失败，不能提前写“all checks passed”。通过后再进行发布 tag。

## 7. 创建 pre-release

维护者确认 tag 与 commit 后，创建并推送对应 tag；不要默认给别的 commit 打 tag。

```bash
git tag -a "$TAG" -m "BeforeTibo $TAG"
git push origin "$TAG"
gh release create "$TAG" \
  --repo "$OWNER/$REPO" \
  --verify-tag \
  --prerelease \
  --title "BeforeTibo $TAG" \
  --notes-file release-notes.md
```

`--verify-tag` 用来避免在缺失 tag 时默默从默认分支另建 tag。[S12](SOURCES.md#s12)

发布之后再查询真实 URL、tag 和 pre-release 状态：

```bash
gh release view "$TAG" --repo "$OWNER/$REPO" --json url,tagName,isPrerelease
```

只有返回成功并与目标一致，才能告诉用户 Release 已发布。GitHub 网页截图或预想的 URL 不算推送证据。

## 8. npm 是另一项发布权限

GitHub 开源与 npm 发布分开。默认只准备可安装的 tarball 与源码说明，不执行 `npm publish`。

获得 npm 发布授权后，再检查包名可用性、维护者 scope、许可证、打包内容、身份和发布渠道。不要让用户执行尚未被本项目拥有的同名 `npx` 包；名称被占用时由维护者选择 scope 或改名。

## 9. 失败后的报告

明确区分：本地代码完成、commit 完成、远端创建完成、push 完成、CI 完成、Release 完成、npm 完成。只报告实际完成的部分，不以“脚本已写好”代替发布成功。

目标信息/权限不全时保留本地工程、release draft 和完整检查结果，说明唯一剩余的发布条件。
