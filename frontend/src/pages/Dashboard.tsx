import {
  DatabaseOutlined,
  FileTextOutlined,
  LinkOutlined,
  MessageOutlined,
  SearchOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Space, Tag, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { getDemoJobs, getHealth } from "../api/client";
import { useSessionStore } from "../store/session";

export default function Dashboard() {
  const navigate = useNavigate();
  const token = useSessionStore((state) => state.token);
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: getHealth });
  const { data: demoJobs } = useQuery({ queryKey: ["demo-jobs"], queryFn: getDemoJobs });

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-eyebrow">
          <ThunderboltOutlined /> 对话式求职工作台 · 可行性版本
        </div>
        <h1 className="hero-title">
          让 AI 先“访谈”你，
          <br />
          再把经历变成一份能投的简历。
        </h1>
        <p className="hero-sub">
          不注册、不登录。连接猎聘 token 后，DeepSeek 帮你梳理经历、补充猎聘在线简历、搜索职位，
          在你确认后完成真实投递。所有简历与投递记录默认只保存在浏览器本地。
        </p>
        <div className="hero-actions">
          <Button
            type="primary"
            size="large"
            icon={<LinkOutlined />}
            onClick={() => navigate(token ? "/jobs" : "/connect")}
          >
            {token ? "去搜索职位" : "连接猎聘，开始体验"}
          </Button>
          <Button size="large" ghost icon={<MessageOutlined />} onClick={() => navigate("/chat")}>
            先和助手聊聊
          </Button>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <strong>{token ? "已连接" : "未连接"}</strong>
            <span>猎聘账号状态</span>
          </div>
          <div className="hero-stat">
            <strong>{health?.deepseek_configured ? "真实模型" : "演示回复"}</strong>
            <span>DeepSeek 配置状态</span>
          </div>
          <div className="hero-stat">
            <strong>{demoJobs?.total ?? "—"}</strong>
            <span>演示职位可体验</span>
          </div>
        </div>
      </section>

      <div className="section-title">
        <h3>当前状态</h3>
        <Tag color="blue">本地优先 · 无服务端用户库</Tag>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">
            <LinkOutlined /> 猎聘 token
          </div>
          <div className="metric-value">{token ? "已连接" : "待连接"}</div>
          <div className="metric-hint">只存 sessionStorage，关闭标签页即失效</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <ThunderboltOutlined /> DeepSeek
          </div>
          <div className="metric-value">{health?.deepseek_configured ? "已配置" : "演示模式"}</div>
          <div className="metric-hint">Key 由服务端环境变量提供，用户无需填写</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <SearchOutlined /> 职位数据
          </div>
          <div className="metric-value">{demoJobs?.total ?? 0}</div>
          <div className="metric-hint">未连接猎聘时使用演示职位</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <DatabaseOutlined /> 数据位置
          </div>
          <div className="metric-value">浏览器</div>
          <div className="metric-hint">IndexedDB / sessionStorage；服务端不落库</div>
        </div>
      </div>

      <div className="section-title">
        <h3>四步跑通闭环</h3>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          先跑通，再补全
        </Typography.Text>
      </div>

      <div className="step-grid">
        <div className="step-card">
          <div className="step-index">01</div>
          <h4>连接猎聘</h4>
          <p>到猎聘授权页生成 token，粘贴到工具里。不会保存你的密码。</p>
        </div>
        <div className="step-card">
          <div className="step-index">02</div>
          <h4>导入 + 对话</h4>
          <p>读取猎聘在线简历，DeepSeek 通过对话补齐缺失信息。</p>
        </div>
        <div className="step-card">
          <div className="step-index">03</div>
          <h4>搜索 + 匹配</h4>
          <p>按关键词/城市/薪资搜索职位，查看匹配分、证据与缺口。</p>
        </div>
        <div className="step-card">
          <div className="step-index">04</div>
          <h4>确认投递</h4>
          <p>确认简历版本后真实投递；投递后手动回填状态并复盘。</p>
        </div>
      </div>

      <div className="section-title">
        <h3>快速入口</h3>
      </div>

      <Space size={12} wrap>
        <Button icon={<LinkOutlined />} onClick={() => navigate("/connect")}>
          连接猎聘
        </Button>
        <Button icon={<FileTextOutlined />} onClick={() => navigate("/resume")}>
          查看简历
        </Button>
        <Button icon={<SearchOutlined />} onClick={() => navigate("/jobs")}>
          搜索职位
        </Button>
        <Button icon={<MessageOutlined />} onClick={() => navigate("/chat")}>
          对话助手
        </Button>
      </Space>

      <Alert
        style={{ marginTop: 22 }}
        type="warning"
        showIcon
        icon={<SafetyCertificateOutlined />}
        message="可行性版本的已知边界"
        description="猎聘当前 Agent API 暂不支持查询投递状态，投递后需要手动回填；搜索结果是否包含完整 JD 需用真实 token 验证。工具不会做服务端自动投递或浏览器自动化。"
      />
    </div>
  );
}
