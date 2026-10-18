const KEY = "urbantrace.device_id";
let fallback: string | null = null;

/**
 * Anonymous per-browser id, so one person cannot back the same issue twice (F1). Kept in
 * localStorage; if storage is blocked (private mode) it lasts for this page load only.
 */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    fallback ??= crypto.randomUUID();
    return fallback;
  }
}
