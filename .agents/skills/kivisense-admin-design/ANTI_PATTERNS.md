# Kivisense Admin Design — Anti-Patterns

These are default rejections. If one appears, redesign the structure before polishing styles.

## 1. Wizard by default

Bad:

`Basic → Participation → Draw → Prize → Publish`

for a record that could have been created after Basic information.

Fix:

Quick Create SideSheet → Record Detail → configure advanced modules.

## 2. Whole product inside a drawer

Bad:

- 70% viewport SideSheet;
- left step navigation;
- tabs inside;
- cards inside tabs;
- sticky footer with 4–5 actions.

Fix:

Use a compact right-side SideSheet for creation, or a real detail page for complex work. Do not embed an application inside the form drawer.

## 3. Nested cards

Bad:

Workspace Card → redundant decorative Card → field-group Card / Table.

Fix:

Use the CRM main workspace Card, meaningful business Summary Cards and Right Rail Info Cards. Keep settings groups flat inside their existing workspace; do not put a decorative Card around an already-contained group or nest more Cards inside a business summary. Forms are not prohibited from using a main Card.

## 4. Two identical navigation rows

Bad:

Primary tabs followed by secondary tabs with the same visual weight.

Fix:

Primary line tabs + lighter text subnav.

## 5. Giant empty whitespace

Bad:

- two short fields spread across a 1600px canvas;
- empty table stretching to the bottom of the viewport;
- huge card containing one sentence.

Fix:

Bound content width and empty-state height.

## 6. KPI-card reflex

Bad:

Every number becomes its own bordered card.

Fix:

Group metrics by business meaning in compact CRM Summary Cards; do not respond by making the entire overview a naked white canvas.

## 7. Developer documentation in the UI

Bad:

`纯前端演示`, `不连接微信/HQ`, `后台职责`, `当前原型没有全局 Audit`.

Fix:

Move implementation notes to docs.

## 8. Internal jargon as Chinese product copy

Bad:

- 奖品履约
- Fulfillment Booking
- Redemption Log
- Participation Record

Fix:

- 中奖与核销
- 领奖预约
- 核销记录
- 参与管理 / 参与用户

## 9. Too many equal-weight actions

Bad:

`查看 编辑 预览 复制 暂停 取消 删除` all visible.

Fix:

Primary + Secondary + `…`.

## 10. Switch for a core business mode

Bad:

`开启预约` as the only expression of how users participate.

Fix:

Use radio/segmented options when the selection changes the business model:

- 预约参与
- 直接参与

Switch is suitable for simple booleans such as `启用抽奖`.

## 11. List as a mini-dashboard

Bad:

Index list with many operational KPI columns that are not needed to choose a record.

Fix:

Keep list columns to identity, type, lifecycle, ownership/context, time/location, and main action.

## 12. Custom CSS before structure

Bad:

Trying to fix a wrong layout by changing border-radius, background, and margin.

Fix:

Correct the interaction pattern and information architecture first.

## 13. External minimalism replacing CRM identity

Bad:

Marketing has its own white page background, primary Tabs CSS, table density and Modal chrome to resemble Plane, while Lead / Deal / Member use the mature CRM layout.

Fix:

Treat existing CRM screens as the final visual authority. Reuse their shell, tokens, Cards, Tabs, Table and Modal defaults. External references inform interaction, not the visual brand. Do not change Sales / Member to match Marketing.

## 14. No Cards interpreted as no boundaries

Bad:

Record Tabs float on an unbounded white page; a few fields span the full workspace and real contextual information has nowhere to go.

Fix:

Use Page Header + main Card with Tabs + optional business information rail. Reject fragmented or meaningless Cards, not the CRM's useful surface boundaries.
