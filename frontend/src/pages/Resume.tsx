import { useState } from "react";
import {
  DownloadOutlined,
  LinkOutlined,
  PrinterOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App as AntApp,
  Button,
  Collapse,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  downloadDocx,
  getDemoResume,
  getLiepinResume,
  getSavedResume,
  saveResume,
} from "../api/client";
import { useSessionStore } from "../store/session";
import type { ResumeData } from "../types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function unwrapResume(value: unknown): Record<string, unknown> {
  const root = asRecord(value);
  return asRecord(root.data ?? root.resume ?? root);
}

function dateRange(start: unknown, end: unknown): string {
  const left = text(start);
  const right = text(end);
  if (left && right) return `${left} – ${right}`;
  return left || right;
}

const MISSING_LABELS: Record<string, string> = {
  "basics.name": "姓名",
  "basics.contact": "联系方式",
  selfAssess: "自我评价",
  education: "教育经历",
  experience: "工作 / 项目经历",
  skills: "技能",
  "jobWant.jobtitle": "目标岗位",
};

export default function Resume() {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const token = useSessionStore((state) => state.token);
  const resumeDraft = useSessionStore((state) => state.resumeDraft);
  const resumeMissing = useSessionStore((state) => state.resumeMissing);
  const setResumeDraft = useSessionStore((state) => state.setResumeDraft);
  const [liepinResume, setLiepinResume] = useState<unknown>(null);

  const demoQuery = useQuery({ queryKey: ["demo-resume"], queryFn: getDemoResume });
  const savedQuery = useQuery({
    queryKey: ["saved-resume"],
    queryFn: getSavedResume,
    staleTime: Infinity,
  });
  const savedResume = savedQuery.data?.data ?? null;
  const activeResume = resumeDraft ?? liepinResume ?? savedResume ?? demoQuery.data?.data;
  const source = resumeDraft
    ? "对话生成"
    : liepinResume
      ? "猎聘简历"
      : savedResume
        ? "已保存简历"
        : "演示简历";

  const fetchMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error("请先连接猎聘");
      return getLiepinResume(token);
    },
    onSuccess: (result) => {
      setLiepinResume(result.data);
      message.success("已读取猎聘简历");
    },
    onError: (error: Error) => message.error(error.message || "读取失败"),
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      if (!activeResume) throw new Error("暂无简历可导出");
      const basics = asRecord(unwrapResume(activeResume).basics);
      const filename = text(basics.name) ? `${text(basics.name)}-简历` : "简历";
      const blob = await downloadDocx(activeResume as ResumeData, filename);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => message.success("DOCX 已开始下载"),
    onError: (error: Error) => message.error(error.message || "导出失败"),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const current = unwrapResume(activeResume);
      if (Object.keys(current).length === 0) throw new Error("暂无简历可保存");
      return saveResume(current as ResumeData);
    },
    onSuccess: (result) => {
      if (resumeDraft) setResumeDraft(resumeDraft, result.missing ?? resumeMissing);
      queryClient.invalidateQueries({ queryKey: ["saved-resume"] });
      message.success("简历已保存");
    },
    onError: (error: Error) => message.error(error.message || "保存失败"),
  });

  const resume = unwrapResume(activeResume);
  const basics = asRecord(resume.basics);
  const education = asArray(resume.education);
  const work = asArray(resume.work);
  const projects = asArray(resume.projects);
  const skills = asArray(resume.skills);
  const jobWant = asRecord(resume.jobWant);
  const selfAssess = text(resume.selfAssess);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>简历中心</h2>
          <p>
            当前展示{source}。猎聘简历同步遵循“只补缺失、不覆盖已有”的原则。
          </p>
        </div>
        <Space wrap>
          <Tag color={resumeDraft ? "blue" : liepinResume ? "green" : savedResume ? "cyan" : "gold"}>
            {source}
          </Tag>
          {token && (
            <Button
              icon={<LinkOutlined />}
              loading={fetchMutation.isPending}
              onClick={() => fetchMutation.mutate()}
            >
              读取猎聘简历
            </Button>
          )}
          <Button
            icon={<SaveOutlined />}
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            保存简历
          </Button>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={exportMutation.isPending}
            onClick={() => exportMutation.mutate()}
          >
            导出 DOCX
          </Button>
          <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
            打印 / PDF
          </Button>
        </Space>
      </div>

      {savedQuery.data?.updated_at && !resumeDraft && (
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 10 }}>
          已保存版本：{new Date(savedQuery.data.updated_at).toLocaleString()}
        </Typography.Paragraph>
      )}

      {!token && (
        <Alert
          style={{ marginBottom: 14 }}
          type="info"
          showIcon
          message={resumeDraft ? "当前展示对话生成的简历" : `当前展示${source}`}
          description={
            resumeDraft
              ? "内容由对话抽取，可能有遗漏。回到「对话助手」补充信息后可重新生成。"
              : savedResume
                ? "这是上次保存的版本。连接猎聘后可读取真实在线简历。"
                : "连接猎聘后，可读取真实在线简历。演示数据仅用于验证界面与导出流程。"
          }
        />
      )}

      {resumeDraft && resumeMissing.length > 0 && (
        <Alert
          style={{ marginBottom: 14 }}
          type="warning"
          showIcon
          message="以下信息尚未提供，简历会显示为空"
          description={<Space size={6} wrap>{resumeMissing.map((key) => <Tag key={key}>{MISSING_LABELS[key] ?? key}</Tag>)}</Space>}
        />
      )}

      <div className="resume-sheet">
        <div className="resume-header">
          <div className="resume-name">{text(basics.name) || "姓名"}</div>
          <div className="resume-contact">
            {[basics.phone, basics.email, basics.city, basics.wechat]
              .map(text)
              .filter(Boolean)
              .join("  ·  ") || "联系方式待补充"}
          </div>
        </div>

        {selfAssess && (
          <section className="resume-section">
            <h4>自我评价</h4>
            <div className="resume-item-desc">{selfAssess}</div>
          </section>
        )}

        {education.length > 0 && (
          <section className="resume-section">
            <h4>教育经历</h4>
            {education.map((item, index) => {
              const record = asRecord(item);
              return (
                <div className="resume-item" key={index}>
                  <div className="resume-item-title">
                    {[record.school, record.major, record.degree].map(text).filter(Boolean).join(" · ")}
                  </div>
                  <div className="resume-item-meta">{dateRange(record.start, record.end)}</div>
                </div>
              );
            })}
          </section>
        )}

        {work.length > 0 && (
          <section className="resume-section">
            <h4>工作经历</h4>
            {work.map((item, index) => {
              const record = asRecord(item);
              const highlights = asArray(record.highlights);
              return (
                <div className="resume-item" key={index}>
                  <div className="resume-item-title">
                    {[record.company, record.title].map(text).filter(Boolean).join(" · ")}
                  </div>
                  <div className="resume-item-meta">{dateRange(record.start, record.end)}</div>
                  {text(record.description) && (
                    <div className="resume-item-desc">{text(record.description)}</div>
                  )}
                  {highlights.length > 0 && (
                    <ul style={{ margin: "4px 0 0 18px", padding: 0, color: "#475569", fontSize: 12 }}>
                      {highlights.map((highlight, i) => (
                        <li key={i}>{text(highlight)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {projects.length > 0 && (
          <section className="resume-section">
            <h4>项目经历</h4>
            {projects.map((item, index) => {
              const record = asRecord(item);
              return (
                <div className="resume-item" key={index}>
                  <div className="resume-item-title">
                    {[record.name, record.role].map(text).filter(Boolean).join(" · ")}
                  </div>
                  <div className="resume-item-meta">{dateRange(record.start, record.end)}</div>
                  {text(record.description) && (
                    <div className="resume-item-desc">{text(record.description)}</div>
                  )}
                  {asArray(record.tech).length > 0 && (
                    <div className="job-tags" style={{ marginTop: 6 }}>
                      {asArray(record.tech).map((tech, i) => (
                        <Tag key={i}>{text(tech)}</Tag>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {skills.length > 0 && (
          <section className="resume-section">
            <h4>专业技能</h4>
            <Space size={6} wrap>
              {skills.map((item, index) => {
                const record = asRecord(item);
                const label = text(record.name) || text(item);
                const level = text(record.level);
                return (
                  <Tag key={index} color="blue">
                    {label}{level ? ` · ${level}` : ""}
                  </Tag>
                );
              })}
            </Space>
          </section>
        )}

        {Object.keys(jobWant).length > 0 && (
          <section className="resume-section">
            <h4>求职意向</h4>
            <div className="resume-item-desc">
              {[jobWant.jobtitle, jobWant.city, jobWant.workType]
                .map(text)
                .filter(Boolean)
                .join(" · ")}
              {jobWant.salaryLow || jobWant.salaryHigh
                ? ` · ${text(jobWant.salaryLow)}-${text(jobWant.salaryHigh)}K`
                : ""}
            </div>
          </section>
        )}

        <div style={{ marginTop: 18 }}>
          <Collapse
            ghost
            items={[
              {
                key: "raw",
                label: "查看原始 JSON",
                children: <pre className="json-block">{JSON.stringify(activeResume, null, 2)}</pre>,
              },
            ]}
          />
        </div>
      </div>

      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12 }}>
        提示：当前 PDF 导出使用浏览器打印；DOCX 由后端 python-docx 生成。猎聘简历的“补写”功能将在下一阶段接入。
      </Typography.Paragraph>
    </div>
  );
}
