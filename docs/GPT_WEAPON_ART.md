# D041 疾风与月蚀 GPT 弓箭

2026-11-14，最新拉取基线 `b49816b0cd47ce88e95a76f44603bdfd6876ed83`。按用户要求补齐其余两把弓的 GPT 图片，并接入已有游戏；不调整装备数值、射速、伤害、冲量或物理骨架。

## 资源与造型

| 装备 | 图片 | 造型 |
| --- | --- | --- |
| 雷霆 | 原 `thunder-bow.png`、`thunder-arrow.png` | 保留银蓝机械弓与琥珀核心 |
| 疾风 | `assets/resources/weapons/gale-weapon.png` | 银色叶刃、翡翠绿弓臂、金色边饰与配套绿羽箭 |
| 月蚀 | `assets/resources/weapons/moon-weapon.png` | 黑银月刃、紫晶核心与配套紫羽箭 |

两张新增图集均由本次内置 GPT 图像生成直接产出，1254×1254 RGBA；原 PNG 原样复制，无重绘、抠图或颜色替换。每张包含互不重叠的完整无弦弓身和水平向右箭矢。切片、真实握点、弦端、40 条弓臂纹理带与原始 PNG SHA-256 在对应 `gale-art.json` / `moon-art.json`。完整生成提示词为 `docs/art-prompts/gale-weapon.txt` 和 `moon-weapon.txt`。

## 接线与所有权

`WeaponArtAssets` 是场景唯一资源所有者，每款独立加载/回退；新增图集中的弓和箭共用一个纹理引用。沿用 `ThunderBowSkin` 的固定握点、真实拉弦手限幅、40片连续弯曲、动态弦及成功释放回弹。切装备复用原40片节点，仅换帧；暂停/后台/死亡隐藏与原生命周期一致。

`BattleLoadout.arrow()` 将当前弓记录为 `appearance`；力度、强化和传承的箭配置复制保留该字段。`ProjectileSystem.fire()` 再复制本箭配置，飞行和插箭均读取该快照。因此切装备不改变在途箭；箭池复用时换帧/重置颜色，敌箭隐藏玩家旧皮肤。未加载时仍使用原程序弓箭，未添加等待发射或自动补射路径。

## 本轮验证

- `npm run verify` 退出0：186项测试、配置/生成漂移和便携类型检查。
- `npm run check:syntax` 退出0：38个引擎侧 TypeScript 脚本语法检查。
- 新API夹具执行生产皮肤/投射物方法，覆盖换弓与搭箭换帧、40片复用、共享纹理引用、独立加载失败、离场后加载、在途箭/插箭快照以及跨敌我箭池复用。夹具不是Cocos或Box2D运行。
- `node --import tsx scripts/render-weapon-preview.mjs` 退出0并目视检查三弓静置/半弓/满弓/回弹12格。
- `PREVIEW_VIEWS=phone-wide,phone-gale,phone-moon PRESENTATION_PREVIEW_DIR=evidence/weapon-art-20261114 node --import tsx scripts/render-battle-presentation.mjs` 退出0并目视检查三款手机离线合成图。该脚本调用生产HUD/几何与原PNG，人物为摆姿，不能当游戏截图。
- `npm run typecheck:engine` / `npm run build:web` 均退出2：当前Linux没有Creator3.8.8可执行文件及真实导入生成的 `temp/tsconfig.cocos.json`。

命令结果见 `evidence/weapon-art-20261114/commands.json` 与 `verification.md`。原始日志/预览PNG依现有策略仅留本机，以上脚本可重建；不追加批量截图进Git。

## Creator复验

在锁定Creator3.8.8导入新增2张PNG和2份JSON，提交编辑器实际生成的4份meta；本轮未伪造UUID。随后执行 `npm run typecheck:engine`、`npm run build:web`，启动当前Web包，依次执行 `test:web:release` 与 `test:web:arcade`。arcade脚本已补三弓切换的真实纹理/40片可见检查，本轮未运行。

继续在手机检查：三弓外观、三种箭的搭箭→飞行→插箭一致；射出疾风箭后立即切月蚀，在途/插箭仍为疾风；轻拉/收回/取消/暂停/后台、池复用及重开销毁；观察40片形变接缝与低端性能。T004/T005/T012继续IN_PROGRESS，G1/发布与历史关节、销毁失败不因本轮放行。
