# NLCRA · 对话式求职工作台

无登录、单用户、只接入猎聘的求职工具。前端 React + Ant Design，后端 Python + FastAPI，默认数据留在浏览器。

> 当前是**可行性版本（v0.1）**：跑通“连接猎聘 / 演示职位 / 简历展示 / DOCX 导出 / DeepSeek 对话”的基础链路，真实投递与简历同步待联调。

## 目录

```text
backend/                FastAPI 无状态后端
  app/
    api/                health / demo / liepin / llm / resume
    services/           LiepinClient / DeepSeekClient / DOCX 导出
    models/             Pydantic schemas
  requirements.txt
frontend/               React 19 + Vite + Ant Design 5/6
  src/pages/            工作台/连接猎聘/职位/简历/对话/设置
Dockerfile.web          React build + Caddy
Caddyfile               / → 静态页，/api → FastAPI
docker-compose.yml      api + web
.env.example            部署环境变量
```

## 本地运行

### 1. 后端

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
# source .venv/bin/activate

pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
# 可选：编辑 backend/.env，填 DEEPSEEK_API_KEY

cd backend
uvicorn app.main:app --reload --port 8000
```

打开 <http://127.0.0.1:8000/docs> 查看接口。

### 2. 前端

```bash
cd frontend
npm install
npm run dev
```

打开 <http://127.0.0.1:5173>。Vite 会把 `/api` 代理到 `8000`。

### 3. 不配 Key 也能跑

- 未连接猎聘：职位页使用演示数据，投递是演示投递；
- 未配置 DeepSeek：对话返回固定演示回复；
- 连接猎聘：在「连接猎聘」页按提示到 <https://www.liepin.com/mcp/auth> 生成 token，粘贴即可。

> token 只存 `sessionStorage`，关闭标签页失效；后端不落库、不写日志。

## Docker 部署

```bash
cp .env.example .env
# 编辑 .env：DEEPSEEK_API_KEY、APP_ACCESS_CODE、DEMO_MODE
docker compose up -d --build
```

打开 <http://服务器IP:8080>。

- `api`：FastAPI，仅内网 `8000`；
- `web`：Caddy，静态页 + `/api` 反代；
- DeepSeek Key 只在 `.env`，用户无需填写；
- `APP_ACCESS_CODE` 可选：设置后首次打开需输入共享访问码（不是账号）。

## 当前接口

| 接口 | 说明 |
| --- | --- |
| `GET /api/health` | 健康检查、DeepSeek/演示模式状态 |
| `GET /api/demo/resume` | 演示简历 |
| `GET /api/demo/jobs` | 演示职位 |
| `POST /api/demo/apply` | 演示投递 |
| `GET /api/liepin/resume` | 代理猎聘 `get-resume`（需 `x-user-token`） |
| `POST /api/liepin/jobs/search` | 代理猎聘 `search-job` |
| `POST /api/liepin/apply` | 代理猎聘 `apply-job` |
| `POST /api/llm/chat` | DeepSeek 对话；无 Key 时演示回复 |
| `POST /api/resume/export/docx` | 生成 DOCX |
| `POST /api/resume/export/pdf` | 暂返回 501，当前用浏览器打印 |

请求头：

- `x-user-token`：猎聘 token；
- `x-access-code`：设置了 `APP_ACCESS_CODE` 时需要。

## VS Code 一键启动/重启

已提供 `.vscode/tasks.json`：

1. VS Code 打开项目；
2. `Terminal → Run Task...`；
3. 选择 **启动全部（前端 + 后端）**；
4. 浏览器打开 <http://127.0.0.1:5173>。

单独启动：

- **后端: 启动** → `http://127.0.0.1:8000`
- **前端: 启动** → `http://127.0.0.1:5173`

重启：在 VS Code 终端面板点垃圾桶停止旧任务，再重新 Run Task。  
如果端口被占用：

```powershell
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

## 已知边界

- 猎聘 Agent API 暂不支持查询投递状态；投递后需手动回填/到猎聘 App 查看；
- 猎聘只有 `search-job` / `apply-job`，没有独立职位详情接口；JD 全文是否可得需用真实 token 验证；
- 简历同步遵循“只补缺失、不覆盖已有”，当前版本先做读取与展示；
- PDF 导出暂用浏览器打印，后续接 WeasyPrint/Chromium；
- 无登录意味着无跨设备同步；数据在浏览器本地。

## 下一步

1. 用真实猎聘 token 验证 `resume` / `search` / `apply` 并保存 fixture；
2. 补简历“只补不改”的 diff + 确认页；
3. 补投递时间线与手动状态；
4. 补 PDF 导出、访问码限流、部署文档。
