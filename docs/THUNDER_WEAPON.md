# D030 雷霆机械弓箭接入

2026-11-11；基线main 25c0a0a。按本轮“把这个加到游戏中，注意拉弓的物理效果”，选择前次建议作为主角武器的雷霆机械款。

## 游戏行为

玩家默认使用青蓝发光、银色机械弓臂和琥珀能量核心的雷霆弓，搭箭、飞行和插箭共用匹配箭矢。三箭仍用原有伤害/箭速/体力/冷却，普通原色，冲击暖色、穿甲紫色。敌人保留程序弓，但双方统一从实际搭箭尖位置放箭。

- 真实右前臂握点驱动弓的视觉根节点。弓的40条纹理带以握把为固定区做连续剪切；两层视觉节点的旋转/缩放分解实现连续四边形变形，既保留金属纹理，又避免简单分段平移的边缘台阶。不是整张图缩放。
- 拉弦手由原有限Box2D铰链马达驱动。弓臂弯曲受实际手的后拉距离限制，不能画面先满弓而手未到位；弦端绑定变形后的机械轴，弦中点绑定实际拉弦握点。
- 松手成功才播放固定物理步驱动的衰减回弹。取消/拒射随原drawAmount回松，取消不补射，不播放放箭振动；暂停/竖屏/玩家死亡隐藏皮肤。
- 箭杆长度固定0.96/1.02/1.10m，箭尾跟手。搭箭、轨迹提示与真实发射复用同一个箭尖计算；发射检查从持弓握点至实际箭尖和安全余量的身体/平台阻挡，不能通过美术位移穿身或穿台。
- 仅操纵视觉子节点；身体质量、碰撞盒、铰链限位和步进所有权未改。箭仍由真实Box2D bullet刚体飞行，伤害/去重/冲量沿用。
- 皮肤纹理或切片加载失败回退程序弓箭，既有控制可继续。纹理和UV帧由场景单一所有者持有/释放，箭池复用皮肤节点；回收和场景销毁沿用原路径。

## 文件与美术来源

- `assets/resources/weapons/thunder-bow.png`：完整弓身透明PNG，无预烘焙弦或外部闪电。
- `assets/resources/weapons/thunder-arrow.png`：向右的完整透明箭矢。
- `assets/resources/weapons/thunder-art.json`：原始尺寸、像素框、握点、弦端、40片及SHA-256。
- `ThunderWeaponSkin.ts`：资源与可变形皮肤；`weaponGeometry.ts`：可独立验证的握点/剪切/箭尖几何。

原概念图为本会话生成的《雷霆机械反曲弓.png》（libfile_d27431b3c2d88191bd7b8302b19d42fc）。本轮使用内置图像生成的编辑模式从该图派生两张透明素材，不使用第三方游戏图片。原参考不覆盖；引擎新增资源与脚本meta须真实Creator3.8.8导入生成，未伪造UUID。

美术提示词的核心约束：

> Bow: Preserve the silver segmented metal limb armor, navy inner limbs, cyan channels, amber core above the brown grip and recurved tips. Complete orthographic vertical bow, tips toward the right. Remove the bowstring, arrows, airborne lightning, particles and backdrop. Genuine alpha exterior/interior, clean edges, no labels. Keep connected bow silhouette for strip deformation about the grip.

> Arrow: One complete horizontal arrow pointing right, silver spear head with cyan slot and amber collar details, straight black shaft, cyan/amber swept fletching and forked nock. Orthographic, no perspective. Remove bow, duplicate arrow, lightning, particles and backdrop; genuine transparent alpha, no text.

## 当前验证与局限

129项规则/配置/便携TS测试通过，31个脚本语法检查通过。新增检查覆盖PNG尺寸/哈希、分片边界、固定握点、弯曲与回弹方向、手势投影、固定箭长、剪切矩阵分解与切片非法值。两个PNG的alpha均实测覆盖0–255。

`node --import tsx scripts/render-thunder-preview.mjs` 输出同一生产几何与纹理的静置/半弓/满弓/释放图，已目视检查并修掉分段台阶。此为离线纹理渲染，不是游戏截图或物理运行证据。

本环境缺实际Creator3.8.8导入声明及可执行程序，`typecheck:engine`和`build:web`均退出2；本轮引擎API类型、WebGL加载、真实手臂/射箭、帧率和资源销毁尚未复验。T004/T005/T012保持IN_PROGRESS，G1不放行。

## Creator复验

先用锁定3.8.8导入新PNG/JSON/脚本并保留meta，然后运行：

```sh
npm run verify
npm run typecheck:engine
npm run build:web
python3 -m http.server 7458 --bind 127.0.0.1 --directory build/web-desktop
# 另一个终端，依次运行
npm run test:web:release
npm run test:web:arm-impact
npm run test:web:arcade
npm run test:web:t003
```

release脚本新增“纹理成功加载、40片显示、发射尖与真实手维持固定长度”检查。检查普通/冲击/穿甲搭箭→离弦→命中一致；高低仰角和朝向；轻拉/收回/取消/暂停；30秒静置、20次重置、箭池跨敌我复用、场景销毁。测低端设备40片的实际开销，不以离线矩阵正确替代性能验收。
