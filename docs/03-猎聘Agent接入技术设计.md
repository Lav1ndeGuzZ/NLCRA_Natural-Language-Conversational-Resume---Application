# 猎聘 Agent 接入技术设计

**版本：** v0.2
**日期：** 2026-11-03
**范围：** 单平台（猎聘）/ **无登录工具（可部署）**
**官方入口：** <https://www.liepin.com/mcp/auth>
**关联文档：** [02-猎聘Agent接入可行性](02-猎聘Agent接入可行性.md) · [05-可行性验证设计文档（精简版）](05-可行性验证设计文档（精简版）.md)

> **当前版本说明：** 服务端按“无状态代理”设计，不保存猎聘 token、简历、投递数据；用户数据在浏览器 IndexedDB。本文数据模型中的 `user_id`/租户字段仅作为未来扩展参考，MVP 不落库。

---

## 0. 设计目标

为**无登录、可部署**的 Web 工具提供一个**只接猎聘**的适配器，完成：

1. 用户用猎聘 `x-user-token` 连接账号；
2. 读取猎聘现有简历，导入/对照；
3. 将我方结构化简历的**缺失字段**补充到猎聘；
4. 搜索猎聘职位；
5. 在用户确认后投递；
6. 记录投递并支持**手动状态**回填与提醒；
7. 所有调用可限流、可重试、可审计。

**非目标：**

- 不做标准 MCP JSON-RPC Server（猎聘不是这个形态）；
- 不做服务端保存猎聘密码；
- 不做浏览器自动化；
- 不承诺自动查询投递状态（官方暂未开放）；
- 不直接拷贝官方 CLI 代码（仓库暂无 LICENSE）。

---

## 1. 接入形态

### 1.1 官方形态

```text
用户浏览器 → 猎聘授权页 /mcp/auth → 生成 x-user-token
我们的后端 → https://open-agent.liepin.com/mcp/* → 带 x-user-token
```

- 官方 CLI 是 HTTP 客户端，不是 MCP Server；
- 我们按同样的 REST 契约实现自己的 Adapter；
- 不依赖 Python 子进程，便于并发与观测。

### 1.2 为什么不用 CLI 子进程

| 问题 | 说明 |
| --- | --- |
| 并发 | 每个请求起进程，开销大 |
| Token 暴露 | 可能出现在命令行参数/进程列表 |
| 错误处理 | 只能解析 stdout/stderr/exit code |
| 可观测 | 难以做细粒度指标 |
| 许可 | 仓库暂无 LICENSE，不适合直接分发/嵌入 |
| 部署 | 需要 Python 3.11+ 与 CLI 安装 |

**结论**：生产用 HTTP Adapter；CLI 只用于联调/抓 fixture。

---

## 2. 认证与 Token

### 2.1 用户流程

```text
1. 用户在“连接猎聘”页点击“去猎聘授权”
2. 新开 https://www.liepin.com/mcp/auth
3. 用户登录猎聘，点击“立即生成凭证”
4. 复制 x-user-token
5. 回到我们的页面粘贴
6. 后端 GET /mcp/get-resume 验证
7. 加密保存，状态 connected
```

**没有 OAuth、没有 refresh token。** 这是 PAT（Personal Access Token）模式。

### 2.2 Token 规则

| 项 | 说明 |
| --- | --- |
| Header | `x-user-token: <token>` |
| 有效期 | 90 天 |
| 刷新 | 无；到期重新生成 |
| 重置 | 猎聘页面重置后旧 token 立即失效 |
| 权限 | 搜索、查看、完善简历、投递 |
| 存储 | AES-256-GCM；密钥在 KMS |
| 日志 | 不记录 token、Authorization、简历正文 |
| 解绑 | 删除密文；提示用户可在猎聘重置 |

### 2.3 账号状态

```text
unbound → binding → connected → expired → reauth_required
                   ↘ error
connected → revoked
```

| 状态 | 前端 | 后端 |
| --- | --- | --- |
| `unbound` | “连接猎聘” | 无 |
| `binding` | 等待粘贴/验证 | 校验格式，调 get-resume |
| `connected` | 已连接（脱敏） | 可搜索/投递 |
| `expired` | “授权已过期” | 停止写操作，保留历史 |
| `reauth_required` | “请重新生成 token” | 清理旧 token |
| `revoked` | 已解绑 | 删除 token |
| `error` | 错误原因 | 记录状态码 |

