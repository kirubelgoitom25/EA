// Screen history for App.js. The app keeps a stack of screen names; the
// last one is on screen. Plain functions (no React) so they're easy to test.
//
// - push: open a screen on top (course, lesson, questions…)
// - switchTab: bottom-nav tabs start a fresh stack
// - back: one step back. On a tab root other than Home, back goes to Home;
//   on Home it isn't handled, so Android closes the app as usual.

export const TABS = ["home", "courses", "ranking", "profile"];
export const HOME = "home";
export const LOGIN = "login";

export const currentScreen = (stack) => stack[stack.length - 1];

export function push(stack, screen) {
  if (currentScreen(stack) === screen) {
    return stack;
  }
  return [...stack, screen];
}

export function switchTab(stack, tab) {
  if (stack.length === 1 && stack[0] === tab) {
    return stack;
  }
  return [tab];
}

// Returns { stack, handled }. handled is false when there's nowhere to go
// back to, so the caller can let the system handle it (exit on Android).
export function back(stack) {
  if (stack.length > 1) {
    return { stack: stack.slice(0, -1), handled: true };
  }

  const screen = currentScreen(stack);
  if (screen !== HOME && TABS.includes(screen)) {
    return { stack: [HOME], handled: true };
  }

  return { stack, handled: false };
}
