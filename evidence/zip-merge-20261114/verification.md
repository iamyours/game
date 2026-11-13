# 下载ZIP合并与本机重新运行（归档日期2026-11-14）

## 来源与保护
- 来源：`/Users/mac/Downloads/storm-archer-project-20261114.zip`，ZIP注释revision `3db153500d3ff27ebbe05ef78bd6178c6cfbb7d3`。本地Git HEAD仍为`d1bbbb24c7c399809f59aef1e06cdaaa9990d265`，本轮为工作区合并，不伪装成Git快进或提交。
- 完整受版本管理文件及未跟踪文件备份：`/Users/mac/Documents/game-merge-backup-20261114-003830/local-before.zip`；原工作区补丁`local.patch`；归档原文解包在备份的`incoming`。
- 更新33个不同文件、新增16个文件；8份本地状态/任务记录合并保留。STATUS冲突采用D040新版结构，保留完整2026-11-13本机复验章节；其余任务三方无冲突合并。首次预检发现STATUS冲突即停止，未写工程文件；解决后再应用。无删除，无提交、推送或全局设置变更。
- 原有79份meta逐字节保留；Creator3.8.8真实生成9份新meta，列表见`creator-generated-meta.json`。源代码与压缩包对应文件一致，合并差异仅历史本机记录及本轮证据。

## 检查与构建
- `npm run verify`退出0：179项测试、配置/生成漂移/便携类型；`npm run check:syntax`退出0：38个脚本。
- 真实Creator声明`npm run typecheck:engine`导入前后均退出0；`npm run env:check`退出0。
- Creator **3.8.8** `npm run build:web`退出0，原码36；重新构建Web Desktop当前包。构建仍有登录TLS、构建参数回退及worker SIGTERM诊断，不称零告警。日志`build.log`，产物哈希`fingerprints.json`。
- `python3 scripts/check-expedition-assets.py`退出1，缺numpy；本轮不宣称图音解码/听感QA。另用标准库验证新增两背景、四音乐的6项清单SHA-256一致，见`resource-hashes.json`。
- `git diff --check`退出0。命令清单及退出码见`command-results.json`。

## 实际运行烟测
- 重启原7458静态服务，新进程信息见`server.json`；根目录为本轮`build/web-desktop`。启动立即探测一次HTTP 000（服务尚未就绪），随后HTTP **200**，页面已实际加载。
- Codex内置浏览器1280×720访问`http://127.0.0.1:7458/`默认连续模式，非离线合成图。日志确认Cocos Creator v3.8.8、register box2d、Boot加载成功；60固定步自动标定打印passed=true，不等于G1。
- 真实画面显示风暴遗迹、人物/平台图片、挑战、修炼Lv.1、BOSS还有15战、三弓/符石/药瓶HUD；执行一次鼠标拖动松手，未把该动作当作命中/伤害数值验收。
- 等待实际敌箭扣血100→28→0，观察完整身体倒地及死亡结算；点击“再来一局”恢复生命100、刷新敌人与平台。随后点击暂停，显示独立“音效 开/音乐 开”及重开/继续菜单。实际听感、音乐循环与切场未验。
- 捕获日志未见warn/error；见`browser-logs.json`。截图`game-over.png`与`paused.png`。当前页保持暂停并显示，用户点“继续战斗”即可玩。
- 本次只做启动/基础交互烟测；没有执行完整12组受击、45战/BOSS轮换、15分钟、30次重开或真机。历史箭长、关节及null destroy失败未复验消除，runtimeVerified=false，G1/发布不放行；T023仍IN_PROGRESS。

注：本机命令时间为CST，浏览器日志以UTC输出；本目录日期沿用用户提供的20261114归档名，不将旧证据误作本轮运行。
