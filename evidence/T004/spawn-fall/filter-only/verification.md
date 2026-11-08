# T003 Web 运行证据

- 日期：2026-11-08
- 场景：Boot → PhysicsLab，headless Chrome; WebGL; Cocos 3.8.8; Box2D; no phone claim
- 运行：FAIL
- 结论：AssertionError [ERR_ASSERTION]: 未受击应持续站在各自平台上: {"minChestYM":3.202361822128296,"maxDriftXM":1.6749649047851562}
- 运行时：{"scene":"Boot","version":"3.8.8","box2d":true,"physicsWorld":"b2PhysicsWorld"}
- 平台初始夹具：{"fixtures":[{"name":"Platform_player_main","masks":[7]},{"name":"Platform_enemy_low","masks":[7]},{"name":"Platform_enemy_high","masks":[7]}],"requiredMask":6}
- 站台：{"minChestYM":3.202361822128296,"maxDriftXM":1.6749649047851562}
- 稳定性：{}
- 重置：{}
- 页面错误：[]
- 控制台错误：[]

边界：这是桌面 Chrome WebGL 运行证据，不是手机真机或渠道验收；配置和 manifest 仍保留 runtimeVerified: false，T008 手感门未通过。
