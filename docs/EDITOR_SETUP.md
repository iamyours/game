# Cocos Creator 工程打开与复现

## 当前机器已完成

- 已安装 **Cocos Creator 3.8.8**：`/Applications/CocosCreator.app`。
- 已合并官方 empty-2d 模板的工程设置，并由真实编辑器导入现有源码、生成声明及资源 meta。
- Boot 场景已经编辑器创建并保存：`/Users/mac/Documents/game/assets/scenes/Boot.scene`。
- 场景 UUID：`b8f2cde8-b589-45b1-a6ee-044e54463f58`。Canvas 下的 BootStatus Label 已绑定 StormArchersBoot；启动场景为 Boot。
- package.json.creator.version 与 configs/engine.lock.json 已锁定 3.8.8；不要自行升级或迁移。

## 打开工程

```sh
open -a /Applications/CocosCreator.app --args --project /Users/mac/Documents/game
```

等待导入完成，在资源面板双击 `assets/scenes/Boot.scene`，点击预览。成功时 Boot 自动程序生成 PhysicsLab，显示米制网格、标定刚体和触摸区域；1 个模拟秒后显示标定结果。左侧按住/拖动、右侧轻点切箭；试射只计数，刷新重新标定。原场景/meta 保留不变。

## 干净副本 / 另一台机器

1. 安装同一实际小版本 **3.8.8**，安装来源和本机安装包哈希见 `evidence/T001/installation/install.json`。其他系统的安装包需自行核实兼容性，本次仅实测 Intel macOS。
2. 保留现有 package.json、package-lock.json、settings、.creator、assets、scene/meta 和 TypeScript 工具配置；**不必新建工程覆盖此目录，也不要重新生成 UUID**。
3. 运行 `npm ci --ignore-scripts`。用编辑器打开当前目录并等待导入，重建 library/temp。profiles、build 和依赖缓存均是本地输出。
4. 若编辑器不在默认路径，设置 `COCOS_CREATOR_CLI` 为实际可执行文件；构建包装器会核对版本。
5. 运行以下检查。没有 temp/declarations 时先等待真实导入，不创建假的 cc.d.ts。

```sh
npm run verify
npm run env:check
npm run typecheck:engine
# 保存并关闭同一工程的编辑器后构建：
npm run build:web
python3 -m http.server 7458 --bind 127.0.0.1 --directory build/web-desktop
```

在支持 WebGL 的浏览器访问 `http://127.0.0.1:7458/`，复核 Boot 与控制台。构建输出不能以 file:// 直接打开。

## 结果与边界

安装历史见 `evidence/T001/tool-baseline.md`，当前单位/输入/适配运行证据见 `evidence/T002/verification.md`。`verify` 不覆盖引擎，`typecheck:engine` 不覆盖运行；AC01/AC02 为 Web 范围通过，G1、正式箭矢、骨架稳定和手机/渠道未验收。下一任务 T003。
