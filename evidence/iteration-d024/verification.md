# D024 实施与验收

基线：main b121eb709d204b50b5867f5cc84a7b08e9f42781。环境：Linux，Node与锁定npm依赖；没有Creator3.8.8或当前构建。先修订任务表，再实现当前连续对战代码。当前版本不是完整复刻或G1通过。

## 修改

任务表、PLAN、STATUS、任务卡与PRD/架构/验收/D024决策已同步；旧三关/解锁T021、装甲/掉盔T020延期。
接入自然倒地、镜像敌人骨架/双手IK、活体阈值掉弓/取消攻击、双方就位/弓口检查、真实质量变体、运动学倾斜平台、出生占用检查、三箭体力冷却、红绿补给、最高分/音效设置、原创背景与可停止音效、尸体上限/原生采样和重开编号保护。
修复敌人朝左时原玩家骨架部分方向不可达的问题：镜像米制坐标、锚点、限位、握点和IK弯曲分支；不负缩放物理节点。规则检查覆盖130–205度、三档拉弦，不能替代原生马达跟随验收。

## 命令

| 命令 | 退出码 | 实际范围 |
| --- | --- | --- |
| npm run verify | 0 | 118项测试、配置、生成漂移、便携TS；无Creator运行 |
| npm run check:syntax | 0 | 28个assets脚本语法；不含真实cc类型 |
| npm run env:check | 0 | 观测命令，报告未发现Creator与缺少真实导入；0不代表环境齐全 |
| npm run typecheck:engine | 2 | BLOCKED：缺temp/tsconfig.cocos.json |
| npm run build:web | 2 | BLOCKED：缺Creator3.8.8和真实导入 |
| npm run test:web:arcade | 2 | BLOCKED：缺当前Creator构建，未启动浏览器 |
| npm run test:web:arcade-stability | 2 | BLOCKED：缺当前Creator构建，未执行30次/15分钟 |

详细日志与退出码见同目录。没有沿用旧macOS构建当作本轮证据；没有伪造cc声明或meta。

## 剩余

当前源码的Creator导入/meta/类型/构建与WebGL，真实敌箭/玩家爆头/自然倒地/四部位受力/倾斜平台/补给，T008/G1，15分钟/30次重开和监听泄漏，微信/TapTap渠道包和真机均未验。具体复验步骤见docs/CONTINUOUS_HANDOFF.md。监听枚举不可用时必须保持unknown。
