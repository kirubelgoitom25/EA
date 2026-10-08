import { useEffect, useState } from "react";
import { api } from "./api.js";

const POLL_MS = 30000;

// Loads who is online in a class and refreshes every 30 seconds while the
// browser tab is visible. Errors are ignored: the last known data stays.
// Returns { [studentId]: presence }.
export function usePresence(classId) {
  const [presence, setPresence] = useState({});

  useEffect(() => {
    setPresence({});
    if (!classId) return undefined;

    let active = true;
    let timer = null;

    const load = async () => {
      try {
        const list = await api.get(
          `/classes/${encodeURIComponent(classId)}/presence`,
        );
        if (active)
          setPresence(Object.fromEntries(list.map((p) => [p.student_id, p])));
      } catch {
        // keep showing what we had
      }
    };

    const start = () => {
      load();
      timer = setInterval(load, POLL_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      stop();
      if (!document.hidden) start();
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [classId]);

  return presence;
}
