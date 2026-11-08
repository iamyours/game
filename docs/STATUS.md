# 当前状态

version: V2.0
currentMilestone: M1
currentTask: T004
taskState: IN_PROGRESS
completedTasks: T001 T002 T003
sourceRevision: 本轮修复基线 main @ 3760c6d；修改及验证见关联提交
configVersion: 2
runtimeVerified: 否（T003 左右骨架 WebGL 已实测；完整玩法种子未验收）
feelGateG1: NOT_RUN
selectedTapTapPath: Android APK 默认方案，待 T016 核实

## 已完成
- T001：Creator 3.8.8 实际安装、官方 2D 配置逐项合并、编辑器生成 Boot.scene/meta、实际类型声明和 WebGL 构建基线；未升级重建工程。
- T002：Boot 程序生成 PhysicsLab，集中 SI 单位与唯一固定步，米制标尺、正交相机、双触点瞄准/轻点切箭/取消、暂停和真实 Web 标签页后台恢复。
- 实际 Box2D 60 步/1 s：10 m/s 位移 10.000004768 m；角速度/转角通过；落体 -4.981666088 m，解析误差 1.667% <2%。AC01 PASS（Web）。
- 可信双触点、切箭不抢手/不重置冷却、取消不补发、暂停和真实后台恢复后需新按下、鼠标均通过；AC02 PASS（Web）。16:9、4:3、超宽、小横屏与竖屏提示通过。
- 63 项无引擎回归、配置与生成漂移、便携及真实引擎 TypeScript 检查通过；Creator 构建原码 36 / 包装器 0，WebGL 无页面异常或失败资源请求。告警/失败修复历史保留。

- T003：新增 `RigDefinition` 与 `RagdollFactory`，生成左右两个 11 刚体/10 铰链骨架；锚点、24 kg 质量分配、角度限位、中性马达和 ragdoll/platform 碰撞组来自生成配置；PhysicsLab 生成三块真实平台并支持 after-step 安全重置。
- T003 WebGL/Box2D：同一 PhysicsLab 静置 30 秒采样 277 次，左右骨架均 11 刚体/10 关节，最大关节锚点误差 0.000016801 m，物理世界数量保持 27 刚体/20 关节；随后重置 20 次，数量仍为 27/20，无页面或控制台错误。AC03 Web 范围 PASS。
- Git 基线：初始化 `main`，首次导入提交 `aba46c0` 已推送到 `git@github.com:iamyours/game.git`；本次提交前的 `npm run verify`、`npm run typecheck:engine` 与 `npm run env:check` 均退出 0。构建/导入缓存、运行配置和 SSH 私钥未纳入版本管理。

## 桌面 PhysicsLab 射箭练习版
- T004 进行中：受限铰链马达跟随世界瞄准，握点来自真实右前臂，发射前检查身位与平台阻挡。真实受击后的后仰、倒地及继续射击尚待验收。
- T005/T006 仅实现靶场所需的灰盒子集：真实 Box2D 箭尖、接触及实际步间射线补充、同箭去重、回收、纯视觉插箭和局部伤害/冲量；可切换三种箭、观察轨迹和靶手 HP、重置。靶手不会还击。
- 历史桌面烟测：两轮普通箭约 13.05/13.09 m、43 固定步，均命中一次并扣血；旧连发证据不再作为当前输入规则验收。
- 开局回归：平台夹具初始化顺序、站姿支撑与限幅平衡已修；桌面 WebGL 30 秒静置、额外 3600 固定步及 20 次重置后双方仍在台上。
- 按用户纠正改为按住只拉弓、拖动瞄准、松手单发；一直按住不自动射箭，取消/暂停/后台/重置不补发。拖动距离控制力度，收回可减力，长按不自动加力；速度、冲量、伤害和轨迹预览使用相同力度。右手持弓、左手拉弦，双臂由受限物理铰链马达配合。
- 新增真实姿态演示按钮；修正物理节点角发布反写 Box2D 引发的双臂大角度失稳。最新检查及边界：`evidence/T004/release-to-fire/verification.md`。AC04–AC07 未正式通过；倒地测试仍存在放箭未成功的情况，不以站立测试代替三姿态验收。

## 下一步
先补 T004 的三姿态实射验收，再完善 T005/T006；T007 装备脱落/坠台未开始。T008/G1、真机及渠道未运行，完整种子 `runtimeVerified` 仍为 false；不提前扩关。

最后更新：2026 年 11 月 8 日。

