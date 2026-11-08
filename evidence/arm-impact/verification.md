# 手臂与箭型冲击修复验证

日期 2026-11-08；初始基线 `2c8290f`，随后合入最新 `db9cb2f64c909b820023eec804875ab5f816b79b` + 关联提交修改。目标 Creator 3.8.8 / Box2D；执行环境 Linux / Node 24.22.1。

- 初始 git pull --ff-only：Already up to date（2c8290f）。提交前检查到新远端 db9cb2f，git fetch、fast-forward 与 stash 恢复后合并文档追加冲突，保留编译修复和 meta；在最终基线重新检查。
- npm run config:generate：退出 0，配置哈希 `3f8df825a95d73528bd772961f4c50fa6b762e21b16f4802e179cb63ff783a62`，runtimeVerified 仍 false。
- npm run verify：退出 0，101 项测试通过；配置/生成漂移及便携 TypeScript 通过，见 verify.log。
- 新增测试：真实骨架端点到贴图局部轴的几何对齐、持弓臂弯曲小于 45°/双手全程可达、分箭型/力度/部位的受击权重、重复受击与恢复、玩家保护和非法配置。
- 首次测试发现纯浮点结果 0.030000000000000027 与 0.03 的严格相等断言失败，改为 1e-9 容差；没有因此更改受击参数。随后全量通过。
- 七个修改/新增的引擎相关文件 transpile 语法错误数 0；不是实际 cc 类型检查，见 engine-syntax.log。
- 新 WebGL 隔离测试脚本 node --check 退出 0；实际 test:web:arm-impact 未运行。
- env:check 退出 0但输出缺少 Creator 和导入配置；typecheck:engine / build:web 均退出 2（BLOCKED），见对应日志与 command-results.json。

本轮没有新构建或物理运行录像。不能凭参数差异/单测宣称箭已经在屏幕上产生更强失衡。AC04、AC07、G1 保持未通过；原站姿和输入验收需按新参数回归。实际引擎步骤见 docs/ARM_IMPACT_FIX.md，前后配置见 tuning-before-after.json。
