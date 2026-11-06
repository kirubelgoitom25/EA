// Pure helpers for selling courses. No React and no network, so they can be tested alone.
// The rules mirror docs/API_CONTRACT.md; the backend stays the authority.

export const MAX_INSTRUCTIONS_LEN = 2000;
export const MAX_NOTE_LEN = 500;
export const MAX_PRICE = 1000000;
export const MAX_ACCESS_DAYS = 36500;

export const DURATIONS = [
  { key: "permanent", label: "Permanent", days: null },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "3 months (90 days)", days: 90 },
  { key: "365", label: "1 year (365 days)", days: 365 },
  { key: "custom", label: "Custom" },
];

export const durationKey = (days) =>
  DURATIONS.find((d) => d.key !== "custom" && d.days === (days ?? null))?.key ?? "custom";

export function durationLabel(days) {
  if (days === null || days === undefined) return "Permanent access";
  if (days === 90) return "3 months";
  if (days === 365) return "1 year";
  return `${days} day${days === 1 ? "" : "s"}`;
}

// The server sends amounts as strings such as "500.00".
export function money(amount, currency = "ETB") {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency}`;
  const text = value.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${text} ${currency}`;
}

export function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Checks the pricing form and builds what to send. Returns { ok, reason, values }.
export function pricingCheck({ paid, price, duration, customDays, instructions }) {
  if (!paid) return { ok: true, reason: "", values: { price: "0" } };

  const amount = Number(price);
  if (String(price).trim() === "" || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: "Enter a price above 0, or choose Free." };
  }
  if (amount > MAX_PRICE) return { ok: false, reason: `The price can be at most ${MAX_PRICE.toLocaleString("en-US")}.` };
  if (Math.round(amount * 100) / 100 !== amount) {
    return { ok: false, reason: "The price can have at most 2 decimal places." };
  }

  let days = DURATIONS.find((d) => d.key === duration)?.days ?? null;
  if (duration === "custom") {
    days = Number(customDays);
    if (!Number.isInteger(days) || days < 1 || days > MAX_ACCESS_DAYS) {
      return { ok: false, reason: `Enter a whole number of days, from 1 to ${MAX_ACCESS_DAYS}.` };
    }
  }

  const text = (instructions ?? "").trim();
  if (!text) return { ok: false, reason: "Tell students how to pay you." };
  return {
    ok: true,
    reason: "",
    values: { price: String(price).trim(), access_days: days, payment_instructions: text },
  };
}

// What a reviewer needs to know before deciding, in plain words.
export function reviewWarnings(item) {
  const warnings = [];
  const access = item.current_access;
  const after = item.after_approval;
  if (access?.state === "active" && after) {
    if (!access.expires_at) {
      warnings.push("This student already has permanent access. Approving will not change it.");
    } else if (after.permanent) {
      warnings.push(`This student has access until ${formatDate(access.expires_at)}. Approving makes it permanent.`);
    } else {
      warnings.push(
        `This student has access until ${formatDate(access.expires_at)}. Approving extends it to ${formatDate(after.expires_at)}.`,
      );
    }
  }
  if (access?.state === "revoked" && after) warnings.push("This student's access was revoked earlier. Approving gives it back.");
  if (item.terms_changed) {
    warnings.push(
      `Your terms have changed since this was sent. Approving honours what the student saw: ${money(item.amount, item.currency)}, ${durationLabel(item.access_days)}.`,
    );
  }
  if (item.image_reused) warnings.push("This same image is on another request. Check it is a new payment.");
  return warnings;
}

export const ACCESS_LABEL = { active: "Active", expired: "Expired", revoked: "Revoked" };
export const SOURCE_LABEL = { payment: "Paid", existing_learner: "Existing learner", admin: "Given by admin" };

export function accessLine(row) {
  if (row.state === "revoked") return "Revoked";
  if (!row.expires_at) return "Permanent";
  return `${row.state === "expired" ? "Ended" : "Until"} ${formatDate(row.expires_at)}`;
}
