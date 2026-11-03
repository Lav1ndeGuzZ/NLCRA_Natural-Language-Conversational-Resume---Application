# 猎聘 Agent 接入可行性（单平台方案）

**版本：** v0.2
**日期：** 2026-11-03
**范围：** 中国市场 / 无登录工具（可部署） / **只接入猎聘**
**官方入口：** <https://www.liepin.com/mcp/auth>
**提交主文档：** [05-可行性验证设计文档（精简版）](05-可行性验证设计文档（精简版）.md)

---

## 0. 结论

### 0.1 一句话

**猎聘可以接，而且有官方授权页和官方 CLI；但它不是标准的远程 MCP Server，而是一个“本地 CLI + REST API”的 Agent 接入方式。对无登录 Web 工具来说，最可行的做法是：用户在自己的猎聘账号生成 token，粘贴到我们的产品；后端用 `x-user-token` 调 `https://open-agent.liepin.com/mcp/*`，token 不落库。**

### 0.2 能做什么

| 能力 | 官方支持 | 说明 |
| --- | :---: | --- |
| 读取简历 | ✅ | `GET /mcp/get-resume` |
| 更新基础资料 | ✅ | `/mcp/update-base-info` |
| 更新自我评价 | ✅ | `/mcp/update-self-assess` |
| 新增/更新教育经历 | ✅ | `/mcp/add-edu-exp`、`/mcp/update-edu-exp` |
| 新增/更新工作经历 | ✅ | `/mcp/add-work-exp`、`/mcp/update-work-exp` |
| 新增/更新项目经历 | ✅ | `/mcp/add-project-exp`、`/mcp/update-project-exp` |
| 新增/更新求职期望 | ✅ | `/mcp/add-job-want`、`/mcp/update-job-want` |
| 搜索职位 | ✅ | `POST /mcp/search-job` |
| 投递职位 | ✅ | `POST /mcp/apply-job` |
| 查询投递进展 | ❌ 暂不支持 | 官方 FAQ：后续版本支持；当前 HR 回复走猎聘 App 推送/短信 |
| HR 聊天 | ❌ | 需回猎聘 App |
| 面试安排 | ❌ | 需回猎聘 App |
| 标准 MCP 协议 | ❌ | 不是 `mcpServers` 那种 JSON-RPC Server；是 CLI + REST |

### 0.3 关键限制

| 限制 | 数值/说明 | 影响 |
| --- | --- | --- |
| Token 有效期 | 90 天 | 到期需用户重新生成；产品要做到期提醒 |
| 频控 | 60 次/分钟 | 搜索/查看/简历更新/投递共用；要做队列和缓存 |
| 认证方式 | 用户登录猎聘后生成 `x-user-token` | 没有 OAuth；用户需复制粘贴 token |
| 能力范围 | 搜索、查看、完善简历、投递 | 不能查状态、不能聊天、不能约面试 |
| 投递参数 | `jobId` + `jobKind` 必填 | `jobKind` 必须来自搜索结果，不能猜 |
| 简历更新 | 官方说明：Agent 只补充缺失字段，不覆盖已有信息 | 我们也要做 diff + 用户确认 |
| 许可 | CLI 仓库暂无 LICENSE 文件 | 不要直接拷贝 CLI 代码；按 API 契约自研 |
| 第三方工具代理 | 官方页面面向个人 Agent | 用服务端代理调用 token 需与猎聘确认条款（即使不落库） |

---

## 1. 官方入口与形态

### 1.1 官方页面

<https://www.liepin.com/mcp/auth> 是猎聘的“授权配置”页，页面标题是“猎聘 CLI”，内容包含：

- CLI 安装说明；
- 授权 Token 生成（登录后点击“立即生成凭证”）；
- CLI 能力说明；
- 使用限制与安全边界；
- 飞书内测群入口。

**结论：这是“猎聘 CLI 的 Agent 接入”，不是标准的远程 MCP Server。** 页面路径里虽然有 `/mcp`，但实际交互是：

```text
用户在猎聘网页登录 → 生成 x-user-token → 配置到本地 CLI / Agent
CLI 调用 https://open-agent.liepin.com/mcp/* → 猎聘账号内执行
```

### 1.2 官方 CLI

官方页面链接的仓库：<https://github.com/liepin-tech-2026/liepin-cil>

- Python 3.11+，Typer + Pydantic + requests；
- 命令：`setup`、`auth`、`resume`、`job`、`skill`；
- 支持 `--output json`，适合 Agent 解析；
- 请求前做 JSON Schema/Pydantic 校验；
- Token 优先级：`--token` > `LIEPIN_USER_TOKEN` > `~/.config/liepin-cli/config.json`；
- 错误：401/403 提示重新授权；退出码 0/1/2。

### 1.3 API 形态

