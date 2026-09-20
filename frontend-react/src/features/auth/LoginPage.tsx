import { useState, type FormEvent } from "react";
import { Banner, Button, Input } from "@douyinfe/semi-ui";
import type { DemoUser } from "@/types/crm";
import { authenticateDemoUser, DEMO_PASSWORD } from "./auth-session";

export function LoginPage({ users, initialUserId, onLogin }: { users: DemoUser[]; initialUserId: string; onLogin: (userId: string) => void }) {
  const initial = users.find((user) => user.id === initialUserId) ?? users[0];
  const [email, setEmail] = useState(initial?.email ?? ""), [password, setPassword] = useState(""), [error, setError] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = authenticateDemoUser(users, email, password);
    if (!result.user) { setError(result.error ?? "无法登录。"); return; }
    setError(""); onLogin(result.user.id);
  };
  return <main className="login-page">
    <section className="login-panel" aria-labelledby="login-title">
      <div className="login-brand">
        <span className="login-brand-mark"><img src="./kivisense-logo.svg" alt="" /></span>
        <div><strong>KIVISENSE</strong><small>CRM PROTOTYPE</small></div>
      </div>
      <div className="login-intro"><p>客户关系与品牌运营工作台</p><h1 id="login-title">登录 Kivisense CRM</h1><span>使用演示账号进入对应的角色与数据范围。</span></div>
      <form className="login-form" onSubmit={submit}>
        {error && <Banner type="danger" description={error} closeIcon={null} />}
        <label>邮箱<Input aria-label="登录邮箱" value={email} onChange={setEmail} autoComplete="username" /></label>
        <label>密码<Input aria-label="登录密码" type="password" value={password} onChange={setPassword} autoComplete="current-password" /></label>
        <Button htmlType="submit" theme="solid" block>登录</Button>
      </form>
      <div className="login-demo-note"><strong>演示账号</strong><span>{initial?.email}</span><span>密码：{DEMO_PASSWORD}</span><small>此页仅模拟前端登录会话，不连接真实账号系统。</small></div>
    </section>
  </main>;
}
