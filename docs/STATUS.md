# 当前状态

version: V2.0
currentMilestone: M1
currentTask: T004
taskState: IN_PROGRESS
completedTasks: T001 T002 T003
sourceRevision: Git main @ aba46c0；首次导入提交与 origin/main 一致
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
