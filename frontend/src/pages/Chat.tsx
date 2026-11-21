import { useEffect, useRef, useState } from "react";
import {
  FileTextOutlined,
  MessageOutlined,
  SendOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { App as AntApp, Button, Input, Space, Tag, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { analyzeResume, chatStream, extractResume, getHealth, getHistory, saveHistory } from "../api/client";
import { useSessionStore } from "../store/session";
import type { ChatMessage } from "../types";

const INITIAL_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "你好，我是职途助手。我会按 6 块帮你整理：项目、学校/专业/成绩、工作/实习、技能、项目经验、求职意向。先从最近一段项目或实习开始：你做了什么、你负责哪部分、结果如何？",
};

export default function Chat() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const token = useSessionStore((state) => state.token);
  const setResumeDraft = useSessionStore((state) => state.setResumeDraft);
  const setResumeAnalysis = useSessionStore((state) => state.setResumeAnalysis);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [lastDemo, setLastDemo] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const hydratedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: getHealth });
  const { data: savedHistory } = useQuery({
    queryKey: ["chat-history"],
    queryFn: getHistory,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (hydratedRef.current) return;
    const saved = savedHistory?.data;
    if (saved && saved.length > 0) {
      setMessages(saved);
      hydratedRef.current = true;
    } else if (savedHistory) {
      hydratedRef.current = true;
    }
  }, [savedHistory]);

  useEffect(() => {
    if (!hydratedRef.current || messages.length < 2) return;
    const timer = setTimeout(() => {
      saveHistory(messages).catch(() => undefined);
    }, 400);
    return () => clearTimeout(timer);
  }, [messages]);

  // 离开页面时中断未完成的流，避免后端继续消耗额度。
  useEffect(() => () => abortRef.current?.abort(), []);

  const submit = async (value?: string) => {
    const content = (value ?? input).trim();
    if (!content || streaming) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setInput("");
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let acc = "";
    try {
      await chatStream(nextMessages, {
        signal: controller.signal,
        onDelta: (delta) => {
          acc += delta;
          setMessages((current) => {
            const copy = [...current];
            const lastIndex = copy.length - 1;
            if (copy[lastIndex]?.role === "assistant") {
              copy[lastIndex] = { role: "assistant", content: acc };
            }
            return copy;
          });
        },
        onDone: (info) => setLastDemo(info.demo),
      });
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        message.error((error as Error)?.message || "助手回复失败");
      }
      setMessages((current) => {
        const copy = [...current];
        const lastIndex = copy.length - 1;
        if (copy[lastIndex]?.role === "assistant" && !copy[lastIndex].content) copy.pop();
        return copy;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const extractMutation = useMutation({
    mutationFn: async () => {
      const result = await extractResume(messages);
      const target = String((result.resume.jobWant as Record<string, unknown> | undefined)?.jobtitle ?? "");
      const analysis = await analyzeResume(result.resume, target).catch(() => null);
      return { result, analysis };
    },
    onSuccess: ({ result, analysis }) => {
      setResumeDraft(result.resume, result.missing);
      setResumeAnalysis(analysis?.data ?? null);
      message.success(
        result.missing.length > 0
          ? `已分析并整理成简历，还缺 ${result.missing.length} 项信息`
          : "已分析并整理成简历",
      );
      navigate("/resume");
    },
    onError: (error: Error) => message.error(error.message || "整理简历失败"),
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>对话助手</h2>
          <p>DeepSeek 负责梳理经历与生成表达；猎聘操作由工具调用完成，token 不会进入模型上下文。</p>
        </div>
        <Space>
          <Tag color={token ? "green" : "default"}>{token ? "猎聘已连接" : "猎聘未连接"}</Tag>
          <Tag color={health?.deepseek_configured ? "blue" : "gold"}>
            {health?.deepseek_configured ? "DeepSeek 真实模型" : "演示回复"}
          </Tag>
        </Space>
      </div>

      <div className="chat-layout">
        <div className="chat-panel">
          <div className="chat-log" ref={logRef}>
            {messages.map((item, index) => {
              const isLastAssistant =
                streaming && index === messages.length - 1 && item.role === "assistant";
              return (
                <div
                  key={`${item.role}-${index}`}
                  className={`chat-bubble ${item.role === "user" ? "user" : "assistant"}`}
                >
                  {isLastAssistant && !item.content ? (
                    <span className="thinking">
                      <ThunderboltOutlined /> 正在思考…
                    </span>
                  ) : (
                    <>
                      {item.content}
                      {isLastAssistant && <span className="stream-cursor" />}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="chat-composer">
            <Input.TextArea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="描述你的经历，或问一个求职问题…（Enter 发送，Shift+Enter 换行）"
              autoSize={{ minRows: 1, maxRows: 5 }}
              onPressEnter={(event) => {
                if (!event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={streaming}
              onClick={() => submit()}
            >
              发送
            </Button>
            {streaming && (
              <Button
                danger
                onClick={() => abortRef.current?.abort()}
              >
                停止
              </Button>
            )}
            <Button
              icon={<FileTextOutlined />}
              loading={extractMutation.isPending}
              disabled={messages.length < 2}
              onClick={() => extractMutation.mutate()}
            >
              整理成简历
            </Button>
          </div>
        </div>

        <aside className="chat-side">
          <div className="panel">
            <h3 style={{ fontSize: 14 }}>
              <MessageOutlined /> 当前上下文
            </h3>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.8 }}>
              <div>猎聘 token：{token ? "已连接（仅当前标签页）" : "未连接"}</div>
              <div>模型：{health?.deepseek_configured ? "DeepSeek" : "演示回复"}</div>
              <div>数据：对话与简历保存在本地 SQLite</div>
            </div>
            {lastDemo && (
              <Typography.Paragraph type="warning" style={{ fontSize: 11, marginTop: 10 }}>
                最近一条是演示回复。配置 DEEPSEEK_API_KEY 后会切换为真实模型。
              </Typography.Paragraph>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
