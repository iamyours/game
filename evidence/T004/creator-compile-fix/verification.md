# Creator 编译失败修复验证

日期：2026-11-08

基线：`2c8290f` 加本次未提交编译修复与 Creator 生成 meta。

## 失败原因

- 新规则脚本使用 `./BattleRules.js`、`./RunSession.js` 等运行时相对导入；Cocos Creator 3.8.8 QuickCompiler 在 assets 资源图中没有将其映射到对应 `.ts`，编辑器报找不到模块。
- `CharacterSkin.ts` 将资源加载回调的 `Asset` 直接视为 `Texture2D`，并把声明返回 `Asset` 的 `addRef()` 结果赋给 Texture2D 字段，真实 Creator 声明下产生 TS2740。

## 修复

- 运行时依赖改为 Cocos 兼容的无扩展名 assets 导入；类型专用导入保持 `.js`。
- 便携 TypeScript 检查改用 `ESNext` + `Bundler`，使用同一锁定依赖的 `node --import tsx` 执行测试。
- Texture2D 回调增加运行时类型校验；`addRef()` 单独调用后继续持有原 Texture2D 引用。

## 实际命令

| 命令 | 结果 |
| --- | --- |
| `npx tsc --project tsconfig.creator.json --noEmit` | 退出 0 |
| `npx tsc --project tsconfig.json --noEmit` | 退出 0 |
| `npm run verify` | 退出 0，94 项通过 |
| 干净 worktree `npm run build:web` | 退出 0；Creator 原始码 36 |
| 当前工作区 `npm run build:web` | 退出 0；Creator 原始码 36 |
| Chrome 150 headless 启动当前工作区产物 | Boot 创建 PhysicsLab；WebGL 2；`b2PhysicsWorld`；无页面错误与失败请求 |

构建产物核对：

- `index.html` SHA-256：`bf8fa1c7bf448f0d50ecbe94005e7355e6d615851e79e9822f9801c83695c123`
- `src/chunks/bundle.js` SHA-256：`23812a688f5acb2e6c9ac75abb244568f6d9b9d8562f096428815bab372aefb6`

首次在全新临时副本中直接启动 CLI 时，资源库尚未完成脚本 UUID 注册，产物中的 Boot 组件被判坏；同一副本完成导入后重跑标准构建，缺失类警告消失且启动烟测通过。关闭修复前卡住的编辑器实例后，当前工作区标准构建与启动烟测也通过。

本证据只覆盖编译与 WebGL 启动，不替代 T004/AC04 三姿态、T008/G1 手感或真机验收。
