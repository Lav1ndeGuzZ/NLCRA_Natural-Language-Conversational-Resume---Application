import { useEffect, useRef, useState } from "react";
import { MessageOutlined, SendOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { App as AntApp, Button, Input, Space, Tag, Typography } from "antd";
import { chat as sendChat, getHealth } from "../api/client";
import { useSessionStore } from "../store/session";
import type { ChatMessage } from "../types";

const INITIAL_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "你好，我是职途助手。先告诉我：你最近一段工作/实习是什么？你负责什么、做出了什么结果？我会帮你把它整理成简历里能用的表达。",
};

const PROMPTS = [
  "帮我梳理最近一段工作经历",
  "这段经历怎么写得更像成果？",
  "我想投产品经理，简历该怎么改？",
  "我适合什么方向的岗位？",
];

export default function Chat() {
  const { message } = AntApp.useApp();
  const token = useSessionStore((state) => state.token);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [lastDemo, setLastDemo] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: getHealth });

  const mutation = useMutation({
    mutationFn: (nextMessages: ChatMessage[]) => sendChat(nextMessages),
    onSuccess: (result) => {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: result.content },
      ]);
      setLastDemo(result.demo);
    },
    onError: (error: Error) => {
      message.error(error.message || "助手回复失败");
    },
  });

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, mutation.isPending]);

  const submit = (value?: string) => {
    const content = (value ?? input).trim();
    if (!content || mutation.isPending) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    mutation.mutate(nextMessages);
  };

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
            {messages.map((item, index) => (
              <div
                key={`${item.role}-${index}`}
                className={`chat-bubble ${item.role === "user" ? "user" : "assistant"}`}
              >
                {item.content}
              </div>
            ))}
            {mutation.isPending && (
              <div className="chat-bubble assistant">
                <ThunderboltOutlined /> 正在思考…
              </div>
            )}
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
              loading={mutation.isPending}
              onClick={() => submit()}
            >
              发送
            </Button>
          </div>
        </div>

        <aside className="chat-side">
          <div className="panel">
            <h3 style={{ fontSize: 14 }}>快捷提问</h3>
            <p className="panel-sub">点击填入输入框，或直接发送。</p>
            <Space direction="vertical" size={8} style={{ width: "100%" }}>
              {PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="chat-prompt"
                  onClick={() => submit(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </Space>
          </div>

          <div className="panel">
            <h3 style={{ fontSize: 14 }}>
              <MessageOutlined /> 当前上下文
            </h3>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.8 }}>
              <div>猎聘 token：{token ? "已连接（仅当前标签页）" : "未连接"}</div>
              <div>模型：{health?.deepseek_configured ? "DeepSeek" : "演示回复"}</div>
              <div>数据：浏览器本地，不上传服务端数据库</div>
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
