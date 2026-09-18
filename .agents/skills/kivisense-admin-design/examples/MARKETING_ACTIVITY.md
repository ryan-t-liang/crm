# Example — Marketing Activity using Kivisense Admin Design

This example shows how the generic skill applies to the Marketing Activity module. It is an example, not a special design system.

## Activity list

Columns:

- 活动编号
- 活动名称
- 活动类型（线上活动 / 线下活动）
- 场地
- 活动时间
- 状态（待开始 / 进行中 / 已结束）
- 参与方式（预约参与 / 直接参与）
- 操作

Do not show effective bookings, check-ins, completed count, winners, draw count, or other KPI columns on the list.

Row actions:

- `编辑`
- `…`

`…` contains only the lifecycle operations required by the current product, e.g. `开始 / 暂停 / 结束`.

## New Activity

Use one Quick Create Modal, not a wizard or SideSheet.

Core fields:

- 活动名称
- 所属品牌
- 活动类型
- 场地（线下活动时）
- 活动开始时间
- 活动结束时间
- 参与方式
- 启用抽奖
- 活动规则（富文本）

Do not configure booking rules, draw rules, prizes, or publish checks during creation.

After creation, open Activity Detail.

## Edit Activity

Use the same form and field order as New Activity.

Footer:

- 取消
- 保存

## Activity detail

Primary navigation:

- 概览
- 活动设置
- 参与管理
- 中奖与核销

Do not use `奖品履约` in Chinese UI.

Secondary navigation:

### 活动设置

- 基本信息
- 预约设置（only for 预约参与）
- 抽奖设置（only when draw enabled）
- 奖品设置（only when draw enabled）

### 参与管理

- 参与用户
- 预约记录（only for 预约参与）
- 抽奖记录（only when draw enabled）

### 中奖与核销

- 中奖记录
- 领奖预约（only when prize fulfillment needs booking）
- 核销记录

## Overview

Do not default to eight independent KPI cards.

Group by business meaning:

### 参与情况

- 参与人数
- 到场人数
- 完成人数
- 中奖人数

### 抽奖情况

- 抽奖人数
- 抽奖次数
- 中奖份数

### 领奖情况

- 待领取
- 已预约
- 已领取

Hide groups that do not apply to the activity.

## Activity participation mode

UI term: `参与方式`

Options:

- `预约参与`
- `直接参与`

Do not express this primary business mode only as `开启预约` switch.

## Prize fulfillment

UI term: `领取方式`

Options depend on prize type, but the business dimension is independent from Activity participation mode.

Examples:

- 实体奖品 + 直接领取
- 实体奖品 + 预约领取
- 虚拟奖品 + 直接发放
- future virtual/service entitlement + 预约履约 if required

## Participant identity

Do not require CRM member, UnionID, OpenID, or phone globally.

Participation may carry optional identity:

- CRM Member
- UnionID
- OpenID + App context
- Phone
- Anonymous ID
- Participation channel

The internal Participation/Participant ID is the stable marketing business identifier.

The main participant table should not expose full OpenID/UnionID. Use a participant detail view for technical identity fields.