## 参考视频复盘与拒射诊断迭代（2026-11-08）
- 复盘 `docs/VID_20261108_174221.mp4` 与当前实现，见 `docs/REFERENCE_REVIEW.md`。明确未完成：倒地实射、局部降权、死亡关闭驱动、掉落/出界闭环。
- T004 新增松手拒射原因、步号和 UI 提示，保持不穿身/穿台、不延迟补射；方向提示从约 0.819 秒纠正为 PRD 的 0.15 秒。
- 当前 Linux 环境 `npm run verify` 退出 0，76 项测试通过；引擎声明/Creator 缺失，`typecheck:engine` 与 `build:web` 均 BLOCKED（退出 2），不得沿用旧机运行结果宣称本次物理通过。
- T004 仍 IN_PROGRESS，AC04 与 G1 不放行。首轮补丁代码已完成，待在 Creator 3.8.8 构建后复测三姿态；证据见 `evidence/T004/reference-review/`。

## 独立规则与角色素材（2026-11-08）
基线 main @ 5008d42。按用户 D017 授权提前完成无引擎子项：敌人攻击调度/预测瞄准、体力与共享冷却、三关九波/清箭事件、补给、页面状态、存档迁移/解锁/去重、生命周期与性能采样、交接清单工具。新增规则均未挂到 PhysicsLab，正式游戏流程待 G1。
按 D018 提前生成两套原创透明 RGBA 角色图集、32 个部件和描述表；CharacterSkin 已接到 PhysicsLab，以真实物理节点的子 Sprite 替换灰盒显示，加载失败回退。弓箭/头盔切片提供素材但未接装备表现。
本轮 94 项测试、配置/漂移和便携 TypeScript 检查 PASS；新引擎适配代码仅检查 TS 语法，缺 Creator 和真实声明，未构建或运行。新资源/脚本 meta 待真实导入。T009/10/11/12/13/14/18 为 IN_PROGRESS（独立子项 CODE_READY），T015/16/17 保持 NOT_STARTED；T004/AC04/G1 仍未放行。证据：evidence/offline/verification.md；接入清单：docs/OFFLINE_HANDOFF.md。

## Creator 编译修复（2026-11-08）
- 真机环境 Creator 3.8.8 导入后发现：新增规则使用 `./BattleRules.js` 等运行时导入时，Cocos QuickCompiler 未映射到 `.ts`；`CharacterSkin` 的资源类型与 `Asset.addRef()` 声明也不兼容。已改为编辑器兼容的无扩展名 assets 导入、运行时 Texture2D 校验并修正引用持有方式。
- `npx tsc --project tsconfig.creator.json --noEmit`、`npx tsc --project tsconfig.json --noEmit` 与 `npm run verify` 均退出 0；94 项测试通过。
- 在干净临时 worktree 中重跑 Creator 3.8.8 `npm run build:web`，包装器退出 0、Creator 原始成功码 36；产物随后通过 WebGL 2 启动烟测，Boot 创建 PhysicsLab，`b2PhysicsWorld` 正常，无页面错误或失败请求。
- 新脚本与角色资源的 `.meta` 已由本机 Creator 生成并随本次修复提交。关闭修复前卡住的旧编辑器实例后，当前工作区也完成标准构建和启动烟测；这不替代 T004/AC04 或 G1。证据见 `evidence/T004/creator-compile-fix/`。

## 手臂交叉 / 三箭冲击反馈修复（2026-11-08）
初始基线 main @ 2c8290f；开发期间已合入远端 db9cb2f 的编译与 meta 修复。手臂 Sprite 与灰盒依据真实肩肘握点的局部连线对齐；持弓目标改为更接近伸展并同步校正弦深度。保留碰撞/质量/铰链，不改物理节点变换。
HitResolver→AimController→PoseController 已接分箭型/部位关节降权、渐进恢复与死亡零主动驱动。去掉统一后仰目标；保留普通1.8/冲击3.2/穿甲1.4 N·s 原冲量，实际数值与关节计划进入 lastHit。
101 项便携回归通过；新引擎代码语法检查通过；实际 Creator/声明/构建缺失，未运行新增 test:web:arm-impact，三姿态、四部位、稳定性与 G1 继续待验。详细原因、参数表和命令：docs/ARM_IMPACT_FIX.md；证据 evidence/arm-impact。

## T004 受限驱动与倒地释放（2026-11-08）
已修正肩部跨限位边界时马达方向：不再按整圈最短路顶住停止角。Downed 仅保留双臂有限IK驱动，躯干/腿部实际马达最大扭矩与速度归零；保留活体与死亡区别，零控制不再显示为满控制。未改限位、质量或三箭参数，没有自动倒地识别/起身。
106 项回归、便携类型检查通过；新场景断言已补，Creator/真实声明缺失，实际三姿态、冲击、稳定性与 G1 仍未放行。证据 evidence/T004/limited-drive/verification.md；说明 docs/LIMITED_DRIVE_FIX.md。
