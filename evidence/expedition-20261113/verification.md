# D039 / D040 验证记录

日期：2026-11-13。基线main d1bbbb24c7c399809f59aef1e06cdaaa9990d265。目标Creator3.8.8 / Box2D 2D；本轮Linux没有Creator可执行文件、temp导入配置或当前Web运行包。

提交整理：离线PNG、运行日志及中间QA JSON保留本地，不纳入本轮源码提交；下表列出的日志与图片为本地验证记录，仓库保留本摘要、复验脚本与测试。

| 命令/检查 | 退出码 | 证据与范围 |
| --- | --- | --- |
| npm run verify | 0 | verify.log；179项规则/存档/调用夹具测试，配置/生成漂移和便携TypeScript通过 |
| npm run check:syntax | 0 | syntax.log；38个引擎侧脚本语法；不代表引擎API类型通过 |
| npm run preview:presentation | 0 | 15组生产HUD/输入夹具及离线摆姿图；presentation-layout.json、interaction-qa.json及对应PNG |
| python scripts/generate-music.py | 0 | 四首原创合成OGG与music-manifest.json；可复现音符/和弦/鼓/循环尾音 |
| python scripts/check-expedition-assets.py | 0 | asset-qa.json；两张原背景PNG尺寸/哈希；四OGG实际ffmpeg解码、时长/电平/循环边界/体积 |
| git diff --check | 0 | 无空白错误 |
| npm run typecheck:engine | 2 | engine-typecheck.log；缺真实Creator导入生成配置 |
| npm run build:web | 2 | web-build.log；缺Creator和真实导入配置 |
| npm run test:web:arcade | 2 | arcade-runtime.log、runtime/verification.json；当前构建缺失 |

179项中的增量覆盖：命中一次共享冲量/玩家2.4N·s、胸部有界力臂、马达保持/恢复、插箭扎入/余震完全停止、头颈读取实际侧仰/倒地坐标、首触音乐门控/场景和BOSS渐变/暂停后台/关闭音乐/死亡、场景异步竞争/缓存/引用归还、三挑战/无伤中断/死亡不领奖、修炼检查点重复和失败重试/最高10%/坏档和未来版本，以及手机四个暂停按钮尺寸。调用夹具使用API doubles，不运行物理或真实音频。

离线图已目视检查：三场景中心飞行走廊保持开放，角色头颈有连续连接，手机音乐/音效独立按钮和三行修炼结算位于面板内。图片摆姿是示意，不是游戏截图；预览没有运行Cocos/Box2D。

仍BLOCKED：真实命中后身体响应/关节误差、图层遮挡和余震观感、四曲实际播放/循环/混音、45战场景及BOSS/挑战全流程、15分钟/30次重开、目标设备/宿主。原D031的销毁异常和小腿强冲击失败不因本轮离线通过而消除。T023维持IN_PROGRESS，发布/G1未放行。

资源导入：新增Expedition.ts、四OGG、music-manifest.json、两背景PNG和expedition-art.json尚无本轮Creator生成的meta，必须真实导入生成，未伪造UUID。新增原背景及完整提示词由assets/resources/scenery/expedition-art.json记录；音频无第三方录音。
