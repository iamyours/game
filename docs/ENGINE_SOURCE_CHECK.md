# 官方3.8.8源码API类型检查

此检查独立于Creator工程导入，适用于当前没有编辑器但希望检查项目API用法的环境。它不生成/伪造temp/tsconfig.cocos.json或.meta，不替代typecheck:engine、build:web、WebGL、G1或渠道验收，也不升级工程。

来源由configs/engine-source.lock.json固定：cocos/cocos-engine的3.8.8和其external-config.json指定的external v3.8.8-2。检查脚本验证两个实际Git提交、package版本和当前工程引擎锁，记录原样生成声明的SHA-256。

在工程之外准备官方源码（以下`/tmp`仅为示例，实际可选本机路径）：

```sh
git clone --depth 1 --branch 3.8.8 https://github.com/cocos/cocos-engine.git /tmp/cocos-engine-3.8.8
git clone --depth 1 --branch v3.8.8-2 https://github.com/cocos/cocos-engine-external.git /tmp/cocos-engine-3.8.8/native/external
cd /tmp/cocos-engine-3.8.8
npm ci --ignore-scripts --omit=dev
npm run build:declaration
```

回到游戏根目录：

```sh
COCOS_ENGINE_SOURCE=/tmp/cocos-engine-3.8.8 npm run typecheck:engine-source
```

可追加`-- --output evidence/本轮/engine-source-check.json`保存结果。未提供外部路径或缺官方声明时退出2并记录BLOCKED，不把语法检查伪装成API检查。

脚本只在忽略的.cache目录生成单独配置。strict/noEmit/experimentalDecorators开启；skipLibCheck与现有Creator项目配置一致，跳过库声明内部验证。官方声明bundler自身的警告需保存；项目检查无诊断不代表引擎内部声明完全无警告。

D025已实际执行：官方声明生成退出0，项目API类型检查退出0。当前Creator工程导入、编辑器构建和运行仍BLOCKED，见evidence/iteration-d025。
