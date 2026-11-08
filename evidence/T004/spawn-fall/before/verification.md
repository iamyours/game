# T003 Web 运行证据

- 日期：2026-11-08
- 场景：Boot → PhysicsLab，headless Chrome; WebGL; Cocos 3.8.8; Box2D; no phone claim
- 运行：FAIL
- 结论：AssertionError [ERR_ASSERTION]: 30 秒采样不足：156
- 运行时：{"scene":"Boot","version":"3.8.8","box2d":true,"physicsWorld":"b2PhysicsWorld"}
- 稳定性：{}
- 重置：{}
- 页面错误：[]
- 控制台错误：[]

边界：这是桌面 Chrome WebGL 运行证据，不是手机真机或渠道验收；配置和 manifest 仍保留 runtimeVerified: false，T008 手感门未通过。
