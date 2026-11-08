# 风暴弓手

V2.0 设计，横屏实时物理对射。**Cocos Creator 3.8.8 已安装，工程已导入，Boot 可在 WebGL 运行**；当前可试玩桌面 PhysicsLab 射箭练习版，尚不是正式对局。

## 打开与运行

```sh
cd /Users/mac/Documents/game
open -a /Applications/CocosCreator.app --args --project /Users/mac/Documents/game
```

等待编辑器导入完成，打开 `assets/scenes/Boot.scene` 并预览。已有 Web 构建时，也可以从项目目录直接启动：

```sh
python3 -m http.server 7458 --bind 127.0.0.1 --directory build/web-desktop
```

用浏览器打开 `http://127.0.0.1:7458/`，保持横屏。左下按住并拖动拉弓、瞄准，拖得越远力度越大，收回可减力；一直按住不会射箭，松手只放一箭。轻拉/满弓改变箭速、伤害和冲量，百分比及预览轨迹同步变化；右侧轻点切换三种箭；右上暂停或重置。命中后看靶手 HP、命中部位和插箭。靶手不会还击。

## 检查与构建

需要 Node.js 22–24（本机 24.13.0）、npm 10–11（本机 11.6.2）。依赖已锁定，npm 使用项目内 `.cache/npm`。

```sh
npm ci --ignore-scripts
npm run verify
npm run env:check
npm run typecheck:engine
# 保存并关闭同一工程的编辑器后运行：
npm run build:web
python3 -m http.server 7458 --bind 127.0.0.1 --directory build/web-desktop
# 浏览器访问 http://127.0.0.1:7458/
```

| 命令 | 范围 |
| --- | --- |
| npm run check:config | 种子结构、范围、唯一 ID、引用、解锁链、骨架质量与预算 |
| npm run config:generate | 单一来源生成未验证种子资源和启动清单 |
| npm run config:check-generated | 检查生成文件与种子的完整内容漂移 |
| npm run test:unit | 74 项无引擎的配置、启动编排、固定步、触点状态、公式及构建预检回归 |
| npm run typecheck | 工具、测试、纯逻辑；排除 cc 组件 |
| npm run typecheck:engine | 真实 Creator 生成声明，项目源码 strict；已通过 |
| npm run env:check | 显示编辑器路径、锁定版本与工程缺失项 |
| npm run test:web:t002 | 浏览器物理/输入/视野验收，需先启动构建静态服务器；完整后台验证用 HEADED=1 |
| npm run build:web | 实际 Creator CLI Web Desktop 构建；已通过，原始码 36 归一化为 0 |

修改种子后运行 config:generate 和 verify。完整玩法种子仍未验收，不能因 T002 基础标定成功就修改 runtimeVerified。

## 进度与证据

- T001–T003 已完成；当前任务 T004。T004–T006 是靶场灰盒子集，不是正式验收。
- 当前操作改为左侧按住拉弓，往左后拉反向瞄准（也可向右拖），松手单发；拉满保持不自动射箭，取消不发射。最新证据见 `evidence/T004/release-to-fire/verification.md`。先启动上面的本地服务，再运行 `npm run test:web:t004-t006` 重跑桌面鼠标烟测。
- AC04–AC07、真机、渠道和 T008/G1 尚未放行，`runtimeVerified` 保持 false。
- 原始 Word/ZIP 和编辑器生成的 Boot.scene/meta 均保留；没有 Git 提交、推送或发布。

### 重跑 T002 浏览器验收

静态服务器启动后执行（使用本机 Chrome + Playwright Core，不新增游戏运行依赖）：

```sh
HEADED=1 npm run test:web:t002
```

工具会以独立临时 Chrome profile 真实切换标签页，退出后清理该 profile，不碰现有浏览器数据。`PLAYWRIGHT_MODULE`、`CHROME_PATH` 可覆盖本机路径。未设 HEADED 时为 headless，标签页始终可见时回退到合成 DOM 生命周期并在报告明确注明，不能作为真实后台证据。

### 拉弓与力度回归
`npm run test:web:release` 验证长按不自动发射、松手单发、双手配合、三档力度的实际 Box2D 速度及取消。`npm run test:web:t004` 另含三姿态正式检查；倒地放箭尚未通过，T004 仍进行中。最新记录见 `evidence/T004/release-to-fire/verification.md`。
