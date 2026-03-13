import { getStoredLocale, translateApiError, t } from "@/lib/locale";
import { getStoredRefreshToken, setStoredTokens, clearStoredTokens } from "@/lib/session";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8003";
const PREFIX = `${API}/api/v1`;
let unauthorizedHandler: (() => void) | null = null;

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ApiError extends Error {
  code?: string;
  rawDetail?: string | Record<string, unknown> | null;
  status?: number;

  constructor(message: string, options?: { code?: string; rawDetail?: string | Record<string, unknown> | null; status?: number }) {
    super(message);
    this.name = "ApiError";
    this.code = options?.code;
    this.rawDetail = options?.rawDetail;
    this.status = options?.status;
  }
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

function handleUnauthorizedState() {
  clearStoredTokens();
  unauthorizedHandler?.();
  if (typeof window === "undefined") return;

  const { pathname, search } = window.location;
  const next = `${pathname}${search}`;
  const isAdminRoute = pathname.startsWith("/admin");
  const isLoginRoute = pathname === "/login" || pathname === "/admin/login";
  if (isLoginRoute) return;

  const target = isAdminRoute
    ? `/admin/login?next=${encodeURIComponent(next)}`
    : `/login?next=${encodeURIComponent(next)}`;
  window.location.replace(target);
}

export type UserProfile = {
  id: string;
  username: string;
  email: string;
  email_verified: boolean;
  preferred_language: "zh-CN" | "en";
  status: string;
};

export type InviteCode = {
  id: string;
  code: string;
  owner_user_id: string | null;
  created_by_user_id: string;
  used_by_user_id?: string | null;
  is_active: boolean;
  used_at?: string | null;
  created_at: string;
};

export type AdminDailyStatPoint = {
  date: string;
  value: number;
};

export type AdminDashboardSummary = {
  total_users: number;
  new_users_today: number;
  tasks_today: number;
  succeeded_today: number;
  failed_today: number;
  processing_now: number;
  active_subscriptions: number;
};

export type AdminMfaStatus = {
  enabled: boolean;
  configured: boolean;
  confirmed_at?: string | null;
};

export type AdminMfaSetup = {
  secret: string;
  otpauth_url: string;
  qr_svg: string;
};

export type AdminDashboardDailyStats = {
  new_users: AdminDailyStatPoint[];
  tasks_created: AdminDailyStatPoint[];
};

export type AdminUserListItem = {
  id: string;
  username: string;
  email: string;
  email_verified: boolean;
  preferred_language: "zh-CN" | "en";
  status: string;
  invited_by_code?: string | null;
  created_at: string;
};

export type AdminUserListResult = {
  items: AdminUserListItem[];
  total: number;
  page: number;
  page_size: number;
};

export type AdminTaskListItem = {
  id: string;
  user_id: string;
  username: string;
  email: string;
  task_type: string;
  service_tier: string;
  status: string;
  provider_name?: string | null;
  provider_status?: string | null;
  planned_quota_consumed: number;
  charged_quota_consumed: number;
  charge_status: string;
  queued_at: string;
  processing_started_at?: string | null;
  finished_at?: string | null;
  queue_wait_seconds?: number | null;
  processing_seconds?: number | null;
  total_elapsed_seconds?: number | null;
  provider_task_id?: string | null;
  provider_submitted_at?: string | null;
  provider_last_polled_at?: string | null;
  provider_completed_at?: string | null;
  error_code?: string | null;
  error_source?: string | null;
  error_detail?: string | null;
  error_retryable?: boolean | null;
  error_message?: string | null;
  created_at: string;
  resolution: string;
  aspect_ratio: string;
  duration_seconds: number;
  prompt: string;
  video_key?: string | null;
};

export type AdminTaskListResult = {
  items: AdminTaskListItem[];
  total: number;
  page: number;
  page_size: number;
};

export type QuotaSnapshot = {
  subscription_plan_type: string | null;
  subscription_status: string | null;
  subscription_is_local_trial: boolean;
  subscription_is_billing_managed: boolean;
  subscription_cancel_at_period_end: boolean;
  subscription_current_period_end: string | null;
  subscription_remaining: number;
  package_remaining: number;
  paid_package_remaining: number;
  signup_bonus_remaining: number;
  invite_bonus_remaining: number;
  total_available: number;
  access_tier: "signup_bonus" | "basic" | "pro" | "ultimate" | "none";
  capabilities: string[];
  can_purchase_quota_package: boolean;
  limits: {
    short_fixed_duration_seconds: number | null;
    short_duration_editable: boolean;
    allowed_resolutions: string[];
    allowed_aspect_ratios: string[];
    storage_days_display: number | null;
  };
};

export type SubscriptionPlan = {
  id: string;
  plan_type: string;
  name: string;
  quota_per_month: number;
  price_cad: string;
  storage_days: number;
};

export type QuotaPackagePlan = {
  id: string;
  package_type: string;
  name: string;
  quota_amount: number;
  price_cad: string;
  validity_days: number | null;
};

export type CheckoutSessionResult = {
  checkout_url: string;
};

export type CustomerPortalResult = {
  portal_url: string;
};

export type ChargeReconciliationItem = {
  task_id: string;
  task_type: string;
  status: string;
  planned_quota_consumed: number;
  charged_quota_consumed: number;
  charge_status: string;
  charged_at?: string | null;
  created_at: string;
  finished_at?: string | null;
};

export type ChargeReconciliation = {
  total_tasks: number;
  planned_total: number;
  charged_total: number;
  successful_short_tasks: number;
  successful_long_tasks: number;
  successful_long_segments: number;
  pending_reserved_total: number;
  items: ChargeReconciliationItem[];
};

export type SceneTemplate = {
  id: string;
  template_key: string;
  name: string;
  property_types: SceneTemplatePropertyType[];
  sort_order: number;
};

export type SceneTemplatePropertyType = "standard_home" | "luxury_home" | "apartment_rental";

export type UserLogo = {
  id: string;
  key: string;
  name: string;
  is_default: boolean;
};

export type UserAvatar = {
  id: string;
  key: string;
  name: string;
  is_default: boolean;
};

export type ProfileCardOptionFlags = {
  include_avatar: boolean;
  include_name: boolean;
  include_phone: boolean;
  include_address: boolean;
  include_brokerage_name: boolean;
  include_logo: boolean;
};

export type ProfileCardTemplateKey = "clean_light" | "brand_dark" | "agent_focus";

export type ProfileCard = {
  id: string;
  display_name: string;
  template_key: ProfileCardTemplateKey;
  full_name: string;
  slogan: string;
  phone: string;
  contact_address: string;
  homepage: string;
  email: string;
  brokerage_name: string;
  avatar_asset_id?: string | null;
  logo_asset_id?: string | null;
  is_default: boolean;
  show_avatar_default: boolean;
  show_name_default: boolean;
  show_phone_default: boolean;
  show_address_default: boolean;
  show_brokerage_default: boolean;
  show_logo_default: boolean;
  created_at: string;
  updated_at: string;
};

export type UpsertProfileCardBody = Omit<ProfileCard, "id" | "created_at" | "updated_at">;

export type AvatarPosition = "top_left" | "top_right" | "bottom_left" | "bottom_right";
export type OverlayPlacement = { x: number; y: number };

export type LongVideoSegmentInput = {
  image_key: string;
  scene_template_id: string;
  duration_seconds: number;
  sort_order: number;
};

export type LongVideoSegmentStatus = {
  id: string;
  sort_order: number;
  image_key: string;
  duration_seconds: number;
  status: string;
  provider_task_id?: string | null;
  segment_video_key?: string | null;
  error_code?: string | null;
  error_source?: string | null;
  error_detail?: string | null;
  error_retryable?: boolean | null;
  error_message?: string | null;
  queued_at: string;
  processing_started_at?: string | null;
  finished_at?: string | null;
  queue_wait_seconds?: number | null;
  processing_seconds?: number | null;
  total_elapsed_seconds?: number | null;
  created_at: string;
  updated_at: string;
};

export type VideoTask = {
  id: string;
  task_type: string;
  service_tier: "standard" | "flex";
  status: string;
  image_keys?: string[];
  resolution: string;
  aspect_ratio: string;
  duration_seconds: number;
  logo_key?: string | null;
  logo_position_x?: number | null;
  logo_position_y?: number | null;
  avatar_key?: string | null;
  avatar_position?: AvatarPosition | null;
  avatar_position_x?: number | null;
  avatar_position_y?: number | null;
  profile_card_id?: string | null;
  profile_card_data?: Record<string, unknown> | null;
  quota_consumed?: number;
  planned_quota_consumed: number;
  charged_quota_consumed: number;
  charge_status: string;
  charged_at?: string | null;
  provider_name?: string | null;
  provider_status?: string | null;
  video_key?: string | null;
  download_url?: string | null;
  error_code?: string | null;
  error_source?: string | null;
  error_detail?: string | null;
  error_retryable?: boolean | null;
  error_message?: string | null;
  expires_at?: string | null;
  queued_at: string;
  processing_started_at?: string | null;
  finished_at?: string | null;
  queue_wait_seconds?: number | null;
  processing_seconds?: number | null;
  total_elapsed_seconds?: number | null;
  segment_count?: number | null;
  completed_segments?: number | null;
  long_segments?: LongVideoSegmentStatus[] | null;
  created_at: string;
  updated_at: string;
};

async function parseError(res: Response) {
  const e = await res.json().catch(() => ({}));
  const detail = (e as { detail?: string | { code?: string; message?: string } }).detail;
  if (detail && typeof detail === "object" && detail.code) {
    const translated = translateApiError(detail.code, getStoredLocale());
    throw new ApiError(translated ?? detail.message ?? t(getStoredLocale(), "common.requestFailed"), {
      code: detail.code,
      rawDetail: detail.message ?? detail,
      status: res.status,
    });
  }
  if (typeof detail === "string") {
    const translated = translateApiError(detail, getStoredLocale());
    throw new ApiError(translated ?? detail, {
      code: translated ? detail : undefined,
      rawDetail: detail,
      status: res.status,
    });
  }
  throw new ApiError(t(getStoredLocale(), "common.requestFailed"), {
    rawDetail: null,
    status: res.status,
  });
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

let _refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    handleUnauthorizedState();
    throw new UnauthorizedError("No refresh token");
  }
  const res = await fetch(`${PREFIX}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) {
    handleUnauthorizedState();
    throw new UnauthorizedError("Token refresh failed");
  }
  const data = (await res.json()) as { access_token: string; refresh_token: string };
  setStoredTokens(data);
  return data.access_token;
}

async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status !== 401) return res;

  if (!_refreshPromise) {
    _refreshPromise = refreshAccessToken().finally(() => { _refreshPromise = null; });
  }
  let newToken: string;
  try {
    newToken = await _refreshPromise;
  } catch {
    handleUnauthorizedState();
    throw new UnauthorizedError("Token refresh failed");
  }

  const retryInit = { ...init, headers: { ...init?.headers, Authorization: `Bearer ${newToken}` } };
  const retryRes = await fetch(input, retryInit);
  if (retryRes.status === 401) {
    handleUnauthorizedState();
    throw new UnauthorizedError("Unauthorized after refresh");
  }
  return retryRes;
}

export function absoluteApiUrl(path: string) {
  return path.startsWith("http") ? path : `${API}${path}`;
}

export async function login(usernameOrEmail: string, password: string) {
  const res = await fetch(`${PREFIX}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username_or_email: usernameOrEmail, password }),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<{ access_token: string; refresh_token: string }>;
}

