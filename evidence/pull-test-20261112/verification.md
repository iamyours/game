# 拉取后真实构建与测试（2026-11-12）

## 基线与保留范围
- macOS 本机 `/Users/mac/Documents/game`，`main` 从 `121c306` 快进至 `623e72da3388f4f70f26f37c2295be8a7c327360`，与本次 fetch 的 `origin/main` 一致。`git fetch origin --prune`、`git pull --ff-only` 均退出 0。
- 开始时无已跟踪文件改动；原有三处未跟踪证据完整保留，未 stash、清理、提交或推送。
- Creator **3.8.8**、TypeScript **5.9.3**、Node **v24.13.0** / npm **11.6.2**；真实 WebGL 2 / Chrome / `b2PhysicsWorld`。版本、产物 SHA-256、原未跟踪文件与本次编辑器生成的 7 个 meta 见 `environment.json`。未升级依赖或伪造 UUID。

## 命令与结果
完整命令、退出码和时间见 `command-results.json`。

| 检查 | 退出码 | 实际范围 |
| --- | --- | --- |
| `npm run env:check` | 0 | 本机 Creator 与导入声明可用 |
| `npm run verify` | 0 | 129 项测试、配置/漂移与便携类型检查 |
| `npm run typecheck:engine` | 0 | 本机真实 Creator 声明下项目类型检查 |
| `npm run check:syntax` | 0 | 31 个脚本 |
| `npm run build:web` | 0 | Creator 原始码 36，生成当前 Web 产物 |
| `npm run test:web:arcade` | 0 | 原生连续循环、真实敌箭扣血、失弓、注入致命命中后的断颈/平台下落/刷新与去重 |
| `node evidence/pull-test-20261112/skin-smoke.mjs` | 0（修正测试初始化后） | 真实纹理加载、40片皮肤、实际手驱动形变、按住不射/释放单发；无页面/控制台错误或失败请求 |
| `npm run test:web:t004` | 1 | 三姿态与取消记录已产生；空间力度检查超时 |
| `npm run test:web:arm-impact` | 1（首跑及复跑） | 首跑测试上下文错误；修正后触发真实关节锚点误差断言 |
| `ARCADE_STRESS_DURATION_MS=60000 npm run test:web:arcade-stability` | 1 | 30次重开、约60.9秒压力采样及销毁均执行，但出现页面异常 |
| `node --check scripts/verify-arm-impact-web.mjs` | 0 | 测试脚本修正语法 |

构建日志保留 SSL 握手、引擎缓存/worker SIGTERM 及本机 `~/.CocosCreator/editor/window.json` JSON 解析诊断；包装器成功码和浏览器当前产物启动已分别验证，不描述为零告警，未修改全局配置。

## 三个未放行项
1. **T004 力度**：60% 目标时实际 `drawProgress=0.5953056899257294`，严格误差 `<0.001` 超时。已有站立、后仰、自然倒地、取消和20%样本，但完整命令未通过；输入坐标取整/映射/容差需继续定位，不修改断言以伪造通过。见 `t004/web-verification.json`、`t004.log`。
2. **T006 受击关节**：修正测试后，第11个 `leftShin/impact` 样本在第60步最大锚点误差 **0.03438462958951669 m**，超过 **0.02 m**，所有采样身体仍有限。前10组通过；当前失败样本、动量和姿态已保存在 `arm-impact-final/verification.json`，不能声称受击稳定性通过。
3. **T014 生命周期**：30次重开及56个压力样本完成，销毁后 `bodies=1 / joints=0 / cocosTotal=0`，但捕获11个 `Cannot read properties of null (reading 'destroy')` 页面错误，命令退出1。见 `stability/verification.json`。仅60秒烟测，不是15分钟/手机性能验收。

## 本次最小修正
`scripts/verify-arm-impact-web.mjs` 将保存 `window.armImpact` 的初始化从 Playwright utility world 改为 main-world `page.evaluate` 轮询；保持所有物理阈值和命中规则不变。断言前保存当前样本，失败信息加部位/箭型/最大误差，避免失败样本丢失。首跑/复跑证据分别保留。

新皮肤专用 smoke 初版也误用了 utility-world 初始化，初跑失败；改为同一 main-world 轮询后退出0。当前 `skin-verification.json`、两张 `skin-*.png` 为修正后的最终结果，不将初跑误报当作引擎缺模块。

## 运行入口与结论
本机服务：`python3 -m http.server 7458 --bind 127.0.0.1 --directory build/web-desktop`。
- 连续模式：`http://127.0.0.1:7458/`
- 物理练习：`http://127.0.0.1:7458/?practice=1`

已人工查看 `skin-drawing.png` 确认是当前游戏场景截图；自动烟测不替代完整手感试玩。当前源码可以编译并进入对战，但 T004/T006/T014/T019 仍 IN_PROGRESS，G1 不放行；未执行15分钟、手机、微信/TapTap或发布验收。下一步优先修复销毁时序与小腿冲击后的关节误差，并定位力度输入回归。
