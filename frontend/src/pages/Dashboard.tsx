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
import { getDemoJobs, getHealth, getSavedResume, listApplications, updateApplication } from "../api/client";
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

  const items = applications?.data ?? [];
  const counts = applications?.counts ?? {};

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ApplicationStatus }) =>
      updateApplication(id, { status }),
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
        <h3>四步跑通闭环</h3>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          现在四步都有真实实现
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
          <h4>信息抽取</h4>
          <p>一键整理成结构化简历，缺失项会明确列出来。</p>
        </div>
        <div className="step-card">
          <div className="step-index">03</div>
          <h4>职位匹配</h4>
          <p>按简历给职位打分，输出匹配项、缺口与下一步建议。</p>
        </div>
        <div className="step-card">
          <div className="step-index">04</div>
          <h4>投递反馈</h4>
          <p>投递自动记档，回填面试/录用状态，复盘哪类岗位更值得投。</p>
        </div>
      </div>

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
