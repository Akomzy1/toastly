/**
 * Labels for the console's Support tab. Client-safe: no I/O.
 */
export const SUPPORT_CATEGORY_LABEL: Record<string, string> = {
  threat: "Threats",
  harassed: "Harassment",
  unsafe: "Feels unsafe",
  money_request: "Asked for money",
  scam: "Possible scam",
  under_18: "Possibly under 18",
  self_harm: "Self-harm",
  refund: "Refund",
  dispute: "Dispute",
  charged_no_plan: "Charged, no plan",
  appeal: "Appeal",
  restriction: "Restriction",
  verification_repeat: "Verification keeps failing",
  data_request: "Data access or deletion",
  verification: "Verification",
  payment: "Payment",
  coins: "Coins",
  plan: "Plan",
  how_it_works: "How Toastly works",
  other: "Other",
  safety: "Safety (before 0042)",
};

export const SUPPORT_TRIGGER_LABEL: Record<string, string> = {
  member_asked: "Member asked for a person",
  rule_topic: "A person decides this topic",
  safety: "Safety topic",
  not_resolved: "Not resolved by Toastly Help",
};

export const SUPPORT_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  replied: "Replied",
  resolved: "Resolved",
};

export const SUPPORT_STATUS_STYLE: Record<string, string> = {
  open: "bg-green-50 border-green-500/30 text-green-550",
  replied: "bg-grey-100 border-ink-900/[.14] text-ink-800",
  resolved: "bg-white border-ink-900/[.18] text-grey-600",
};

export const PLAN_LABEL: Record<string, string> = {
  starter: "Starter",
  premium: "Premium",
  premium_plus: "Premium Plus",
  diaspora: "Diaspora",
  diaspora_plus: "Diaspora Plus",
};

export const VERIFICATION_LABEL: Record<string, string> = {
  unverified: "Not verified",
  phone_verified: "Phone confirmed",
  verified_real: "Verified Real",
  id_confirmed: "Verified Real + ID",
};
