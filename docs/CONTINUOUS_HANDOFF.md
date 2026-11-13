# D025 最新验证补充

当前代码在D024已推送提交2fcf37c上继续迭代。最新119项便携检查、28脚本语法与官方3.8.8声明API检查通过（docs/ENGINE_SOURCE_CHECK.md）；Creator导入、构建、物理和渠道边界不变。

回收现先停用节点再帧末销毁，避免同帧后续物理步的旧碰撞。稳定性脚本已增加本lab和箭池的Cocos回调真实计数、销毁归零检查；不包含DOM/OS监听。下面D024中的“监听完全未测量”已由此覆盖，但当前脚本仍未运行，AR08未放行。

# 连续对战 D024：当前交接与复验

基线main b121eb7。任务表已对齐连续模式；三关解锁T021与装甲掉盔T020延期。当前核心代码已接入，尚无当前版本Creator构建/物理试玩/渠道证据。

## 已实现的代码

- 自然倒地识别与双臂保留控制；镜像敌人骨架/锚点/限位/握点/IK，不负缩放物理节点。
- 持弓臂受创阈值失弓、同一步取消攻击、死亡不重复掉弓；双方均检查双手与弓口，失败发射不补发。
- 重型真实质量32.4kg，普通24kg；小幅倾斜平台由运动学刚体角速度驱动，死亡改动态；原生查询排除出生占用，失败延后重试。
- ShotBudget在连续模式独占体力/冷却；红绿补给的实际传感器、射线候选、仅玩家收取与单次消费。
- 最高分/音效设置独立存储，写失败保留内存并提示；原创背景和三段可停止音效。
- 尸体/掉落上限、重开编号不复用、动态目标注销与原生数量采样；未能测量的监听数记null。

## 当前实际验证

`npm run verify`退出0：118项规则/输入/存档/配置回归及便携类型检查；`npm run check:syntax`退出0：28个引擎侧TS文件语法。两者不包含Creator类型/构建/物理运行。

`npm run typecheck:engine`、`npm run build:web`均退出2：Linux没有Creator3.8.8及真实导入生成的temp/tsconfig.cocos.json。
`npm run test:web:arcade`和`npm run test:web:arcade-stability`因没有当前构建退出2并写BLOCKED，未假装执行原生运行。
完整记录：evidence/iteration-d024/command-results.json、verify.log及其余命令日志。

## 本机Creator步骤

1. 用原工程Creator3.8.8打开并等待真实导入，保留Boot.scene、现有meta与项目设置。新audio文件夹/3个WAV以及ArcadeBattle、ArcadeRules如缺meta，由编辑器生成并提交，不手写UUID。
2. 在工程根执行：

```sh
npm ci --ignore-scripts
npm run verify
npm run check:syntax
npm run typecheck:engine
npm run build:web
python3 -m http.server 7458 --bind 127.0.0.1 --directory build/web-desktop
```

另一个终端：

```sh
npm run test:web:arcade
npm run test:web:t004
npm run test:web:arm-impact
npm run test:web:arcade-stability
```

保留PLAYWRIGHT_MODULE和CHROME_PATH指向本机已安装工具的配置。默认入口是连续模式，旧靶场是`?practice=1`。

arcade脚本要求真实敌箭命中玩家，再以明确的HitCandidate注入隔离失弓/致命爆头及去重/刷新检查；它不能放行玩家真实射中头部。stability脚本先30次重开，再默认15分钟通过显式注入击杀和补满HP压力测试资源生命周期；不是15分钟手动战斗录像，也不验证真实箭尖碰撞或产品手感。缩短ARCADE_STRESS_DURATION_MS只能做烟测，不能据此标15分钟通过。监听覆盖仍为NOT_MEASURED。

## 必须实玩、不能用规则测试替代

按qa_cases.csv执行AR01–AR08：敌箭实际扣血、玩家实际头部暴击并保留颈关节、活体掉弓后停射、自然倒地实射、倾斜台站立/可达性、补给实际收取、音效开关和存储失败。录同一构建的飞行/四部位受力/坠落过程，完成T008/G1。若手臂一直未就位，检查镜像后的原生关节角/锚点和当步误差，不关闭就位检查掩盖问题。

## 渠道阻塞

Cocos Game隐藏/恢复事件、sys.getSafeAreaRect、sys.localStorage和AudioSource是当前跨宿主接入点，不能据此声称渠道已经验证。
T015需要本机Creator微信小游戏构建、实际AppID、开发者工具和Android/iOS真机；设置横屏并测安全区/多点/后台/音频/最高分。T016默认Android APK，需要原生构建工具链、签名和Android设备，测同一连续流程。此环境均不可用，不生成假的渠道包或构建设置。

先完成当前源码的Creator导入/构建和运行复验，再收敛物理参数与发布回归。所有未验收项留IN_PROGRESS或BLOCKED。