从 CLI 源码可确认：

```text
Base URL: https://open-agent.liepin.com
Header:   x-user-token: <token>
Method:   GET / POST
Body:     application/json
```

这不是 MCP JSON-RPC，而是普通 REST。对我们来说反而更好接：不需要实现 MCP 协议，直接做 HTTP Adapter 即可。

---

## 2. 能力矩阵（官方 CLI 暴露的范围）

| 模块 | 命令/接口 | 关键字段 | 备注 |
| --- | --- | --- | --- |
| 读取简历 | `resume get` / `GET /mcp/get-resume` | 全量简历 JSON | 用于导入/对照 |
| 基础资料 | `resume update-base-info` / `POST /mcp/update-base-info` | `realName`、`sex`、`birthday`、`cityCode`、`startJob`、`startJobMonth`、`nowWorkStatus`、`nowSalary`、`jobName`、`nowComp`、`wechat`、`politicalStatusCode` 等 | `birthday=YYYYMMDD`；`startJob=YYYY` + `startJobMonth=MM` 必须成对 |
| 自我评价 | `resume update-self-assess` | `selfAssess` | 纯文本 |
| 教育 | `add-edu-exp` / `update-edu-exp` | `school`、`major`、`start`、`end`、`degree`、`tz`、`experience` | `start/end=YYYYMM`；`degree` 是枚举码 |
| 工作 | `add-work-exp` / `update-work-exp` | `compName`、`workStart`、`workEnd`、`rwTitle`、`jobtitle`、`dq`、`dept`、`duty`、`salary`、`months`、`compkind`、`compscale`、`workType` | `workStart/End=YYYYMM`；`workType=1/2` |
| 项目 | `add-project-exp` / `update-project-exp` | `name`、`start`、`end`、`compName`、`position`、`descr`、`duty`、`achievement` | `start/end=YYYYMM` |
| 求职期望 | `add-job-want` / `update-job-want` | `jobtitle`、`dq`、`wantSalaryLow`、`wantSalaryHigh`、`wantSalaryMonths`、`workType`、`industries`、`otherExpectDqs`、`workweek`、`practiceMonths` | `dq` 可用城市名；薪资为月薪 |
| 职位搜索 | `job search` / `POST /mcp/search-job` | `jobName`、`address`、`salaryFloor`、`salaryCap`、`salaryKind`、`workExperience`、`eduLevel`、`compNature`、`companyName`、`page` | 首页 `page=0` |
| 职位投递 | `job apply` / `POST /mcp/apply-job` | `jobId`（int）、`jobKind`（"1"/"2"） | `jobKind` 必须复用搜索结果 |

### 2.1 简历能力缺口

官方 CLI 没有单独的“技能”模块。简历里的技能可能只能：

- 写进 `selfAssess`；
- 写进工作/项目描述的 `duty`/`achievement`；
- 或依赖猎聘网页端已有字段。

**影响**：我们不能假设“技能”能结构化同步到猎聘；我们的技能数据主要用于**匹配报告**和**PDF/DOCX 简历**，猎聘侧只同步它支持的字段。

### 2.2 职位能力缺口

CLI 只有 `search` 和 `apply`，**没有单独的职位详情接口**。需要确认搜索结果是否包含：

- JD 全文/要求；
- 公司信息；
- 职位 URL；
- `jobKind`；
- 截止时间。

如果没有 JD 全文，匹配报告只能基于标题/公司/薪资/地点/经验/学历等结构化字段，精准度会下降。**这是接入前必须用测试 token 抓一次真实响应的原因。**

### 2.3 状态能力缺口（最重要）

官方 FAQ 明确：

> “HR 回复会通过猎聘 App 消息推送和短信通知触达。后续版本将支持 Agent 查询投递进展，但即时沟通建议回到猎聘 App 完成。”

也就是说，**当前 API 只能投递，不能查状态**。这会直接影响赛题 R5/R6 的“状态跟踪 + 主动提醒 + 反馈优化”。

---

## 3. 认证、Token 与频控

### 3.1 用户流程

```text
用户打开我们的产品
  → 点击“连接猎聘”
  → 跳转/新开 https://www.liepin.com/mcp/auth
  → 用户登录猎聘，点击“立即生成凭证”
  → 复制 x-user-token
  → 粘贴到我们的授权页
  → 我们调用 GET /mcp/get-resume 验证
  → 加密保存，显示“已连接”
```

**没有 OAuth。** 这是“个人访问令牌（PAT）”模式，类似 GitHub Token。

### 3.2 Token 生命周期

