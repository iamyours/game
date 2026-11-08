# 无引擎交付与 Cocos 接入清单

日期：2026-11-08；本轮基线 `5008d42`，源码/资源清单见 evidence/offline/handoff.json。用户授权独立子项提前实现，完整任务仍保留引擎验收。

| 任务 | 已完成的独立工作 | 必须后续完成 |
| --- | --- | --- |
| T009 | 攻击错峰、蓄势/取消、冻结瞄准、静态及匀速预测候选；RunSession 同步失败优先、清波状态 | 实际敌人、真实箭生成与暂停/死亡桥接 |
| T010 | 种子三关九波规则模拟、延迟出生描述、补给间隔/上限/TTL/阵营单次收取 | 真实出生与不重叠、地形遮挡/补给可达、三关游戏演示 |
| T011 | 三箭体力/共享冷却、受阻不消耗、原装甲公式回归 | 正式替换 InputRouter 的冷却归属、实际冲击失衡/穿甲表现 |
| T012 | 两套 1254×1254 原创 RGBA 图集、32 个切片、CharacterSkin 接 PhysicsLab | 编辑器导入/.meta、实际比例/UV/关节/插箭可读性、场景音效与对照录像 |
| T013 | SaveRepository、StoragePort、迁移/备份/去重/失败重试、PageFlow | 实际页面和宿主存储、结果页写失败提示 |
| T014 | 有限采样、帧时分位数、资源峰值、最近 30 次重开趋势 | 目标设备真实 15 分钟/30 次重开记录、降级策略调优 |
| T015/T016 | 共享生命周期/存储接口 | 微信/Android 宿主实现、音频与触摸安全区、渠道包及真机验证，任务尚未开始 |
| T017 | 可复用纯规则测试和源文件清单工具 | 当前版本全部物理/产品/渠道用例回归，不能据单测放行 |
| T018 | handoff:report 和本说明 | 新 meta 提交、干净副本构建、当前版本产物与证据齐备 |

## 当前可以查看的角色

`assets/resources/characters/hero-atlas.png`、`enemy-atlas.png` 是原始透明图片，`*-frames.json` 是逐部件像素矩形。11 个身体片接在 PhysicsLab 的原刚体节点下面，不改变质量、关节、碰撞尺寸、马达或握点。弓、三箭、头盔共 5 个额外部件仅提供素材，本轮仍保留原程序弓弦和箭表现。

1. 本机拉取提交，使用 **Creator 3.8.8** 打开原工程，等待资源与脚本导入。
2. 新脚本、文件夹、PNG/JSON 的合法 `.meta` 由编辑器生成；检查并提交，禁止手工猜 UUID。
3. 打开 `Boot.scene` 预览；异步加载成功后身体由 Sprite 子节点显示。若仍为灰盒，查日志 `[PhysicsLab] 角色图片加载失败`，检查两张 PNG 的 texture 子资源及切片 JSON 是否导入。
4. 执行 `npm run typecheck:engine`、`npm run build:web`，再启动 `python3 -m http.server 7458 --bind 127.0.0.1 --directory build/web-desktop`。
5. 执行 `npm run test:web:t004`（三姿态），记录实际显示、拒射原因与倒地射击。失败应保留证据；不因换图片而标 AC04 或 G1 通过。

图片加载按 Cocos 3.8 官方 texture/SpriteFrame 资源路径实现；本环境缺真实引擎声明，仅完成语法检查。图集 alpha 通道和切片矩形已检查，不代表实际 UV 渲染验收。

## 新规则如何接入

当前除 CharacterSkin 外，以下模块均为未接引擎的纯规则库。`tests/future-rules.test.ts`、`tests/save.test.ts` 给出调用示例，不能当作完整游戏演示。

- 所有规则只由现有 PhysicsAdapter 的唯一固定步推进。禁止再建 setInterval/第二物理步。ShotBudget/EnemyAttack/PickupRules 的 active 参数必须来自同一个 RunSession/lifecycle。
- 在波开始时一次性构造所有 EnemyAttack，传入同波共享 AttackSlots 及各自 spawnDelaySec。从波开始统一推进时钟，未出生者也推进等待时间；实际身体按种子延迟生成。每次重新开波创建新控制器和 AttackSlots，不复用旧时钟。
- EnemyAttack 在蓄势开始时冻结预测瞄准与误差；真实发射前再查存活/持弓/弓口。死亡或失弓立即调用状态更新，取消尚未释放攻击。预测假设匀速、恒重力；不可达返回 null，真实命中仍归 Box2D。
- ShotBudget 只在一次新 release 且真实双手/弓口/箭池检查通过后扣体力并建立冷却。正式接入时移走 InputRouter 的冷却消费，不能两套冷却叠加。按住与松手恢复速率来自种子，不用力度缩减体力成本。
- RunSession.start() 先输出 clear-projectiles、spawn-wave。物理步全部接触/死亡处理完成后才调用 afterStep；提供所有本波预期敌人状态（包括延迟出生者/已移除尸体的逻辑记录）及真实在途敌箭数。清波进入 draining 禁发，等待仍能伤害玩家的敌箭结束后进入 transition/结果。clear-projectiles 要实际清理飞行箭和待结算队列，重开创建新 session/id，不继承旧箭。
- PickupRules 的 chooseReachable 必须由真实碰撞查询验证出生空间和可射路径。这里只控制数量和时机。collect 成功后主流程消费玩家箭、按上限恢复 HP/体力；敌箭不收取。所有碰撞修改仍在 after-step 执行。
- PageFlow 仅管理 home/battle/result/settings 状态。begin 返回未 start 的 RunSession，宿主挂好世界后消费 start 事件。showResult 只接受终态并调用同一个 SaveRepository；retry/next 使用新的全局唯一 runId。UI 要以 WriteResult 显示失败并允许 flush 重试，不能显示“已保存”掩盖失败。
- SaveRepository 的 StoragePort 可适配本地存储；当前没有 wx 或 Android 插件实现。v0 迁移契约为 completedLevels/soundEnabled；未知/坏档先备份再回退，未来版本只读。读取错误要重新创建仓库重读后再尝试写入。settlements 保留 runId 去重，当前不保存中途物理、不引入经济系统。
- LifecycleRules 的 clearInput/setPaused/resetTime 必须接真实输入和 PhysicsAdapter。后台恢复仍保留手动暂停，不能补发旧触点或旧时间差。
- RuntimeDiagnostics 在真实帧采样/重置完成且稳定后采样资源数。报告保留全量累计时长/均值/峰值和末窗口分位数，内存不可用写 null；不会自动宣布性能 PASS。

## 可复现检查

```sh
npm ci --ignore-scripts
npm run verify
npm run handoff:report -- --output evidence/offline/handoff.json
```

本轮 94 项无引擎测试、配置/生成漂移与便携类型检查通过。引擎文件仅做 TypeScript 语法检查，不伪造 `cc` 声明。T004/AC04、G1、游戏内三关、15 分钟实测、渠道包和真机仍未完成。用户可从此清单继续接入，不应把单测里的规则流程理解成已可在游戏里游玩。
