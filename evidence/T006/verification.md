# T006 Web 运行证据

复用 `scripts/verify-t004-t006-web.mjs` 的桌面 WebGL/Box2D 烟测：实际命中 EnemyRagdoll 的身体部位，`HitResolver` 按 head/torso/limb 结算伤害并在命中点施加局部冲量；命中后控制器进入受击姿态。证据详情见 `web-verification.json`。

边界：规则函数已有单元测试，桌面灰盒已验证一次部位命中；四个定点命中与产品手感、粒子关闭可读性、G1 尚未正式放行。
