# v1.15.0 实现与范围报告

## 已实现

- 保留 v1.14.0 页面结构、布局和品牌视觉；移除前端 Mock 数据、Mock 登录、Mock 权限和默认密码。
- MySQL/Prisma 数据模型覆盖 Brand、Customer、Brand Profile、Identity、Consent、Lead、Journey、Note、Audit、HQ Link、Outbox、Attempt、Import/Export Job、User/Role/Permission/Session。
- Fastify API 实现统一错误、验证、健康检查、同源写保护和请求限流。
- Argon2id 密码、HttpOnly Session、首次改密、重置/禁用撤销 Session。
- 后端强制 RBAC 和品牌范围；前端同步隐藏不可用入口，但前端隐藏不作为安全边界。
- 会员与线索导入模板来自品牌表单配置；手机号列为文本，必填列带红色星号。
- 用户提交、后台新增和外部小程序使用同一 Canonical Lead Service；Local Lead 与 Outbox 原子落库。
- Sowind Gateway Payload Builder、Client、Outbox Worker、重试、限速、Attempt 与追踪。
- Docker、Nginx、迁移、Seed、备份/恢复和 UAT 文档。

## 未实现或依赖外部条件

- 未执行真实 Sowind Gateway Live Test；需要有效 Key、测试窗口和业务授权。
- 未确认 Gateway 202 后的 HQ 最终处理状态/回调，因此只显示 Gateway 已受理。
- HQ Contact 映射仍按品牌和外部系统保存，不假定 GP/UN 必然共享同一 Contact。
- 当前导入导出使用本机/挂载卷；大规模部署建议改为对象存储和异步队列。
- 当前 Worker 适合单实例；多实例必须增加分布式限速、租约与锁恢复策略。

## 兼容与保留

- 原始 v1.14.0 ZIP 未覆盖，SHA-256 为 `a31f5e34bde870e14daa40fe9f7fe56f49f22fe97d422f409d062a10608add30`。
- 生产 ZIP 不包含 `.env`、密钥、本地数据库数据、导入导出文件或 `node_modules`。

