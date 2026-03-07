import { getStoredLocale, translateApiError, t } from "@/lib/locale";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8003";
const PREFIX = `${API}/api/v1`;

export type UserProfile = {
  id: string;
  username: string;
  email: string;
  email_verified: boolean;
  preferred_language: "zh-CN" | "en";
  status: string;
};

export type QuotaSnapshot = {
  subscription_plan_type: string | null;
  subscription_remaining: number;
  package_remaining: number;
  paid_package_remaining: number;
  signup_bonus_remaining: number;
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

export type SceneTemplate = {
  id: string;
  template_key: string;
  name: string;
  sort_order: number;
};

export type UserLogo = {
  id: string;
  key: string;
  name: string;
  is_default: boolean;
};

export type LongVideoSegmentInput = {
  image_key: string;
  scene_template_id: string;
  duration_seconds: number;
  sort_order: number;
};

export type VideoTask = {
  id: string;
  task_type: string;
  status: string;
  image_keys?: string[];
  resolution: string;
  aspect_ratio: string;
  duration_seconds: number;
  logo_key?: string | null;
  quota_consumed?: number;
  provider_name?: string | null;
  video_key?: string | null;
  download_url?: string | null;
  error_message?: string | null;
  expires_at?: string | null;
  segment_count?: number | null;
  completed_segments?: number | null;
  created_at: string;
  updated_at: string;
};

async function parseError(res: Response) {
  const e = await res.json().catch(() => ({}));
  const detail = (e as { detail?: string | { code?: string } }).detail;
  if (detail && typeof detail === "object" && detail.code) {
    const translated = translateApiError(detail.code, getStoredLocale());
    throw new Error(translated ?? detail.code);
  }
  if (typeof detail === "string") {
    throw new Error(detail);
  }
  throw new Error(t(getStoredLocale(), "common.requestFailed"));
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
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

export async function sendCode(email: string) {
  const res = await fetch(`${PREFIX}/auth/send-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<{ message: string; debug_code?: string }>;
}

export async function register(username: string, password: string, email: string, code: string) {
  const res = await fetch(`${PREFIX}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, email, code }),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<{ access_token: string; refresh_token: string }>;
}

export async function getMe(accessToken: string) {
  const res = await fetch(`${PREFIX}/users/me`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<UserProfile>;
}

export async function updateMyPreferences(
  accessToken: string,
  body: { preferred_language: "zh-CN" | "en" },
) {
  const res = await fetch(`${PREFIX}/users/me/preferences`, {
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
  const res = await fetch(`${PREFIX}/billing/quota`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<QuotaSnapshot>;
}

export async function getSubscriptionPlans(accessToken: string) {
  const res = await fetch(`${PREFIX}/billing/plans`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<SubscriptionPlan[]>;
}

export async function getQuotaPackagePlans(accessToken: string) {
  const res = await fetch(`${PREFIX}/billing/quota-packages/plans`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<QuotaPackagePlan[]>;
}

export async function getSceneTemplates(
  accessToken: string,
  options?: { category?: "short" | "long_unified" },
) {
  const query = new URLSearchParams();
  if (options?.category) query.set("category", options.category);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const res = await fetch(`${PREFIX}/videos/scene-templates${suffix}`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<SceneTemplate[]>;
}

export async function getVideoTasks(accessToken: string, options?: { taskType?: string | null }) {
  const query = new URLSearchParams();
  if (options?.taskType) query.set("task_type", options.taskType);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const res = await fetch(`${PREFIX}/videos/tasks${suffix}`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<VideoTask[]>;
}

export async function getUserLogos(accessToken: string) {
  const res = await fetch(`${PREFIX}/videos/logos`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<UserLogo[]>;
}

export async function uploadVideoAsset(
  accessToken: string,
  file: File,
  kind: "image" | "logo",
  options?: { name?: string },
) {
  const formData = new FormData();
  formData.append("file", file);
  if (kind === "logo" && options?.name) {
    formData.append("name", options.name);
  }
  const res = await fetch(`${PREFIX}/videos/uploads/${kind}`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: formData,
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<{ id?: string; key: string; name?: string; is_default?: boolean; url?: string | null }>;
}

export async function setDefaultLogo(accessToken: string, logoId: string) {
  const res = await fetch(`${PREFIX}/videos/logos/${logoId}/default`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<UserLogo>;
}

export async function deleteLogo(accessToken: string, logoId: string) {
  const res = await fetch(`${PREFIX}/videos/logos/${logoId}`, {
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
  },
) {
  const res = await fetch(`${PREFIX}/videos/tasks/short`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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
    segments?: LongVideoSegmentInput[] | null;
  },
) {
  const res = await fetch(`${PREFIX}/videos/tasks/merge`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<VideoTask>;
}

export async function downloadVideoTask(accessToken: string, taskId: string) {
  const res = await fetch(`${PREFIX}/videos/tasks/${taskId}/download`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) await parseError(res);
  return res.blob();
}
