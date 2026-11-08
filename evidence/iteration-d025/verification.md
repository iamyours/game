# D025：推送后继续执行

基线：main 2fcf37c15bacf8eaa1e404a11c0e1d43f6fba8b7。用户要求先提交push再执行剩下任务；D024完整源码树已推送到该提交，随后继续本轮。

## 已执行

- 修复帧末延迟销毁期间的残留碰撞：PhysicsAdapter.retire先停用节点再destroy，应用于尸体、平台、掉弓、补给和箭池释放。仅在native step之外调用；原生body数量仍可能到帧末才减少，不把停止碰撞误报成立即释放所有内存。
- ProjectileSystem增加显式dispose，解除每个池槽的实际接触回调并释放池与目标索引；重开仍clear复用池。
- 按锁定3.8.8的Eventify/CallbacksInvoker/Input源码只读枚举本lab拥有的Cocos全局回调和箭池接触回调。未知结构返回null，不用常量当实测；不包括浏览器DOM/OS监听。
- 稳定性脚本加入30次重开的实际监听计数与箭池槽数核对，以及销毁lab后的Cocos监听归零/原生关节归零检查。脚本未实跑，不能据此放行AR08。
- 修正T005/T006任务卡仍以历史烟测DONE开头的冲突，当前整体IN_PROGRESS。
- 增加可复现的官方源码声明API检查，不创建假的Creator temp或meta，不修改引擎版本。实际28个assets脚本在真实声明下类型检查通过。

## 官方声明来源

- https://github.com/cocos/cocos-engine/tree/3.8.8 ，commit 411f98df047c25902f93440d4b22925c2fb65461。
- 该版本native/external-config.json指定cocos/cocos-engine-external v3.8.8-2，commit c16ca649a9ab3c40543e989609c34d7bcecf8b7e。
- 在外部临时checkout按原package-lock安装依赖（npm ci --ignore-scripts --omit=dev），运行官方npm run build:declaration，退出0。补齐官方external/emscripten声明及engine external/extensions源后，最终生成日志无Cannot find module；官方bundler仍有模板字面量/PAL类型合并等警告，原样保留official-declaration-build.log。
- 使用其原样生成的bin/.declarations/cc.d.ts检查项目；声明哈希见engine-source-check.json。skipLibCheck与tsconfig.creator.json一致：此项检查项目的API用法，不宣称验证整个引擎内部声明、Editor导入或运行。未将第三方引擎源码/生成声明提交入游戏仓库。

## 实际结果

119项便携检查通过；28脚本语法通过；官方源码声明API检查退出0，无项目诊断。实际Creator typecheck/build仍因缺3.8.8编辑器和真实导入退出2；arcade/stability脚本缺当前构建退出2。引擎运行/G1、15分钟/30次重开、DOM/OS监听、微信/TapTap真机均未通过。命令、退出码、日志及源码清单在同目录。

## 源码核查依据

https://github.com/cocos/cocos-engine/blob/3.8.8/cocos/physics-2d/box2d/rigid-body.ts 的onDisable/setActive；cocos/core/event/callbacks-invoker.ts的_callbackTable/callbackInfos；cocos/input/input.ts的_eventTarget。官方节点接口说明：https://docs.cocos.com/creator/3.8/manual/en/scripting/basic-node-api.html 。
