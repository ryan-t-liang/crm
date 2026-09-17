# 会员页面与 Sowind 字段映射

## 基线（2026-09-17 实际核对）

本轮附件已提供并完整读取 `docs/reference/sowind-schema.sql`，不再沿用“SQL 缺失”的结论。原文件完整复制到本地 reference 目录，未修改 SQL，未接数据库、真实客户或 HQ。该目录沿用仓库原有 Git 忽略规则。

四表原始主键/引用为 unsigned int；前端展示键为字符串，真实整数可经 String(id) 作只读转换，不改变关联。既有 customer-1001 等是明确虚构演示键，不冒充生产 ID。新演示种子补日期、删除状态、商品及原生电话；旧 LocalStorage 不合并种子、不回填、不改版本。

## 页面字段—SQL 字段—转换规则—是否扩展

| 页面字段 / 用途 | 原表字段与 SQL 契约 | 只读转换 / 兼容规则 | 是否扩展 |
| --- | --- | --- | --- |
| 集团客户记录 | customer.id：unsigned int 非空 PK | 按 id 去重，非 GP/UN 档案数相加 | 否 |
| 集团日期 | customer.created_at / updated_at：datetime 非空 | 前端可选以兼容旧数据；缺失显示日期待补，不补今天 | 否 |
| 品牌身份 | user.id / brand：unsigned int PK / varchar(16) 非空，gp/un | 原品牌值保留，用户不是 CRM 登录账号 | 否 |
| 集团关联 | user.customer_id：unsigned int 可空 | NULL 与无效引用分开；不补建集团；允许同品牌多 user | 否 |
| 微信身份 | user.openid / unionid：varchar(100) 可空 | 仅 brand+openid 唯一；NULL 语义保留，unionid 不全局唯一 | 否 |
| 身份来源 | user.source：tinyint 非空默认1，1自主/2管理员 | 原枚举保留，不据此推导关联或同意 | 否 |
| 新增品牌档案 | user.created_at / updated_at：datetime 非空 | created_at 统计；updated_at 不作新增/成交时间 | 否 |
| 有效档案 | user.is_deleted：tinyint 非空默认0，0有效/1删除 | 仅严格等于0入统计；旧数据 undefined 单列删除状态待补 | 否 |
| 资料主键与关联 | user_profile.id / user_id：unsigned int 非空，user_id唯一 | 缺 profile 显示缺失，不自动创建 | 否 |
| 会员电话 | user_profile.tel：varchar(30)非空；tel_country_code：varchar(10)可空默认86 | 原生字段优先，包括显式NULL；缺原生字段只读兼容旧 user.phone/country_code，标记旧演示别名；不写回 | 否；旧 user 电话别名非 SQL 字段 |
| 资料称谓/姓名/邮箱 | user_profile.salutation tinyint可空（1博士/2先生/3太太/4女士/0不透露）；first_name/last_name varchar(100)、email varchar(255)可空 | 本轮不据姓名、邮箱合并身份，未全面接入编辑 | 否 |
| 资料地区/语言/生日 | user_profile.region varchar(255)可空（China/Hong Kong/Taiwan/Macau/us）；language varchar(10)、birthday datetime可空 | 原地区原值保留，与意向编码分开；旧未知字符串/数字不强转 | 否；未知值为旧兼容 |
| 资料兴趣 | user_profile.areas_of_interest：varchar(255)可空，自填字符串 | 保持字符串，不伪造正式字典 | 否 |
| 资料喜爱系列 | user_profile.favorite_series：tinyint可空 | 支持数字原码；旧字符串码保留，字典待配置 | 否；旧字符串为兼容 |
| 资料腕表/营销选择 | user_profile.has_watch tinyint可空：0否/1是；accepts_marketing tinyint非空默认0：0否/1是 | 分表映射，不布尔化，不跨品牌复制 | 否 |
| 资料数据同意/日期 | user_profile.personal_data_consent tinyint非空默认1：0否/1是；created_at/updated_at datetime非空 | 本轮不以营销选择推导发送权限；日期不反向覆盖意向 | 否；尚未全面接入页面 |
| 资料零售商（旧页保留） | user_profile 无 retailer 列 | 仅旧原型字段，保留用户值；不用于概览指标 | 是，旧原型扩展 / 待后端支持 |
| 意向主键/品牌/关联 | user_purchase_intent.id unsigned int PK；brand varchar(16)非空 gp/un；user_id unsigned int可空 | 不是 Sales Lead/Deal；NULL、有效同品牌、关联不可用三类；不自动创建会员 | 否 |
| 意向联系快照 | first_name/last_name varchar(100)、email varchar(255)、tel varchar(30)、tel_country_code varchar(10)默认86：均可空 | 保留独立快照。旧 name 为姓名展示别名；phone/country_code 为 tel/tel_country_code 的旧别名。原生电话优先，NULL不回退会员电话 | 否；name/phone/country_code 是旧别名 |
| 意向称谓/联系偏好 | salutation tinyint可空（同资料称谓）；preferred_contact tinyint可空：1微信/2电话/3email/4短信；language varchar(10)可空 | 未用于概览，不编造偏好统计 | 否；尚未全面接入页面 |
| 意向地区/城市/生日 | region varchar(10)可空：zh/hk/tw/mc/us；city varchar(100)、birthday datetime可空 | 与 profile.region 分别解释；未知旧码原样展示 | 否 |
| 意向腕表/营销选择 | has_watch / accepts_marketing：tinyint非空默认0，0未选择/1是/2否 | 旧NULL是数据未知，不是SQL允许值；只读保留，不纠正为0，也不布尔化 | 否；旧NULL为兼容异常 |
| 意向数据同意 | personal_data_consent tinyint非空默认0：0否/1是 | 无发送能力，不跨品牌复制同意 | 否；尚未全面接入页面 |
| 意向商品 | product_sku / model：varchar(100)可空 | 品牌+SKU；缺SKU按品牌+model；两者缺失单列未填写，每条一次 | 否；种子为演示商品码 |
| 意向零售渠道/门店/来源 | purchase_channel tinyint可空：1零售商；retailer smallint可空；source tinyint非空默认1：1小程序/2管理员 | 数字原码保留；旧字符串门店兼容，字典待配置；不编造正式品牌选项 | 否；部分未接入页面 |
| 意向兴趣/喜爱系列（旧页保留） | user_purchase_intent 无 areas_of_interest / favorite_series 列 | 不声称现有后端字段，不用于概览商品归因，保留已有用户值 | 是，旧原型扩展 / 待后端支持 |
| HQ 引用 | user_purchase_intent.hq_ref：JSON可空 | 原JSON展示；兼容旧字符串，不据引用反推成功，不写回 | 否；旧字符串兼容 |
| HQ 错误 | user_purchase_intent.error：varchar(255)可空 | 去首尾空白仅作分类，不改原始字符串；错误独立展示 | 否 |
| HQ 同步 | user_purchase_intent.hq_sync_status：tinyint非空默认0，0未同步/1成功 | 0无错未同步、0有错异常、1无错成功、1有错待核验；无状态2 | 否 |
| 意向日期 | user_purchase_intent.created_at / updated_at：datetime非空 | 仅创建时间选期，缺日期不纳入趋势；updated_at不替代closedAt | 否 |
| 关联/同步/日期覆盖分类 | 前述原字段派生 | 只读前端分类，不写SQL，不代表后端状态枚举 | 是，仅派生展示，非后端扩展 |

## 独立性与本轮刻意不修改的动作

资料和意向的 has_watch 修改继续各自独立。意向关联用户不实时覆盖姓名、电话、邮箱、地区、同意或营销选择；跨品牌也不复制。集团关系只按已有 customer_id，不按手机号、openid、unionid 合并。

旧手机号匹配演示动作仍使用 user.phone/country_code 别名，按本轮任务明确要求未修改。它与 SQL 的 profile 电话来源以及“管理员创建时为空”注释的差异需后续确认：如何迁移候选读取、唯一匹配是否写 user_id、多候选如何处理。当前未声称后端实现了自动关联，也不自动修复已有关系。

前端类型是局部展示契约，不是逐列完整数据库模型。未接入的SQL字段不被补成默认值；字典、生产时区及同步错误清理规则仍待正式确认。
