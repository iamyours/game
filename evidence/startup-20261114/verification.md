# D042 验证（2026-11-14）

源码基线：53e34387cc4541e4f2d8b2ccc94bf74bd553a449。Creator锁定3.8.8；本轮无编辑器可执行文件、真实导入声明或当前Web构建。

- `npm run verify`：退出0，197项测试全部通过；包含配置/生成漂移、便携TypeScript、首场清单/有界加载、生产Boot等待背景/视觉/两帧绘制及退出引用归零、异步启动重试、崩台固定步/BOSS边界、构建插屏处理与MD5引用更新。夹具不运行GPU/Box2D。
- `npm run check:syntax`：退出0，39个TypeScript脚本语法通过；不是Creator API检查。
- `PRESENTATION_PREVIEW_DIR=evidence/startup-20261114 PREVIEW_VIEWS=phone-wide,phone-cooldown,phone-reward node scripts/render-battle-presentation.mjs`：退出0，生产HUD/输入夹具与3幅离线布局已生成；phone-wide图已目视检查。不是实际游戏截图。
- `npm run typecheck:engine`：退出2，缺temp/tsconfig.cocos.json。
- `npm run build:web`：退出2，缺真实导入声明和Creator可执行文件。未运行微信构建扩展或测量500ms实际显示时间。
- `git diff --check`：最终退出0。

用户原视频约20.47秒与8.29秒，仅用作问题观察：后者先灰盒再补贴图，前者倒地存活状态不明。没有把视频视为本轮运行证据。

未验证：新增脚本meta须Creator真实生成；裁剪后的引擎构建、扩展启用、微信冷/热启动/断网重试、真实坍台与死亡、全三弓实射、BOSS、45战换景/音乐、15分钟/30次重开。旧强冲击关节与null destroy历史失败继续保留，G1及发布未放行。复验步骤见docs/STARTUP_AND_PACING.md、tasks/T024.md。
