# 环境与实际命令

安装日期：2026-11-07；最终复核：2026-11-08。工程：`/Users/mac/Documents/game`。

## 已安装环境

| 项目 | 实测状态 |
| --- | --- |
| 主机 | Intel x86_64，macOS 12.7.4 |
| Node.js / npm | v24.13.0 / 11.6.2；本地 npm 缓存在 `.cache/npm` |
| TypeScript | 5.9.3，由 package-lock.json 锁定 |
| Cocos Creator | **3.8.8**，`/Applications/CocosCreator.app` |
| 引擎锁 | `configs/engine.lock.json` 与 package.json.creator.version 均为 3.8.8 |
| 工程来源 | 已安装编辑器的官方 empty-2d 模板配置，逐项合并而非覆盖现有源码 |
| 导入 | 真实编辑器生成 library、temp/declarations、资源 meta 和 Boot.scene |
| 物理后端 | 编辑器日志确认切换至 Box2D；WebGL 运行对象为 b2PhysicsWorld；T002 已实跑标定与输入 |
| Git | 已初始化 `main` 并跟踪 `origin/main`；首次导入提交 `aba46c0` 已于 2026-11-08 推送 GitHub；未发布 |

安装包官方来源、本地 SHA-256 和签名信息见 `evidence/T001/installation/install.json` 与 `codesign-info.log`。本地计算的哈希用于标识安装包，不冒充厂商发布的校验值。

## 可复现命令

```sh
cd /Users/mac/Documents/game
npm ci --ignore-scripts
open -a /Applications/CocosCreator.app --args --project /Users/mac/Documents/game
# 首次/干净副本需等待编辑器完成资源导入并生成 temp/declarations。
npm run verify
npm run env:check
npm run typecheck:engine
# 建议先保存并关闭该工程的编辑器，再由 CLI 构建，避免同时访问工程缓存。
npm run build:web
HEADED=1 npm run test:web:t002
HEADED=1 npm run test:web:t003
python3 -m http.server 7458 --bind 127.0.0.1 --directory build/web-desktop
# 浏览器访问 http://127.0.0.1:7458/，不要直接双击 index.html。
```

| 命令 | 实际结果与边界 |
| --- | --- |
| npm run verify | 退出码 0：配置、生成漂移、63 项回归和便携类型检查；不含 cc 组件运行 |
| npm run env:check | 检测实际编辑器和工程缺失项；返回 0 本身不代表游戏验收 |
| npm run typecheck:engine | 退出码 0：使用实际 temp/declarations，项目源码 strict 检查 |
| npm run build:web | 退出码 0；Creator 原始成功码 36，包装器归一化；产物 build/web-desktop/index.html |
| HEADED=1 npm run test:web:t002 | 退出码 0；Chrome 150.0.7871.125 / WebGL 2.0，实际 Box2D 标定、双触点、鼠标、真实标签页后台与恢复、五种窗口适配；无页面异常与失败请求 |
| npm run test:web:t003 | 退出码 0；Chrome WebGL / Cocos 3.8.8 / `b2PhysicsWorld`，30 秒骨架稳定性与 20 次重置；277 次采样、无页面或控制台错误 |

引擎类型配置显式包含真实生成声明，并启用 ES2022/DOM。`skipLibCheck` 仅跳过官方第三方引擎声明自身的兼容诊断；未添加 cc stub，项目源码仍按 strict 检查。

构建曾出现 debug 字符串类型、默认压缩策略以及 worker SIGTERM 诊断，但最终构建成功；不将日志描述为零告警。首次日志保留在 `evidence/T001/logs/10-build-web.log`；T001 最终构建见 `evidence/T001/logs/14-build-web-final.log`。历史 T002 构建见 `evidence/T002/logs/18-build-web-verified.log`：返回原码 36，但退出阶段还有编辑器全局 window.json 恢复窗口解析诊断，未修改全局文件；以随后 WebGL 实跑独立确认产物。

## T002/T003 浏览器验收命令

先启动上面的 HTTP 服务，再在另一个终端运行：

```sh
HEADED=1 npm run test:web:t002
HEADED=1 npm run test:web:t003
```

默认读取本机 Chrome 与 `/Users/mac/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs`；可以用 `CHROME_PATH` 和 `PLAYWRIGHT_MODULE` 覆盖，不是项目安装依赖。Headed 模式创建独立临时 profile 并使用原生焦点/可见性，真实触发 hidden/visible；不修改用户浏览器 profile。未设 HEADED 时 headless 可回退合成 DOM 生命周期，报告会注明，该模式不作为真实后台通过证据。

Web Desktop 壳来自 `build-templates/web-desktop`：全窗口、touch-action none，启动委托设置 `screen.exactFitScreen=true`，使 resize 真正进入引擎；不手改构建产物。首次发现默认固定外壳裁切，随后发现仅 CSS 改动不发引擎尺寸事件，失败证据保留在 `evidence/T002/web-*-failure.*`。

