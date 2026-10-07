export default function LoadingScreen({ message = "Loading…" }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-badge-wrap">
        <span className="loading-ring" />
        <span className="brand-badge loading-badge">EA</span>
      </div>
      <p className="loading-message">{message}</p>
    </div>
  );
}
