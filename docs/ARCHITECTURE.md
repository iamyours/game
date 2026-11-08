# 风暴弓手技术架构

## 十一 工程结构与模块职责

### 保持一套生产物理
生产物理统一使用 Cocos Box2D 2D，不另建一套浏览器物理代码代替引擎验收。可把公式、结算和状态转换写成无引擎依赖的 TypeScript，供命令行测试；运行中的刚体、碰撞和手感在 Cocos 内验证。

| 目录或模块 | 负责内容 |
| --- | --- |
| assets/scripts/core | 事件 生命周期 时间与配置加载 |
| assets/scripts/domain | 伤害 冷却 解锁 结算等纯逻辑 |
| assets/scripts/input | 多触点 瞄准 取消和键鼠适配 |
| assets/scripts/physics | 单位适配 角色工厂 姿态 关节 |
| assets/scripts/combat | 弓 箭 命中队列 装甲 掉落 |
| assets/scripts/level | 敌人 波次 补给 胜败 |
| assets/scripts/presentation | 相机 音效 粒子和 UI 订阅 |
| assets/scripts/platform | Web 微信 TapTap 存储与生命周期 |
| assets/scenes | Boot PhysicsLab Battle |
| tests scripts docs | 纯逻辑测试 工具和开发记录 |

### 引擎边界
PhysicsAdapter 统一长度、速度、角度、冲量和重力的输入输出。RagdollFactory 创建身体与铰链；PoseController 只通过力、扭矩或马达控制；AimController 生成手臂目标；ProjectileSystem 管理飞行；HitResolver 统一结算。

EquipmentSystem 负责弓盔附着、脱落与回收；WaveDirector 生成敌人并判断清波；RunSession 管理胜败和唯一结算；Presentation 只读取事件。任何 UI 节点都不直接给敌人扣血。

### 编辑器与脚本协作
Boot 场景保持精简，挂一个入口组件。PhysicsLab 的平台、骨架和测试箭优先由工厂程序生成，便于 Codex 反复修改和复现。正式素材可逐步使用预制体，但必须由编辑器导入并保留 meta 文件；不能随意伪造 UUID 或覆盖整个工程配置。

## 十二 数据契约与物理顺序

### 关键数据
CombatConfig 保存射击、生命体力、部位倍率和装备阈值。RigDefinition 保存部位尺寸质量、锚点和逻辑限位。LevelDefinition 保存米制平台、出生点、敌人和波次。ActorState 保存生命、姿态、武器和部位受创。ShotState 保存 shotId、所有者、阵营、飞行和结算状态。

HitEvent 至少包含 stepId、shotId、attackerId、targetId、partId、worldPoint、normal、incomingVelocity、damage、armorDamage 和 reactionType。接触对象只在回调时读取，事件中使用数值快照，不保留即将失效的引擎接触引用。

### 一次物理步的处理
1. 采样输入并更新射击意图，不直接在输入事件里生成多支箭。
2. 在物理更新前应用姿态控制、瞄准目标和本步合法发射。
3. 引擎完成固定步模拟，收集接触与扫掠候选。
4. 物理步后按箭排序去重，执行装甲、伤害、局部冲量和受创。
5. 统一执行死亡、掉弓、掉盔、插箭和安全回收，再发出表现事件。
6. 结算胜败和波次；UI 与相机读取已完成的数据。

具体前后步挂接点在锁定小版本里验证。不能在渲染帧和物理步各运行一次同一套冷却或伤害。

### 姿态与瞄准
先选择关节马达作为主要角度驱动，目标由关节当前角误差计算，驱动速度和最大扭矩限幅。需要整身平衡时再添加受限的躯干扭矩；不能对同一自由度叠加两套强回正控制。

瞄准使用世界方向，依据当前肩部位置生成持弓手和拉弦手目标，再做两段 IK。可达范围内稍留肘部弯曲，防止完全伸直导致解翻转。倒地后仍从真实 BowSocket 发射，出生点前方受阻时取消本次发射，不从躯干内部穿出。

受击权重按局部关节组衰减并恢复。参数与质量、惯量有关，配置中的初值不得未经运行标定直接当成最终物理常数。

### T002 锁定版步进与坐标实测
在安装的 Creator **3.8.8** 源码中，`PhysicsSystem2D` 自动路径的 BEFORE/AFTER_PHYSICS 是每渲染帧而非每个子步；手动 `step()` 只推进世界，不同步节点。因此 `PhysicsAdapter` 是唯一运行步进所有者：关闭 `autoSimulation`，用米制配置的 1/60 秒固定步依次执行 before → syncSceneToPhysics → engine.step → syncPhysicsToScene → after。每渲染帧最多 5 步，超出墙钟时间丢弃；暂停与恢复清余量，恢复首帧也丢弃。不要另加自动路径监听或第二套物理引擎。

