from __future__ import annotations

from typing import Any

DEMO_RESUME: dict[str, Any] = {
    "basics": {
        "name": "林晚晴",
        "sex": "女",
        "birthday": "1998-06-12",
        "city": "上海",
        "phone": "138****1234",
        "email": "demo@example.com",
        "wechat": "demo_lwq",
    },
    "selfAssess": "3 年 B 端产品经验，擅长把模糊需求拆成可交付的流程与指标；有数据分析与跨团队协作经验。",
    "education": [
        {
            "school": "华东师范大学",
            "major": "信息管理与信息系统",
            "degree": "本科",
            "start": "2016-09",
            "end": "2020-06",
        }
    ],
    "work": [
        {
            "company": "某企业服务 SaaS",
            "title": "产品经理",
            "start": "2022-03",
            "end": "至今",
            "description": "负责客户运营与数据看板产品线，覆盖 200+ 企业客户。",
            "highlights": [
                "重构客户分层与触达流程，试用转付费率提升 18%",
                "搭建经营看板，把周报制作时间从 4 小时降到 30 分钟",
            ],
        },
        {
            "company": "某互联网教育公司",
            "title": "产品助理",
            "start": "2020-07",
            "end": "2022-02",
            "description": "负责课程详情页与转化链路，协同设计、研发、运营。",
            "highlights": ["完成 3 次 A/B 测试，详情页转化率提升 12%"],
        },
    ],
    "projects": [
        {
            "name": "客户健康度评分",
            "role": "产品负责人",
            "start": "2023-05",
            "end": "2023-10",
            "description": "基于使用频次、工单、续费风险构建健康度模型，输出运营动作建议。",
            "tech": ["SQL", "Python", "Tableau"],
        }
    ],
    "skills": [
        {"name": "需求分析", "level": "熟练"},
        {"name": "SQL", "level": "熟练"},
        {"name": "A/B 测试", "level": "了解"},
        {"name": "Figma", "level": "熟练"},
    ],
    "jobWant": {
        "jobtitle": "产品经理",
        "city": "上海",
        "salaryLow": 25,
        "salaryHigh": 35,
        "salaryMonths": 14,
        "workType": "社招",
    },
}

DEMO_JOBS: list[dict[str, Any]] = [
    {
        "job_id": 900001,
        "job_kind": "2",
        "title": "B 端产品经理（客户运营方向）",
        "company": "星云科技",
        "city": "上海·徐汇",
        "salary": "25-35K·14薪",
        "experience": "3-5 年",
        "education": "本科",
        "tags": ["SaaS", "客户成功", "数据看板"],
        "match_score": 88,
        "source": "demo",
    },
    {
        "job_id": 900002,
        "job_kind": "2",
        "title": "产品经理（数据分析平台）",
        "company": "澄明数据",
        "city": "上海·浦东",
        "salary": "28-40K·15薪",
        "experience": "3-5 年",
        "education": "本科",
        "tags": ["数据产品", "SQL", "BI"],
        "match_score": 84,
        "source": "demo",
    },
    {
        "job_id": 900003,
        "job_kind": "2",
        "title": "增长产品经理",
        "company": "一页科技",
        "city": "杭州·余杭",
        "salary": "25-38K·14薪",
        "experience": "3-5 年",
        "education": "本科",
        "tags": ["增长", "A/B 测试", "用户运营"],
        "match_score": 79,
        "source": "demo",
    },
    {
        "job_id": 900004,
        "job_kind": "2",
        "title": "企业服务产品经理",
        "company": "远山软件",
        "city": "上海·静安",
        "salary": "22-32K·13薪",
        "experience": "3-5 年",
        "education": "本科",
        "tags": ["ERP", "流程设计", "B 端"],
        "match_score": 76,
        "source": "demo",
    },
    {
        "job_id": 900005,
        "job_kind": "1",
        "title": "产品运营（客户成功）",
        "company": "青禾云",
        "city": "上海·杨浦",
        "salary": "18-25K·13薪",
        "experience": "1-3 年",
        "education": "本科",
        "tags": ["客户成功", "运营", "SaaS"],
        "match_score": 72,
        "source": "demo",
    },
    {
        "job_id": 900006,
        "job_kind": "2",
        "title": "高级产品经理（AI 应用）",
        "company": "知行智能",
        "city": "上海·张江",
        "salary": "35-50K·15薪",
        "experience": "5-10 年",
        "education": "本科",
        "tags": ["AI", "LLM", "B 端"],
        "match_score": 68,
        "source": "demo",
    },
]

DEMO_CHAT_REPLY = (
    "我是演示模式下的求职助手。当前没有配置 DeepSeek Key，所以先用固定回复展示交互。\n\n"
    "你可以先做三件事：\n"
    "1. 到「连接猎聘」粘贴 token，读取真实简历；\n"
    "2. 到「职位搜索」用演示数据体验匹配与投递流程；\n"
    "3. 部署时在 `.env` 配置 `DEEPSEEK_API_KEY`，我就会接入真实模型。"
)
