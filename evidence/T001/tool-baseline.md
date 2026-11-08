# T001 工程与工具基线 — 已完成

安装/导入日期：2026-11-07；最终 WebGL 复核日期：2026-11-08。

## 当前结果

| 验证项 | 结果 | 证据 |
| --- | --- | --- |
| Cocos Creator 3.8.8 安装 | 已安装到 `/Applications/CocosCreator.app` | `installation/install.json`、`installation/codesign-info.log` |
| 实际项目导入 | PASS；Box2D 切换、合法资源 meta、真实声明 | `logs/09-creator-project-import.log`、`assets/scenes/Boot.scene`（工程内） |
| 引擎 TypeScript | 退出 0；使用实际生成的声明 | `logs/13-typecheck-engine.log` |
| Web Desktop 最终构建 | 退出 0；Creator 原始退出 36 | `logs/14-build-web-final.log` |
| WebGL 2.0 最终冒烟 | 退出 0；Boot 加载，1920 × 1080 设计分辨率，b2PhysicsWorld，无页面异常或失败请求 | `logs/15-webgl-smoke-final.log`、`webgl-smoke.json`、`boot-webgl.png` |
| 便携验证 | 退出 0；55 项测试，配置与生成物无漂移 | `logs/16-verify-final.log` |
| 环境预检 | 退出 0；已发现 Creator，工程缺失列表为空 | `logs/17-env-final.log` |

初次 WebGL 检查先读取到加载中的场景，后以显式轮询等待 Boot 就绪。初次成功报告对应 `logs/12-webgl-smoke.log`，截图复核发现文本裁切；通过编辑器将 Label 区域设为 1700 × 700 并保存、重建，最终截图确认完整。`boot-webgl-failed.png` 是首次过早读取时的加载画面，不是最终结果。

最终检查入口 `installation/webgl-smoke.mjs` 使用本机 Chrome、Playwright Core 和回环地址静态服务器，不加入项目开发依赖。需先启动 `python3 -m http.server 7458 --bind 127.0.0.1 --directory build/web-desktop`；可用 `PLAYWRIGHT_MODULE` 指定 Playwright Core 模块入口。

`installation/snapshot-manifest.json` 保存当前源码、配置与实际 Web 构建文件 SHA-256。`command-results.json` 保留安装前记录，并单列安装后的命令；`tool-baseline-before-install.md` 保留历史阻塞说明。

**证据仅覆盖 T001。** Box2D 后端已加载不等于验证了物理步、输入、设备性能或手感；配置种子、G1、AC01–AC24 仍未验收。
