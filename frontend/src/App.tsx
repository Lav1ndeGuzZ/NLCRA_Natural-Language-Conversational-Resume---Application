import { useMemo } from "react";
import {
  ApiOutlined,
  DashboardOutlined,
  FileTextOutlined,
  LinkOutlined,
  MessageOutlined,
  SearchOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Layout, Menu, Space, Tag, Typography } from "antd";
import { Link, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { getHealth } from "./api/client";
import { useSessionStore } from "./store/session";
import Dashboard from "./pages/Dashboard";
import Connect from "./pages/Connect";
import Jobs from "./pages/Jobs";
import Resume from "./pages/Resume";
import Chat from "./pages/Chat";
import Settings from "./pages/Settings";

const { Header, Sider, Content, Footer } = Layout;

const menuItems = [
  { key: "/", icon: <DashboardOutlined />, label: "工作台" },
  { key: "/connect", icon: <LinkOutlined />, label: "连接猎聘" },
  { key: "/jobs", icon: <SearchOutlined />, label: "职位搜索" },
  { key: "/resume", icon: <FileTextOutlined />, label: "简历中心" },
  { key: "/chat", icon: <MessageOutlined />, label: "对话助手" },
  { key: "/settings", icon: <SettingOutlined />, label: "设置" },
];

const pageTitles: Record<string, string> = {
  "/": "工作台",
  "/connect": "连接猎聘",
  "/jobs": "职位搜索",
  "/resume": "简历中心",
  "/chat": "对话助手",
  "/settings": "设置",
};

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = useSessionStore((state) => state.token);
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: getHealth });

  const selectedKey = useMemo(() => {
    if (location.pathname === "/") return "/";
    const match = menuItems.find((item) => item.key !== "/" && location.pathname.startsWith(item.key));
    return match?.key ?? "/";
  }, [location.pathname]);

  return (
    <Layout className="app-shell">
      <Sider
        className="app-sider"
        width={238}
        breakpoint="lg"
        collapsedWidth={0}
        theme="dark"
      >
        <div className="brand">
          <div className="brand-mark">职</div>
          <div>
            <div className="brand-name">职途</div>
            <div className="brand-sub">NLCRA 求职工作台</div>
          </div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          className="app-menu"
        />
        <div className="sider-note">
          <ApiOutlined />
          <span>只接入猎聘 · 无登录工具</span>
        </div>
      </Sider>

      <Layout>
        <Header className="app-header">
          <div>
            <Typography.Text className="header-kicker">NLCRA / FEASIBILITY BUILD</Typography.Text>
            <Typography.Title level={4} className="header-title">
              {pageTitles[selectedKey] ?? "职途"}
            </Typography.Title>
          </div>
          <Space size={8} wrap className="header-tags">
            <Tag color={token ? "green" : "default"}>{token ? "猎聘已连接" : "猎聘未连接"}</Tag>
            <Tag color={health?.deepseek_configured ? "blue" : "default"}>
              {health?.deepseek_configured ? "DeepSeek 已配置" : "DeepSeek 演示模式"}
            </Tag>
            {health?.demo_mode && <Tag color="gold">演示数据可用</Tag>}
            {health?.access_code_required && <Tag color="purple">已启用访问码</Tag>}
            <Link to="/connect" className="header-link">
              快速连接
            </Link>
          </Space>
        </Header>

        <Content className="app-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/connect" element={<Connect />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/resume" element={<Resume />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Content>

        <Footer className="app-footer">
          NLCRA · 对话式简历与精准投放 · 可行性版本 v0.1 · 数据默认保存在浏览器本地
        </Footer>
      </Layout>
    </Layout>
  );
}
