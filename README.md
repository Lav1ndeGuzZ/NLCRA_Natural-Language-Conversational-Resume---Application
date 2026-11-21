# NLCRA · 自然语言对话式简历生成与精准投放

一个面向学生/求职者的单用户求职工作台：用自然语言对话梳理经历，系统先分析再生成结构化简历，随后完成岗位匹配、多渠道投递、回信解析与状态跟踪。

- 前端：React 19 + Vite + Ant Design 6 + TanStack Query + Zustand
- 后端：Python 3.12+ / FastAPI / Pydantic v2 / SQLite
- 模型：DeepSeek（OpenAI 兼容接口，服务端配置）
- 投递渠道：猎聘 Agent API、QQ 邮箱 SMTP、公司官网爬虫
- 回信渠道：QQ 邮箱 IMAP

> 当前定位是**可运行的初赛交付版本**：核心闭环已实现，真实 QQ 发信/收信需要用户自备邮箱授权码；部分企业官网受反爬或 JS 渲染影响，可能抓不到邮箱。

---

## 1. 核心能力

### 简历生成

- 对话引导采集 6 类信息：
  1. 项目/课题
  2. 学校、专业、成绩（GPA/排名/均分）
  3. 工作/实习经历
  4. 技能
  5. 项目经验
  6. 求职意向
- **先分析再填充**：先输出优势、缺口、修改建议和完整度评分，再进入模板预览。
- 结构化 JSON 持久化到 SQLite。
- 4 套简历模板：经典单栏、现代蓝线、紧凑一页、稳重深色。
- 支持导出 **DOCX** 和 **PDF**。

### 岗位匹配与邮件投递

- 输入求职意向，调用猎聘 `search-job` 检索岗位。
- 规则评分 + DeepSeek 评分，输出匹配项、缺口和建议。
- 从岗位数据中提取招聘邮箱；没有邮箱时可手动填写。
- QQ 邮箱 SMTP 发信，自动附带 DOCX + PDF 简历。
- 邮件内容包含：抬头、岗位匹配说明、正文、落款。

### 官网渠道

- 按求职意向/关键词搜索企业招聘官网。
- 优先使用最近一次职位搜索得到的公司名单，逐家定位官网。
- 抓取职位列表 → 进入职位详情页 → 提取岗位和招聘邮箱。
- 有 SSRF 防护，只允许公开 http/https 地址。
- 抓取结果可一键填入邮件投递。

### 回信与状态闭环

- QQ 邮箱 IMAP 同步回信。
- 自动分类：面试邀请、Offer、未通过、已查看、其他。
- 按招聘邮箱/公司/岗位匹配投递记录，自动更新状态。
- 未读回信进入工作台提醒；投递 3/7/14 天未更新也会提醒。
- 支持手动改状态，并区分「手动」和「邮件回信」来源。

---

## 2. 业务闭环

```text
对话采集
  → 结构化抽取
  → 简历分析（优势/缺口/建议）
  → 模板简历 + JSON 保存
  → 求职意向
  → 猎聘职位匹配
  → 确认投递（猎聘 API / QQ 邮件 / 官网渠道）
  → 回信同步与解析
  → 状态更新 + 主动提醒
  → 下一轮匹配/投递
```

---

## 3. 目录结构

```text
backend/
  app/
    api/            health / demo / liepin / llm / match / resume /
                    applications / email / official / reminders
    services/       deepseek / liepin / extract / match / store /
                    resume_docx / resume_pdf / resume_templates /
                    resume_analyze / emailer / crawler / company_search
    models/         Pydantic 数据模型
    db.py           SQLite schema 与迁移
    main.py         FastAPI 入口
  requirements.txt
frontend/
  src/
    pages/          工作台 / 连接猎聘 / 职位 / 投递中心 /
                    简历中心 / 对话助手 / 设置
    api/client.ts   所有前端 API 调用
    store/session.ts
Dockerfile.web      React build + Caddy
Caddyfile           静态页 + /api 反代
docker-compose.yml  api + web
.env.example        Docker 部署环境变量示例
backend/.env.example 本地后端环境变量示例
```

`docs/` 与 `research/` 已在 `.gitignore` 中排除，不随仓库上传。

---

## 4. 本地运行

### 4.1 环境要求

- Python 3.12+
- Node.js 20+（推荐 22/24）
- npm

### 4.2 后端

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
# source .venv/bin/activate

pip install -r backend/requirements.txt

# Windows
copy backend\.env.example backend\.env
# macOS / Linux
# cp backend/.env.example backend/.env

# 编辑 backend/.env，至少按需填写 DEEPSEEK_API_KEY
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

接口文档：<http://127.0.0.1:8000/docs>

