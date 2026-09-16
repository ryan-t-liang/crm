# 会员页面与 Sowind 字段映射（暂定）

## 基线状态

`docs/reference/sowind-schema.sql` 在当前仓库、当前 Git refs 和本次附件目录中均不存在。因此本文件不是完整 SQL 审计，只记录需求中明确点名的表、字段和值语义。未在需求中出现的列、SQL 类型、默认值、索引、外键、注释和可空性均为 **UNKNOWN / 待 SQL 核对**，不得据此声称后端已兼容。

本轮仍保持纯前端模拟，不修改 SQL，不接数据库，不调用 HQ 接口。Demo 数据全部为虚构值。

## 页面字段映射

| 页面字段 | SQL 表字段 | 前端展示 / 转换规则 | 原型扩展 |
| --- | --- | --- | --- |
| 集团客户主键 | `customer.id` | 原值展示；未推测 customer 的姓名、等级、积分、标签或会员编码 | 否 |
| 品牌用户主键 | `user.id` | 原值展示；类型名使用 `SowindBrandUser`，避免与销售 User 冲突 | 否 |
| 集团客户关联 | `user.customer_id` | 允许 `NULL`；空值显示“未关联（NULL）”，不自动创建或合并 customer | 否 |
| 品牌 | `user.brand` | 保留小写 `gp` / `un` 原值，不重编码 | 否 |
| 微信身份 | `user.openid` | 原值或显式 `NULL`；只保留 `brand + openid` 原约束语义，不对 `NULL` 做等值合并 | 否 |
| 跨应用身份 | `user.unionid` | 原值或显式 `NULL`；不新增全局唯一校验 | 否 |
| 手机匹配国家码 | `user.country_code` | 与 `user.phone` 组合用于同品牌候选匹配；精确 SQL 类型待核对 | 否 |
| 手机匹配号码 | `user.phone` | 不跨品牌匹配，不规范化写回，不自动合并 customer | 否 |
| 品牌资料主键 | `user_profile.id` | 原值展示；精确主键定义待 SQL 核对 | 否 |
| 品牌资料关联 | `user_profile.user_id` | 与 `user` 组合成“品牌会员详情”；缺失时显示空状态，不补建 | 否 |
| 是否有腕表 | `user_profile.has_watch` | `0=否`、`1=是`、`NULL=未提供`；不转换为布尔值 | 否 |
| 接受营销 | `user_profile.accepts_marketing` | `0=否`、`1=是`；不跨品牌复制 | 否 |
| 品牌资料地区 | `user_profile.region` | 原值展示并标注“profile 映射”；不与购买意向 region 共用字典 | 否 |
| 兴趣范围 | `user_profile.areas_of_interest` | 保留字符串契约，不拆成后端数组 | 否 |
| 喜爱系列 | `user_profile.favorite_series` | 保留原始编码，并显示“字典待配置” | 否 |
| 零售商 | `user_profile.retailer` | 保留原始编码，并显示“字典待配置” | 否 |
| 购买意向主键 | `user_purchase_intent.id` | 原值展示；类型名使用 `SowindPurchaseIntent`，避免与 Sales Lead 冲突 | 否 |
| 关联品牌用户 | `user_purchase_intent.user_id` | 允许 `NULL`；空值不会自动创建 user 或 customer | 否 |
| 意向品牌 | `user_purchase_intent.brand` | 保留 `gp` / `un` 范围；是否为 SQL 实列仍需 schema 确认 | 否 |
| 意向姓名 | `user_purchase_intent.name` | 作为历史快照原值展示；不从 user_profile 实时覆盖 | 否 |
| 意向国家码 | `user_purchase_intent.country_code` | 与意向 phone 共同参与候选匹配；空值保持 `NULL` | 否 |
| 意向电话 | `user_purchase_intent.phone` | 作为历史快照独立保留；空值保持 `NULL` | 否 |
| 意向邮箱 | `user_purchase_intent.email` | 作为历史快照独立保留；空值保持 `NULL` | 否 |
| 意向是否有腕表 | `user_purchase_intent.has_watch` | `0=未选择`、`1=是`、`2=否`、`NULL=未提供`；不与 profile 枚举合并 | 否 |
| 意向接受营销 | `user_purchase_intent.accepts_marketing` | `0=未选择`、`1=是`、`2=否`、`NULL=未提供`；不与 profile 枚举合并 | 否 |
| 意向地区 | `user_purchase_intent.region` | 原值展示并标注“intent 映射”；不与 profile region 共用字典 | 否 |
| 意向兴趣范围 | `user_purchase_intent.areas_of_interest` | 保留字符串契约 | 否 |
| 意向喜爱系列 | `user_purchase_intent.favorite_series` | 保留原始编码，并显示“字典待配置” | 否 |
| 意向零售商 | `user_purchase_intent.retailer` | 保留原始编码，并显示“字典待配置” | 否 |
| HQ 引用 | `user_purchase_intent.hq_ref` | 原值或显式 `NULL`；不调用 HQ | 否 |
| HQ 错误 | `user_purchase_intent.error` | 与同步状态分开显示，不生成额外状态枚举 | 否 |
| HQ 同步状态 | `user_purchase_intent.hq_sync_status` | `0=未同步`、`1=成功` | 否 |
| 手机号匹配结果 | 由 `user.brand + country_code + phone` 与意向对应字段计算 | 0 个候选=保持空；1 个候选=唯一候选；多个候选=待处理，不自动选择 | 是，前端派生状态，不写回 SQL |

## 独立性规则

- `user_profile` 与 `user_purchase_intent` 分别存储和修改。当前原型修改任一 `has_watch` 不会覆盖另一份记录。
- 购买意向即使关联 `user_id`，姓名、国家码、电话、邮箱、营销选择和地区仍从意向自身字段展示。
- `user.customer_id` 与 `user_purchase_intent.user_id` 的缺失不会触发自动补建。
- 多个同品牌 user 可以关联同一 customer；原型不增加“每客户每品牌唯一 user”约束。
- 手机号候选匹配只是前端演示。它与 SQL 注释中“管理员创建时可为空”的差异仍为待核对项，不代表后端已经实现自动匹配。

## SQL 到位后必须补做

1. 逐列核对四张表的完整字段、SQL 类型、长度、默认值、可空性与注释。
2. 核对 `hq_ref`、`error`、`hq_sync_status` 的实际所属表。
3. 核对 country code、phone、name、email 与 brand 的准确 SQL 列名。
4. 核对 `region`、`favorite_series`、`retailer` 的品牌字典和实际编码范围。
5. 核对 `brand + openid` 唯一索引的数据库实现及 `NULL` 行为。