## 验证范围

AC01/AC02（Web 范围）与 T003/AC03（桌面 WebGL 骨架稳定性范围）通过；T003 的实际证据见 `evidence/T003/verification.md`。60 个固定步的位移、旋转、落体实测以及浏览器触点、取消、暂停、后台与适配证据见 `evidence/T002/verification.md` 与 `web-verification.json`。Box2D 基础量纲和 T003 骨架稳定性通过不等于主动姿态、碰撞结算、飞行与手感通过。种子 `runtimeVerified` 仍为 false；AC04–AC24、G1、微信、TapTap 和真机未正式验收。当前练习版的烟测范围见下文。

T001 的安装前退出码 2 历史保留在 `evidence/T001/command-results.json`。T002 最新命令、日志和源码/构建指纹见 `evidence/T002/command-results.json` 与 `snapshot-manifest.json`。

## 桌面 PhysicsLab 射箭练习版（2026-11-08）

使用同一 Creator 3.8.8 构建与 HTTP 服务；已有产物可直接访问 `http://127.0.0.1:7458/`。保持横屏，左下按住拖动，右侧切箭，右上重置或暂停。靶手不还击。

```sh
# 本地静态服务运行后；两个 Web 测试分开执行以免 Chrome 争抢资源。
npm run test:web:t004-t006
T003_EVIDENCE_DIR=evidence/T006/practice/t003-regression npm run test:web:t003
```

本版命令结果、Chrome/Box2D 版本、重试与构建指纹见 `evidence/T006/practice/verification.md`。桌面鼠标烟测不替代正式三姿态、低帧率、真机或 T008/G1 验收。

## PhysicsLab 开局与拉弓回归（2026-11-08）

使用 Creator 3.8.8 构建与同一静态服务，重跑时将证据写到新目录，保留历史基线：

```sh
T003_EVIDENCE_DIR=evidence/T004/spawn-fall/after npm run test:web:t003
T004_EVIDENCE_DIR=evidence/T004/bow-draw npm run test:web:t004-t006
T002_EVIDENCE_DIR=evidence/T004/bow-draw/t002-regression npm run test:web:t002
```

站台测试覆盖 Boot 重载、创建瞬间的原生夹具掩码、30 秒静置、额外 3600 固定步和 20 次重置；拉弓烟测分别用向前、向后真实鼠标拖动命中靶手，并检查连射间再次拉弦和松手停射。实测结论见 `evidence/T004/bow-draw/verification.md`，不替代手机或三姿态验收。

## 本轮远程开发环境（2026-11-08）
- Linux，Node 24.22.1 / npm 11.9.0；干净拉取基线 `1906406`，npm ci --ignore-scripts 退出 0。
- 没有 Creator 3.8.8 与 temp/declarations，不复用上述 macOS 的验收结论。env:check 退出 0 但输出 blockers；typecheck:engine / build:web 退出 2。
- tsx CLI 启动 IPC socket 遇到 EPERM；npm 脚本改用同一已锁定依赖的 node --import tsx。npm run verify 随后退出 0，76 项测试通过。
- 本轮证据位于 evidence/T004/reference-review；未产生新的 WebGL 构建或物理录像。

## 独立工作与角色图集检查（2026-11-08）
本轮基线 `5008d42`。94 项无引擎测试、配置/漂移、便携类型检查通过；CharacterSkin / PhysicsLab 新接入仅通过 TypeScript transpile 语法检查，非引擎检查。新增命令 `npm run handoff:report`，输出源码哈希、任务状态及待编辑器生成 meta 的清单，acceptance 始终 NOT_EVALUATED。两张 PNG 为 1254×1254 RGBA，alpha 范围 0–255，逐片边界及 SHA-256 有测试。Creator/真实声明缺失，未增加引擎构建或 WebGL PASS。详见 evidence/offline 与 docs/OFFLINE_HANDOFF.md。

## Creator 编译兼容性复核（2026-11-08）
- assets 内运行时相对导入按 Cocos 约定使用无扩展名路径；便携 Node 检查使用 `module: ESNext` 与 `moduleResolution: Bundler`，避免 NodeNext 强制 `.js` 后缀后破坏 Cocos QuickCompiler。
- 基线 `2c8290f` 加本次未提交修复后，真实 Creator 3.8.8 声明类型检查退出 0；`npm run verify` 退出 0，94 项测试通过。
- 干净临时 worktree 完成导入后执行 `npm run build:web`，退出 0，Creator 原始码 36，产物 index.html 与 bundle.js 哈希记录在编译修复证据中。
- Chrome headless WebGL 2 启动烟测通过：Boot 场景创建 PhysicsLab、Box2D 为 `b2PhysicsWorld`，无页面错误或失败资源请求。该结果只验证编译与启动，不替代 T004/AC04、G1 或真机验收。
