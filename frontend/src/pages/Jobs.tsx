import { useEffect, useMemo, useRef, useState } from "react";
import {
  BankOutlined,
  CheckCircleOutlined,
  EnvironmentOutlined,
  LeftOutlined,
  MailOutlined,
  RadarChartOutlined,
  RightOutlined,
  SearchOutlined,
  SendOutlined,
  TagsOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
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
  contactEmail?: string;
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
  const emailMatch = JSON.stringify(record).match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/);

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
    contactEmail: emailMatch?.[0],
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

const PAGE_SIZE = 30;
const MAX_UI_PAGES = 50;
const MAX_SOURCE_PAGE = 50;
const SOURCE_PAGES_PER_REQUEST = 3;

function mergeJobs(current: JobCard[], incoming: JobCard[]): JobCard[] {
  const seen = new Set(current.map(jobKey));
  const merged = [...current];
  incoming.forEach((job) => {
    const key = jobKey(job);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(job);
  });
  return merged;
}

type JobPagerProps = {
  current: number;
  loaded: number;
  canPrev: boolean;
  canNext: boolean;
  loading: boolean;
  className?: string;
  onPrev: () => void;
  onNext: () => void;
};

function JobPager({
  current,
  loaded,
  canPrev,
  canNext,
  loading,
  className,
  onPrev,
  onNext,
}: JobPagerProps) {
  return (
    <div className={`job-pagination ${className ?? ""}`}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        第 {current} 页 / 最多 {MAX_UI_PAGES} 页 · 已加载 {loaded} 个职位
      </Typography.Text>
      <Space>
        <Button
          icon={<LeftOutlined />}
          disabled={!canPrev || loading}
          onClick={onPrev}
        >
          上一页
        </Button>
        <Button
          icon={<RightOutlined />}
          iconPosition="end"
          loading={loading}
          disabled={!canNext}
          onClick={onNext}
        >
          下一页
        </Button>
      </Space>
    </div>
  );
}

export default function Jobs() {
  const { message, modal } = AntApp.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const token = useSessionStore((state) => state.token);
  const setRecentCompanies = useSessionStore((state) => state.setRecentCompanies);
  const resumeDraft = useSessionStore((state) => state.resumeDraft);
  const [form] = Form.useForm<JobSearchForm>();
  const [realJobs, setRealJobs] = useState<JobCard[] | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobCard | null>(null);
  const [matchMap, setMatchMap] = useState<Record<string, JobMatch>>({});
  const [uiPage, setUiPage] = useState(1);
  const [nextSourcePage, setNextSourcePage] = useState(SOURCE_PAGES_PER_REQUEST);
  const [exhausted, setExhausted] = useState(false);
  const lastSearchRef = useRef<JobSearchForm | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [uiPage]);

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
  const pageJobs = useMemo(() => {
    const start = (uiPage - 1) * PAGE_SIZE;
    return jobs.slice(start, start + PAGE_SIZE);
  }, [jobs, uiPage]);
  const loadedPages = Math.max(1, Math.ceil(jobs.length / PAGE_SIZE));
  const canGoPrev = uiPage > 1;
  const canGoNext =
    uiPage < MAX_UI_PAGES &&
    !exhausted &&
    (uiPage < loadedPages || nextSourcePage <= MAX_SOURCE_PAGE);

  const searchMutation = useMutation({
    mutationFn: (values: JobSearchForm) => {
      if (!token) throw new Error("请先连接猎聘");
      return searchLiepinJobs(token, values);
    },
    onSuccess: (result) => {
      const normalized = normalizeJobs(result.data);
      setRecentCompanies([...new Set(normalized.map((job) => job.company).filter(Boolean))].slice(0, 20));
      setRealJobs(normalized);
      setMatchMap({});
      setUiPage(1);
      setNextSourcePage(result.pages ?? SOURCE_PAGES_PER_REQUEST);
      setExhausted(normalized.length === 0);
      if (normalized.length) {
        message.success(`找到 ${normalized.length} 个职位`);
      } else {
        message.warning("已返回数据，但暂未识别职位字段；请调整关键词后重试");
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

  const loadMoreMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error("请先连接猎聘");
      const base = lastSearchRef.current;
      if (!base) throw new Error("请先搜索职位");
      return searchLiepinJobs(token, {
        ...base,
        page: nextSourcePage,
        pages: SOURCE_PAGES_PER_REQUEST,
      });
    },
    onSuccess: (result) => {
      const incoming = normalizeJobs(result.data);
      const merged = mergeJobs(realJobs ?? [], incoming);
      const consumed = result.pages ?? SOURCE_PAGES_PER_REQUEST;
      const nextStart = nextSourcePage + consumed;
      setRealJobs(merged);
      setNextSourcePage(nextStart);
      setExhausted(incoming.length < PAGE_SIZE || nextStart > MAX_SOURCE_PAGE);
      if (incoming.length === 0) {
        message.info("没有更多职位了");
        return;
      }
      setUiPage((page) => page + 1);
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.status === 401) {
        message.error("猎聘 token 已失效，请到「连接猎聘」重新生成");
        return;
      }
      message.error(error.message || "加载更多职位失败");
    },
  });

  const matchMutation = useMutation({
    mutationFn: () => {
      if (!activeResume) {
        throw new Error("请先在「对话助手」生成简历，或在「简历中心」保存一份简历");
      }
      const targets = pageJobs.slice(0, 10);
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
        const job = pageJobs[index];
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
      setUiPage(1);
      setExhausted(true);
      return;
    }
    const payload: JobSearchForm = {
      ...values,
      pages: SOURCE_PAGES_PER_REQUEST,
      salary_floor: values.salary_floor ? String(values.salary_floor) : undefined,
      salary_cap: values.salary_cap ? String(values.salary_cap) : undefined,
    };
    lastSearchRef.current = payload;
    searchMutation.mutate(payload);
  };

  const goToNextPage = () => {
    if (uiPage < loadedPages) {
      setUiPage((page) => page + 1);
      return;
    }
    if (canGoNext) {
      loadMoreMutation.mutate();
    }
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
              <Button onClick={() => { setRealJobs(null); setUiPage(1); setExhausted(true); }}>
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

      {realJobs && jobs.length > 0 && (
        <JobPager
          className="job-pagination-top"
          current={uiPage}
          loaded={jobs.length}
          canPrev={canGoPrev}
          canNext={canGoNext}
          loading={loadMoreMutation.isPending}
          onPrev={() => setUiPage((page) => Math.max(1, page - 1))}
          onNext={goToNextPage}
        />
      )}

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
          {pageJobs.map((job) => {
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
                  {job.contactEmail && <span title={job.contactEmail}>邮箱 {job.contactEmail}</span>}
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
                      icon={<MailOutlined />}
                      onClick={() => navigate("/outreach", { state: { job: { ...job, email: job.contactEmail ?? "" } } })}
                    >
                      邮件
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

      {realJobs && jobs.length > 0 && (
        <JobPager
          current={uiPage}
          loaded={jobs.length}
          canPrev={canGoPrev}
          canNext={canGoNext}
          loading={loadMoreMutation.isPending}
          onPrev={() => setUiPage((page) => Math.max(1, page - 1))}
          onNext={goToNextPage}
        />
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
