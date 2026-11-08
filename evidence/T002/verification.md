# T002 单位与输入标定 — Web 最小闭环

执行日期：2026-11-08（Asia/Shanghai）。源码版本：无 Git 仓库，以 `snapshot-manifest.json` 的完整源码、引擎边界源码与构建 SHA-256 标识；无提交、推送或发布。

## 实际入口与范围

- 沿用锁定的 **Creator 3.8.8 / TypeScript 5.9.3 / Box2D 2D**，未升级重建工程。
- 编辑器生成的新脚本/目录 meta 保留；原 Boot.scene 与 meta 未改。Boot 加载同哈希配置后程序生成 `PhysicsLab`，不是手写场景 UUID。
- Web 运行入口：`http://127.0.0.1:7458/`，对应 `build/web-desktop/index.html`；也可编辑器打开 Boot 预览。
- 宿主：Intel macOS 12.7.4，Chrome **150.0.7871.125**（headed 独立临时 profile），WebGL 2.0；实际对象 `b2PhysicsWorld`。
- 左侧按住/拖动、右侧轻点切箭、顶部暂停；当前“试射”只记录意图、计数和画瞄准线，没有角色、敌人 AI、正式箭矢或伤害。

## AC01 — 实际 Box2D 采样

以 1/60 s 唯一固定步模拟 60 次，而非以墙钟约一秒推算。

| 检查 | 实际 | 期望 | 结论 |
| --- | --- | --- | --- |
| 无重力 10 m/s 水平位移 | 10.000004768 m | 10 m | PASS，约 0.000048% |
| 无重力竖向位移 | 0 m | 0 m | PASS |
| 转角 | 1.570796327 rad | π/2 rad | PASS |
| 末角速度 | 1.570796327 rad/s | π/2 rad/s | PASS |
| -9.8 m/s² 自由落体位移 | -4.981666088 m | -4.9 m | PASS，约 1.667%，小于 2% |
| 落体末速度 | -9.799998283 m/s | -9.8 m/s | PASS |

落体位移相对解析解的首轮差异保留，不伪装为零误差。起止位置、速度、角度与每项误差见 `web-verification.json` → checks.AC01。第 60 步后停下标定刚体供查看；这不是给生产刚体每帧改位姿。

## AC02 — 同一引擎输入管线

可信 CDP 触点经浏览器原生 TouchEvent → Cocos Input → InputRouter；报告保留 `isTrusted`、changed/active IDs。touchId 11 为左手，22 为切箭/暂停：

1. 左手按住并拖到热区之外，角度约 52.815°；右手轻点切箭，左手 ID/方向不变。
2. 普通箭后一发使用冲击箭，但两发间仍为 **33 固定步（0.55 s）**，切箭没有改写上一发建立的冷却。
3. `touchcancel` 后等待超过箭间隔无补发；暂停期间步数不增，继续后旧触点 move 不重新接管；新按下才能射击。
4. **真实切换浏览器标签页**触发 hidden/visible：后台步数停止，触点清空；恢复没有积压步或旧按住发射。报告 backgroundSource 必须为 `actual browser tab visibilitychange`，本次未用合成事件冒充真实切后台。
5. 鼠标拖动、释放、右侧切到穿甲均通过，没有另注册一套重复发射逻辑。

录像 `ac02-web.webm` 为同一画布的连续输入过程，日志/可信触点与生命周期记录见 `web-verification.json`；切换标签页时画布停止采集属于正常暂停，不把该录像声称为手机录屏。

## 画面与投影

- `physicslab.png`：双触点持有时的实验室画面。
- `landscape-16x9.png`：1440×810。
- `landscape-4x3.png`：1200×900，完整核心视野。
- `landscape-ultrawide.png`：1400×600，背景延伸、不扩大物理节点。
- `landscape-compact.png`：640×360，按钮仍至少 48 逻辑像素。
- `portrait.png`：540×960，仅横置提示，物理暂停，不提供竖屏玩法。

每种尺寸断言核心角点未裁掉、世界/UI 坐标往返误差 <0.001 m、按钮在安全核心区域。未测试手机异形安全区，不能用桌面矩形窗口代替。

## 命令与日志

实际退出码见 `command-results.json`。最新必需命令：`npm run verify`（63 项）、`npm run env:check`、`npm run typecheck:engine`、`npm run build:web`（Creator 原码 36 → 包装器 0）、`HEADED=1 npm run test:web:t002`。浏览器验证脚本是 `scripts/verify-t002-web.mjs`，要求 HTTP 服务与本机 Chrome/Playwright Core，路径覆盖见 ENVIRONMENT。

### 保留的失败与告警

- `web-first-failure.*` / `logs/04-web-first.log`：默认 Web Desktop 固定 1280×960 外壳把下部控件裁出窗口；未掩盖为输入通过。
- `web-resize-failure.*` / `logs/06-web-responsive.log`：CSS 改成全窗口后，stock subframe 未发引擎 resize，4:3 仍保留旧构图。工程内模板启动委托显式设置 screen.exactFitScreen 后修复并重建。
- `logs/13-verify-final.log`：新增启动边界测试使便携类型检查首次覆盖到 PhysicsLabConfig，暴露无扩展名的 type-only imports；修正 `.js` 类型导入和显式空值守卫后通过，不伪造“首次全绿”。
- `logs/18-build-web-verified.log`：Creator 成功构建并返回原码 36，但退出时还报全局 `~/.CocosCreator/editor/window.json` 解析失败、Recovery window failed；未擅自改写该编辑器全局窗口状态。构建产物仍须由本次 WebGL 实跑独立确认，不能用成功码掩盖此诊断。
- 控制台会记录 Creator 对不可取消 touchcancel 调用 preventDefault 的浏览器诊断；页面没有未捕获异常、无失败资源请求。未修改引擎来隐藏诊断。构建原始输出也保留，不宣称零告警。

## 结论与后续

T002 / AC01 / AC02 **按 Web M0 范围通过**，允许进入 T003 骨架与关节。不将基础量纲/输入通过扩大成骨架、接触结算、弹道、性能、真机或渠道通过。种子 `runtimeVerified=false` 保留；G1、AC03–AC24 NOT_RUN。T003 需真实骨架静置和重置证据，T005/T006 必须再验证接触队列/after-step 统一变更；T014–T016 验证实际设备和宿主生命周期。
