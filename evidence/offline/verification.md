# 独立规则与角色素材验证

2026-11-08，基线 `5008d42fcd4df2efd2f33125e50f330c6e6f5ff4` + 关联提交的修改。Node 24.22.1 / Linux；目标引擎 Creator 3.8.8 / Box2D。

- npm run verify：退出 0，94 项测试通过，含配置与生成漂移检查、便携类型检查；日志 verify.log。
- CharacterSkin.ts / PhysicsLab.ts：TypeScript transpile 语法诊断 0，日志 skin-syntax.log；不是引擎类型检查。
- npm run handoff:report -- --output evidence/offline/handoff.json：退出 0，记录源码/配置哈希与未生成 meta；acceptance=NOT_EVALUATED。
- 两张图集：1254×1254 RGBA，alpha 0–255；PNG 尺寸、SHA-256、32 个切片边界与中心锚点通过静态测试。原图没有被改像素。
- npm run env:check：退出 0 但明确没有 Creator 和导入配置；不构成可运行证明。
- npm run typecheck:engine / npm run build:web：均退出 2，BLOCKED。未生成新 Web/微信/Android 包。

本轮规则测试证明攻击时序、体力、波次、补给、存档和页面状态边界，不证明关节、碰撞、真实暂停、页面渲染或真机性能。规则库尚未接引擎；CharacterSkin 已接 PhysicsLab 等待资源导入和运行复验。三姿态、G1、三关游戏流程与渠道仍未放行。

具体接口和接入顺序见 docs/OFFLINE_HANDOFF.md；素材见 assets/resources/characters/README.md。
