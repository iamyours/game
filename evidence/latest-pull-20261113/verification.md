# 最新代码拉取、构建与Chrome测试（2026-11-13）

## 同步与环境
- 已从 main `6795b5d` 安全快进至 `d1bbbb24c7c399809f59aef1e06cdaaa9990d265`，与本次成功 fetch 的 origin/main 一致，共6个新提交。没有覆盖原有未跟踪证据、提交、推送、升级依赖或修改全局设置。
- 标准SSH/HTTPS直连失败后，使用已有本机代理的SSH443通道、原仓库专用密钥及严格已有主机密钥校验，`fetch origin --prune` 退出0，`merge --ff-only origin/main` 退出0。命令证据保存在 `../pull-test-20261113/retry-fetch-ssh443-proxy-result.json` 和 `fast-forward-result.json`。冗余HTTPS代理抓取因SSH已完成而主动终止。
- Creator **3.8.8** / TypeScript **5.9.3** / Node **v24.13.0** / npm **11.6.2**；真实 Chrome / Cocos / `b2PhysicsWorld`。Creator真实导入生成16个合法meta（保留为未提交文件）；版本、清单及构建index哈希见 `environment.json`。
- 拉取前6795b5d测试在 `../pull-test-20261113`，不作为d1bbbb2结果。

## 实际命令
每条命令完整时间、退出码与输出见本目录对应 `*-result.json` / `.log`。

| 检查 | 退出码 | 边界 |
| --- | --- | --- |
| npm run verify | 0 | 168项、配置/生成漂移、便携类型 |
| npm run typecheck:engine | 0 | 本机真实Creator生成声明 |
| npm run check:syntax | 0 | 37个脚本 |
| npm run build:web | 0 | Creator原始码36；生成当前版本Web产物 |
| HEADED=1 npm run test:web:arcade | 1 | 导航ERR_ABORTED，保留首跑，不作为游戏逻辑通过 |
| npm run test:web:arcade（headless重试） | 1 | 真实敌箭扣血/失弓/完整颈关节死亡及刷新已有中间证据；读取退场UIOpacity时null异常，未到后续强化/装备验收 |
| npm run test:web:projectile-presentation | 0 | 真实飞行/地形命中、残留到期、桌面/横屏手机尺寸/4:3布局；绕过手势直接fire，非G1 |
| npm run test:web:t004 | 1 | 普通箭发射点与真实拉弦手固定箭长断言失败 |
| npm run test:web:arm-impact | 1 | leftShin/impact锚点误差0.0343846296m，阈值0.02m |
| ARCADE_STRESS_DURATION_MS=60000 npm run test:web:arcade-stability | 1 | 30次重开，61.06秒墙钟/46样本；销毁捕获11个null destroy异常 |

构建有Creator登录/SSL、asset-db计时和worker SIGTERM诊断，不描述为零告警。未修改游戏规则、测试阈值或脚本以伪造通过。

## 稳定性局限
原生释放后 bodies=1、joints=0、cocosTotal=0，但销毁仍抛异常，稳定性不放行。新版5击败奖励模态暂停了物理，当前旧压力脚本未选择奖励，最终score=5且rewardReady=true；因此本轮不是完整61秒连续击杀，更不是15分钟/BOSS长局验收。脚本需要后续适配奖励后再验证多段/BOSS资源趋势。

## Chrome与入口
- HTTP由PID记录在 `../pull-test-20261113/server.pid` 的本机Python服务提供，监听127.0.0.1:7458；已验证HTTP 200。
- 已通过 `open -a 'Google Chrome' 'http://127.0.0.1:7458/?revision=d1bbbb2'` 打开最新构建。
- 默认连续模式：`http://127.0.0.1:7458/`；练习：`http://127.0.0.1:7458/?practice=1`。
- 已查看 `projectile/landscape-1440.png`，确认真实遗迹背景、双方角色/站台、段落HUD及装备技能按钮。手机尺寸截图不等于真机或双触点验收。

## 结论
最新代码已成功拉取并可构建、Chrome中可进入默认连续对战，但运行回归仍失败，runtimeVerified=false，G1和有关任务保持IN_PROGRESS。未验证真实BOSS两阶段/第15与30战、完整手动技能、15分钟、手机/渠道。下一步先定位退场透明度生命周期、发射点箭长与小腿冲击误差，并适配段间奖励压力驱动。
