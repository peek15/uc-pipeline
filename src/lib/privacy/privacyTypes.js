export const DATA_CLASSES = {
  D0_PUBLIC: "D0_PUBLIC",
  D1_BUSINESS_STANDARD: "D1_BUSINESS_STANDARD",
  D2_CONFIDENTIAL: "D2_CONFIDENTIAL",
  D3_SENSITIVE: "D3_SENSITIVE",
  D4_SECRET: "D4_SECRET",
};

export const PRIVACY_MODES = {
  STANDARD: "standard",
  CONFIDENTIAL: "confidential",
  ENHANCED_PRIVACY: "enhanced_privacy",
  ENTERPRISE_CUSTOM: "enterprise_custom",
};

export const DEFAULT_DATA_CLASS = DATA_CLASSES.D1_BUSINESS_STANDARD;
export const DEFAULT_PRIVACY_MODE = PRIVACY_MODES.STANDARD;

export const DATA_CLASS_ORDER = [
  DATA_CLASSES.D0_PUBLIC,
  DATA_CLASSES.D1_BUSINESS_STANDARD,
  DATA_CLASSES.D2_CONFIDENTIAL,
  DATA_CLASSES.D3_SENSITIVE,
  DATA_CLASSES.D4_SECRET,
];

export const PRIVACY_MODE_RULES = {
  [PRIVACY_MODES.STANDARD]: {
    label: "Standard",
    allowedDataClasses: [DATA_CLASSES.D0_PUBLIC, DATA_CLASSES.D1_BUSINESS_STANDARD],
    requiresZeroRetentionFrom: DATA_CLASSES.D3_SENSITIVE,
  },
  [PRIVACY_MODES.CONFIDENTIAL]: {
    label: "Confidential",
    allowedDataClasses: [DATA_CLASSES.D0_PUBLIC, DATA_CLASSES.D1_BUSINESS_STANDARD, DATA_CLASSES.D2_CONFIDENTIAL],
    requiresZeroRetentionFrom: DATA_CLASSES.D2_CONFIDENTIAL,
  },
  [PRIVACY_MODES.ENHANCED_PRIVACY]: {
    label: "Enhanced Privacy",
    allowedDataClasses: [DATA_CLASSES.D0_PUBLIC, DATA_CLASSES.D1_BUSINESS_STANDARD, DATA_CLASSES.D2_CONFIDENTIAL, DATA_CLASSES.D3_SENSITIVE],
    requiresZeroRetentionFrom: DATA_CLASSES.D2_CONFIDENTIAL,
  },
  [PRIVACY_MODES.ENTERPRISE_CUSTOM]: {
    label: "Enterprise Custom",
    allowedDataClasses: [DATA_CLASSES.D0_PUBLIC, DATA_CLASSES.D1_BUSINESS_STANDARD, DATA_CLASSES.D2_CONFIDENTIAL, DATA_CLASSES.D3_SENSITIVE],
    requiresZeroRetentionFrom: DATA_CLASSES.D2_CONFIDENTIAL,
  },
};

export const STANDARD_PROVIDER_DATA_CLASSES = [
  DATA_CLASSES.D0_PUBLIC,
  DATA_CLASSES.D1_BUSINESS_STANDARD,
];

export function normalizeDataClass(value) {
  if (!value) return DEFAULT_DATA_CLASS;
  const key = String(value).trim().toUpperCase();
  return DATA_CLASSES[key] || Object.values(DATA_CLASSES).find(v => v === value) || DEFAULT_DATA_CLASS;
}

export function normalizePrivacyMode(value) {
  if (!value) return DEFAULT_PRIVACY_MODE;
  const normalized = String(value).trim().toLowerCase();
  return Object.values(PRIVACY_MODES).includes(normalized) ? normalized : DEFAULT_PRIVACY_MODE;
}

export function dataClassRank(dataClass) {
  const idx = DATA_CLASS_ORDER.indexOf(normalizeDataClass(dataClass));
  return idx === -1 ? DATA_CLASS_ORDER.indexOf(DEFAULT_DATA_CLASS) : idx;
}

export function isDataClassAtLeast(dataClass, threshold) {
  return dataClassRank(dataClass) >= dataClassRank(threshold);
}

export function requiresZeroRetention({ dataClass, privacyMode }) {
  const mode = normalizePrivacyMode(privacyMode);
  const klass = normalizeDataClass(dataClass);
  const threshold = PRIVACY_MODE_RULES[mode]?.requiresZeroRetentionFrom;
  return threshold ? isDataClassAtLeast(klass, threshold) : false;
}

export function isSecretDataClass(dataClass) {
  return normalizeDataClass(dataClass) === DATA_CLASSES.D4_SECRET;
}

export function canSendToProvider({ dataClass, privacyMode, providerProfile }) {
  const klass = normalizeDataClass(dataClass);
  const mode = normalizePrivacyMode(privacyMode);
  const rules = PRIVACY_MODE_RULES[mode] || PRIVACY_MODE_RULES[DEFAULT_PRIVACY_MODE];
  const profile = providerProfile || {};

  if (klass === DATA_CLASSES.D4_SECRET) {
    return { allowed: false, reason: "D4_SECRET cannot be sent to AI/media providers." };
  }
  if (!rules.allowedDataClasses.includes(klass)) {
    return { allowed: false, reason: `${klass} is not allowed in ${mode} mode.` };
  }
  if (profile.blocked_data_classes?.includes(klass)) {
    return { allowed: false, reason: `${profile.provider_key || "provider"} blocks ${klass}.` };
  }
  if (profile.allowed_data_classes?.length && !profile.allowed_data_classes.includes(klass)) {
    return { allowed: false, reason: `${profile.provider_key || "provider"} is not approved for ${klass}.` };
  }
  if (mode === PRIVACY_MODES.ENHANCED_PRIVACY && !profile.enhanced_privacy_allowed) {
    return { allowed: false, reason: `${profile.provider_key || "provider"} is not Enhanced Privacy compatible.` };
  }
  if (mode === PRIVACY_MODES.ENTERPRISE_CUSTOM && !profile.enterprise_allowed) {
    return { allowed: false, reason: `${profile.provider_key || "provider"} is not approved for Enterprise Custom mode.` };
  }
  if (requiresZeroRetention({ dataClass: klass, privacyMode: mode })) {
    const noRetention = profile.standard_retention === "no_retention" || profile.zero_retention_enabled === true;
    if (!noRetention) {
      return { allowed: false, reason: `${klass} requires zero/no-retention routing in ${mode} mode.` };
    }
  }
  return { allowed: true, reason: "Allowed by privacy profile." };
}
