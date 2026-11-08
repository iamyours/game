# T001 工具基线证据

日期：2026-11-07
工作目录：`/Users/mac/Documents/game`
源码版本：未创建 Git 仓库（`git rev-parse --short HEAD` 不可用）
配置版本：2；当前种子 SHA-256 前 16 位 `951e27ddf49d804d`

## 已完成

- 整理 ZIP 中的 AGENTS、docs、tasks、configs、templates 和 evidence 到工程根目录，保留原始 Word/ZIP。
- 建立 `package.json`、锁定依赖、`.npmrc` 本地缓存和 Node/npm 命令契约。
- 建立配置种子结构校验与跨文件校验：唯一 ID、视野比例、11 刚体/质量比例、箭种、首领独占波、平台/敌人引用、解锁链、预算和范围。
- 从种子确定性生成 `assets/resources/config/*.json` 和 `manifest.json`；生成物含来源、完整 SHA-256 和 `runtimeVerified: false`。
- 建立 Boot 的 Cocos 组件源码、无引擎启动编排、启动清单校验与状态显示。未手写 `.scene`、`.meta` 或 UUID。
- 建立纯逻辑伤害参考、Boot 并发/失败/销毁回归、配置负例和 Creator 构建预检回归。
- 55 项纯逻辑/工具测试通过；依赖审计当前为 0 vulnerabilities。

## 环境发现

- Node.js：`v24.13.0`
- npm：`11.6.2`
- 包管理器：npm；使用仓库 `.npmrc` 的 `.cache/npm`
- Cocos Creator：未在 PATH、环境变量或常见 macOS 应用目录中发现
- 引擎锁：`configs/engine.lock.json` 的 `patch` 仍为 `null`
- 工程骨架：当前 `package.json` 没有编辑器生成的 `creator.version`
- 引擎临时类型：没有 `temp/tsconfig.cocos.json`
- 场景：没有由编辑器生成的 `assets/scenes/Boot.scene`/`.meta`
- 物理后端：目标 Box2D 2D（设计约束；尚未由编辑器导入与运行验证）
- Git：当前目录及父级不是 Git 仓库；未创建提交
- WebGL、手机、微信、TapTap：均未执行

## 最终命令记录

完整 stdout/stderr 保存在 `evidence/T001/logs/`，索引为 `evidence/T001/command-results.json`。

| 命令 | 退出码 | 结论 |
| --- | ---: | --- |
| `npm ci --ignore-scripts` | 0 | 锁定依赖安装成功 |
| `npm run verify` | 0 | 配置、生成漂移、55 项测试、便携类型检查通过 |
| `npm run config:check-generated` | 0 | 生成文件与种子逐字节一致 |
| `npm run env:check` | 0 | 预检程序执行成功；明确列出编辑器、工程、scene/meta 缺失 |
| `npm run typecheck:engine` | 2 | BLOCKED：没有实际 Creator 工程与引擎生成声明 |
| `npm run build:web` | 2 | BLOCKED：没有锁定编辑器、scene/meta 和 Creator 可执行文件 |
| `npm audit --audit-level=high` | 0 | 当前依赖审计无高危问题，输出 `found 0 vulnerabilities` |

## 阻塞与最小解除动作

T001 不能标为 DONE。缺少实际 Creator 3.8 LTS 小版本和编辑器生成的工程，无法证明 `Boot.scene` 导入、Box2D 物理、Web 构建或 WebGL 运行。静态工具代码已就绪，状态保持 BLOCKED。

最小解除动作：按 `docs/EDITOR_SETUP.md` 安装并打开实际 Creator，生成/合并合法工程骨架；将 `configs/engine.lock.json.patch` 填为真实小版本；由编辑器生成 `temp/tsconfig.cocos.json`、`Boot.scene` 和 `.meta`；再运行 `npm run typecheck:engine`、`npm run build:web`，打开 WebGL 后补录证据。完成这些之前不能进入 T002 的引擎输入标定。
