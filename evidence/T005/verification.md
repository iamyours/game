# T005 Web 运行证据

复用 `scripts/verify-t004-t006-web.mjs` 的桌面 WebGL/Box2D 烟测：固定步发射普通箭，箭以动态 bullet 刚体飞行；接触候选与扫掠补充在 after-step 去重结算；一次命中后箭回收。证据详情见 `web-verification.json`。

边界：已验证约 13–17 m 灰盒弹道和一次命中，不等同低帧率、移动靶完整漏碰验收；未做最终插箭视觉和 G1。
