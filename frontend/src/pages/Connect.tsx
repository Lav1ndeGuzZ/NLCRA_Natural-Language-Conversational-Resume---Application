import { useState } from "react";
import {
  CheckCircleOutlined,
  DisconnectOutlined,
  LinkOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { Alert, App as AntApp, Button, Input, Space, Tag, Typography } from "antd";
import { getLiepinResume } from "../api/client";
import { useSessionStore } from "../store/session";

type Basics = {
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
};

function extractBasics(data: unknown): Basics {
  if (!data || typeof data !== "object") return {};
  const root = data as Record<string, unknown>;
  const candidate =
    (root.basics as Record<string, unknown> | undefined) ??
    (root.base as Record<string, unknown> | undefined) ??
    (root.data as Record<string, unknown> | undefined) ??
    root;
  return {
    name: typeof candidate.name === "string" ? candidate.name : undefined,
    phone: typeof candidate.phone === "string" ? candidate.phone : undefined,
    email: typeof candidate.email === "string" ? candidate.email : undefined,
    city: typeof candidate.city === "string" ? candidate.city : undefined,
  };
}

export default function Connect() {
  const { message } = AntApp.useApp();
  const token = useSessionStore((state) => state.token);
  const setToken = useSessionStore((state) => state.setToken);
  const clear = useSessionStore((state) => state.clear);
  const [tokenInput, setTokenInput] = useState("");
  const [basics, setBasics] = useState<Basics | null>(null);

  const verifyMutation = useMutation({
    mutationFn: (value: string) => getLiepinResume(value),
    onSuccess: (result, value) => {
      setToken(value);
      setTokenInput("");
      const data = result.data as unknown;
      const parsed = extractBasics(data);
      setBasics(parsed);
      message.success(`猎聘连接成功${parsed.name ? `，你好，${parsed.name}` : ""}`);
    },
    onError: (error: Error) => {
      message.error(error.message || "连接失败，请检查 token");
    },
  });

  const handleConnect = () => {
    const value = tokenInput.trim();
    if (!value) {
      message.warning("请先粘贴猎聘 token");
      return;
    }
    verifyMutation.mutate(value);
  };

  const handleVerify = () => {
    if (token) verifyMutation.mutate(token);
  };

  const handleDisconnect = () => {
    clear();
    setBasics(null);
    message.success("已断开猎聘连接，本地 token 已清除");
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>连接猎聘</h2>
          <p>
            猎聘提供官方 Agent 授权页。登录后生成 token，粘贴到这里即可读取/补充简历、搜索职位并发起投递。
          </p>
        </div>
        <Tag color={token ? "green" : "default"}>{token ? "已连接" : "未连接"}</Tag>
      </div>

      <div className="connect-grid">
        <div className="panel">
          <h3>三步完成连接</h3>
          <p className="panel-sub">
            我们不保存你的猎聘密码。token 只存在当前浏览器标签页的 sessionStorage 中，关闭标签页即失效。
          </p>

          <div className="instruction-list">
            <div className="instruction">
              <div className="instruction-num">1</div>
              <div>
                <strong>打开猎聘授权页</strong>
                <span>在猎聘网页登录，点击「立即生成凭证」。</span>
                <div style={{ marginTop: 8 }}>
                  <Button
                    type="primary"
                    ghost
                    icon={<LinkOutlined />}
                    href="https://www.liepin.com/mcp/auth"
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开猎聘授权页
                  </Button>
                </div>
              </div>
            </div>
            <div className="instruction">
              <div className="instruction-num">2</div>
              <div>
                <strong>复制 token</strong>
                <span>token 形如一段长字符串；有效期 90 天，重置后旧 token 立即失效。</span>
              </div>
            </div>
            <div className="instruction">
              <div className="instruction-num">3</div>
              <div>
                <strong>粘贴并验证</strong>
                <span>验证成功后即可进入职位搜索与简历同步。</span>
              </div>
            </div>
          </div>

          <div className="token-input">
            <Typography.Text strong style={{ fontSize: 12 }}>
              猎聘 token
            </Typography.Text>
            <Input.Password
              size="large"
              placeholder="粘贴 x-user-token"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              onPressEnter={handleConnect}
              autoComplete="off"
              iconRender={(visible) =>
                visible ? <LockOutlined /> : <LockOutlined style={{ opacity: 0.45 }} />
              }
              style={{ marginTop: 8 }}
            />
            <div className="token-actions">
              <Button
                type="primary"
                loading={verifyMutation.isPending}
                onClick={handleConnect}
                icon={<LinkOutlined />}
              >
                验证并连接
              </Button>
              {token && (
                <Button icon={<CheckCircleOutlined />} onClick={handleVerify}>
                  重新验证
                </Button>
              )}
              {token && (
                <Button danger icon={<DisconnectOutlined />} onClick={handleDisconnect}>
                  断开连接
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="panel">
          <h3>连接状态</h3>
          <p className="panel-sub">token 是账号级凭证，请只在可信环境使用。</p>

          {token ? (
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Alert
                type="success"
                showIcon
                message="猎聘已连接"
                description={
                  basics?.name
                    ? `已读取到简历：${basics.name}${basics.city ? ` · ${basics.city}` : ""}`
                    : "token 已保存在当前标签页；可到「简历中心」读取猎聘简历。"
                }
              />
              {(basics?.phone || basics?.email) && (
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    联系方式
                  </Typography.Text>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    {[basics.phone, basics.email].filter(Boolean).join(" · ")}
                  </div>
                </div>
              )}
              <Alert
                type="info"
                showIcon
                icon={<SafetyCertificateOutlined />}
                message="Token 不会写入服务端数据库"
                description="后端只做逐请求转发，不持久化 token，也不记录 token 日志。关闭标签页后需重新粘贴。"
              />
            </Space>
          ) : (
            <div className="empty-state">
              <LockOutlined style={{ fontSize: 30, color: "#cbd5e1" }} />
              <div style={{ marginTop: 10 }}>还没有连接猎聘</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                按左侧步骤生成 token 后粘贴到输入框。
              </div>
            </div>
          )}

          <Alert
            style={{ marginTop: 16 }}
            type="warning"
            showIcon
            message="使用边界"
            description="当前猎聘 Agent API 只支持搜索、查看、完善简历与投递；投递状态需回猎聘 App 查看。工具不做服务端自动投递。"
          />
        </div>
      </div>
    </div>
  );
}