### 2.4 Token 校验

```text
GET https://open-agent.liepin.com/mcp/get-resume
Header: x-user-token: <token>
```

- 200：token 有效；
- 401/403：无效/过期；
- 5xx/网络：暂时无法验证，允许“稍后重试”，不要误判为无效。

---

## 3. API 契约

Base URL：`https://open-agent.liepin.com`
Header：`x-user-token: <token>`
Content-Type：`application/json`（POST）
超时：30s（可配置）

| 用途 | Method | Path | 关键 Body/参数 | 返回 |
| --- | --- | --- | --- | --- |
| 读取简历 | GET | `/mcp/get-resume` | 无 | 简历 JSON |
| 更新基础资料 | POST | `/mcp/update-base-info` | `realName`、`sex`、`birthday`、`cityCode`、`startJob`、`startJobMonth`、`nowWorkStatus`、`nowSalary`、`nowMonths`、`nowSalarySecret`、`jobName`、`nowComp`、`nowIndusCode`、`nowJobTitleCode`、`nameSecret`、`wechat`、`politicalStatusCode` | 平台响应 |
| 更新自我评价 | POST | `/mcp/update-self-assess` | `selfAssess` | 平台响应 |
| 新增教育 | POST | `/mcp/add-edu-exp` | `school`、`major`、`start`、`end`、`degree`、`tz`、`experience` | 平台响应 |
| 更新教育 | POST | `/mcp/update-edu-exp` | `eduId` + 可选字段 | 平台响应 |
| 新增工作 | POST | `/mcp/add-work-exp` | `compName`、`workStart`、`workEnd`、`rwTitle`、`jobtitle`、`dq`、`dept`、`duty`、`salary`、`months`、`compkind`、`compscale`、`workType` | 平台响应 |
| 更新工作 | POST | `/mcp/update-work-exp` | `workId` + 可选字段 | 平台响应 |
| 新增项目 | POST | `/mcp/add-project-exp` | `name`、`start`、`end`、`compName`、`position`、`descr`、`duty`、`achievement` | 平台响应 |
| 更新项目 | POST | `/mcp/update-project-exp` | `id` + 可选字段 | 平台响应 |
| 新增求职期望 | POST | `/mcp/add-job-want` | `jobtitle`、`dq`、`wantSalaryLow`、`wantSalaryHigh`、`wantSalaryMonths`、`workType`、`industries`、`otherExpectDqs`、`workweek`、`practiceMonths` | 平台响应 |
| 更新求职期望 | POST | `/mcp/update-job-want` | `id` + 可选字段 | 平台响应 |
| 搜索职位 | POST | `/mcp/search-job` | `jobName`、`address`、`salaryFloor`、`salaryCap`、`salaryKind`、`workExperience`、`eduLevel`、`compNature`、`companyName`、`page` | 职位列表 |
| 投递职位 | POST | `/mcp/apply-job` | `jobId`（int）、`jobKind`（"1"/"2"） | 投递结果 |

> 以上来自官方 CLI 的源码/README 契约；实际响应字段需用测试 token 抓取 fixture 后固化。

### 3.1 日期/枚举规则

| 字段 | 格式 | 说明 |
| --- | --- | --- |
| `birthday` | `YYYYMMDD` | 例 `19950101` |
| `startJob` | `YYYY` | 与 `startJobMonth` 必须成对 |
| `startJobMonth` | `MM` | 01–12 |
| `start`/`end`/`workStart`/`workEnd` | `YYYYMM` | 例 `202301` |
| `degree` | 枚举 `090/080/060/050/040/030/020/010` | 含义待字典确认，**不要猜** |
| `sex` | `男`/`女` | 无“未知” |
| `workType` | `1`/`2` | 含义待确认 |
| `nowWorkStatus` | `"0"`–`"7"` | 含义待字典确认 |
| `politicalStatusCode` | `"1"`–`"6"` | 敏感，非必要不传 |
| `cityCode` | 字符串 | 城市代码字典待确认 |
| `jobKind` | `"1"`/`"2"` | 必须来自搜索结果 |