| 项 | 说明 |
| --- | --- |
| 有效期 | 90 天 |
| 刷新 | 无 refresh token；到期重新生成 |
| 重置 | 用户在猎聘页面重置，旧 token 立即失效 |
| 存储 | AES-256-GCM 加密；KMS/Secrets Manager 管理密钥 |
| 日志 | 绝不打印 token、请求头、简历正文 |
| 解绑 | 删除 token；提示用户可在猎聘侧重置 |
| 到期提醒 | 提前 7/3/1 天站内信/邮件提醒 |

### 3.3 频控

- 60 次/分钟，搜索/查看/简历更新/投递共用；
- 按“用户 token”维度做令牌桶，不是按 IP；
- 搜索缓存 5–10 分钟；简历读取缓存 1–5 分钟；
- 写操作串行化，避免同一用户并发更新简历；
- 批量投递要排队，不能瞬间打满 60 次。

### 3.4 错误处理

| HTTP/退出码 | 含义 | 处理 |
| --- | --- | --- |
| 401/403 | token 无效/过期 | 停止操作，提示重新生成 token |
| 4xx | 参数/业务错误 | 展示平台返回信息；修正后重试 |
| 5xx | 平台故障 | 指数退避；熔断；稍后重试 |
| 网络超时 | 不确定是否成功 | 先查本地记录/重新搜索；不要盲目重复投递 |
| CLI exit 2 | 本地校验失败 | 修正字段；不要发请求 |

---

## 4. 无登录 Web 的三种接法

| 方案 | 做法 | 优点 | 缺点 | 推荐 |
| --- | --- | --- | --- | --- |
| A. 服务端 HTTP Adapter | 后端直接调 `open-agent.liepin.com/mcp/*`，带用户 token（逐请求，不落库） | 简单、可扩展、好观测、无进程开销 | 需确认猎聘是否允许第三方工具代理；需自研契约 | ⭐⭐⭐⭐⭐ |
| B. 服务端 CLI 子进程 | 每次请求 `subprocess` 调 `liepin-cli --token ... --output json` | 复用官方校验；开发快 | 进程开销、并发差、token 可能出现在进程参数、错误处理弱、无 LICENSE | ⭐⭐（仅原型） |
| C. 本地伴生 CLI | 用户本机装 CLI，我们的 Web 通过本地桥调用 | 最贴近官方设计；token 不出本机 | 不是纯 Web；评委/用户安装成本高 | ⭐⭐⭐（高级用户） |

**建议：A 为主，C 为辅，B 只用于早期联调。**

### 4.1 为什么 A 可行

CLI 本身就是 HTTP 客户端：

```text
GET  https://open-agent.liepin.com/mcp/get-resume
POST https://open-agent.liepin.com/mcp/search-job
POST https://open-agent.liepin.com/mcp/apply-job
Header: x-user-token: <token>
```

我们按同样的契约实现自己的 client，不拷贝 CLI 代码，不依赖 Python 进程。

### 4.2 必须先确认的条款

官方页面说“Token 仅用于代替你操作猎聘平台”“Agent 只能执行搜索、查看、完善简历和投递操作”。这听起来允许 Agent 操作，但**是否允许第三方 Web 工具通过服务端代理调用用户 token（即使不落库）**，需要猎聘书面确认：

- 是否允许第三方工具（含服务端代理）使用？
- 是否允许服务端逐请求转发 token（不持久化）？
- 是否有 IP 白名单/来源限制？
- 是否有 IP 白名单/来源限制？
- 是否允许商业化/收费？
- 数据使用、保存、删除要求？
- 是否允许我们展示/缓存职位数据？

**在确认前，代码可以按契约开发，但不能公开运营。**

---

## 5. “只接入猎聘”对产品的影响

### 5.1 用户定位要调整

猎聘偏中高端/社招，不是实习/校招的主场。原来 PRD 把“应届生/实习生”当 P0，需要改成：

| 用户 | 原优先级 | 新优先级 | 原因 |
| --- | --- | --- | --- |
| 1–5 年社招 | P1 | **P0** | 猎聘覆盖最好，简历/职位字段匹配 |
| 中高端/管理 | P2 | P1 | 猎聘强项，但匹配要求更高 |
| 应届生/实习生 | P0 | P2 | 猎聘不是主战场；本项目不再接实习僧 |
| 蓝领/服务业 | P2 | 不做 | 猎聘不匹配 |

### 5.2 闭环要“降级但诚实”

没有状态 API，R5/R6 不能做成“自动同步已读/面试/拒绝”。可行方案：

1. **投递成功**：API 返回成功即记 `submitted`。
2. **状态自报**：3/7/14 天后提醒用户“有回复了吗？”，用户手动选已读/面试/拒绝/无回应。
3. **消息粘贴**：用户把猎聘 App/短信内容粘贴进来，LLM 抽取状态（可选）。
4. **反馈调权**：用户对匹配准确性打分，系统调整权重。
5. **未来升级**：猎聘开放状态查询后，替换为自动同步。

