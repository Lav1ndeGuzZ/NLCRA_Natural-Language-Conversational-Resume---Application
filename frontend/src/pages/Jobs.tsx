import { useMemo, useState } from "react";
import {
  BankOutlined,
  CheckCircleOutlined,
  EnvironmentOutlined,
  RadarChartOutlined,
  SearchOutlined,
  SendOutlined,
  TagsOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Alert,
  App as AntApp,
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  ApiError,
  applyLiepinJob,
  demoApply,
  getDemoJobs,
  searchLiepinJobs,
} from "../api/client";
import { useSessionStore } from "../store/session";
import type { DemoJob, JobSearchForm } from "../types";

type JobCard = {
  id: number;
  kind?: "1" | "2";
  title: string;
  company: string;
  city: string;
  salary: string;
  experience: string;
  education: string;
  tags: string[];
  score: number;
  source: string;
  raw: unknown;
};

function toJobCard(item: unknown): JobCard | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const idRaw = record.jobId ?? record.job_id ?? record.id;
  const id = Number(idRaw);
  if (!Number.isFinite(id)) return null;

  const kindRaw = record.jobKind ?? record.job_kind;
  const kind = kindRaw === "1" || kindRaw === 1 ? "1" : kindRaw === "2" || kindRaw === 2 ? "2" : undefined;

  const tagsRaw = record.tags ?? record.skillTags ?? record.welfare;
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.map((tag) => (typeof tag === "string" ? tag : String((tag as { name?: string })?.name ?? ""))).filter(Boolean)
    : [];

  const scoreRaw = record.matchScore ?? record.match_score ?? record.score;
  const score = Number(scoreRaw);

  return {
    id,
    kind,
    title: String(record.title ?? record.jobName ?? record.job_name ?? "未命名职位"),
    company: String(record.company ?? record.companyName ?? record.compName ?? "未知公司"),
    city: String(record.city ?? record.address ?? record.dq ?? "地点未知"),
    salary: String(record.salary ?? record.salaryDesc ?? record.jobSalary ?? "薪资面议"),
    experience: String(record.experience ?? record.workExperience ?? record.workExp ?? "经验不限"),
    education: String(record.education ?? record.eduLevel ?? record.degree ?? "学历不限"),
    tags,
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0,
    source: String(record.source ?? "liepin"),
    raw: item,
  };
}

function normalizeJobs(data: unknown): JobCard[] {
  if (Array.isArray(data)) {
    return data.map(toJobCard).filter((item): item is JobCard => Boolean(item));
  }
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  for (const key of ["jobs", "list", "data", "result", "items"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.map(toJobCard).filter((item): item is JobCard => Boolean(item));
    }
    if (value && typeof value === "object") {
      const nested = normalizeJobs(value);
      if (nested.length) return nested;
    }
  }
  return [];
}

function demoToCard(job: DemoJob): JobCard {
  return {
    id: job.job_id,
    kind: job.job_kind,
    title: job.title,
    company: job.company,
    city: job.city,
    salary: job.salary,
    experience: job.experience,
    education: job.education,
    tags: job.tags,
    score: job.match_score,
    source: "demo",
    raw: job,
  };
}

