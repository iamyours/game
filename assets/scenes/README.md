# 场景入口

`Boot.scene` 由 **Cocos Creator 3.8.8** 场景与资产数据库接口生成、保存和导入，保留原 scene/meta；T002 没有新造场景 UUID。

入口仍是 Boot（Canvas、Camera、BootStatus、StormArchersBoot）。加载同哈希 manifest/combat 后，由程序工厂生成 `PhysicsLab/World`（世界相机、米制网格、两只真实标定刚体）和 Canvas 下的 `PhysicsLabHUD`。不是第二套浏览器物理，也没有另一个 PhysicsLab.scene。

点击预览即可运行；浏览器构建入口 `build/web-desktop/index.html` 需 HTTP 服务。左侧按住/拖动，右侧轻点切箭，顶部暂停；试射只计数，不生成正式箭矢。刷新重新标定。

设计 UI 为 1920×1080，世界核心视野 24×13.5 m。16:9、4:3、超宽、640×360 与竖屏提示实测见 `evidence/T002/verification.md`。正式角色/关节与箭矢分别留给 T003–T005。
