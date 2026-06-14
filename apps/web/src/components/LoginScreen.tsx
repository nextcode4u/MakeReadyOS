import { useState } from "react";
import type { UserLanguage } from "../lib/api";
import { languageOptions, t } from "../lib/i18n";

type Props = {
  onSubmit: (email: string, password: string) => Promise<void>;
  errorMessage?: string;
  loading?: boolean;
  infoMessage?: string;
  language?: UserLanguage;
};

export function LoginScreen({ onSubmit, errorMessage, loading, infoMessage, language = "en" }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState<UserLanguage>(language);

  return (
    <main className="login-shell">
      <section className="login-panel">
        <p className="eyebrow">MakeReadyOS</p>
        <h1>{t(selectedLanguage, "auth.signIn")}</h1>
        <p className="login-copy">{t(selectedLanguage, "auth.copy")}</p>
        {infoMessage ? <div className="login-info">{infoMessage}</div> : null}

        <form
          className="login-form"
          onSubmit={async (event) => {
            event.preventDefault();
            await onSubmit(email, password);
          }}
        >
          <label>
            {t(selectedLanguage, "language.label")}
            <select
              data-testid="login-language"
              value={selectedLanguage}
              onChange={(event) => setSelectedLanguage(event.target.value as UserLanguage)}
            >
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.nativeLabel}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t(selectedLanguage, "auth.email")}
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
            {t(selectedLanguage, "auth.password")}
            <input
              data-testid="login-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder={t(selectedLanguage, "auth.passwordPlaceholder")}
              required
            />
          </label>

          {errorMessage ? <div className="login-error">{errorMessage}</div> : null}

          <button data-testid="login-submit" className="button button-primary login-button" type="submit" disabled={loading}>
            {loading ? t(selectedLanguage, "auth.submitting") : t(selectedLanguage, "auth.submit")}
          </button>
        </form>
      </section>
    </main>
  );
}
