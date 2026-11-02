import { useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";

export const LEAVE_MESSAGE = "You have unsaved changes. Leave without saving?";

// While `dirty` is true:
//  * closing the tab or reloading asks first (beforeunload, the browser's own prompt);
//  * every in-app navigation that changes the page is blocked, whether it is a link, the
//    browser's Back or Forward button, or a programmatic navigate(). The page shows
//    <LeavePrompt blocker={blocker} /> so the user can stay or leave on purpose.
// Nothing is asked while there is nothing unsaved. Needs a data router (see App.jsx).
//
// allowLeave() skips the prompt for one deliberate navigation made by the page itself,
// for example right after a successful save, when state has not caught up yet.
export default function useUnsavedGuard(dirty) {
  const skip = useRef(false);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (skip.current || !dirty) return false;
    return (
      currentLocation.pathname !== nextLocation.pathname ||
      currentLocation.search !== nextLocation.search
    );
  });

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const allowLeave = () => {
    skip.current = true;
  };
  return { blocker, allowLeave };
}
