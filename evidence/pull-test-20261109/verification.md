# 拉取后测试记录（2026-11-09，America/New_York）

## 基线
- 工作区：`/Users/mac/Documents/game`
- 拉取前分支：`main`，落后 `origin/main` 3 个提交；存在用户未提交修改。
- 处理：先执行 `git stash push -u -m codex-pre-pull-20261109-071528`，再 `git pull --ff-only origin main`，最后恢复 stash；无冲突。
- 当前 HEAD：`522963d`（与 `origin/main` 一致）。
- 拉取内容包含 `b121eb7`、`2fcf37c`、`522963d` 的连续对战、回收和 API 检查实现。
- 用户改动已保留：`package.json`、两个 Cocos settings 文件，以及两个未跟踪文件。

## 命令与退出码
| 命令 | 退出码 | 结果 |
|---|---:|---|
| `npm run verify` | 0 | PASS；配置/漂移、118 项规则/单元回归、便携 TS 检查通过 |
| `npm run typecheck` | 0 | PASS |
| `npm run check:syntax` | 0 | PASS；28 个引擎侧 TS 文件语法检查 |
| `npm run env:check` | 0 | PASS；检测到 Cocos Creator 3.8.8，导入与 Web 构建标记已验证 |
| `npm run typecheck:engine-source` | 2 | BLOCKED；当前 shell 未设置 `COCOS_ENGINE_SOURCE` |
| `npm run build:web` | 0 | 构建包装器 PASS；Cocos 原始日志码 36，产物 `build/web-desktop/index.html` 已生成 |
| `npm run test:web:arcade`（未启动 HTTP） | 1 | BLOCKED/连接拒绝 |
| `npm run test:web:arcade`（HTTP 7458） | 1 | FAIL；连续模式启动阶段 `未找到可达的随机平台配置`，随后测试上下文未建立 |
| `npm run test:web:arcade-stability`（HTTP 7458） | 1 | FAIL；同一启动错误，上下文未建立 |
| `npm run test:web:t004`（HTTP 7458） | 1 | FAIL；practice 场景在 `spatial draw strength` 断言失败（实际状态含 `shots: 0`） |

## 运行观察
- WebGL/Box2D 页面可加载，但默认连续模式在 `ArcadeBattle.spawn()` 初始化时抛出：`未找到可达的随机平台配置`。
- 浏览器同时观察到 Box2D `b2GrowableStack.Pop` 错误；该错误发生在初始化异常后的持续物理步中，不能作为通过证据。
- 因此本次只确认“已拉取、可构建、无引擎规则测试通过”，不放行 T019、T004、T008/G1；需要先修复随机平台生成/运行时配置问题，再重跑 arcade 与 practice 验收。
