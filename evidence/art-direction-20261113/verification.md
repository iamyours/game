# D035 视觉方向与交互验证

日期：2026-11-13。基线 main 33db0a2bab46939d3daf82e1c92fe5b77026fcb7，检查对象为 D035 未提交工作区；源码哈希见 source-snapshot.json。锁定引擎 Cocos Creator 3.8.8，配置 v2 不变。

## 结果

| 检查 | 退出码 | 覆盖范围 |
| --- | --- | --- |
| npm run verify | 0 | 配置/生成漂移、141 项便携测试、便携类型 |
| npm run check:syntax | 0 | 34 个引擎侧 TS 脚本语法，不是引擎 API 类型检查 |
| npm run preview:presentation | 0 | 6 组生产 HUD/输入处理器夹具与离线图片 |
| 外部 asset_report.py，三个方图1254×1254，require-alpha | 0 | 角色/机械弓 PNG 尺寸、真实透明像素 |
| 外部 asset_report.py，箭2172×724，require-alpha | 0 | 机械箭 PNG 尺寸、真实透明像素 |
| 外部 build_preview_sheet.py，四张原PNG | 0 | 带标签的素材接触表 |
| npm run typecheck:engine | 2 | BLOCKED：缺 Creator 实际导入生成的 temp/tsconfig.cocos.json |
| npm run build:web | 2 | BLOCKED：缺 Creator 可执行文件与实际导入配置 |

命令日志和时间见 command-results.json；素材报告 square-asset-qa.json、arrow-asset-qa.json。外部两个脚本从用户指定仓库固定提交 c6ca6c41c839b68319ffc08430b99ab768debc32 读取并审查，仅用 Pillow/本地文件生成离线证据；未安装技能或修改环境设置。

## 实际检查

4 个新增便携用例覆盖重叠事件/30ms重复回调不延长、1000次事件容量有界、位置快照与三档差异，以及不同缩放下暂停按钮≥48逻辑像素。生产 UI 夹具覆盖角色附近开始瞄准、有效释放单发、死亡拦截、重开只入队、存活Downed允许操作、暂停背景隔离、继续不补射、结果按钮拖出至隐藏按钮不重开。逐组结果见 interaction-qa.json。

人工检查 desktop、phone-wide、phone-pause、phone-impact、phone-defeat 离线图和素材接触表：平台材质一致、文字/主按钮可读，局部短命中标记与蓄势形状不使用整屏遮罩。phone-cooldown 与其他五种状态一同由脚本生成。背景、平台、箭和UI调用生产绘制；人物为摆姿插图，源 PNG 未编辑。**这些图片和夹具不运行 Cocos、Box2D 或真实游戏。**

新平台实心形状全部在原平台 width×0.6m 内；无碰撞、质量、箭速、伤害、冲量、关节和固定步所有权变更。命中标记无原生资源；暂停冻结、重开/销毁清空。新 BattleArt.ts meta 待真实 Creator 导入。

## 未通过或未执行

DS01/DS02/DS03 真实场景验收 BLOCKED；没有本轮实玩、真实音效对比、WebGL、手机、全屏 API、帧时或 G1 通过记录。D031 的 11 次 null destroy、小腿冲击箭关节误差 0.03438m，以及完整力度回归继续待实际构建定位；本次没有宣称修复。

Creator 可用后先导入新增脚本并构建，按 docs/ART_DIRECTION.md 的三个命中事件、敌人蓄势、暂停/死亡、手机安全区步骤复验，并复跑原 test:web:release、arm-impact、arcade 与稳定性脚本。状态仍为 IN_PROGRESS/G1 BLOCKED。
