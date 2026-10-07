---
name: cqai-club-publish-activity
description: 在 CQAI Club 官网查找、检查、修改或发布已有活动，并核验真实发布状态。用于活动发布管理，不用于普通内容发布。
---

# 活动发布

使用已连接的 CQAI Club MCP，读取当前工具 schema。缺失连接、登录失效或缺少活动管理权限时，报告具体阻塞并保留操作上下文，不宣称操作完成。

通过 `club_list_managed_activities` 和 `club_get_managed_activity` 解析用户指定的真实活动。仅靠标题有多个候选时列出区别，让用户选择，不能随意取第一个。公开查询 `club_get_activity` 不能代替草稿管理查询。

检查完整输入：标题、摘要、正文、线上/线下模式、地点/线上入口、含时区的开始与结束时间、报名开放与截止时间、人数上限。缺项或矛盾时合并追问，不能编造。用户要求调整时，先取得当前完整输入，改用户指定字段，并通过 `club_update_activity({ id, input, requestKey })` 保存。

首次写入前，将活动 ID、操作目的、完整参数、随机 UUID `requestKey` 持久保存于当前可写的工作目录，例如 `.cqai-club/operations/activity-<id>.json`。更新与发布各用一个键；失败、超时、断线后的相同操作复用原键和原参数。参数发生变化时保留旧记录并创建新操作。令牌不进入记录或 Git。没有可持久保存记录的环境时，先建立可写持久位置再操作。

用户明确说发布、上线该活动，或已在本次流程授权发布时，调用 `club_publish_activity({ id, requestKey })`，无需再次确认同一授权。仅检查、修改、保存草稿的请求不自动扩展成发布。活动已经发布时直接核验并返回现有结果。

操作响应可能是幂等重放的历史快照。发布后使用 `club_get_managed_activity({ id })` 实时查询，并用 `club_get_activity({ id })` 核验公开可读。返回真实 ID、当前 `published` 状态与服务给出的公开 URL；失败时给出失败信息，不能以草稿链接或一个 HTTP 成功响应代替发布成功。
