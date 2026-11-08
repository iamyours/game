# 分段弓手素材 v1

2026-11-08，原创建图：透明 RGBA PNG，1254×1254。参考原作视频的简洁圆头与分段轮廓，未提取或复用原作贴图。玩家青蓝、敌人珊瑚红。提示词见 docs/CHARACTER_ASSETS.md。

每套图包含 4×4 排列的 16 个部件：head、chest、pelvis、leftUpperArm、leftForearm、rightUpperArm、rightForearm、leftThigh、leftShin、rightThigh、rightShin、bow、normal、impact、piercing、helmet。

`*-frames.json` 保存每张 PNG 的真实尺寸、SHA-256 与每个部件的裁剪矩形（左上原点像素坐标）。坐标通过读取 alpha≥128 的可见范围取得，不修改原始图片。部件中心锚点为 (0.5,0.5)，显示尺寸来自 RigDefinition；关节挂点仍使用 RigDefinition 的米制局部锚点，不从图片推导。

CharacterSkin 加载对应 Texture2D 子资源并创建 SpriteFrame，不需要手工切成 16 张 PNG。只把 11 个身体片显示到原刚体的视觉子节点。弓、箭和头盔切片为后续装备表现准备；当前物理弓弦及箭形状仍走原程序表现，不添加没有玩法状态的头盔。

首次打开 Creator 3.8.8，等待导入并保存自动生成的 .meta；本次未伪造 UUID 或 meta。图片若被配置为其他资源类型，设为 texture 或 sprite-frame，保证 `characters/hero-atlas/texture` 和 `characters/enemy-atlas/texture` 可加载。加载失败会保留灰盒并输出告警。

当前仅做透明度、边界和引用的静态检查；需要引擎构建确认实际 UV、比例、轮廓与插箭遮挡。资源本身不会升级关节、碰撞或手感验收状态。
