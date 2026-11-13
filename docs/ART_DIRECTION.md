# 风暴遗迹视觉方向（D035）

本轮在现有 Cocos Creator 3.8.8 / Box2D 工程上优化，沿用青蓝主角、珊瑚红敌人和雷霆机械弓。目标是让玩家更容易看清来箭、蓄势、接触和坠落。没有更换引擎、重做骨架或调整伤害/击退预算。

## 画面语言

场景采用冷青石材、旧铜镶条、少量青蓝能量；暖金用于箭头与关键事件。继续保留简洁分段人物与清楚的肩肘膝轮廓。材质细节集中在平台与武器，背景保持低对比，平台下方保持空旷。

| 用途 | 颜色与形状 | 规则 |
| --- | --- | --- |
| 背景 | 深青蓝，远山低对比 | 不增加高亮漂浮物或遮挡飞行的云雾 |
| 平台 | 石材 #304A59、亮边 #A5B7B5、暗底 #142C3B | 所有实心形状位于原 width × 0.6m 碰撞范围内 |
| 镶条 | 旧铜 #AD8858、窄金边 #EBC689 | 两端少量使用，避免抢夺箭头注意力 |
| 符文 | 主角平台青蓝 #83D8DF，敌台灰青 #B4C6C6 | 一枚小菱形，保持同一家族而非独立炫光素材 |
| 命中 | 普通淡青短线，重击/致命暖金短线和环 | 范围、时长分档，局限于真实接触点 |
| 敌人蓄势 | 头上暖金向下折线 | 颜色之外还有独立形状；只在实际 telegraph 状态出现 |
| HUD | 深青半透明底、浅色文字 | 战斗顶部只留暂停；设置与重开进入暂停面板 |

## 命中与注意力预算

HitResolver 完成伤害后，PhysicsLab 在同一回调读取接触点、shotId 和入射方向，只触发一次。普通命中 0.16 秒；冲击箭或非头部致命命中 0.22 秒；致命头部命中 0.26 秒。最大半径依次 0.28/0.43/0.55m，透明度回落至零。命中音效沿用原资源，音量强调依次 1/1.15/1.3 倍，仍受原限频与音效关闭控制。

活动标记上限 12，最近 shotId 去重历史上限 64，重叠事件独立到期；固定步推进，暂停冻结，重开/销毁清空。不增加刚体、屏幕闪白、震屏、hitstop 或新冲量。身体真实后仰与关节反应仍由原物理负责，特效不能作为其通过证据。

## 横屏与交互

继续使用 D033 全宽安全区与固定战斗构图，保留飞行距离和坠落空间。暂停面板包含音效、支持时的全屏、重开与主按钮“继续战斗”；HP 归零显示独立结果面板。两种面板都拦截背后的瞄准和隐藏按钮；从重开按钮拖出不执行重开。按钮在检查的手机/小窗口尺寸下不小于 48 逻辑像素。

旧练习模式保留原调试入口和操作。全屏仍由真实用户点击发起，API/手机兼容性待浏览器和真机复验。未引入新的菜单层级、装备系统或营销文案。

## 资源与验收

现有四张 PNG 未改动。按外部技能附带的 asset_report.py 检查实际尺寸/透明通道，按 build_preview_sheet.py 生成带标签接触表；来源与哈希见 art-manifest.json。平台、提示和命中标记由生产 Graphics 直接绘制，无新增纹理加载。BattleArt.ts 的 meta 待真实 Creator 导入生成，不猜 UUID。

离线预览调用生产 Graphics/HUD/输入处理器，人物为摆姿插图，**不运行 Cocos 或 Box2D**。预览、素材检查、141 项便携测试和 34 脚本语法通过，只证明各自覆盖范围；当前 Creator 类型/构建退出 2。新视觉家族为 candidate，runtime_verified=false，不据此标记引擎可交付。

下一轮在真实当前构建核对：1）普通/冲击/爆头三个事件是否只出现一次并准时回落；2）敌人蓄势符号与实际放箭是否一致；3）暂停恢复/结算重开不补射；4）844×390 与 4:3、刘海安全区、进入/退出全屏；5）关粒子仍能分辨头、胸、臂、膝的物理反应。原 null destroy 与小腿强冲击关节误差继续独立修复。

## 使用的外部设计方法

用户指定仓库是技能合集，未提供 Cocos 专属技能；采用其跨引擎方法并保留项目引擎边界。来源固定到 c6ca6c41c839b68319ffc08430b99ab768debc32；本轮直接读取使用，没有安装或修改个人技能。

- [game-feel](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/c6ca6c41c839b68319ffc08430b99ab768debc32/skills/disciplines/game-feel/SKILL.md)：离散事件触发、分级强度、重叠安全、自动回落。
- [game-ui-ux](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/c6ca6c41c839b68319ffc08430b99ab768debc32/skills/disciplines/game-ui-ux/SKILL.md)：安全区、触摸尺寸、清晰层次、模态输入隔离。
- [create-game-assets](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/c6ca6c41c839b68319ffc08430b99ab768debc32/skills/disciplines/create-game-assets/SKILL.md)：成套美术方向、清单和技术检查、实际游戏尺寸预览。
- [router/custom-engines](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/c6ca6c41c839b68319ffc08430b99ab768debc32/router/references/custom-engines.md)：缺少专属引擎技能时保留已有引擎，以本项目 API 与生命周期为准。

证据目录：evidence/art-direction-20261113。素材脚本仅用于离线审查，未作为运行时代码引入。
