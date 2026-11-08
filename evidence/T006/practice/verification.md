# PhysicsLab 桌面射箭练习版

- 日期：2026-11-08。场景：Boot → PhysicsLab，Cocos Creator 3.8.8，Box2D JS `b2PhysicsWorld`。
- 配置：V2 种子，哈希 `bc96602a3baf5bbfd96acbeafc8a0bcb2e08d193252819a1650c9e9ea9f0b9a9`，`runtimeVerified: false`。未创建 Git 仓库；构建、源码和配置标识见本目录的 SHA-256 清单。
- 运行入口：项目目录中 `python3 -m http.server 7458 --bind 127.0.0.1 --directory build/web-desktop`，用桌面 Chrome 打开 `http://127.0.0.1:7458/`。

## 桌面鼠标实跑

Chrome 150.0.7871.125，`npm run test:web:t004-t006` 退出码 0。精确试射使用真实鼠标按下/拖动/释放；仅在测试器分步派发两次精确拖动时短暂停固定步，随后恢复真实运行。连射、松手、切箭、暂停和重置使用正常游戏时钟。

| 轮次 | 握点至命中点横距 | 离弦到命中 | 命中与伤害 |
| --- | --- | --- | --- |
| 1 | 约 13.05 m | 43 固定步（约 0.72 s） | Box2D 接触命中左上臂一次，60 → 48 HP |
| 2（重置后） | 约 13.09 m | 43 固定步（约 0.72 s） | Box2D 接触命中左上臂一次，60 → 48 HP |

- 两轮均观察到活跃箭、单次扣血、回收与一支视觉插箭；重置清除插箭/计数、复原 HP，95 步后靶手仍在台上。同一发射入口拒绝从躯干内部出箭。
- 读取原生 Box2D `GetBodyCount()`：首次发射前 28（含引擎内部地面刚体），两轮飞行和两次重置后均为 29，箭池复用未增长。
- 普通 → 冲击 → 穿甲切换成功；按住连发 3 支穿甲箭，松手后 95 步未补发；暂停时可点重置恢复。
- 运行无页面异常、console error 或失败的资源请求。完整事件见 `web-verification.json`，桌面浏览器渲染截图见 `physicslab.png`。

## 构建与回归

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run verify` | 0 | 配置、生成漂移、63 项测试、便携 TypeScript |
| `npm run typecheck:engine` | 0 | 使用实际 Creator 引擎声明 |
| `npm run build:web` | 0 | Creator 原码 36，包装器归一化；保留编辑器构建诊断 |
| `npm run test:web:t004-t006` | 0 | 上述鼠标与命中测试 |
| `T003_EVIDENCE_DIR=evidence/T006/practice/t003-regression npm run test:web:t003` | 0 | 同一构建，静置 30 秒 242 个样本，最大锚点误差 0.0006421 m；20 次重置。实际 Box2D 刚体/关节保持 28/20（含内部地面刚体） |

原始日志在 `logs/`，机器可读的命令与退出码见 `command-results.json`。

## 修复与重试

- 初次浏览器运行发现 3.8.8 Box2D 射线内部调用 `Vec2.equals`，不能把普通坐标对象传给它。已在 PhysicsAdapter 统一构造真实 `Vec2`；失败记录在 `logs/pre-vec2-failure.json`。
- 实射后重置暴露出场景位姿虽已归位、原生 Box2D 仍保留旧旋转的问题，靶手可能在下一步恢复倾斜并跌出台面。现在在 after-step 中短暂禁用刚体以清旧接触、显式同步原生位姿、清速度并刷新铰链求解状态；没有逐步强改刚体姿态。修复前证据见 `logs/pre-reset-fix-failure.json`、`logs/pre-fresh-rig-failure.json`。
- 一次并行启动 Chrome 的 T003 回归只有 153 个样本，未达 200 门槛，已保留 `logs/concurrent-t003-run.json`。最终的两个 Web 脚本串行跑。

## 验收边界

这是可操作的靶场，不是完整对局；靶手不还击。未验收三姿态实射、13/15/17 m 矩阵、低帧率/移动靶/薄台和斜面、四部位无粒子反应、臂伤恢复、装备脱落/坠台、真机或 T008/G1。不能用自动化替代真人试玩。
