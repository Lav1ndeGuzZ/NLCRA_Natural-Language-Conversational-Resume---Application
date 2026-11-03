import { useState } from "react";
import {
  ClearOutlined,
  CloudServerOutlined,
  KeyOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  App as AntApp,
  Button,
  Descriptions,
  Input,
  Space,
  Tag,
  Typography,
} from "antd";
import { getHealth } from "../api/client";
import { useSessionStore } from "../store/session";

export default function Settings() {
  const { message, modal } = AntApp.useApp();
  const token = useSessionStore((state) => state.token);
  const accessCode = useSessionStore((state) => state.accessCode);
  const setAccessCode = useSessionStore((state) => state.setAccessCode);
  const clear = useSessionStore((state) => state.clear);
  const [codeInput, setCodeInput] = useState(accessCode);
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: getHealth });

  const saveCode = () => {
    setAccessCode(codeInput.trim());
    message.success(codeInput.trim() ? "访问码已保存到当前标签页" : "已清除访问码");
  };

  const clearToken = () => {
    clear();
    message.success("已清除猎聘 token");
  };

  const clearAll = () => {
    modal.confirm({
      title: "清除当前浏览器里的所有本地数据？",
      content: "会清除猎聘 token、访问码、本地简历/投递记录（如有）。服务端没有你的数据副本。",
      okText: "清除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => {
        clear();
        setAccessCode("");
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch {
          // ignore
        }
        setCodeInput("");
        message.success("已清除本地数据");
      },
    });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>设置</h2>
          <p>无登录工具：没有账号体系；访问码和猎聘 token 都只存在当前浏览器标签页。</p>
        </div>
        <Tag color="blue">无服务端用户库</Tag>
      </div>

      <div className="connect-grid">
        <div className="panel">
          <h3>
            <KeyOutlined /> 访问码
          </h3>
          <p className="panel-sub">
            如果部署者设置了 <code>APP_ACCESS_CODE</code>，首次使用需要输入访问码。它不是账号，只用于防止公开部署被滥用。
          </p>
          <Input.Password
            value={codeInput}
            onChange={(event) => setCodeInput(event.target.value)}
            placeholder="输入部署者提供的访问码"
            autoComplete="off"
          />
          <div className="token-actions">
            <Button type="primary" onClick={saveCode}>
              保存访问码
            </Button>
            <Button
              onClick={() => {
                setCodeInput("");
                setAccessCode("");
                message.success("已清除访问码");
              }}
            >
              清除
            </Button>
          </div>
          <Alert
            style={{ marginTop: 16 }}
            type={health?.access_code_required ? "warning" : "success"}
            showIcon
            message={health?.access_code_required ? "服务端已启用访问码" : "服务端未启用访问码"}
            description={
              health?.access_code_required
                ? "请向部署者获取访问码；所有 /api 请求会带 x-access-code。"
                : "本地开发默认不启用；公开部署建议设置 APP_ACCESS_CODE。"
            }
          />
        </div>

        <div className="panel">
          <h3>
            <CloudServerOutlined /> 服务状态
          </h3>
          <p className="panel-sub">部署时由环境变量配置，用户无需填写 DeepSeek Key。</p>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="版本">{health?.version ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="环境">{health?.environment ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="猎聘 API">{health?.liepin_base_url ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="DeepSeek">
              {health?.deepseek_configured ? "已配置（服务端）" : "未配置 / 演示模式"}
            </Descriptions.Item>
            <Descriptions.Item label="演示模式">
              {health?.demo_mode ? "开启" : "关闭"}
            </Descriptions.Item>
            <Descriptions.Item label="猎聘 token">
              {token ? "当前标签页已连接" : "未连接"}
            </Descriptions.Item>
          </Descriptions>
        </div>
      </div>

      <div className="section-title">
        <h3>本地数据</h3>
      </div>

      <div className="panel">
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Typography.Text>
            当前工具不把简历/投递数据写入服务端数据库。猎聘 token、访问码存在 sessionStorage；未来的简历/投递数据会存 IndexedDB。
          </Typography.Text>
          <Space wrap>
            <Button danger icon={<ClearOutlined />} onClick={clearToken} disabled={!token}>
              清除猎聘 token
            </Button>
            <Button danger type="primary" icon={<SafetyCertificateOutlined />} onClick={clearAll}>
              清除所有本地数据
            </Button>
          </Space>
          <Alert
            type="info"
            showIcon
            message="部署提示"
            description="DeepSeek Key 通过后端 .env 的 DEEPSEEK_API_KEY 配置；不要把它写进前端、README 或提交到仓库。"
          />
        </Space>
      </div>
    </div>
  );
}
