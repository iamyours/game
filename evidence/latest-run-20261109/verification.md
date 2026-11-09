# 最新代码拉取、编译与运行（2026-11-09）

- 当前分支：`main`
- 远端：`origin/main`
- 拉取检查：`git fetch origin --prune` 后 HEAD 与 `origin/main` 同步，无新远端提交（`0 0`）。
- 本地未提交修改全部保留，未执行覆盖性清理。

## 命令
- `npm run verify`：退出码 0，120 项测试通过。
- `npm run build:web`：退出码 0；Cocos Creator 3.8.8 原始日志码 36，生成 `build/web-desktop/index.html`。
- `ARCADE_URL=http://127.0.0.1:7458/ npm run test:web:arcade`：退出码 0。
- 浏览器启动检查：Creator `3.8.8`，无 pageerror，PhysicsLab/连续模式已创建，Box2D calibration passed，敌人 `Enemy_1` 已生成并进入 telegraph。

## 地址
- 连续模式：`http://127.0.0.1:7458/`
- PhysicsLab：`http://127.0.0.1:7458/?practice=1`
