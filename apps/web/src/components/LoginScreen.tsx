import { useState } from "react";

type Props = {
  onSubmit: (email: string, password: string) => Promise<void>;
  errorMessage?: string;
  loading?: boolean;
  infoMessage?: string;
};

export function LoginScreen({ onSubmit, errorMessage, loading, infoMessage }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main className="login-shell">
      <section className="login-panel">
        <p className="eyebrow">MakeReadyOS</p>
        <h1>Sign in</h1>
        <p className="login-copy">Use the self-hosted admin account or a provisioned staff user to access the board.</p>
        {infoMessage ? <div className="login-info">{infoMessage}</div> : null}

        <form
          className="login-form"
          onSubmit={async (event) => {
            event.preventDefault();
            await onSubmit(email, password);
          }}
        >
          <label>
            Email
            <input
              data-testid="login-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="admin@example.com"
              required
            />
          </label>

          <label>
            Password
            <input
              data-testid="login-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder="Enter your password"
              required
            />
          </label>

          {errorMessage ? <div className="login-error">{errorMessage}</div> : null}

          <button data-testid="login-submit" className="button button-primary login-button" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
