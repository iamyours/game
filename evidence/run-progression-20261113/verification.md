# D038 验证记录

基线main 59fac0d；Linux远程开发副本。代码指纹见source-and-checks.json。锁定Creator 3.8.8 / TypeScript 5.9.3，未升级工程。

| 命令 | 退出码 | 范围 |
| --- | --- | --- |
| npm ci --ignore-scripts --prefer-offline | 0 | 原package-lock依赖安装 |
| npm run verify | 0 | 168项测试、配置/生成漂移及便携strict类型；verify-final.log |
| npm run check:syntax | 0 | 37个引擎侧脚本语法；syntax.log |
| node --check scripts/verify-arcade-web.mjs | 0 | 回归脚本语法，不是浏览器执行 |
| PREVIEW_VIEWS=phone-boss,phone-moon-skill,phone-reward PRESENTATION_PREVIEW_DIR=evidence/run-progression-20261113 npm run preview:presentation | 0 | 3组最新生产HUD/输入夹具，已查看PNG；摆姿人物，不是引擎物理 |
| npm run typecheck:engine | 2 | BLOCKED：缺真实编辑器导入的temp/tsconfig.cocos.json |
| npm run build:web | 2 | BLOCKED：另缺Creator可执行程序 |
| ARCADE_EVIDENCE_DIR=evidence/run-progression-20261113/runtime npm run test:web:arcade | 2 | BLOCKED：缺当前Web构建；没有执行新增运行断言 |

规则回归覆盖：百段上限、周期BOSS/半血攻速、真正HitResolver头部规则、同一步死亡、战利品去重、共享冷却、技能/符石实际成功箭扣次、升级和库存、补给去重、特效预算与48逻辑像素布局。生产UI夹具覆盖瞄准手、切弓、技能不自动射、用药/取消、拖出不选、暂停/死亡/强化隔离；详见interaction-qa.json。

初次运行发现新增状态尚未放入旧测试夹具；另修正跨VM对象比较、测试中旧快照的TypeScript收窄与触控尺寸浮点取整。最终168项和便携类型均通过。initial-fixture-failure.log为首次失败记录，不能误认为最终结果。

没有Creator导入、当前引擎构建、人工实射BOSS或真机证据。两份新增domain脚本meta待实际编辑器生成；T022/原物理任务及G1不放行。D031的销毁异常和小腿强冲击关节误差未在本环境重现定位，仍未解决。后续实跑与手动验证见docs/RUN_VARIETY.md。
