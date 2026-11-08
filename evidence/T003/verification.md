# T003 Web 运行证据

- 日期：2026-11-08
- 场景：Boot → PhysicsLab，headless Chrome; WebGL; Cocos 3.8.8; Box2D; no phone claim
- 运行：PASS
- 结论：真实 Cocos Creator 3.8.8 Box2D 中生成左右两个 11 刚体、10 铰链骨架；静置 30 秒采样期间刚体/关节数量保持 27/20、关节误差小于 0.02 m、坐标有限且未越界；随后安全队列重置 20 次，数量仍保持不变。
- 运行时：{"scene":"Boot","version":"3.8.8","box2d":true,"physicsWorld":"b2PhysicsWorld"}
- 稳定性：{"durationSec":30,"sampleCount":263,"initialResetCount":0,"bodyCountPerRagdoll":[11],"jointCountPerRagdoll":[10],"maxJointErrorM":0.0014408140974716598,"physicsBodies":[27],"physicsJoints":[20],"calibrationPassed":true}
- 重置：{"requested":20,"completed":20,"physicsBodies":27,"physicsJoints":20,"ragdollBodyCounts":[11,11],"ragdollJointCounts":[10,10]}
- 页面错误：[]
- 控制台错误：[]

边界：这是桌面 Chrome WebGL 运行证据，不是手机真机或渠道验收；配置和 manifest 仍保留 runtimeVerified: false，T008 手感门未通过。
