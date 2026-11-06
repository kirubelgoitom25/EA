// How a course's price and access read on screen. Plain functions (no React) so they're easy to
// test. These only decide what to SHOW: the server decides what a student can open, on every call.

const OPEN_STATES = ["free", "class", "active"];

// A server that doesn't send access yet (or a free course) counts as open.
export const isOpen = (course) => OPEN_STATES.includes(course?.access?.state ?? "free");
export const isLocked = (course) => !isOpen(course);

export const isPaid = (course) => Number(course?.price) > 0;

export function money(amount, currency = "ETB") {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency}`;
  const whole = Number.isInteger(value);
  const text = (whole ? String(value) : value.toFixed(2)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${text} ${currency}`;
}

export function durationText(days) {
  if (days === null || days === undefined) return "Permanent access";
  if (days === 90) return "3 months of access";
  if (days === 365) return "1 year of access";
  return `${days} day${days === 1 ? "" : "s"} of access`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dateText(value) {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

// The short line on a course row. Null when there is nothing to say (a free course).
export function accessLine(course) {
  const access = course?.access;
  if (!isPaid(course) || !access) return null;
  if (access.state === "class") return "Included with your class";
  if (access.state === "active") {
    return access.expiresAt ? `Access until ${dateText(access.expiresAt)}` : "Permanent access";
  }
  if (access.pendingRequests > 0) return "Payment being reviewed";
  if (access.state === "expired") return "Access ended";
  if (access.state === "revoked") return "Access removed";
  return money(course.price, course.currency);
}

// Time-limited access can be renewed any time. There's nothing to buy on top of permanent access.
export const canRenew = (course) =>
  isPaid(course) && course?.access?.state === "active" && Boolean(course.access.expiresAt);

export const buyLabel = (course) =>
  course?.access?.state === "expired" || canRenew(course) ? "Renew access" : "Get access";

// "Your courses" lives on the phone. A course the student paid for belongs there automatically.
export function withPurchased(ids, courses) {
  const purchased = (courses ?? [])
    .filter((course) => isPaid(course) && course.access?.state === "active")
    .map((course) => course.id);
  const missing = purchased.filter((id) => !ids.includes(id));
  return missing.length ? [...ids, ...missing] : ids;
}

export const REQUEST_STATUS = {
  pending: { label: "Pending", tone: "pending" },
  approved: { label: "Approved", tone: "approved" },
  rejected: { label: "Rejected", tone: "rejected" },
};