健康检查：<http://127.0.0.1:8000/api/health>

### 4.3 前端

```bash
cd frontend
npm install
npm run dev
```

打开 <http://127.0.0.1:5173>。Vite 会把 `/api` 代理到 `127.0.0.1:8000`。

### 4.4 VS Code 一键启动

已提供 `.vscode/tasks.json`：

1. VS Code 打开项目；
2. `Terminal → Run Task...`；
3. 选择 **启动全部（前端 + 后端）**；
4. 打开 <http://127.0.0.1:5173>。

也可以单独运行 **后端: 启动** / **前端: 启动**。

### 4.5 不配置外部服务也能跑

- 未配置 DeepSeek Key：使用演示回复和规则匹配；
- 未连接猎聘：职位页使用演示职位；
- 未配置 QQ 邮箱：邮件发送/回信同步会提示先填写授权码；
- 官网爬虫只依赖公网访问，不需要额外 Key。

---

## 5. 环境变量

### 本地：`backend/.env`

| 变量 | 说明 |
| --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek Key，仅服务端使用；为空时进入演示模式 |
| `DEEPSEEK_BASE_URL` | 默认 `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 默认 `deepseek-chat` |
| `APP_ACCESS_CODE` | 可选共享访问码；设置后所有 `/api` 请求需携带 `x-access-code` |
| `DATABASE_PATH` | SQLite 路径，默认 `backend/data/nlcra.db` |
| `DEMO_MODE` | 是否允许无 Key 时使用演示数据 |
| `CORS_ORIGINS` | 本地开发跨域来源 |

### Docker：项目根目录 `.env`

Docker Compose 的 `api` 服务读取根目录 `.env`，字段与 `backend/.env` 基本一致。

```bash
cp .env.example .env
# 编辑 .env：DEEPSEEK_API_KEY / APP_ACCESS_CODE / DEMO_MODE
docker compose up -d --build
```

打开 <http://服务器IP:8080>。

- `api`：FastAPI，仅在 Compose 内网暴露 `8000`；
- `web`：Caddy，静态页 + `/api` 反代；
- SQLite 数据默认在容器可写目录，生产部署建议挂载持久化卷。

### 凭证说明

| 凭证 | 存放位置 | 是否入库 |
| --- | --- | --- |
| 猎聘 token | 浏览器 `sessionStorage` + 请求头 `x-user-token` | 否 |
| QQ 邮箱 / 授权码 | 浏览器 `sessionStorage` + 请求头 `x-qq-email` / `x-qq-auth-code` | 否 |
| DeepSeek Key | 服务端环境变量 | 否 |
| 简历/对话/投递记录 | 本地 SQLite | 是，按匿名 `session_id` 隔离 |

---

## 6. 使用流程

1. **连接猎聘**
   - 打开「连接猎聘」，按页面提示到猎聘 MCP 授权页生成 token；
   - token 只保存在当前浏览器会话。

2. **对话采集**
   - 打开「对话助手」，按 6 类信息逐步回答；
   - 助手一次只追问一个关键问题。

3. **分析与生成简历**
   - 对话整理后，系统先分析简历，再进入「简历中心」；
   - 选择模板，按建议补充缺口；
   - 保存 JSON，导出 DOCX/PDF。

4. **岗位匹配**
   - 在「职位搜索」输入关键词/城市/薪资；
   - 搜索真实猎聘职位，点击「匹配分析」查看分数和缺口；
   - 有招聘邮箱的职位可直接点「邮件」进入投递中心。

5. **邮件 / 官网投递**
   - 在「投递中心」填写 QQ 邮箱和 SMTP/IMAP 授权码；
   - 生成匹配说明，检查正文后发送；
   - 或在「官网渠道」按意向搜索企业官网，抓取职位后投递。

6. **回信与状态**
   - 点「同步收件箱回信」；
   - 系统解析回信并更新投递状态；
   - 工作台会显示未读回信和 3/7/14 天跟进提醒。

---

## 7. 主要接口

### 健康与配置

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康检查、DeepSeek/演示模式状态 |
| `GET` | `/api/config` | 前端可见的配置状态 |

### 简历

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/resume/templates` | 模板列表 |
| `POST` | `/api/resume/extract` | 从对话抽取结构化简历 |
| `POST` | `/api/resume/analyze` | 简历分析与缺口 |
| `GET/PUT` | `/api/resume` | 读取/保存简历与模板 |
| `POST` | `/api/resume/export/docx` | 导出 DOCX |
| `POST` | `/api/resume/export/pdf` | 导出 PDF |

