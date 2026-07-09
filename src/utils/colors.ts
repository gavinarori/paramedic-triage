/**
 * Professional, high-visibility color palette for emergency medical UI.
 * Priority 1 & 2 use hazard-grade reds/oranges to be unmistakable at a glance,
 * even under poor lighting or stress conditions.
 */

export type PriorityLevel = 1 | 2 | 3 | 4 | 5;

interface PriorityColorSet {
  background: string;
  border: string;
  text: string;
  label: string;
}

/** Priority -> color mapping. Contrast ratios chosen for outdoor/field visibility. */
export const PRIORITY_COLORS: Record<PriorityLevel, PriorityColorSet> = {
  1: {
    background: '#B3001B', // deep hazard red
    border: '#7A0012',
    text: '#FFFFFF',
    label: 'CRITICAL',
  },
  2: {
    background: '#E8590C', // deep hazard orange
    border: '#B33E00',
    text: '#FFFFFF',
    label: 'URGENT',
  },
  3: {
    background: '#F2A900', // amber
    border: '#B37D00',
    text: '#1A1A1A',
    label: 'MODERATE',
  },
  4: {
    background: '#2E7D32', // green
    border: '#1B5E20',
    text: '#FFFFFF',
    label: 'STABLE',
  },
  5: {
    background: '#3A7CA5', // calm blue
    border: '#2A5A7A',
    text: '#FFFFFF',
    label: 'MINOR',
  },
};

export const COLORS = {
  primary: '#0B3D91',
  primaryDark: '#062A66',
  background: '#F5F6F8',
  surface: '#FFFFFF',
  border: '#E0E2E7',
  textPrimary: '#1A1A1A',
  textSecondary: '#5A5F6A',
  textInverse: '#FFFFFF',
  success: '#2E7D32',
  error: '#B3001B',
  warning: '#E8590C',
  pendingBadge: '#F2A900',
  syncedBadge: '#2E7D32',
  disabled: '#C7CBD1',
  overlay: 'rgba(0,0,0,0.4)',
} as const;

export function getPriorityColors(priority: PriorityLevel): PriorityColorSet {
  return PRIORITY_COLORS[priority];
}

/** Whether a priority level is considered critical (drives extra visual emphasis) */
export function isCriticalPriority(priority: PriorityLevel): boolean {
  return priority === 1 || priority === 2;
}