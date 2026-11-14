# D041 GPT弓箭接入验证

日期2026-11-14；基线main b49816b0cd47ce88e95a76f44603bdfd6876ed83；Linux / Node24.22.1 / npm11.9.0 / Creator锁定3.8.8。克隆后工作区干净，保留既有工程结构与meta。

新增疾风/月蚀GPT原PNG及切片表，接入统一资源所有者和40片形变；玩家搭箭、飞行及插箭按发射时装备匹配图片，箭池跨款式/敌我复用清理旧皮肤。

| 命令 | 退出码 | 实际范围 |
| --- | --- | --- |
| npm ci --ignore-scripts | 0 | 按原锁文件安装，未升级依赖 |
| npm run verify | 0 | 186项便携测试、配置和TS |
| npm run check:syntax | 0 | 38个引擎侧TS语法，非引擎类型 |
| node --import tsx scripts/render-weapon-preview.mjs | 0 | 原图+生产几何12格离线预览，已目视检查 |
| PREVIEW_VIEWS=phone-wide,phone-gale,phone-moon PRESENTATION_PREVIEW_DIR=evidence/weapon-art-20261114 node --import tsx scripts/render-battle-presentation.mjs | 0 | 三款手机离线合成与生产UI夹具，已目视检查 |
| npm run typecheck:engine | 2 | BLOCKED：缺真实导入配置 |
| npm run build:web | 2 | BLOCKED：缺Creator及真实导入配置 |

两PNG尺寸1254×1254、RGBA，alpha实测范围0–255，完整指纹保存在各art.json。新增测试执行生产资产/皮肤/投射物方法，检查一次纹理引用、迟到加载不持有资源、失败隔离、固定40片复用、搭箭换帧、在途/插箭外观快照及敌我池复用。

初次新增夹具缺少程序箭绘制替身，1项失败，补齐后通过；首次手机预览在交互自检前切装备，破坏原初始状态断言，已移至自检重置后。两项均为验证夹具设置修正，未放宽生产规则或断言。

本轮没有Creator/WebGL/Box2D或真机运行；新增4份资源meta等待编辑器实际导入。扩展的test:web:arcade三弓纹理检查仅通过脚本语法，尚未执行。不得使用本轮离线图/夹具替代手感、物理或发布验收。T004/T005/T012与G1状态不升级。资源/复验详见docs/GPT_WEAPON_ART.md。
