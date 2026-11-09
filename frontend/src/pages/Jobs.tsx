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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  addApplication,
  ApiError,
  applyLiepinJob,
  demoApply,
  getDemoJobs,
  getSavedResume,
  scoreJobs,
  searchLiepinJobs,
} from "../api/client";
import { useSessionStore } from "../store/session";
import type { DemoJob, JobMatch, JobSearchForm } from "../types";

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
    score: 0,
    source: "demo",
    raw: job,
  };
}

const jobKey = (job: { id: number; kind?: "1" | "2" }) => `${job.id}-${job.kind ?? "x"}`;

export default function Jobs() {
  const { message, modal } = AntApp.useApp();
  const queryClient = useQueryClient();
  const token = useSessionStore((state) => state.token);
  const resumeDraft = useSessionStore((state) => state.resumeDraft);
  const [form] = Form.useForm<JobSearchForm>();
  const [realJobs, setRealJobs] = useState<JobCard[] | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [selectedJob, setSelectedJob] = useState<JobCard | null>(null);
  const [matchMap, setMatchMap] = useState<Record<string, JobMatch>>({});

  const savedResumeQuery = useQuery({
    queryKey: ["saved-resume"],
    queryFn: getSavedResume,
    staleTime: Infinity,
  });
  const activeResume = resumeDraft ?? savedResumeQuery.data?.data ?? null;

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

  const matchMutation = useMutation({
    mutationFn: () => {
      if (!activeResume) {
        throw new Error("请先在「对话助手」生成简历，或在「简历中心」保存一份简历");
      }
      const targets = jobs.slice(0, 10);
      return scoreJobs(
        activeResume,
        targets.map((job) => ({
          job_id: job.id,
          title: job.title,
          company: job.company,
          city: job.city,
          salary: job.salary,
          experience: job.experience,
          education: job.education,
          tags: job.tags,
        })),
      );
    },
    onSuccess: (result) => {
      const next: Record<string, JobMatch> = {};
      result.results.forEach((item, index) => {
        const job = jobs[index];
        if (job) next[jobKey(job)] = item;
      });
      setMatchMap(next);
      message.success(result.demo ? "已按规则完成匹配（未启用模型）" : "匹配分析完成");
    },
    onError: (error: Error) => message.error(error.message || "匹配分析失败"),
  });

  const applyMutation = useMutation({
    mutationFn: async (job: JobCard) => {
      if (!job.kind) throw new Error("该职位缺少 jobKind，无法投递");
      if (token) return applyLiepinJob(token, job.id, job.kind);
      return demoApply(job.id, job.kind);
    },
    onSuccess: (result, job) => {
      const isDemo = Boolean(result.demo);
      addApplication({
        job_id: job.id,
        job_kind: job.kind ?? "2",
        title: job.title,
        company: job.company,
        city: job.city,
        salary: job.salary,
        note: isDemo ? "演示投递" : "",
      })
        .then(() => queryClient.invalidateQueries({ queryKey: ["applications"] }))
        .catch(() => undefined);
      modal.success({
        title: isDemo ? "演示投递成功" : "投递成功",
        content: isDemo
          ? "当前未连接猎聘，这是一次演示投递，已记入投递记录。连接猎聘后可在真实职位上投递。"
          : `已向「${job.company} · ${job.title}」发起投递，并记入投递记录。猎聘当前不支持查询状态，请稍后到猎聘 App 查看 HR 回复，回到「工作台」更新状态。`,
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
          <p>连接猎聘后搜索真实职位；点击「匹配分析」用你的简历给当前职位打分并列出缺口。</p>
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
              <Button
                icon={<RadarChartOutlined />}
                loading={matchMutation.isPending}
                onClick={() => matchMutation.mutate()}
              >
                匹配分析
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
          {jobs.map((job) => {
            const match = matchMap[jobKey(job)];
            return (
              <article className="job-card" key={jobKey(job)}>
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
                  {job.tags.slice(0, 5).map((tag) => {
                    const isMissing = match?.missing.includes(tag);
                    return (
                      <Tag key={tag} icon={<TagsOutlined />} color={isMissing ? "red" : undefined}>
                        {tag}
                      </Tag>
                    );
                  })}
                </div>

                <div className="score-row">
                  <div>
                    <span className="score-num">{match ? match.score : "—"}</span>
                    <span className="score-label"> 匹配分</span>
                  </div>
                  <Progress
                    percent={match?.score ?? 0}
                    showInfo={false}
                    strokeColor={{ "0%": "#60a5fa", "100%": "#2563eb" }}
                    style={{ flex: 1, margin: 0 }}
                  />
                  <Space size={6}>
                    <Button
                      size="small"
                      icon={<RadarChartOutlined />}
                      onClick={() => setSelectedJob(job)}
                    >
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
            );
          })}
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
        {selectedJob &&
          (() => {
            const match = matchMap[jobKey(selectedJob)];
            return (
              <div>
                <Space size={10} wrap style={{ marginBottom: 16 }}>
                  <Tag color="blue">匹配分 {match ? match.score : "—"}</Tag>
                  <Tag>{selectedJob.company}</Tag>
                  <Tag>{selectedJob.city}</Tag>
                  {selectedJob.source === "demo" && <Tag color="gold">演示数据</Tag>}
                </Space>

                {!match ? (
                  <Alert
                    type="info"
                    showIcon
                    message="还没有做匹配分析"
                    description={
                      activeResume
                        ? "点击工具栏的「匹配分析」，系统会用你的简历与当前职位逐条对照，给出分数、匹配项和缺口。"
                        : "还没有简历。请先到「对话助手」说一段经历并生成简历，或在「简历中心」保存一份简历。"
                    }
                    style={{ marginBottom: 16 }}
                  />
                ) : (
                  <>
                    <div style={{ marginBottom: 14 }}>
                      <Progress
                        percent={match.score}
                        strokeColor={{ "0%": "#60a5fa", "100%": "#2563eb" }}
                        format={(value) => `${value} 分`}
                      />
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>已匹配</div>
                      <Space size={6} wrap>
                        {match.matched.length > 0 ? (
                          match.matched.map((item) => (
                            <Tag key={item} color="green" icon={<CheckCircleOutlined />}>
                              {item}
                            </Tag>
                          ))
                        ) : (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            暂无明显匹配项
                          </Typography.Text>
                        )}
                      </Space>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>缺口</div>
                      <Space size={6} wrap>
                        {match.missing.length > 0 ? (
                          match.missing.map((item) => (
                            <Tag key={item} color="red">
                              {item}
                            </Tag>
                          ))
                        ) : (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            没有明显缺口
                          </Typography.Text>
                        )}
                      </Space>
                    </div>

                    <Alert
                      type="warning"
                      showIcon
                      message="下一步建议"
                      description={match.suggestion || "补充一条量化成果后再投递。"}
                      style={{ marginBottom: 16 }}
                    />
                  </>
                )}

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
            );
          })()}
      </Modal>
    </div>
  );
}
