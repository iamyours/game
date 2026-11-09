# 连续模式启动修复验证（2026-11-09）

## 修复
- `BattleRules.ballisticAngles` 去掉 `Set` + spread，改为显式返回两个角度。Cocos Creator QuickCompiler 运行时曾将角度转换成对象，导致所有角度可达性判断失败。
- `ArcadeRules.chooseArcadeSpawn` 保留随机出生，并增加 9×9 确定性可达网格回退，避免随机候选耗尽阻塞启动。
- arcade Web 验收脚本不再依赖 Playwright utility world 中的临时 `window` 对象，改为每次从当前场景重新获取 PhysicsLab；稳定性脚本兼容 Cocos `physicsWorld.impl` 结构。

## 验证
- `npm run verify`：退出码 0，120 项通过。
- `npm run check:syntax`：退出码 0，28 个引擎侧 TypeScript 文件通过。
- `node --check scripts/verify-arcade-web.mjs`：退出码 0。
- `node --check scripts/verify-arcade-stability-web.mjs`：退出码 0。
- `npm run build:web`：退出码 0，Cocos 原始日志码 36，Web 产物已生成。
- `ARCADE_URL=http://127.0.0.1:7458/ npm run test:web:arcade`：退出码 0；真实 Creator 3.8.8 / Box2D 连续模式、敌箭命中、掉弓、爆头、断颈、平台坠落/重生及去重检查通过。
- `ARCADE_STRESS_DURATION_MS=5000 ARCADE_URL=http://127.0.0.1:7458/ npm run test:web:arcade-stability`：仍退出码 1。5 秒生命周期采样、30 次重开和销毁后的 `bodies=1 / joints=0 / callbacks=0` 已完成，但销毁后的页面错误仍有 `Cannot read properties of null (reading 'destroy')`，所以不宣称稳定性通过。

## 结论
连续模式启动阻塞已修复，可以打开本机试玩地址；T019 的基础连续对战验收通过。稳定性/长时间验收仍待修复销毁时序错误后再放行，G1 不因本次代码测试自动放行。
