import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import LoadingScreen from "../components/LoadingScreen.jsx";
import "./Login.css";

export default function Login() {
  const { profile, loading, notice, clearNotice, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Wake the free-tier server while the teacher types. Nothing is sent or read.
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/health`, { mode: "no-cors" }).catch(
      () => {},
    );
  }, []);

  if (loading) return <LoadingScreen message="Loading…" />;
  if (profile) return <Navigate to="/" replace />;
  if (busy) return <LoadingScreen message="Signing you in…" />;

  async function handleSubmit(event) {
    event.preventDefault();
    clearNotice();
    setError("");
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const message = error || notice;

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <span className="brand-badge login-badge">EA</span>
        <h1>Teacher sign in</h1>
        <p className="login-sub">See how your classes are doing.</p>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {message && (
          <p className="notice" role="alert">
            {message}
          </p>
        )}

        <button className="btn" type="submit" disabled={!email || !password}>
          Sign in
        </button>
      </form>
    </div>
  );
}
