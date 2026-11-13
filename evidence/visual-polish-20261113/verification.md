# D033 验证记录（2026-11-13）

基线main 6795b5da288e9d4e083ce26fb00545e65a6c17a8；本轮用户要求修复箭矢累计、重量/尺寸表现和横屏全屏。完整变更见../../docs/PROJECTILE_PRESENTATION.md。

| 命令 | 退出码 | 范围 |
| --- | --- | --- |
| npm run verify | 0 | 134项规则/配置/便携类型；包含500次残留策略测试，非引擎内射击 |
| npm run check:syntax | 0 | 33份引擎侧TS脚本语法，非API类型或运行 |
| node --check 新平台碰撞脚本/压力脚本 | 0 | 两个测试入口语法 |
| npm run preview:presentation | 0 | 生产Graphics/HUD/相机构图的离线绘制，人物摆姿示意 |
| npm run typecheck:engine | 2 | 缺Creator真实导入temp配置，BLOCKED |
| npm run build:web | 2 | 缺Creator可执行程序/当前导入配置，BLOCKED |
| npm run test:web:projectile-presentation | 2 | 缺当前Web产物，BLOCKED；runtime/verification.json |
| git diff --check | 0 | 空白检查 |

逐项命令与耗时：command-results.json；原样输出见对应.log。曾在编写阶段修正一个else分支括号，以及离线绘制夹具缺少setBlocked接口；最终语法、便携测试与离线绘制均按上表重新执行。

已查看desktop-offline.png和phone-wide-offline.png，分别为1440×810及844×390。图片直接复用生产绘制和相机/HUD代码、角色图集及机械弓纹理，不包含Cocos/Box2D模拟。presentation-layout.json记录安全区和按钮矩形，离线手机按钮按48逻辑像素约束生成。不是当前引擎游戏截图，不作为全屏/碰撞/物理/G1通过证据。

当前未实跑的重点：真实射击后平台/身体插箭到期及池复用、UIOpacity在World层的实际淡出、放大箭长后的高低角出弓阻挡、原生重力/短迹、全屏按钮/退出/刘海/双触点、长时资源数量。两份新增domain脚本meta待Creator3.8.8真实导入生成。D031销毁异常和小腿强冲击误差保留未解决状态；此轮没有改验收阈值、额外叠加击退或升级引擎。

## 提交与推送

代码、前轮审查和本轮证据整理为本地Git提交。首次向GitHub创建blob的请求被自动审批拒绝：理由是本轮未明确授权将代码披露至iamyours/game。没有绕过或换通道重试，远端未更新；待用户明确同意后再推送该提交。
