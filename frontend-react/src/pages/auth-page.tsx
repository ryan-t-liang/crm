import { useState } from "react";
import { assetUrl, crmApi, ApiError, type SessionUser } from "@/lib/api";
import { friendlyError } from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  PageContent,
  PageHeader,
  Section,
} from "@/components/crm/primitives";

export function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [account, setAccount] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="crm-auth-page flex min-h-svh items-center justify-center p-6">
      <section className="crm-auth-card w-full max-w-sm border bg-background p-7">
        <div className="mb-7 flex items-center gap-3">
          <span className="crm-auth-logo border p-2">
            <img
              className="size-6 object-contain"
              src={assetUrl("/assets/kivisense-logo.svg")}
              alt="Kivisense"
            />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-wider">KIVISENSE</p>
            <p className="text-xs text-muted-foreground">CRM 2.0</p>
          </div>
        </div>
        <h1 className="crm-display-title">登录</h1>
        <p className="mt-2 text-sm text-muted-foreground">使用工作账号继续。</p>
        <form
          className="mt-6 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            void crmApi("/api/v1/auth/login", {
              method: "POST",
              body: JSON.stringify({ loginAccount: account, password }),
            })
              .then(() => {
                setPassword("");
                onSignedIn();
              })
              .catch((e) =>
                setError(
                  e instanceof ApiError && e.status < 500
                    ? e.message
                    : friendlyError(e),
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          <Field label="登录账号" required>
            {(id) => (
              <Input
                id={id}
                type="email"
                autoComplete="username"
                required
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="name@company.com"
              />
            )}
          </Field>
          <Field label="密码" required>
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "登录中…" : "登录"}
          </Button>
        </form>
        <p className="mt-5 text-xs leading-5 text-muted-foreground">
          忘记密码？请联系系统管理员重置。
        </p>
      </section>
    </main>
  );
}
export function PasswordPage({
  me,
  onSaved,
  onLogout,
}: {
  me: SessionUser;
  onSaved: () => void;
  onLogout: () => void;
}) {
  const [currentPassword, setCurrent] = useState(""),
    [newPassword, setNew] = useState(""),
    [confirmPassword, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <PageContent>
      <PageHeader
        title={me.mustChangePassword ? "首次登录 · 修改密码" : "账户安全"}
        description={
          me.mustChangePassword
            ? "请先设置新密码，再进入 CRM。"
            : "更新密码后，其他登录会话将退出。"
        }
      />
      <div className="max-w-xl">
        <Section title="修改密码">
          <p className="mb-5 text-sm text-muted-foreground">
            {me.loginAccount}
          </p>
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (newPassword !== confirmPassword) {
                setError("两次输入的新密码不一致。");
                return;
              }
              setBusy(true);
              setError("");
              void crmApi("/api/v1/auth/change-password", {
                method: "POST",
                body: JSON.stringify({
                  currentPassword,
                  newPassword,
                  confirmPassword,
                }),
              })
                .then(onSaved)
                .catch((e) => setError(friendlyError(e)))
                .finally(() => setBusy(false));
            }}
          >
            <Field label="当前密码" required>
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrent(e.target.value)}
                />
              )}
            </Field>
            <Field label="新密码" required>
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={newPassword}
                  onChange={(e) => setNew(e.target.value)}
                />
              )}
            </Field>
            <Field label="确认新密码" required>
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={confirmPassword}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              )}
            </Field>
            <p className="text-xs text-muted-foreground">
              至少 12
              位，避免纯数字、重复字符与常见弱密码，不得使用系统初始密码。
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={onLogout}
                disabled={busy}
              >
                退出登录
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "保存中…" : "更新密码"}
              </Button>
            </div>
          </form>
        </Section>
      </div>
    </PageContent>
  );
}
