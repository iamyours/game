# PhysicsLab 拉弓与开局修复

- 场景：Boot → PhysicsLab；Creator 3.8.8 / `b2PhysicsWorld`，Chrome 150.0.7871.125 桌面 WebGL。构建入口 `http://127.0.0.1:7458/`。
- 配置 V2：`2a076436f69c303645e9af3165ca06b7e55c4c610df76cd6ec1342b95f066b27`，`runtimeVerified: false`。无 Git，源文件、配置、构建文件指纹在 `build-and-source-sha256.txt`。
- 前拖和后拉各完成一轮普通箭实际命中，均离弦后第 43 固定步结算一次，靶手 60→48 HP。连射间观察到再次拉弦，松开后进度归零且无补发；切箭、箭池和暂停重置仍通过。见 `web-verification.json`、`bow-draw.png`。
- 开局、重载、静置与重置回归见 `../spawn-fall/verification.md`。没有关闭重力或固定角色；不是正式倒地瞄准、坠台、真机或 T008 手感验收。

| 命令 | 退出码与范围 |
| --- | --- |
| `npm run config:generate` | 0；更新种子生成资源，meta 不变 |
| `npm run verify` | 0；配置、生成漂移、65 项测试、便携类型检查 |
| `npm run typecheck:engine` | 0；实际 3.8.8 声明 |
| `npm run build:web` | 0；Creator 原始码 36，保留编辑器网络及构建诊断 |
| `npm run test:web:t003` | 0；原生夹具、站台、30 秒静置、额外 3600 步、20 次重置 |
| `npm run test:web:t004-t006` | 0；前拖、后拉、重拉、命中、切箭、松手停射 |
| `npm run test:web:t002` | 0；双触点、取消、暂停和画面适配；后台为合成 DOM 回退，不是本构建真实标签页通过证据 |
| `HEADED=1 npm run test:web:t002`（中间构建） | 1；宿主提前进入 hidden，标定停在第 19 步；日志保留在 `t002-headed-hidden.log` |

日期说明：部分运行脚本以 America/New_York 输出 2026-11-07，同一时段构建主机本地日志为 2026-11-08。
