# 拉取前本地基线测试（2026-11-13）

本目录前半轮测试只对应 main **6795b5d**；后续成功拉取 **d1bbbb2** 后的测试在 `evidence/latest-pull-20261113`，两者不能混用。

## 基线检查
- env/verify（129项）/engine/syntax（31脚本）/Creator3.8.8构建退出0。
- arcade退出0；skin有窗口回归退出1（holding must not fire）；T004退出1（staggered release shoot / too-short）；arm-impact退出1（leftShin/impact最大锚点误差0.0343846m）；30次重开+60秒stability退出1（13个null destroy异常）。未放行G1。
- 原有未跟踪证据保留，未提交或推送。各命令的退出码、日志和原始报告均保留。

## 拉取重试
- 初次标准SSH/SSH443尝试超时，HTTPS直连失败。后来检查到本机系统代理，严格主机校验的SSH443经已有本地SOCKS代理成功连接。
- `retry-proxy-443-lsremote.log`确认远端d1bbbb2；`retry-fetch-ssh443-proxy-result.json`记录fetch退出0；`fast-forward-result.json`记录安全快进退出0（6795b5d→d1bbbb2）。没有改全局Git/代理设置。
- 旧HTTPS代理fetch后因SSH路径已经成功而主动终止，不将其退出码当作新的远端阻塞。
