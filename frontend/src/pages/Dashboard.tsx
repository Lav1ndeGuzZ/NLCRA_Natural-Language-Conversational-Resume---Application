import { useMemo } from "react";
import {
  DatabaseOutlined,
  FileTextOutlined,
  LinkOutlined,
  MessageOutlined,
  SearchOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Empty, Progress, Select, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useNavigate } from "react-router-dom";
import { getDemoJobs, getHealth, getReminders, getSavedResume, listApplications, updateApplication } from "../api/client";
import { useSessionStore } from "../store/session";
import type { Application, ApplicationStatus } from "../types";

const STATUS_META: Record<ApplicationStatus, { label: string; color: string }> = {
  submitted: { label: "已投递", color: "blue" },
  viewed: { label: "已查看", color: "cyan" },
  interview: { label: "面试中", color: "orange" },
  offer: { label: "已录用", color: "green" },
  rejected: { label: "未通过", color: "red" },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = useSessionStore((state) => state.token);
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: getHealth });
  const { data: demoJobs } = useQuery({ queryKey: ["demo-jobs"], queryFn: getDemoJobs });
  const { data: savedResume } = useQuery({
    queryKey: ["saved-resume"],
    queryFn: getSavedResume,
    staleTime: Infinity,
  });
  const { data: applications } = useQuery({ queryKey: ["applications"], queryFn: listApplications });
  const { data: reminders } = useQuery({ queryKey: ["reminders"], queryFn: getReminders, refetchInterval: 60000 });

  const items = applications?.data ?? [];
  const counts = applications?.counts ?? {};
  const dueReminders = reminders?.data ?? [];

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ApplicationStatus }) =>
      updateApplication(id, { status, status_source: "manual" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications"] }),
  });

  const funnel = useMemo(() => {
    const total = items.length;
    const reached = (statuses: ApplicationStatus[]) =>
      items.filter((item) => statuses.includes(item.status)).length;
    return [
      { label: "投递", value: total },
      { label: "已查看", value: reached(["viewed", "interview", "offer", "rejected"]) },
      { label: "面试", value: reached(["interview", "offer"]) },
      { label: "录用", value: reached(["offer"]) },
    ];
  }, [items]);

  const columns: ColumnsType<Application> = [
    {
      title: "职位",
      dataIndex: "title",
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.title || "未命名职位"}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {record.company}
            {record.city ? ` · ${record.city}` : ""}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: "薪资",
      dataIndex: "salary",
      width: 130,
      render: (value: string) => value || "—",
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 150,
      render: (value: ApplicationStatus, record) => (
        <Select
          size="small"
          value={value}
          style={{ width: 108 }}
          loading={statusMutation.isPending}
          onChange={(status) => statusMutation.mutate({ id: record.id, status })}
          options={(Object.keys(STATUS_META) as ApplicationStatus[]).map((key) => ({
            value: key,
            label: <Tag color={STATUS_META[key].color}>{STATUS_META[key].label}</Tag>,
          }))}
        />
      ),
    },
    {
      title: "回信",
      dataIndex: "last_reply_at",
      width: 86,
      render: (value: string) => (value ? <Tag color="green">有回信</Tag> : "—"),
    },
    {
      title: "状态来源",
      dataIndex: "status_source",
      width: 100,
      render: (value: string) => (
        <Tag color={value === "email" ? "blue" : "default"}>{value === "email" ? "邮件回信" : "手动"}</Tag>
      ),
    },
    {
      title: "投递时间",
      dataIndex: "created_at",
      width: 160,
      render: (value: string) => (value ? new Date(value).toLocaleString() : "—"),
    },
    {
      title: "备注",
      dataIndex: "note",
      render: (value: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {value || "—"}
        </Typography.Text>
      ),
    },
  ];

  return (
    <div className="page">
      <section className="hero">
        <h1 className="hero-title">
          让 AI 先“访谈”你，
          <br />
          再把经历变成一份能投的简历。
        </h1>
        <div className="hero-actions">
          <Button
            type="primary"
            size="large"
            icon={<MessageOutlined />}
            onClick={() => navigate("/chat")}
          >
            和助手聊聊，生成简历
          </Button>
          <Button size="large" ghost icon={<SearchOutlined />} onClick={() => navigate("/jobs")}>
            去看职位匹配
          </Button>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <strong>{items.length}</strong>
            <span>已记录投递</span>
          </div>
          <div className="hero-stat">
            <strong>{counts.interview ?? 0}</strong>
            <span>面试中</span>
          </div>
          <div className="hero-stat">
            <strong>{counts.offer ?? 0}</strong>
            <span>已录用</span>
          </div>
        </div>
      </section>

      {dueReminders.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
          message={`有 ${dueReminders.length} 条投递需要跟进`}
          description={dueReminders.slice(0, 3).map((item) => item.kind === "reply" ? `新回信：${item.title}` : `${item.company || "公司"} · ${item.title}：已 ${item.days_since} 天`).join("；")}
          action={<Button size="small" onClick={() => navigate("/outreach")}>去处理</Button>}
        />
      )}

      <div className="section-title">
        <h3>当前状态</h3>
        <Tag color="blue">本地 SQLite · 无账号体系</Tag>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">
            <FileTextOutlined /> 简历
          </div>
          <div className="metric-value">{savedResume?.data ? "已保存" : "未保存"}</div>
          <div className="metric-hint">
            {savedResume?.updated_at
              ? `更新于 ${new Date(savedResume.updated_at).toLocaleString()}`
              : "去对话助手生成一份"}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <SendOutlined /> 投递记录
          </div>
          <div className="metric-value">{items.length}</div>
          <div className="metric-hint">来自职位页的实际投递与演示投递</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <ThunderboltOutlined /> DeepSeek
          </div>
          <div className="metric-value">{health?.deepseek_configured ? "已配置" : "演示模式"}</div>
          <div className="metric-hint">Key 由服务端环境变量提供</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <DatabaseOutlined /> 数据位置
          </div>
          <div className="metric-value">SQLite</div>
          <div className="metric-hint">backend/data/nlcra.db，按会话隔离</div>
        </div>
      </div>

      <div className="section-title">
        <h3>投递漏斗</h3>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          猎聘不支持查询状态，投递后请手动回填
        </Typography.Text>
      </div>

      <div className="metric-grid">
        {funnel.map((stage, index) => (
          <div className="metric-card" key={stage.label}>
            <div className="metric-label">
              {index + 1}. {stage.label}
            </div>
            <div className="metric-value">{stage.value}</div>
            <Progress
              percent={funnel[0].value ? Math.round((stage.value / funnel[0].value) * 100) : 0}
              showInfo={false}
              strokeColor="#2563eb"
              size="small"
            />
          </div>
        ))}
      </div>

      <div className="section-title">
        <h3>投递记录</h3>
        <Space>
          <Tag color={token ? "green" : "gold"}>{token ? "猎聘已连接" : "未连接猎聘"}</Tag>
          <Button size="small" icon={<SearchOutlined />} onClick={() => navigate("/jobs")}>
            去投递
          </Button>
        </Space>
      </div>

      <div className="panel">
        {items.length === 0 ? (
          <Empty description="还没有投递记录。去「职位搜索」做一次匹配分析，再投递试试。" />
        ) : (
          <Table
            rowKey="id"
            size="middle"
            columns={columns}
            dataSource={items}
            pagination={{ pageSize: 6, hideOnSinglePage: true }}
          />
        )}
      </div>

      <div className="section-title">
        <h3>六步跑通闭环</h3>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          对话 → 分析 → 简历 → 匹配 → 投递 → 回信
        </Typography.Text>
      </div>

      <div className="step-grid">
        <div className="step-card">
          <div className="step-index">01</div>
          <h4>对话收集</h4>
          <p>助手一次问一个关键问题，把经历聊成可用的素材。</p>
        </div>
        <div className="step-card">
          <div className="step-index">02</div>
          <h4>分析抽取</h4>
          <p>先分析经历与缺口，再整理成结构化简历，不直接套模板。</p>
        </div>
        <div className="step-card">
          <div className="step-index">03</div>
          <h4>模板简历</h4>
          <p>四套模板可选，支持 DOCX / PDF 导出与多版本保存。</p>
        </div>
        <div className="step-card">
          <div className="step-index">04</div>
          <h4>岗位匹配</h4>
          <p>按简历给职位打分，输出匹配项、缺口与下一步建议。</p>
        </div>
        <div className="step-card">
          <div className="step-index">05</div>
          <h4>多渠道投递</h4>
          <p>猎聘 API、QQ 邮件、公司官网页，统一记入投递记录。</p>
        </div>
        <div className="step-card">
          <div className="step-index">06</div>
          <h4>回信闭环</h4>
          <p>同步邮箱回信，自动识别面试/录用/拒绝并更新状态。</p>
        </div>
      </div>

      <Alert
        style={{ marginTop: 22 }}
        type="warning"
        showIcon
        icon={<SafetyCertificateOutlined />}
        message="当前版本的已知边界"
        description="猎聘状态仍以手动回填为主；QQ 邮件与官网抓取需要用户自备授权码/公开页面；官网反爬或 JS 渲染可能导致邮箱缺失，可在投递中心手动补填。"
      />
    </div>
  );
}
