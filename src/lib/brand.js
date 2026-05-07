export const FALLBACK_BRAND_PROFILE_ID = "00000000-0000-0000-0000-000000000001";
export const FALLBACK_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

// Backward-compatible aliases while Phase 1 moves the app to tenant context.
export const DEFAULT_BRAND_PROFILE_ID = process.env.NEXT_PUBLIC_DEFAULT_BRAND_PROFILE_ID || FALLBACK_BRAND_PROFILE_ID;
export const DEFAULT_WORKSPACE_ID = process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID || FALLBACK_WORKSPACE_ID;

export function defaultTenant() {
  return {
    workspace_id: DEFAULT_WORKSPACE_ID,
    brand_profile_id: DEFAULT_BRAND_PROFILE_ID,
  };
}

export function normalizeTenant(tenant = {}) {
  return {
    workspace_id: tenant.workspace_id || DEFAULT_WORKSPACE_ID,
    brand_profile_id: tenant.brand_profile_id || DEFAULT_BRAND_PROFILE_ID,
  };
}

export function tenantStorageKey(base, tenant = {}) {
  const t = normalizeTenant(tenant);
  return `${base}:${t.workspace_id}:${t.brand_profile_id}`;
}