**答辩时要说清楚**：不是我们不做自动状态，是猎聘当前 Agent API 不提供；我们用“用户自报 + 提醒 + 反馈”完成闭环，等官方开放后无缝升级。

### 5.3 职位匹配要“看菜下饭”

如果搜索结果没有 JD 全文：

- 用标题/公司/薪资/地点/经验/学历做结构化匹配；
- 用 LLM 生成“有限信息匹配报告”，标注置信度；
- 不要假装有全文 JD 的精准度。

如果搜索结果有 JD 全文：按原计划做“要求 → 证据 → 缺口”。

**接入前必须用测试 token 跑一次 `job search --output json`，把真实响应存成 fixture。** 这是第一优先级技术验证。

### 5.4 简历同步要“只补不改”

官方 FAQ 说 Agent 只补充缺失字段，不覆盖已有信息。我们的实现也要：

- `get-resume` 拉取现有简历；
- 对比我方结构化资料；
- 只对缺失字段生成 `add-*`/`update-*` 建议；
- 用户逐项确认；
- 绝不静默覆盖猎聘上已有内容。

---

## 6. 实施路线

### Phase 0：验证（1–2 天）

- 用个人猎聘账号生成 token；
- 跑 `liepin-cli resume get --output json`，保存响应；
- 跑 `liepin-cli job search --job-name "..." --address "..." --output json`，保存响应；
- 确认：搜索结果是否含 JD、`jobId`、`jobKind`、URL、公司信息；
- 确认：`get-resume` 的字段结构、必填项、枚举码；
- 确认：token 是否能从服务器 IP 调用（不是只限本地）。

### Phase 1：Adapter（1 周）

- HTTP client + token 加密；
- `get-resume` 导入/对照；
- `search-job` 归一化；
- `apply-job` 投递 + 幂等；
- 错误处理/频控/日志；
- 用 fixture 做契约测试。

### Phase 2：产品闭环（1 周）

- “连接猎聘”授权页；
- 简历同步 diff + 确认；
- 匹配报告（按可用字段）；
- 投递确认 + 时间线；
- 手动状态 + 提醒；
- 反馈调权。

### Phase 3：增强（后续）

- 猎聘状态 API（等官方）；
- 消息粘贴解析；
- 多简历版本；
- 数据看板。

**总工期：约 2 周（不含商务确认/测试 token 等待）。**

---

## 7. 风险与待确认

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 猎聘不允许第三方工具代理调用 token | 方案 A 不可用 | 转本地伴生 CLI（方案 C）；或只做个人本地版 |
| 无状态 API | 闭环弱 | 手动状态 + 提醒 + 消息粘贴；答辩说明 |
| 搜索结果无 JD | 匹配不准 | 先抓 fixture；向猎聘申请详情接口；用结构化字段降级 |
| 学历/城市/求职状态枚举码未知 | 简历同步失败 | 用测试 token 抓字典；建立映射表 |
| Token 90 天到期 | 用户流失 | 到期提醒；一键重连 |
| 60 次/分钟 | 批量投递受限 | 队列 + 缓存 + 串行 |
| CLI 仓库无 LICENSE | 不能拷代码 | 自研 HTTP client；只参考契约 |
| API 变更 | 适配器失效 | 契约测试；错误告警；版本化 |
| 猎聘偏社招 | 校招用户价值低 | 产品定位转向 1–5 年社招 |

**必须找猎聘确认的 6 个问题**：

1. 是否允许第三方 Web 工具通过服务端代理调用用户 token（即使不落库）？
2. 是否允许服务端调用（非本地 CLI）？有无 IP/来源限制？
3. 是否有职位详情接口/完整 JD？搜索结果字段清单？
4. 投递状态查询 API 的排期？
5. 学历/城市/求职状态等枚举字典在哪里获取？
6. 商业化/收费/数据使用条款？

---

## 8. 结论

- **能接**：官方授权页 + CLI + REST API，能力覆盖“读简历、改简历、搜职位、投职位”。
- **不是标准 MCP**：是 CLI + REST，需要我们自己写 Adapter。
- **最大缺口是状态**：当前只能投递，不能查已读/面试/拒绝；闭环要靠手动状态 + 提醒 + 反馈。
- **最大机会是单平台聚焦**：只接猎聘，可以把“简历同步、职位匹配、投递确认、时间线”做深，而不是做一堆半成品适配器。
- **最大风险是条款**：第三方工具通过服务端代理调用 token 必须得到猎聘确认；否则只能做本地伴生 CLI 或个人本地版。

> 建议：先用个人 token 跑通 `resume get` + `search-job` + `apply-job`，拿到真实响应后再定 PRD 细节；不要在没有 fixture 的情况下写死字段映射。