接触回调只能快照入队；手动路径不会替调用方维护自动路径的延迟操作队列，所有未来碰撞引起的修改、销毁和释放必须进入适配器的 after 阶段。T002 没有命中或销毁回调，T005/T006 需在实际接触场景继续验证。

`PHYSICS_2D_PTM_RATIO=32` 只由适配器引用。场景长度、碰撞尺寸和系统重力需要乘该比值；`RigidBody2D.linearVelocity`、`angularVelocity`、线冲量已是 m/s、rad/s、N·s，不再乘 32；冲量施加点仍为场景坐标。不要用 UI 的 1920/24 比例充当 Box2D 比例。相机以 24×13.5 m 核心视野、中心 (12,5) 配置；`LabViewport` 集中处理左上 UI 与世界投影，世界节点不通过缩放适配画面。

Boot 成功加载同哈希 manifest/combat 后程序生成 `PhysicsLab/World` 与 Canvas 下 HUD；保留原 Boot.scene/meta，不伪造新的 PhysicsLab.scene。`InputRouter` 只持有触摸意图，唯一固定步消费者生成试射记录；正式箭矢留到 T005。Creator 自带鼠标→触摸管线已验证，未再注册重复的鼠标发射逻辑。

### PhysicsLab 启动与拉弓回归
平台夹具在创建时读取碰撞矩阵；先初始化 `RagdollFactory` 的平台、骨架、箭组，再生成夹具。回归读取创建瞬间的 Box2D mask，并检查双方持续站在各自平台而不只检查关节误差。站姿用对称外展的髋部和中性膝目标拓宽支撑；铰链只控制相对角，站立胸部力矩控制世界倾角，使用角速度阻尼、限幅，并在离开站立范围时退出。
`InputRouter` 在原有固定步发射计时上提供只读拉弦进度。PhysicsLab 用真实前臂握点和世界瞄准方向画弓、弦和搭箭；该表现不改变实际发射入口与物理。

### T004 双手与松手单发
`domain/archery` 根据 RigDefinition 的肩、肘锚点和握点解两段 IK；PoseController 用同一世界目标协调右手持弓、左手拉弦。Graphics 弦直接接实际左手，不把目标位置当实际位置。松手意图由 InputRouter 快照箭种和瞄准角，在唯一次固定步中消费；取消、暂停和后台清该队列。拉满期间没有发射路径，不恢复自动连射。
手动步在原生模拟及 physics→scene 发布期间维护 3.8.8 的 `_steping` 保护并处理延迟操作；发布完成后消费仅由物理产生的 position/rotation 标记，保留外部后续新变更。否则超过 ±180° 的手臂会被节点反写改角，破坏原生关节限位。此锁定版本桥接仅在 PhysicsAdapter 内，验证须包含原生肘限位和超过一整圈的旋转，而不能只看画面骨架。

### 空间力度
InputRouter.drawProgress 由设计坐标拖距映射而非计时自动填满；ShotIntent 冻结 strength。`domain/archery.applyDrawStrength` 是预览和实射唯一力度映射，生成独立的本箭配置（速度、基础伤害、冲量），HitResolver 使用该配置，不改共享种子。最小按住时间与冷却不代表力度。

### 已实现的独立规则与视觉适配
- domain/BattleRules：ShotBudget、AttackSlots、EnemyAttack、ballisticAngles/predictAim；只接受固定步与值类型，不引入第二套物理世界。
- domain/RunSession：三波、draining、波间、安全清箭事件、同一步失败优先与唯一终态。
- domain/PickupRules：有界补给、TTL、阵营与单次收取；可达点由真实世界提供。
- domain/SaveRepository、PageFlow：存档迁移、去重、失败重试及页面状态；StoragePort 由平台注入。
- domain/RuntimeDiagnostics：生命周期清输入与时间重置契约、有限采样/30 次重开趋势；无真实样本时不输出 PASS。
- presentation/CharacterSkin：动态加载 Texture2D 和切片描述；Sprite 仅挂在物理节点子层，显示尺寸来自 RigDefinition，保留灰盒回退。

除 CharacterSkin 外，以上新模块尚未接入 Boot/PhysicsLab，不能与已有 InputRouter 冷却叠加运行。接入步骤及边界见 OFFLINE_HANDOFF.md。
