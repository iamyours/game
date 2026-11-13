# D037 非血腥反馈验证

2026-11-13。基线62d0e46da09406652ec9c3a183a9c09311211fd8，本轮D037未提交源；配置v2不变，锁定Creator3.8.8。源码哈希见source-snapshot.json。

| 命令/检查 | 退出码 | 范围 |
| --- | --- | --- |
| npm run verify | 0 | 148项便携测试、配置/生成漂移、便携类型 |
| npm run check:syntax | 0 | 35引擎侧TS语法 |
| npm run preview:presentation | 0 | 9组生产HUD/处理器夹具与离线摆姿合成 |
| PCM检查 | 0 | 5段单声道16-bit/22050Hz、峰值无削波；原shot/drop字节一致 |
| npm run typecheck:engine | 2 | 缺真实Creator导入配置 |
| npm run build:web | 2 | 缺Creator/导入配置 |
| npm run test:web:arcade | 2 | 缺当前Web包；使用本轮独立evidence目录 |

命令日志和时间见command-results.json，PCM峰值/尺寸/哈希见audio-qa.json。最初新增180ms边界断言采用浮点严格相等而失败，已改为数值容差；最终完整148项退出0，生产提示时长未因此调整。

新增检查覆盖：180ms提示与末600ms渐隐；生产ArcadeBattle的致命头击保持neck约束/平台动态/死亡计分一次/已失弓不重掉；伤标到期、保留重型原色、淡出不额外施力。控制器检查使用明确标注的接口替身，不运行引擎或替代Box2D稳定性。

人工检查普通/重击/头部暴击三张离线图，橙金短标记局限于接触点，人物头部保持完整；所有9组生产UI/输入处理器夹具通过。合成图使用生产Graphics路径、裁切和GPT素材，但人物为摆姿，**不是实机截图或真实命中录像**。没有本轮实际听音/混音验收记录。

真实Web脚本已改为neckPresent=true、原伤色不改变、身体/平台回收前出现UIOpacity渐隐且关节短提示已到期；当前无运行包，未执行这些引擎断言。新增hit-heavy/hit-critical音频meta待实际Creator导入，既有hit.wav的合法meta保留。

未完成：头部保持连接后的真实受力/关节稳定、四部位×三箭/力度、暂停/重开、真实音效区分、手机显示与15分钟资源回收。旧11次null destroy、小腿冲击0.03438m误差、完整力度回归仍未解决；不放行G1。DS05与AR02真实验收BLOCKED，相关开发任务保持IN_PROGRESS。完整当前规则docs/NON_GORY_FEEL.md。
