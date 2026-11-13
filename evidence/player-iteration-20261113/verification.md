# D034 验证与试玩阻塞

日期2026-11-13；基线main e509c8705e7e614ab96876fb242eabe6088d40d9。本轮先按用户要求完成D033推送，再检查试玩环境并做交互迭代；详细建议/边界见../../docs/PLAYER_EXPERIENCE_REVIEW.md。

| 检查 | 退出码/观察 | 结论 |
| --- | --- | --- |
| npm run verify | 0，137项 | 便携规则/配置/类型通过；非引擎物理 |
| npm run check:syntax | 0，33脚本 | TS语法通过 |
| npm run preview:presentation | 0 | 生产UI处理器夹具、桌面/手机/冷却/失败离线图 |
| npm run env:check | 0但报告无Creator与temp配置 | 未获得当前运行环境 |
| npm run typecheck:engine | 2 | BLOCKED |
| npm run build:web | 2 | BLOCKED |
| npm run test:web:projectile-presentation | 2 | 缺当前Web产物，BLOCKED |
| curl -I --max-time 3 http://127.0.0.1:7458/ | 7，connection refused | 当前没有本地游戏服务 |
| 桌面应用与窗口检查 | 无Creator、无运行游戏窗口 | 不能从桌面直接试玩 |

command-results.json和各.log为最终执行记录。测试曾发现按钮尺寸浮点计算略小于48逻辑像素，本轮把生产按钮最小设计尺寸向上取整后重跑通过，没有放宽门槛。

interaction-qa.json：在UI夹具里执行真实PhysicsLab的press/move/release/drawHUD与原InputRouter，验证角色附近接管、松手仅一次、死亡不瞄准、点击重开仅排队重置、存活Downed仍接管。该夹具没有Cocos/Box2D后端，不声称运行实射或游戏试玩。

已查看phone-defeat-offline.png和phone-cooldown-offline.png，核对结果卡/重开、共享冷却进度与剩余秒数。桌面和正常手机图同时生成；人物为摆姿示意。当前没有实玩录像、G1或新增真实物理通过证据；原D031销毁/受击误差继续待复验。继续实玩需可访问的当前游戏URL或Creator导出的Web包。