**实现策略**：先建立 `liepin_dictionaries` 表，把学历/城市/求职状态/公司性质等枚举码与中文标签映射起来；没有字典的字段，宁可留空/让用户选，不要瞎猜。

---

## 4. 简历读取与映射

### 4.1 读取

```text
GET /mcp/get-resume
→ 猎聘简历 JSON
```

用途：

1. 用户首次连接时导入，减少对话提问；
2. 每次更新前对照，避免覆盖；
3. 投递前确认猎聘侧简历完整度。

### 4.2 我方 Canonical Schema

```json
{
  "basics": {
    "name": "", "sex": "", "birthday": "1995-01-01",
    "city": "", "phone": "", "email": "", "wechat": ""
  },
  "selfAssess": "",
  "education": [
    {"school": "", "major": "", "degree": "", "start": "2013-09", "end": "2017-06"}
  ],
  "work": [
    {"company": "", "title": "", "start": "2020-07", "end": "2023-06",
     "description": "", "highlights": [], "salary": 0, "months": 12}
  ],
  "projects": [
    {"name": "", "role": "", "start": "", "end": "", "description": "", "achievement": ""}
  ],
  "jobWant": {
    "jobtitle": "", "city": "", "salaryLow": 0, "salaryHigh": 0,
    "salaryMonths": 12, "workType": "", "industries": [], "workweek": 5
  },
  "skills": [{"name": "", "level": ""}]
}
```

### 4.3 映射表

| 猎聘字段 | 我方字段 | 转换 |
| --- | --- | --- |
| `realName` | `basics.name` | 直接 |
| `sex` | `basics.sex` | 男/女 |
| `birthday` | `basics.birthday` | `YYYYMMDD` ↔ `YYYY-MM-DD` |
| `cityCode` | `basics.city` | 需城市字典 |
| `startJob` + `startJobMonth` | 参加工作年月 | 拆分/合并 |
| `nowWorkStatus` | 求职状态 | 枚举字典 |
| `nowSalary` / `nowMonths` | 当前薪资 | 数字 |
| `jobName` | 当前职位 | 直接 |
| `nowComp` | 当前公司 | 直接 |
| `wechat` | `basics.wechat` | 直接 |
| `politicalStatusCode` | 政治面貌 | 可选，敏感 |
| `selfAssess` | `selfAssess` | 直接/改写 |
| `educ[]` | `education[]` | `school/major/degree/start/end` |
| `work[]` | `work[]` | `compName/rwTitle/workStart/workEnd/duty/...` |
| `proj[]` | `projects[]` | `name/position/start/end/descr/achievement` |
| `jobWant[]` | `jobWant` | `jobtitle/dq/薪资/工作类型` |
| 技能 | `skills` | **猎聘无独立技能接口**；只用于我方匹配/PDF |

### 4.4 更新策略：只补不改

官方 FAQ：Agent 只会补充缺失字段，不会修改/覆盖已填写信息。我们的实现必须一致：

```text
1. get-resume → 现有简历
2. 对比我方 profile
3. 只对“猎聘缺失/为空”的字段生成补充建议
4. 生成 diff 预览
5. 用户逐项确认
6. 调用 add-*/update-* 
7. 重新 get-resume 校验
```

**禁止**：

- 不静默覆盖用户已在猎聘填写的内容；
- 不把“改写”当成“补充”；
- 不在用户未确认时写简历。

### 4.5 新增 vs 更新

- 教育/工作/项目/求职期望：如果猎聘已有对应条目，优先 `update-*`（用 `eduId`/`workId`/`id`）；没有则 `add-*`。
- 需要保存平台返回的 ID，建立 `liepin_resume_links` 映射。
- 如果平台返回结构中没有 ID，重新 `get-resume` 匹配（学校+时间/公司+时间）。

### 4.6 字段缺口

