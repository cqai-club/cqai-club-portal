---
name: cqai-club-register-activity
description: 查询 CQAI Club 公开活动、为当前登录用户报名或取消报名，并核验报名状态。用于官网活动报名，不代替会议预约或替他人报名。
---

# 活动报名

使用已连接的 CQAI Club MCP，并读取工具的实际 schema。通过 `club_list_activities`、`club_get_activity` 查找用户指定的真实活动，展示与选择有关的日期、地点、名额、报名开放状态。重名或多场活动不能任意选一个；信息不足时请用户选择。

`club_register_activity` 与 `club_cancel_registration` 仅作用于当前 MCP 登录用户。不要伪造用户身份、替他人报名或通过管理报名查询扩大范围。`club_activity_registrations` 需要对应活动管理权限；普通用户查询自己的记录使用 `club_my_registrations`。

用户已明确要求“给我报名/取消报名”某活动时执行该操作；用户只是咨询活动时先返回信息。报名关闭、名额满、活动取消或权限不足时如实报告官网结果，不改活动或绕过限制。

首次写入前，在当前可写的持久工作目录保存活动 ID、报名/取消操作、完整参数、随机 UUID `requestKey`，例如 `.cqai-club/operations/registration-<id>.json`。同一意图因超时、断线或服务错误重试时，沿用同一键和参数，不能换键重复提交。取消后用户又要求重新报名是新的操作，保留旧记录、生成新键。令牌不写进记录，不提交 Git；无法持久保存时先建立可写持久位置。

执行 `club_register_activity({ id, requestKey })` 或 `club_cancel_registration({ id, requestKey })` 后，写回真实报名 ID 与返回结果，再调用 `club_my_registrations()` 查询当前状态。幂等响应可能是旧快照，以实时查询为准；若查不到或状态不符，明确说明核验失败。

最终返回活动标题/ID、当前报名或取消状态与官网返回的活动链接，不能编造确认编号、二维码或成功状态。