export default function Jobs() {
  const { message, modal } = AntApp.useApp();
  const token = useSessionStore((state) => state.token);
  const [form] = Form.useForm<JobSearchForm>();
  const [realJobs, setRealJobs] = useState<JobCard[] | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [selectedJob, setSelectedJob] = useState<JobCard | null>(null);

  const demoQuery = useQuery({ queryKey: ["demo-jobs"], queryFn: getDemoJobs });
  const demoJobs = useMemo(
    () => (demoQuery.data?.data ?? []).map(demoToCard),
    [demoQuery.data],
  );
  const jobs = realJobs ?? demoJobs;

  const searchMutation = useMutation({
    mutationFn: (values: JobSearchForm) => {
      if (!token) throw new Error("请先连接猎聘");
      return searchLiepinJobs(token, values);
    },
    onSuccess: (result) => {
      setRawResponse(result.data);
      const normalized = normalizeJobs(result.data);
      setRealJobs(normalized);
      if (normalized.length) {
        message.success(`找到 ${normalized.length} 个职位`);
      } else {
        message.warning("已返回数据，但暂未识别职位字段；可展开原始响应查看");
      }
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.status === 401) {
        message.error("猎聘 token 已失效，请到「连接猎聘」重新生成");
        return;
      }
      message.error(error.message || "搜索失败");
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (job: JobCard) => {
      if (!job.kind) throw new Error("该职位缺少 jobKind，无法投递");
      if (token) return applyLiepinJob(token, job.id, job.kind);
      return demoApply(job.id, job.kind);
    },
    onSuccess: (result, job) => {
      const isDemo = Boolean(result.demo);
      modal.success({
        title: isDemo ? "演示投递成功" : "投递成功",
        content: isDemo
          ? "当前未连接猎聘，这是一次演示投递。连接猎聘后可在真实职位上投递。"
          : `已向「${job.company} · ${job.title}」发起投递。猎聘当前不支持查询状态，请稍后到猎聘 App 查看 HR 回复，并回到工具手动更新状态。`,
      });
    },
    onError: (error: Error) => {
      message.error(error.message || "投递失败");
    },
  });

  const onSearch = (values: JobSearchForm) => {
    if (!token) {
      message.info("未连接猎聘，当前展示演示职位；连接后可搜索真实职位。");
      setRealJobs(null);
      return;
    }
    const payload: JobSearchForm = {
      ...values,
      salary_floor: values.salary_floor ? String(values.salary_floor) : undefined,
      salary_cap: values.salary_cap ? String(values.salary_cap) : undefined,
    };
    searchMutation.mutate(payload);
  };

  const confirmApply = (job: JobCard) => {
    if (!job.kind) {
      message.warning("该职位缺少 jobKind，暂不能投递");
      return;
    }
    modal.confirm({
      title: `确认投递：${job.title}`,
      content: (
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <div>
            公司：<strong>{job.company}</strong>
          </div>
          <div>地点：{job.city}</div>
          <div>来源：{job.source === "demo" ? "演示职位" : "猎聘"}</div>
          <div style={{ marginTop: 8, color: "#b45309" }}>
            猎聘当前不支持投递状态查询，投递后请在猎聘 App 查看 HR 回复。
          </div>
        </div>
      ),
      okText: token ? "确认投递" : "演示投递",
      cancelText: "取消",
      onOk: () => applyMutation.mutateAsync(job),
    });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>职位搜索</h2>
          <p>连接猎聘后搜索真实职位；未连接时可用演示职位体验匹配与投递流程。</p>
        </div>
        <Tag color={token ? "green" : "gold"}>{token ? "真实猎聘" : "演示数据"}</Tag>
      </div>

      {!token && (
        <Alert
          style={{ marginBottom: 14 }}
          type="info"
          showIcon
          message="当前为演示模式"
          description="连接猎聘 token 后，这里会改为调用猎聘 search-job；演示职位的投递不会发送到真实平台。"
        />
      )}

      <div className="job-toolbar">
        <Form form={form} layout="inline" onFinish={onSearch} initialValues={{ page: 0 }}>
          <Form.Item name="job_name" label="关键词">
            <Input placeholder="产品经理 / Python / 数据分析" allowClear style={{ width: 200 }} />
          </Form.Item>
          <Form.Item name="address" label="城市">
            <Input placeholder="上海 / 北京 / 杭州" allowClear style={{ width: 150 }} />
          </Form.Item>
          <Form.Item name="salary_floor" label="最低薪资">
            <InputNumber min={0} max={200} placeholder="K" style={{ width: 100 }} />
          </Form.Item>
          <Form.Item name="salary_cap" label="最高薪资">
            <InputNumber min={0} max={500} placeholder="K" style={{ width: 100 }} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SearchOutlined />}
                loading={searchMutation.isPending}
              >
                搜索
              </Button>
              <Button onClick={() => { setRealJobs(null); setRawResponse(null); }}>
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </div>

      <div className="section-title">
        <h3>{realJobs ? "猎聘搜索结果" : "推荐职位（演示）"}</h3>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          共 {jobs.length} 个
        </Typography.Text>
      </div>

      {jobs.length === 0 ? (
        <div className="panel">
          <Empty description="暂无职位，试试调整关键词或先连接猎聘" />
        </div>
      ) : (
        <div className="job-grid">
          {jobs.map((job) => (
            <article className="job-card" key={`${job.id}-${job.kind ?? "x"}`}>
              <div className="job-head">
                <div>
                  <div className="job-title">{job.title}</div>
                  <div className="job-company">
                    <BankOutlined /> {job.company}
                  </div>
                </div>
                <div className="job-salary">{job.salary}</div>
              </div>

              <div className="job-meta">
                <span>
                  <EnvironmentOutlined /> {job.city}
                </span>
                <span>{job.experience}</span>
                <span>{job.education}</span>
                {job.source === "demo" && <Tag color="gold">演示</Tag>}
              </div>

              <div className="job-tags">
                {job.tags.slice(0, 5).map((tag) => (
                  <Tag key={tag} icon={<TagsOutlined />}>
                    {tag}
                  </Tag>
                ))}
              </div>

              <div className="score-row">
                <div>
                  <span className="score-num">{job.score || "—"}</span>
                  <span className="score-label"> 匹配分</span>
                </div>
                <Progress
                  percent={job.score}
                  showInfo={false}
                  strokeColor={{ "0%": "#60a5fa", "100%": "#2563eb" }}
                  style={{ flex: 1, margin: 0 }}
                />
                <Space size={6}>
                  <Button size="small" icon={<RadarChartOutlined />} onClick={() => setSelectedJob(job)}>
                    匹配
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    icon={<SendOutlined />}
                    loading={applyMutation.isPending}
                    onClick={() => confirmApply(job)}
                  >
                    投递
                  </Button>
                </Space>
              </div>
            </article>
          ))}
        </div>
      )}

      {Boolean(rawResponse) && (
        <div className="section-title">
          <h3>原始响应</h3>
        </div>
      )}
      {Boolean(rawResponse) && (
        <pre className="json-block">{JSON.stringify(rawResponse, null, 2)}</pre>
      )}

      <Modal
        open={Boolean(selectedJob)}
        onCancel={() => setSelectedJob(null)}
        footer={null}
        width={640}
        title={selectedJob ? `匹配报告 · ${selectedJob.title}` : "匹配报告"}
      >
        {selectedJob && (
          <div>
            <Space size={10} wrap style={{ marginBottom: 16 }}>
              <Tag color="blue">匹配分 {selectedJob.score || "—"}</Tag>
              <Tag>{selectedJob.company}</Tag>
              <Tag>{selectedJob.city}</Tag>
              {selectedJob.source === "demo" && <Tag color="gold">演示数据</Tag>}
            </Space>

            <Alert
              type="info"
              showIcon
              message="匹配报告（可行性版本）"
              description="当前版本先用职位结构化字段与演示规则生成报告；接入真实搜索响应后，会展开为「职位要求 → 简历证据 → 缺口」的逐条对照。"
              style={{ marginBottom: 16 }}
            />

            {[
              { label: "核心技能", value: Math.min(100, selectedJob.score + 4) },
              { label: "经验相关度", value: Math.max(40, selectedJob.score - 6) },
              { label: "地点/薪资", value: Math.max(35, selectedJob.score - 10) },
            ].map((dimension) => (
              <div key={dimension.label} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span>{dimension.label}</span>
                  <span>{dimension.value}</span>
                </div>
                <Progress
                  percent={dimension.value}
                  showInfo={false}
                  strokeColor="#2563eb"
                  size="small"
                />
              </div>
            ))}

            <div style={{ marginTop: 14, fontSize: 12, color: "#475569", lineHeight: 1.8 }}>
              <div>
                <CheckCircleOutlined style={{ color: "#16a34a" }} /> 建议：优先补充与「
                {selectedJob.tags.slice(0, 2).join("、") || "岗位关键词"}
                」直接相关的项目证据，并把结果量化。
              </div>
              <div style={{ marginTop: 6 }}>
                缺口：当前演示数据无法读取完整 JD；真实接入后需要确认搜索结果是否包含职位要求全文。
              </div>
            </div>

            <div style={{ marginTop: 18, textAlign: "right" }}>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() => {
                  const job = selectedJob;
                  setSelectedJob(null);
                  confirmApply(job);
                }}
              >
                去投递
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