| 缺口 | 影响 | 方案 |
| --- | --- | --- |
| 无独立技能接口 | 技能不能结构化同步 | 技能只进我方匹配/PDF；猎聘侧写进自我评价/工作描述需用户确认 |
| 学历码未知 | 教育更新失败 | 建字典；测试 token 验证 |
| 城市码未知 | 基础资料更新失败 | 建字典；或只更新非城市字段 |
| 求职状态码未知 | 基础资料更新失败 | 建字典；或让用户选 |
| 工作类型码未知 | 工作/求职期望更新失败 | 建字典；或留空 |

---

## 5. 职位搜索

### 5.1 请求

```json
POST /mcp/search-job
{
  "jobName": "Python开发",
  "address": "北京",
  "salaryFloor": "20",
  "salaryCap": "40",
  "salaryKind": "月薪",
  "workExperience": "3-5年",
  "eduLevel": "本科",
  "compNature": "民营",
  "companyName": "",
  "page": 0
}
```

字段均可选；`page=0` 为第一页。

### 5.2 归一化

将搜索结果转成内部 `LiepinJob`：

```text
external_id = jobId
job_kind = jobKind（必须保存）
title = 职位名称
company = 公司名称
city = 地址
salary = 薪资
experience = 工作经验
education = 学历
raw_json = 原始结果
```

**必须保存 `jobKind`**，否则无法投递。

### 5.3 JD 缺口

CLI 没有 detail 接口；搜索结果是否含 JD 全文未知。分两种情况：

**A. 搜索结果含 JD/要求**
→ 正常做“要求 → 证据 → 缺口”匹配。

**B. 只有摘要**
→ 用标题/公司/薪资/地点/经验/学历做结构化匹配；
→ 匹配报告标注“基于有限信息”；
→ 向猎聘申请 detail 接口。

**第一优先级**：用测试 token 跑一次真实搜索，保存 fixture，确认字段。

### 5.4 缓存

- 搜索缓存 5–10 分钟；
- 同一 query 去重；
- 投递前不强制刷新（没有 detail 接口），但检查 `jobId` 是否仍在结果中；
- 失败时降级到缓存并提示“信息可能不是最新”。

---

## 6. 投递

### 6.1 前置校验

```text
1. 猎聘账号已连接，token 未过期
2. 简历版本已冻结
3. 猎聘侧简历完整度足够（get-resume）
4. jobId + jobKind 存在
5. 本地无重复投递
6. 用户已确认
```

### 6.2 请求

```json
POST /mcp/apply-job
{
  "jobId": 123456,
  "jobKind": "2"
}
```

- `jobId` 必须是 int；
- `jobKind` 必须是 "1"/"2"，来自搜索结果；
- 不猜 `jobKind`。

### 6.3 确认页

```text
投递确认
平台：猎聘
职位：Python开发 · 某某科技
简历：猎聘在线简历（或我方定制版）
匹配分：82
提示：猎聘当前不支持投递状态查询，投递后请在猎聘 App 查看 HR 回复。
[ ] 我确认向该职位投递
[取消] [去完善简历] [确认投递]
```

### 6.4 幂等

- 键：`browser_id + liepin + jobId + resume_version_id`（服务端不落库；本地 IndexedDB 幂等）；
- 本地已投 → 提示“已投递”；
- 网络超时 → 先查本地记录；不要盲目重投；
- 平台无“重复投递”错误码文档 → 以本地幂等为主。

### 6.5 响应

平台响应原样保存 `raw_json`；如果返回投递 ID/状态，写入 `liepin_applications`；如果没有，记 `submitted` + 时间。

### 6.6 投递后

- 写 `application_events`：`submitted`；
- 设置提醒：3 天/7 天/14 天；
- 提示用户：“HR 回复会在猎聘 App/短信中，收到后请回来更新状态”；
- 不假装能自动同步。

---

## 7. 状态：手动闭环

### 7.1 为什么手动

官方 FAQ：

> “HR 回复会通过猎聘 App 消息推送和短信通知触达。后续版本将支持 Agent 查询投递进展。”

所以当前没有状态 API。产品必须：

1. **自动记录 `submitted`**；
2. **提醒用户回填**；
3. **手动状态**：已查看/面试/拒绝/Offer/无回应；
4. **可选消息粘贴**：用户粘贴猎聘 App/短信文本，LLM 抽取状态；
5. **反馈调权**：用户评价匹配准确性。