export async function adminLogin(usernameOrEmail: string, password: string, totpCode?: string) {
  const res = await fetch(`${PREFIX}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username_or_email: usernameOrEmail, password, totp_code: totpCode || null }),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<{ access_token: string; refresh_token: string }>;
}

export async function sendCode(email: string) {
  const res = await fetch(`${PREFIX}/auth/send-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<{ message: string; debug_code?: string }>;
}

export async function register(username: string, password: string, email: string, code: string, inviteCode: string) {
  const res = await fetch(`${PREFIX}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, email, code, invite_code: inviteCode }),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<{ access_token: string; refresh_token: string }>;
}

export async function resetPassword(email: string, code: string, newPassword: string) {
  const res = await fetch(`${PREFIX}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code, new_password: newPassword }),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<{ message: string }>;
}

export async function getMe(accessToken: string, options?: { signal?: AbortSignal }) {
  const res = await authFetch(`${PREFIX}/users/me`, {
    headers: authHeaders(accessToken),
    signal: options?.signal,
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<UserProfile>;
}

export async function ensureSessionReady(accessToken: string, options?: { signal?: AbortSignal }) {
  await getMe(accessToken, options);
}

export async function getMyInviteCode(accessToken: string) {
  const res = await authFetch(`${PREFIX}/invite-codes/me`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<InviteCode | null>;
}

export async function createMyInviteCode(accessToken: string) {
  const res = await authFetch(`${PREFIX}/invite-codes/me`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<InviteCode>;
}

export async function getAdminDashboardSummary(accessToken: string) {
  const res = await authFetch(`${PREFIX}/admin/dashboard/summary`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<AdminDashboardSummary>;
}

export async function getAdminMfaStatus(accessToken: string) {
  const res = await authFetch(`${PREFIX}/admin/security/mfa/status`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<AdminMfaStatus>;
}

export async function setupAdminMfa(accessToken: string) {
  const res = await authFetch(`${PREFIX}/admin/security/mfa/setup`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<AdminMfaSetup>;
}

export async function enableAdminMfa(accessToken: string, code: string) {
  const res = await authFetch(`${PREFIX}/admin/security/mfa/enable`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<AdminMfaStatus>;
}

export async function disableAdminMfa(accessToken: string, code: string) {
  const res = await authFetch(`${PREFIX}/admin/security/mfa/disable`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<AdminMfaStatus>;
}

export async function getAdminDashboardDailyStats(accessToken: string, options?: { days?: number }) {
  const query = new URLSearchParams();
  if (options?.days) query.set("days", String(options.days));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const res = await authFetch(`${PREFIX}/admin/dashboard/daily-stats${suffix}`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<AdminDashboardDailyStats>;
}

export async function getAdminUsers(
  accessToken: string,
  options?: { query?: string; status?: string; page?: number; pageSize?: number },
) {
  const query = new URLSearchParams();
  if (options?.query) query.set("query", options.query);
  if (options?.status) query.set("status", options.status);
  if (options?.page) query.set("page", String(options.page));
  if (options?.pageSize) query.set("page_size", String(options.pageSize));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const res = await authFetch(`${PREFIX}/admin/users${suffix}`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<AdminUserListResult>;
}

export async function blockAdminUser(accessToken: string, userId: string) {
  const res = await authFetch(`${PREFIX}/admin/users/${userId}/block`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<AdminUserListItem>;
}

export async function unblockAdminUser(accessToken: string, userId: string) {
  const res = await authFetch(`${PREFIX}/admin/users/${userId}/unblock`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<AdminUserListItem>;
}

export async function resetAdminUserPassword(accessToken: string, userId: string, newPassword: string) {
  const res = await authFetch(`${PREFIX}/admin/users/${userId}/reset-password`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ new_password: newPassword }),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<AdminUserListItem>;
}

export async function getAdminTasks(
  accessToken: string,
  options?: { query?: string; status?: string; taskType?: string; serviceTier?: string; page?: number; pageSize?: number },
) {
  const query = new URLSearchParams();
  if (options?.query) query.set("query", options.query);
  if (options?.status) query.set("status", options.status);
  if (options?.taskType) query.set("task_type", options.taskType);
  if (options?.serviceTier) query.set("service_tier", options.serviceTier);
  if (options?.page) query.set("page", String(options.page));
  if (options?.pageSize) query.set("page_size", String(options.pageSize));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const res = await authFetch(`${PREFIX}/admin/tasks${suffix}`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<AdminTaskListResult>;
}

export async function getAdminInviteCodes(accessToken: string) {
  const res = await authFetch(`${PREFIX}/admin/invite-codes`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<InviteCode[]>;
}

export async function createAdminInviteCode(accessToken: string) {
  const res = await authFetch(`${PREFIX}/admin/invite-codes`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ owner_user_id: null }),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<InviteCode>;
}

export async function updateMyPreferences(
  accessToken: string,
  body: { preferred_language: "zh-CN" | "en" },
) {
  const res = await authFetch(`${PREFIX}/users/me/preferences`, {
    method: "PATCH",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<UserProfile>;
}

export async function getQuota(accessToken: string) {
  const res = await authFetch(`${PREFIX}/billing/quota`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<QuotaSnapshot>;
}

export async function getChargeReconciliation(accessToken: string, options?: { limit?: number }) {
  const query = new URLSearchParams();
  if (options?.limit) query.set("limit", String(options.limit));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const res = await authFetch(`${PREFIX}/billing/reconciliation${suffix}`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<ChargeReconciliation>;
}

export async function createSubscriptionCheckout(accessToken: string, planId: string) {
  const res = await authFetch(`${PREFIX}/billing/checkout/subscription`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ plan_id: planId }),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<CheckoutSessionResult>;
}

export async function createQuotaPackageCheckout(accessToken: string, packagePlanId: string) {
  const res = await authFetch(`${PREFIX}/billing/checkout/quota-package`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ package_plan_id: packagePlanId }),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<CheckoutSessionResult>;
}

export async function createCustomerPortal(accessToken: string) {
  const res = await authFetch(`${PREFIX}/billing/customer-portal`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<CustomerPortalResult>;
}

export type UpgradeSubscriptionResult = {
  result_status: "redirect_to_stripe" | "applied_now" | "payment_failed";
  invoice_hosted_url?: string | null;
  message?: string | null;
  plan_type?: string | null;
  quota_per_month?: number | null;
  quota_used?: number | null;
  storage_days?: number | null;
  status?: string | null;
};

export type UpgradeSubscriptionPreviewResult = {
  current_plan_type: string;
  current_plan_name: string;
  target_plan_type: string;
  target_plan_name: string;
  amount_due_cents: number;
  currency: string;
  current_period_end?: string | null;
};

export async function upgradeSubscription(accessToken: string, planId: string) {
  const res = await authFetch(`${PREFIX}/billing/subscription/upgrade`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ plan_id: planId }),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<UpgradeSubscriptionResult>;
}

export async function previewUpgradeSubscription(accessToken: string, planId: string) {
  const res = await authFetch(`${PREFIX}/billing/subscription/upgrade/preview`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ plan_id: planId }),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<UpgradeSubscriptionPreviewResult>;
}

export async function getSubscriptionPlans(accessToken: string) {
  const res = await authFetch(`${PREFIX}/billing/plans`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<SubscriptionPlan[]>;
}

export async function getQuotaPackagePlans(accessToken: string) {
  const res = await authFetch(`${PREFIX}/billing/quota-packages/plans`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<QuotaPackagePlan[]>;
}

export async function getSceneTemplates(
  accessToken: string,
  options?: { category?: "short" | "long_unified"; propertyType?: SceneTemplatePropertyType | null },
) {
  const query = new URLSearchParams();
  if (options?.category) query.set("category", options.category);
  if (options?.propertyType) query.set("property_type", options.propertyType);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const res = await authFetch(`${PREFIX}/videos/scene-templates${suffix}`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<SceneTemplate[]>;
}

export async function getVideoTasks(accessToken: string, options?: { taskType?: string | null }) {
  const query = new URLSearchParams();
  if (options?.taskType) query.set("task_type", options.taskType);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const res = await authFetch(`${PREFIX}/videos/tasks${suffix}`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<VideoTask[]>;
}

export async function getUserLogos(accessToken: string) {
  const res = await authFetch(`${PREFIX}/videos/logos`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<UserLogo[]>;
}

export async function getUserAvatars(accessToken: string) {
  const res = await authFetch(`${PREFIX}/videos/avatars`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<UserAvatar[]>;
}

export async function getProfileCards(accessToken: string) {
  const res = await authFetch(`${PREFIX}/videos/profile-cards`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<ProfileCard[]>;
}

export async function uploadVideoAsset(
  accessToken: string,
  file: File,
  kind: "image" | "logo" | "avatar",
  options?: { name?: string; signal?: AbortSignal },
) {
  const formData = new FormData();
  formData.append("file", file);
  if ((kind === "logo" || kind === "avatar") && options?.name) {
    formData.append("name", options.name);
  }
  const res = await authFetch(`${PREFIX}/videos/uploads/${kind}`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: formData,
    signal: options?.signal,
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<{ id?: string; key: string; name?: string; is_default?: boolean; url?: string | null }>;
}

export async function setDefaultLogo(accessToken: string, logoId: string) {
  const res = await authFetch(`${PREFIX}/videos/logos/${logoId}/default`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<UserLogo>;
}

export async function deleteLogo(accessToken: string, logoId: string) {
  const res = await authFetch(`${PREFIX}/videos/logos/${logoId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<{ message: string }>;
}

export async function setDefaultAvatar(accessToken: string, avatarId: string) {
  const res = await authFetch(`${PREFIX}/videos/avatars/${avatarId}/default`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<UserAvatar>;
}

export async function deleteAvatar(accessToken: string, avatarId: string) {
  const res = await authFetch(`${PREFIX}/videos/avatars/${avatarId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<{ message: string }>;
}

export async function getAvatarPreviewBlob(accessToken: string, avatarId: string) {
  const res = await authFetch(`${PREFIX}/videos/avatars/${avatarId}/preview`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.blob();
}

export async function getLogoPreviewBlob(accessToken: string, logoId: string) {
  const res = await authFetch(`${PREFIX}/videos/logos/${logoId}/preview`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.blob();
}

export async function getProfileCardPreviewBlob(accessToken: string, profileCardId: string) {
  const res = await authFetch(`${PREFIX}/videos/profile-cards/${profileCardId}/preview`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.blob();
}

export async function getProfileCardDraftPreviewBlob(accessToken: string, body: UpsertProfileCardBody) {
  const res = await authFetch(`${PREFIX}/videos/profile-cards/preview`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.blob();
}

export async function createProfileCard(
  accessToken: string,
  body: UpsertProfileCardBody,
) {
  const res = await authFetch(`${PREFIX}/videos/profile-cards`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<ProfileCard>;
}

export async function updateProfileCard(
  accessToken: string,
  profileCardId: string,
  body: UpsertProfileCardBody,
) {
  const res = await authFetch(`${PREFIX}/videos/profile-cards/${profileCardId}`, {
    method: "PATCH",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<ProfileCard>;
}

export async function deleteProfileCard(accessToken: string, profileCardId: string) {
  const res = await authFetch(`${PREFIX}/videos/profile-cards/${profileCardId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<{ message: string }>;
}

export async function createShortVideoTask(
  accessToken: string,
  body: {
    image_key: string;
    scene_template_id: string;
    resolution: "480p" | "720p" | "1080p";
    aspect_ratio: "16:9" | "9:16" | "1:1" | "adaptive";
    duration_seconds: number;
    logo_key?: string | null;
    logo_position_x?: number | null;
    logo_position_y?: number | null;
    avatar_key?: string | null;
    avatar_position?: AvatarPosition | null;
    avatar_position_x?: number | null;
    avatar_position_y?: number | null;
    profile_card_id?: string | null;
    profile_card_options?: ProfileCardOptionFlags | null;
    service_tier?: "standard" | "flex";
  },
  options?: { signal?: AbortSignal },
) {
  const res = await authFetch(`${PREFIX}/videos/tasks/short`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: options?.signal,
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<VideoTask>;
}

export async function createLongVideoTask(
  accessToken: string,
  body: {
    image_keys: string[];
    scene_template_id: string;
    resolution: "480p" | "720p" | "1080p";
    aspect_ratio: "16:9" | "9:16" | "1:1" | "adaptive";
    duration_seconds: number;
    logo_key?: string | null;
    logo_position_x?: number | null;
    logo_position_y?: number | null;
    avatar_key?: string | null;
    avatar_position?: AvatarPosition | null;
    avatar_position_x?: number | null;
    avatar_position_y?: number | null;
    profile_card_id?: string | null;
    profile_card_options?: ProfileCardOptionFlags | null;
    segments?: LongVideoSegmentInput[] | null;
    service_tier?: "standard" | "flex";
  },
  options?: { signal?: AbortSignal },
) {
  const res = await authFetch(`${PREFIX}/videos/tasks/merge`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: options?.signal,
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<VideoTask>;
}

export async function downloadVideoTask(accessToken: string, taskId: string) {
  const res = await authFetch(`${PREFIX}/videos/tasks/${taskId}/download`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.blob();
}

export async function retryVideoTask(accessToken: string, taskId: string) {
  const res = await authFetch(`${PREFIX}/videos/tasks/${taskId}/retry`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<VideoTask>;
}
