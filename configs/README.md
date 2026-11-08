# 配置种子与生成关系

`*.seed.json` 是唯一手工维护的数值来源，不是已验证的生产配置。原始 Word/ZIP 资料包保留不变；工程种子的每次调整须同步校验、生成物与决策。

```sh
npm run check:config             # 结构、范围、引用、预算与解锁链
npm run config:generate          # 从通过校验的种子生成 assets/resources/config/*.json
npm run config:check-generated   # 按完整文件比较检测数值和元数据漂移
```

生成文件纳入源码以便 Creator 导入，但不要手改。生成过程确定且无时间戳，相同种子生成相同字节；每个文件注明来源、完整 SHA-256 和 `runtimeVerified: false`。清单包含 Boot 展示摘要，不隐瞒种子未验证的状态。`npm run verify` 检查生成物是否最新，不自动重写过期文件。

校验通过不等于关卡可达、骨架稳定或手感通过。T002 已完成 Web 基础单位与输入标定；T003 填写骨架锚点和参考角；T004 填写驱动参数；T008 通过试玩后提交经过验证的参数快照。届时通过明确的数据格式/状态迁移更新工具，不能仅把标记从 false 改为 true。

`engine.lock.json` 是环境元数据而非数值种子：当前 `patch: "3.8.8"`，已安装并实际导入该版本，完成 Web 构建；验证证据见 `evidence/T001/tool-baseline.md`。引擎锁不改变历史种子中的版本占位说明；实际构建以引擎锁和编辑器生成的工程版本为准。渠道凭据不放入共享种子。

冲量、质量和控制参数需要实际 Box2D 后端标定。穿甲只改变装甲余伤，不穿多人。levels 使用米制台面坐标，不使用旧版竖屏归一化坐标。T001 的伤害公式只是无引擎参考内核，不代表 T006/T011 或 AC11 已通过。

T002 为 `physics` 增加 `steppingOwner: PhysicsAdapter`、`engineAutoSimulation: false` 与 `maxStepsPerFrame: 5`，防止自动步与适配器重复推进；没有更改既有战斗数值或全局 runtimeVerified。生成物哈希因元数据契约增加而更新，完整值见 `evidence/T002/web-verification.json`。
