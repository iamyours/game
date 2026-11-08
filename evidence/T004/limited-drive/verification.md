# 受限关节与倒地驱动回归

2026-11-08；基线 main 3760c6d66fed6e58dfaf9643a1bd52aa52fe1b81 + 关联提交修改。

- pull：Already up to date；开始时工作区无改动。
- npm run verify：退出 0，106 项测试、配置/漂移、便携 TypeScript 通过。日志 verify.log。
- 新增规则测试覆盖所有配置关节的合法转向/速度上限、肩部跨 ±150°、零速度/非法参数、倒地与死亡的控制权限。伺服数值积分用例只验证控制律，不冒充 Box2D。
- 首轮105/106通过，零速度分支返回 -0 导致严格断言失败；增加显式零输出后106/106通过，首轮日志保留 verify-initial-failed.log。
- node --check scripts/verify-t004-web.mjs：退出 0；新增倒地躯干/腿部组件最大扭矩零值与双臂可控断言，实际脚本未运行。
- 引擎适配文件语法/运行时 import 检查通过；不是 cc 类型检查。
- env:check 返回 0 但显示未安装 Creator/未导入声明；typecheck:engine / build:web 返回 2，BLOCKED。无新构建或录像。

具体修复和本机复验见 docs/LIMITED_DRIVE_FIX.md。AC04 和 G1 仍未放行，前一次三箭冲量参数未改。