### 7.2 状态机

```text
submitted → viewed → interview → offer
                    ↘ rejected
submitted → no_response（14 天）
submitted → withdrawn
```

### 7.3 提醒节奏

| 时间 | 动作 |
| --- | --- |
| 第 3 天 | “投递已 3 天，有被查看吗？” |
| 第 7 天 | “有面试邀请吗？” |
| 第 14 天 | “还没有回复？可以标记无回应或跟进” |
| 状态变更后 | 询问匹配准确性，进入反馈 |

### 7.4 消息粘贴（可选）

用户粘贴：

> “【猎聘】某某公司邀请你于 11 月 10 日 14:00 面试……”

LLM 输出：

```json
{"status":"interview","company":"某某公司","time":"2025-11-10 14:00","confidence":0.9}
```

用户确认后写时间线。**不要自动读取短信/通知**；只处理用户主动粘贴的内容。

---

## 8. 数据模型

### 8.1 `liepin_accounts`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `user_id` | uuid | 租户 |
| `token_enc` | bytea | 加密 token |
| `token_expires_at` | timestamptz | 生成时间 + 90 天 |
| `status` | text | connected/expired/revoked/error |
| `last_verified_at` | timestamptz | 最近一次 get-resume 成功 |
| `consent_version` | text | 授权文案版本 |
| `created_at` / `updated_at` | timestamptz | — |

唯一索引：`(user_id)`（单平台，一人一个猎聘连接）。

### 8.2 `liepin_resume_links`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `user_id` | uuid | — |
| `resume_version_id` | uuid | 我方版本 |
| `external_edu_id` | text | 猎聘 eduId |
| `external_work_id` | text | 猎聘 workId |
| `external_project_id` | text | 猎聘项目 id |
| `external_job_want_id` | text | 猎聘求职期望 id |
| `last_synced_at` | timestamptz | — |
| `sync_status` | text | ok/pending/conflict/error |

### 8.3 `liepin_jobs`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `job_id` | bigint | 猎聘 jobId |
| `job_kind` | text | "1"/"2" |
| `title` / `company` / `city` | text | — |
| `salary` / `experience` / `education` | text | — |
| `raw_json` | jsonb | 原始搜索结果 |
| `fetched_at` | timestamptz | — |

唯一索引：`(job_id, job_kind)`。

### 8.4 `liepin_applications`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `application_id` | uuid | 内部投递 |
| `job_id` | bigint | 猎聘 jobId |
| `job_kind` | text | 猎聘 jobKind |
| `resume_version_id` | uuid | 投递版本 |
| `status` | text | submitted/viewed/interview/... |
| `status_source` | text | manual/paste/future_api |
| `applied_at` | timestamptz | — |
| `raw_json` | jsonb | 平台响应 |

### 8.5 `liepin_api_logs`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `endpoint` | text | `/mcp/...` |
| `request_id` | text | trace |
| `status_code` | int | HTTP |
| `latency_ms` | int | — |
| `error_code` | text | 平台错误 |
| `created_at` | timestamptz | — |

不记录 token、简历正文、手机号。

### 8.6 `liepin_dictionaries`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `type` | text | degree/city/work_status/... |
| `code` | text | 平台码 |
| `label` | text | 中文标签 |
| `source` | text | 官方/抓包/人工 |
| `verified_at` | timestamptz | 验证时间 |

---

## 9. 频控、队列、错误

### 9.1 频控

- 60 次/分钟/用户 token；
- Redis token bucket；
- 搜索 5–10 分钟缓存；
- 简历读取 1–5 分钟缓存；
- 写操作串行（同一用户）。

### 9.2 队列

- 投递任务入队，串行执行；
- 失败重试 1–2 次，指数退避；
- 401/403 不重试，直接要求重新授权；
- 5xx/网络错误可重试；
- 超过重试上限进入死信，人工处理。

### 9.3 错误映射

| 场景 | 用户提示 | 动作 |
| --- | --- | --- |
| 401/403 | 猎聘授权已过期，请重新生成 token | 跳转授权页 |
| 4xx 参数 | 平台校验失败：... | 展示原文，修正字段 |
| 5xx | 猎聘服务暂时不可用 | 稍后重试 |
| 超时 | 不确定是否成功 | 查本地记录，不重复投递 |
| 频控 | 操作太频繁 | 排队/稍后 |

