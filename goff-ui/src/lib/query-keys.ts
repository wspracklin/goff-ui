export const queryKeys = {
  flagsets: ['flagsets'] as const,
  flagsetFlags: (id: string) => ['flagset-flags', id] as const,
  flagsetFlag: (id: string, key: string) => ['flagset-flag', id, key] as const,
  localFlags: ['local-flags'] as const,
  flagsConfig: ['flags-config'] as const,
  health: ['health'] as const,
  info: ['info'] as const,
  flagset: (id: string) => ['flagset', id] as const,
};