### 对话与匹配

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/llm/chat` | 非流式对话 |
| `POST` | `/api/llm/chat/stream` | SSE 流式对话 |
| `GET/PUT` | `/api/llm/history` | 对话历史 |
| `POST` | `/api/match/score` | 简历 × 职位匹配评分 |

### 猎聘

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/liepin/resume` | 读取猎聘简历 |
| `POST` | `/api/liepin/jobs/search` | 搜索职位，支持多页合并 |
| `POST` | `/api/liepin/apply` | 猎聘投递 |

### 邮件 / 官网 / 状态

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/email/draft` | 生成岗位匹配邮件 |
| `POST` | `/api/email/send` | 发送邮件 + 简历附件 |
| `POST` | `/api/email/sync` | 同步 QQ 收件箱回信 |
| `GET` | `/api/email/replies` | 回信列表 |
| `POST` | `/api/email/replies/read` | 标记回信已读 |
| `POST` | `/api/official/discover` | 按意向/关键词发现企业招聘官网 |
| `POST` | `/api/official/crawl` | 抓取官网职位与邮箱 |
| `GET` | `/api/official/jobs` | 已抓取的官网职位 |
| `GET` | `/api/applications` | 投递记录 |
| `POST` | `/api/applications` | 创建投递记录 |
| `PATCH` | `/api/applications/{id}` | 更新状态/备注/来源 |
| `GET` | `/api/reminders` | 跟进提醒与未读回信 |

请求头：

- `x-user-token`：猎聘 token；
- `x-access-code`：设置了 `APP_ACCESS_CODE` 时需要；
- `x-session-id`：匿名数据隔离标识；
- `x-qq-email` / `x-qq-auth-code`：QQ 邮箱连接器凭证，仅邮件接口使用。

---

## 8. 测试与检查

```bash
# 后端语法检查
python -m compileall backend/app

# 前端构建
cd frontend
npm run build
```

手工验收建议：

- [ ] 未配置 Key 时，对话/匹配走演示模式；
- [ ] 配置 DeepSeek 后，`/api/health` 显示 `deepseek_configured=true`；
- [ ] 对话采集后能先分析、再保存、再导出 DOCX/PDF；
- [ ] 4 套模板导出结果不同；
- [ ] 猎聘 token 能读取简历、搜索职位；
- [ ] 无邮箱职位可手动填邮箱后发送；
- [ ] QQ 邮箱能发出带 DOCX + PDF 的邮件；
- [ ] 官网 URL 能抓出职位和邮箱；
- [ ] IMAP 同步后回信能匹配投递记录并更新状态；
- [ ] 工作台能看到未读回信和 3/7/14 天提醒。

---

## 9. 已知边界

- **猎聘不支持投递状态查询**：状态主要靠用户手动回填或 QQ 回信同步。
- **猎聘没有独立职位详情接口**：JD 全文和招聘邮箱不一定随搜索结果返回；缺失时需手动填写或走官网渠道。
- **QQ 邮箱需自行开启 SMTP/IMAP 并生成授权码**，不能使用 QQ 登录密码；真实发信/收信未在仓库内置测试账号。
- **官网爬虫是有限抓取**：只抓公开页面，最多 12 个职位；JS 渲染、验证码、反爬可能导致邮箱缺失。
- **回信分类是关键词规则**：模糊邮件会归为「其他」，不会强行改状态。
- **单个匿名 session 不是认证**：公开部署请设置 `APP_ACCESS_CODE`，不要把 SQLite 直接暴露到公网。
- **发送前保留用户确认**：当前不会无人确认地批量群发邮件。
- **PDF 依赖 `reportlab`**：部署时通过 `backend/requirements.txt` 安装。

---

## 10. 常见问题

### 端口被占用

```powershell
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

### 前端 5173 被占用

Vite 会自动切换到 5174；以终端输出为准。

### `DEEPSEEK_API_KEY` 已填但仍是演示模式

- 确认修改的是实际启动目录对应的 `.env`；
- 本地后端读 `backend/.env`，Docker 读根目录 `.env`；
- 修改后重启后端进程。

### QQ 邮件发送失败

- 确认使用 **SMTP 授权码**，不是 QQ 密码；
- 确认 QQ 邮箱网页版已开启 SMTP/IMAP；
- 检查网络是否允许访问 `smtp.qq.com:465` / `imap.qq.com:993`。

### 官网抓不到职位或邮箱

- 换职位列表页/具体职位页，而不是首页；
- 部分官网是 JS 渲染，爬虫只能拿到静态 HTML；
- 可在投递中心手动填写招聘邮箱。

---

## 11. 仓库

<https://github.com/Lav1ndeGuzZ/NLCRA_Natural-Language-Conversational-Resume---Application>

当前代码为单用户、无登录的可部署工具；`docs/` 与 `research/` 仅保留在本地，不进入仓库。