---

## 10. 安全与合规

| 项 | 要求 |
| --- | --- |
| Token | AES-GCM 加密；KMS；不打印 |
| 传输 | HTTPS；证书校验 |
| 日志 | 脱敏；不记录简历正文/token |
| 权限 | 只有 Adapter 能读 token |
| 审计 | 连接/解绑/简历更新/投递全记录 |
| 用户同意 | 明确“我们将代你操作猎聘账号”；可撤回 |
| 平台条款 | 第三方工具通过服务端代理调用 token 需猎聘书面确认（即使不落库） |
| 数据保留 | 简历/投递按需；支持导出/删除 |
| 合规 | PIPL、ICP；若收费涉及人力资源服务许可证需法务确认 |

---

## 11. 测试策略

### 11.1 单元

- Token 加解密；
- 日期/枚举转换；
- 简历 diff（只补缺失）；
- 幂等键；
- 错误映射。

### 11.2 契约

- 用真实响应 fixture 校验 `get-resume`/`search-job`/`apply-job`；
- 字段缺失/新增时测试失败；
- 固化 `jobId`/`jobKind` 关系。

### 11.3 集成

- 测试账号：连接 → get-resume → search → apply（测试职位）；
- 401/403/5xx/超时注入；
- 频控 60/min 压测。

### 11.4 安全

- Token 不出现在日志/错误页；
- 越权访问他人 token；
- 解绑后无法调用；
- SQL 注入/XSS。

---

## 12. 里程碑

| 阶段 | 工作 | 预估 |
| --- | --- | --- |
| M1 | 抓 fixture、确认字段/字典 | 2 天 |
| M2 | Token 连接/加密/校验 | 2 天 |
| M3 | get-resume 导入/映射 | 3 天 |
| M4 | 简历 diff/补充/确认 | 4 天 |
| M5 | search-job 归一化/缓存 | 3 天 |
| M6 | apply-job/幂等/确认页 | 3 天 |
| M7 | 手动状态/提醒/反馈 | 3 天 |
| M8 | 联调/测试/文档 | 2 天 |

约 **3 周**；如果只做“连接 + 搜索 + 投递 + 手动状态”，可压缩到 **2 周**。

---

## 13. 风险与待确认

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 猎聘不允许第三方工具代理 token | 方案不可用 | 本地伴生 CLI/个人本地版 |
| 搜索结果无 JD | 匹配弱 | 抓 fixture；申请 detail 接口；结构化降级 |
| 无状态 API | 闭环弱 | 手动 + 提醒 + 消息粘贴 |
| 枚举码未知 | 简历更新失败 | 字典表 + 测试 token |
| Token 90 天 | 流失 | 到期提醒 |
| 60/min | 批量受限 | 队列/缓存 |
| 无 LICENSE | 不能拷 CLI 代码 | 自研 HTTP client |
| API 变更 | 适配器失效 | 契约测试/告警 |

**必须确认**：

1. 第三方 Web 工具通过服务端代理调用 token 是否允许（即使不落库）？
2. 服务端调用是否允许？IP 限制？
3. 是否有职位详情/JD 接口？
4. 状态查询 API 排期？
5. 学历/城市/求职状态字典？
6. 商业化/数据使用条款？

---

## 14. 结论

猎聘接入的技术难度不高：**一个 header、几个 REST 端点、无签名、无 OAuth**。真正的难点是：

1. **Token 模式**：用户要手动生成/粘贴，90 天过期；
2. **状态缺口**：只能投递，不能查状态；
3. **JD 缺口**：只有 search，没有 detail；
4. **字典缺口**：学历/城市/求职状态码未知；
5. **条款**：第三方工具代理 token 需猎聘确认。

建议先做 **2 天 fixture 验证**：用个人 token 跑 `get-resume`、`search-job`、`apply-job`，把真实响应存下来。所有字段映射、匹配逻辑、PRD 细节都应以这份 fixture 为准，而不是以 README 的示例为准。
