import { useEffect, useMemo, useState } from "react";
import {
  CloudDownloadOutlined,
  GlobalOutlined,
  InboxOutlined,
  MailOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Empty,
  Input,
  InputNumber,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
} from "antd";
import { useLocation } from "react-router-dom";
import {
  crawlOfficialJobs,
  discoverCompanySites,
  draftEmail,
  getDemoResume,
  getReminders,
  getSavedResume,
  listEmailReplies,
  listOfficialJobs,
  markRepliesRead,
  sendEmail,
  syncEmailReplies,
} from "../api/client";
import { useSessionStore } from "../store/session";
import type { CompanySite, EmailReply, OfficialJob, Reminder, ResumeData } from "../types";

type IncomingJob = {
  id?: number;
  title?: string;
  company?: string;
  city?: string;
  salary?: string;
  email?: string;
  contactEmail?: string;
  url?: string;
  source?: string;
};

const CATEGORY_LABEL: Record<string, { text: string; color: string }> = {
  interview: { text: "面试邀请", color: "green" },
  offer: { text: "录用/Offer", color: "blue" },
  rejected: { text: "未通过", color: "red" },
  viewed: { text: "已查看", color: "cyan" },
  unknown: { text: "其他回信", color: "default" },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export default function Outreach() {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const location = useLocation();
  const incoming = (location.state as { job?: IncomingJob } | null)?.job;
  const qqEmail = useSessionStore((state) => state.qqEmail);
  const recentCompanies = useSessionStore((state) => state.recentCompanies);
  const resumeDraft = useSessionStore((state) => state.resumeDraft);
  const qqAuthCode = useSessionStore((state) => state.qqAuthCode);
  const setQqCredentials = useSessionStore((state) => state.setQqCredentials);

  const [email, setEmail] = useState(qqEmail);
  const [authCode, setAuthCode] = useState(qqAuthCode);
  const [to, setTo] = useState(incoming?.email ?? incoming?.contactEmail ?? "");
  const [company, setCompany] = useState(incoming?.company ?? "");
  const [title, setTitle] = useState(incoming?.title ?? "");
  const [jdUrl, setJdUrl] = useState(incoming?.url ?? "");
  const [jobId, setJobId] = useState(incoming?.id ?? 0);
  const [jobSource, setJobSource] = useState(incoming?.source ?? "email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templateId, setTemplateId] = useState("classic");

  const [officialUrl, setOfficialUrl] = useState("");
  const [officialCompany, setOfficialCompany] = useState("");
  const [officialKeyword, setOfficialKeyword] = useState("");
  const [maxJobs, setMaxJobs] = useState(8);
  const [discoverKeyword, setDiscoverKeyword] = useState("");
  const [discoverCity, setDiscoverCity] = useState("");
  const [companySites, setCompanySites] = useState<CompanySite[]>([]);

  const savedQuery = useQuery({ queryKey: ["saved-resume"], queryFn: getSavedResume, staleTime: Infinity });
  const demoQuery = useQuery({ queryKey: ["demo-resume"], queryFn: getDemoResume });
  const repliesQuery = useQuery({ queryKey: ["email-replies"], queryFn: listEmailReplies });
  const officialQuery = useQuery({ queryKey: ["official-jobs"], queryFn: listOfficialJobs });
  const remindersQuery = useQuery({ queryKey: ["reminders"], queryFn: getReminders, refetchInterval: 60000 });

  const resume = useMemo<ResumeData | null>(() => {
    return (savedQuery.data?.data ?? resumeDraft ?? demoQuery.data?.data ?? null) as ResumeData | null;
  }, [savedQuery.data, resumeDraft, demoQuery.data]);

  useEffect(() => {
    if (incoming) {
      setTo(incoming.email ?? incoming.contactEmail ?? "");
      setCompany(incoming.company ?? "");
      setTitle(incoming.title ?? "");
      setJdUrl(incoming.url ?? "");
      setJobId(incoming.id ?? 0);
      setJobSource(incoming.source ?? "email");
    }
  }, [incoming]);

  useEffect(() => {
    const want = asRecord(resume?.jobWant);
    const target = String(want.jobtitle ?? "").trim();
    const city = String(want.city ?? "").trim();
    setDiscoverKeyword((value) => value || target);
    setDiscoverCity((value) => value || city);
  }, [resume]);

  const currentJob = () => ({
    job_id: jobId,
    job_kind: "email",
    title,
    company,
    city: incoming?.city ?? "",
    salary: incoming?.salary ?? "",
    email: to,
    url: jdUrl,
    source: jobSource,
  });

  const draftMutation = useMutation({
    mutationFn: () => {
      if (!resume) throw new Error("请先在「简历中心」保存一份简历");
      return draftEmail(resume, currentJob());
    },
    onSuccess: (result) => {
      setSubject(result.data.subject);
      setBody(result.data.body);
      if (!to && result.data.to) setTo(result.data.to);
      message.success("已生成匹配说明，可修改后发送");
    },
    onError: (error: Error) => message.error(error.message || "生成失败"),
  });

  const sendMutation = useMutation({
    mutationFn: () => {
      if (!resume) throw new Error("请先在「简历中心」保存一份简历");
      if (!email || !authCode) throw new Error("请先填写 QQ 邮箱和授权码");
      if (!to) throw new Error("请填写招聘邮箱");
      if (!subject.trim() || !body.trim()) throw new Error("请先生成或填写邮件内容");
      setQqCredentials(email, authCode);
      return sendEmail({ to, subject, body, resume, job: currentJob(), template_id: templateId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      message.success("邮件已发送，并写入投递记录");
    },
    onError: (error: Error) => message.error(error.message || "发送失败"),
  });

  const discoverMutation = useMutation({
    mutationFn: () =>
      discoverCompanySites({
        keyword: discoverKeyword,
        city: discoverCity,
        companies: recentCompanies.slice(0, 6),
        limit: 8,
      }),
    onSuccess: (result) => {
      setCompanySites(result.data);
      if (result.data.length === 0) {
        message.info("没有找到匹配的企业招聘站，试试输入公司名或官网 URL");
      } else {
        message.success(`找到 ${result.data.length} 个候选企业站点`);
      }
    },
    onError: (error: Error) => message.error(error.message || "搜索企业官网失败"),
  });

  const crawlMutation = useMutation({
    mutationFn: (target?: { url?: string; company?: string; keyword?: string }) =>
      crawlOfficialJobs({
        url: target?.url ?? officialUrl,
        company: target?.company ?? officialCompany,
        keyword: target?.keyword ?? officialKeyword,
        max_jobs: maxJobs,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["official-jobs"] });
      message.success(`抓到 ${result.total} 个官网职位`);
    },
    onError: (error: Error) => message.error(error.message || "抓取失败"),
  });

  const markReadMutation = useMutation({
    mutationFn: () => markRepliesRead(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["email-replies"] });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      message.success(`已标记 ${result.updated} 封回信为已读`);
    },
    onError: (error: Error) => message.error(error.message || "标记失败"),
  });

  const syncMutation = useMutation({
    mutationFn: () => {
      if (!email || !authCode) throw new Error("请先填写 QQ 邮箱和授权码");
      setQqCredentials(email, authCode);
      return syncEmailReplies();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["email-replies"] });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      message.success(`同步完成：新增 ${result.data.inserted} 封，更新 ${result.data.updated} 条投递状态`);
    },
    onError: (error: Error) => message.error(error.message || "同步失败"),
  });

  const pickOfficialJob = (job: OfficialJob) => {
    setTo(job.email ?? "");
    setCompany(job.company);
    setTitle(job.title);
    setJdUrl(job.url);
    setOfficialUrl(job.url);
    setJobId(job.id);
    setJobSource("official");
    message.success("已填入邮件投递，请生成匹配说明");
  };

  const replies: EmailReply[] = repliesQuery.data?.data ?? [];
  const reminders: Reminder[] = remindersQuery.data?.data ?? [];
  const officialJobs: OfficialJob[] = officialQuery.data?.data ?? [];

  const emailTab = (
    <div className="outreach-grid">
      <Card title="QQ 邮箱连接器" size="small">
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="授权码只保存在当前浏览器 sessionStorage，不写入后端数据库。"
          description="QQ 邮箱需先在网页版设置中开启 SMTP/IMAP 并生成授权码；不要填 QQ 登录密码。"
        />
        <Space direction="vertical" style={{ width: "100%" }} size={10}>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="QQ 邮箱，例如 123456@qq.com" />
          <Input.Password
            value={authCode}
            onChange={(e) => setAuthCode(e.target.value)}
            placeholder="SMTP/IMAP 授权码"
          />
          <Button onClick={() => { setQqCredentials(email, authCode); message.success("已保存到当前浏览器会话"); }}>
            保存连接
          </Button>
          <Button
            icon={<CloudDownloadOutlined />}
            loading={syncMutation.isPending}
            onClick={() => syncMutation.mutate()}
          >
            同步收件箱回信
          </Button>
        </Space>
      </Card>

      <Card title="邮件投递" size="small">
        <Space direction="vertical" style={{ width: "100%" }} size={10}>
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="招聘邮箱（猎聘未返回时可手动填写）" />
          <Space.Compact style={{ width: "100%" }}>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="公司" />
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="岗位" />
          </Space.Compact>
          <Input value={jdUrl} onChange={(e) => setJdUrl(e.target.value)} placeholder="岗位链接（可选）" />
          <Select
            value={templateId}
            onChange={setTemplateId}
            options={[
              { value: "classic", label: "经典单栏" },
              { value: "modern", label: "现代蓝线" },
              { value: "compact", label: "紧凑一页" },
              { value: "executive", label: "稳重深色" },
            ]}
          />
          <Button
            icon={<MailOutlined />}
            loading={draftMutation.isPending}
            onClick={() => draftMutation.mutate()}
          >
            生成匹配说明
          </Button>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="邮件主题" />
          <Input.TextArea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            autoSize={{ minRows: 10, maxRows: 18 }}
            placeholder="邮件正文（抬头、匹配说明、正文、落款）"
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={sendMutation.isPending}
            onClick={() => sendMutation.mutate()}
          >
            发送邮件 + 简历附件
          </Button>
        </Space>
      </Card>
    </div>
  );

  const officialTab = (
    <div>
      <Card
        size="small"
        title="按求职意向找企业官网"
        style={{ marginBottom: 14 }}
      >
        <Space wrap style={{ marginBottom: 10 }}>
          <Input
            value={discoverKeyword}
            onChange={(e) => setDiscoverKeyword(e.target.value)}
            placeholder="岗位/公司关键词，例如 产品经理、联想"
            style={{ width: 260 }}
          />
          <Input
            value={discoverCity}
            onChange={(e) => setDiscoverCity(e.target.value)}
            placeholder="城市（可选）"
            style={{ width: 130 }}
          />
          <Button
            type="primary"
            icon={<GlobalOutlined />}
            loading={discoverMutation.isPending}
            onClick={() => discoverMutation.mutate()}
          >
            搜索企业招聘官网
          </Button>
        </Space>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {recentCompanies.length > 0
            ? `优先使用最近职位搜索到的 ${Math.min(recentCompanies.length, 6)} 家公司：${recentCompanies.slice(0, 6).join("、")}`
            : "会按关键词搜索公开企业官网；如果刚从职位搜索过来，会优先使用职位里的公司名单。"}
        </Typography.Text>
        {companySites.length > 0 && (
          <div className="outreach-job-grid" style={{ marginTop: 12 }}>
            {companySites.map((site) => (
              <Card
                key={site.domain}
                size="small"
                title={site.company || site.domain}
                extra={<Tag>{site.domain}</Tag>}
              >
                <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ fontSize: 12, color: "#475569" }}>
                  {site.title}
                </Typography.Paragraph>
                <Space wrap>
                  <Button
                    size="small"
                    type="primary"
                    loading={crawlMutation.isPending}
                    onClick={() => {
                      setOfficialUrl(site.url);
                      setOfficialCompany(site.company);
                      crawlMutation.mutate({ url: site.url, company: site.company, keyword: discoverKeyword });
                    }}
                  >
                    抓取该站职位
                  </Button>
                  <Button size="small" href={site.url} target="_blank">打开网站</Button>
                </Space>
              </Card>
            ))}
          </div>
        )}
      </Card>

      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 14 }}
        message="官网渠道会实时抓取公开页面，可能受反爬、JS 渲染影响。"
        description="建议填职位列表页或具体职位页；抓取结果里的邮箱可能为空，需要回到职位页确认或手动补填。"
      />
      <Space wrap style={{ marginBottom: 14 }}>
        <Input
          value={officialUrl}
          onChange={(e) => setOfficialUrl(e.target.value)}
          placeholder="公司官网招聘页 URL"
          style={{ width: 380 }}
        />
        <Input value={officialCompany} onChange={(e) => setOfficialCompany(e.target.value)} placeholder="公司名（可选）" style={{ width: 180 }} />
        <Input value={officialKeyword} onChange={(e) => setOfficialKeyword(e.target.value)} placeholder="关键词（可选）" style={{ width: 160 }} />
        <InputNumber min={1} max={12} value={maxJobs} onChange={(value) => setMaxJobs(value ?? 8)} addonBefore="最多" />
        <Button
          type="primary"
          icon={<GlobalOutlined />}
          loading={crawlMutation.isPending}
          onClick={() => crawlMutation.mutate()}
        >
          抓取官网职位
        </Button>
      </Space>
      {officialJobs.length === 0 ? (
        <Card><Empty description="还没有官网职位，输入招聘页 URL 后抓取" /></Card>
      ) : (
        <div className="outreach-job-grid">
          {officialJobs.map((job) => (
            <Card
              key={job.id}
              size="small"
              title={job.title || "未命名职位"}
              extra={<Tag>{job.company || "官网"}</Tag>}
            >
              <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
                {job.city || "地点未知"} · {job.salary || "薪资面议"}
              </Typography.Paragraph>
              <Typography.Paragraph ellipsis={{ rows: 3 }} style={{ fontSize: 12 }}>
                {job.description || "暂无职位描述"}
              </Typography.Paragraph>
              <Space wrap>
                <Tag color={job.email ? "green" : "gold"}>{job.email || "未找到邮箱"}</Tag>
                <Button size="small" onClick={() => pickOfficialJob(job)}>填入邮件投递</Button>
                {job.url && <Button size="small" href={job.url} target="_blank">打开职位页</Button>}
              </Space>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const inboxTab = (
    <div className="outreach-grid">
      <Card
        title={`收件箱回信（${replies.length}）`}
        size="small"
        extra={<Button size="small" loading={markReadMutation.isPending} onClick={() => markReadMutation.mutate()}>全部已读</Button>}
      >
        {replies.length === 0 ? (
          <Empty description="还没有同步到回信" />
        ) : (
          <div className="reply-list">
            {replies.map((reply) => {
              const meta = CATEGORY_LABEL[reply.category] ?? CATEGORY_LABEL.unknown;
              return (
                <div key={reply.id} className="reply-item">
                  <Space wrap>
                    <Tag color={meta.color}>{meta.text}</Tag>
                    {!reply.is_read && <Tag color="red">未读</Tag>}
                    <strong>{reply.subject || "(无主题)"}</strong>
                  </Space>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                    {reply.from_addr} · {reply.received_at ? new Date(reply.received_at).toLocaleString() : "时间未知"}
                  </div>
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{reply.snippet}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <Card title={`主动提醒（${reminders.length}）`} size="small">
        {reminders.length === 0 ? (
          <Empty description="暂无到期提醒" />
        ) : (
          <div className="reply-list">
            {reminders.map((item) => (
              <div key={`${item.kind ?? "followup"}-${item.email_reply_id ?? item.application_id}`} className="reply-item">
                <Tag color={item.level >= 14 ? "red" : item.level >= 7 ? "orange" : "gold"}>
                  已 {item.days_since} 天
                </Tag>
                <strong>{item.company} · {item.title}</strong>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{item.message}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>投递中心</h2>
          <p>QQ 邮箱自动发信、官网招聘邮箱抓取、回信解析与投递状态闭环。</p>
        </div>
        <Space wrap>
          <Tag color={qqEmail ? "green" : "default"}>{qqEmail ? "QQ 已配置" : "QQ 未配置"}</Tag>
          <Tag color="blue">{reminders.length} 条提醒</Tag>
        </Space>
      </div>

      {!resume && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 14 }}
          message="暂无可用简历"
          description="请先到「简历中心」保存一份简历，邮件会自动附带 DOCX + PDF 附件。"
        />
      )}

      <Tabs
        items={[
          { key: "email", label: <span><MailOutlined /> 邮件投递</span>, children: emailTab },
          { key: "official", label: <span><GlobalOutlined /> 官网渠道</span>, children: officialTab },
          { key: "inbox", label: <span><InboxOutlined /> 回信与提醒</span>, children: inboxTab },
        ]}
      />
    </div>
  );
}
