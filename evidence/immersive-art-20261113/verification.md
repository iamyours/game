# D036 GPT图片美术接入验证

2026-11-13，基线本地1ac497bb0546a59de056bca42cfb93bdb98cd261，检查D036未提交源；配置v2与Cocos Creator3.8.8锁不变。源码哈希见source-snapshot.json。

| 命令/检查 | 退出码 | 覆盖范围 |
| --- | --- | --- |
| npm run verify | 0 | 145项便携测试、种子/漂移、便携类型 |
| npm run check:syntax | 0 | 35个引擎侧TS语法；不覆盖实际引擎类型 |
| npm run preview:presentation | 0 | 7组离线生产HUD/处理器夹具与新图片摆姿合成 |
| PNG检查 | 0 | 四张原图尺寸/哈希；3张透明素材alpha；背景完全不透明；22个人物裁切不越界 |
| npm run typecheck:engine | 2 | 缺Creator实际导入配置 |
| npm run build:web | 2 | 缺Creator可执行文件和实际导入配置 |
| npm run test:web:projectile-presentation | 2 | 缺当前Web包；本轮指定新evidence目录，不覆盖旧证据 |

本轮使用内置GPT生图，四张原始PNG按字节复制入仓库；来源、实际尺寸与SHA-256见assets/resources/scenery/ruins-art-v2.json；逐张完整提示词见docs/IMMERSIVE_ART_PROMPTS.json。alpha连通区域检查只用于生成SpriteFrame裁切元数据，未对图像做程序编辑。

新增便携检查：资源哈希/尺寸/帧范围；共享一次环境加载；平台视觉各片在原碰撞框内且端块保宽；背景保持原图比例并cover；加载中离场/平台回收不创建迟到精灵；失败保持程序绘制；纹理引用归还。资源所有者测试使用明确标注的接口替身，不是Cocos或Box2D运行。

人工检查844×390手机、桌面、1024×768平板和暂停的离线合成：统一石材青铜与人物服装质感，箭矢/关节仍可见，文字衬底可读。其他冷却/死亡/命中状态一同生成，共7组，生产输入处理器夹具通过。人物为摆姿插图，背景/人物/平台使用新PNG及实际裁切/显示尺寸；**合成图不是引擎截图，不代表真实人物物理或音效表现。**

新增真实Web脚本断言：背景、人物和平台实际精灵已加载；人物texture宽1448；背景等比覆盖；敌人纹理子节点朝左；平台三片位于真实BoxCollider范围。当前该脚本因缺构建BLOCKED，不能宣称这些引擎断言已通过。

实际Creator导入/meta/API类型/构建、手机全屏、斜台/掉台贴合、真实部位受击/断头、15分钟性能和引擎资源释放均待验。原D031销毁异常与小腿冲击关节失败未解决。任务T012/T014保持IN_PROGRESS，DS04与G1保持BLOCKED。未执行新推送。
