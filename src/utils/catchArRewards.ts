import {
  ARRewardTier,
  AR_INTRO_ID,
  AR_REWARD_PRESETS,
  getDefaultARRewards,
  normalizeARRewardTiers,
  normalizeSingleARReward,
} from '../arWriting/services/arRewardsService';
import { formatRetrySettingToken, parseRetryCountFromSettingsText } from './retryLimit';

const CATCH_AR_REWARDS_STORAGE_KEY = 'faseeh_catch_ar_rewards_v1';
const CATCH_AR_INTRO_STORAGE_KEY = 'faseeh_catch_ar_intro_v1';

export const getDefaultCatchARIntroReward = (): ARRewardTier => {
  const preset = AR_REWARD_PRESETS[4] || AR_REWARD_PRESETS[0];
  return {
    id: AR_INTRO_ID,
    title: '🎯 مستعد لاصطياد الحروف في الهواء ✨',
    minScore: 0,
    maxScore: 0,
    presetId: preset.id,
    imageUrl: preset.imageUrl,
    scaleRatio: preset.defaultScaleRatio,
    offsetYRatio: preset.defaultOffsetYRatio,
    enabled: true,
  };
};

export const getStoredCatchARRewards = (): ARRewardTier[] => {
  try {
    const raw = localStorage.getItem(CATCH_AR_REWARDS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return normalizeARRewardTiers(parsed);
      }
    }
  } catch {}
  return getDefaultARRewards();
};

export const saveStoredCatchARRewards = (tiers: ARRewardTier[]): boolean => {
  try {
    const clean = tiers.filter((t) => t.id !== AR_INTRO_ID);
    localStorage.setItem(CATCH_AR_REWARDS_STORAGE_KEY, JSON.stringify(clean));
    return true;
  } catch (err) {
    console.warn('Could not save Catch AR rewards to localStorage:', err);
    return false;
  }
};

export const getStoredCatchARIntroReward = (): ARRewardTier => {
  try {
    const raw = localStorage.getItem(CATCH_AR_INTRO_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return normalizeSingleARReward(
          { ...parsed, id: AR_INTRO_ID },
          0,
          AR_REWARD_PRESETS[4] || AR_REWARD_PRESETS[0]
        );
      }
    }
  } catch {}
  return getDefaultCatchARIntroReward();
};

export const saveStoredCatchARIntroReward = (intro: ARRewardTier): boolean => {
  try {
    const normalized = normalizeSingleARReward(
      { ...intro, id: AR_INTRO_ID },
      0,
      AR_REWARD_PRESETS[4] || AR_REWARD_PRESETS[0]
    );
    localStorage.setItem(CATCH_AR_INTRO_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch (err) {
    console.warn('Could not save Catch AR intro reward to localStorage:', err);
    return false;
  }
};

/**
 * Parse Col E settings string for Catch ("صيد"):
 * Note: Intentionally omits mic recording duration and voice_only/mouse mode per design spec.
 */
export function parseCatchSettingsString(str?: string): {
  lockOnMistake: boolean;
  allowRetry: boolean;
  maxRetries: number;
} {
  const s = String(str || '').trim();
  const lockOnMistake =
    s.includes('لا تراجع') || s.includes('لا يمكن التراجع') || s.includes('قفل');
  const { allowRetry, maxRetries } = parseRetryCountFromSettingsText(s);
  return { lockOnMistake, allowRetry, maxRetries };
}

export function formatCatchSettingsString(exercise: {
  lockOnMistake?: boolean;
  allowRetry?: boolean;
  maxRetries?: number;
}): string {
  const lockStr = exercise.lockOnMistake ? 'لا تراجع' : 'إتاحة المحاولة';
  const retryStr = formatRetrySettingToken(exercise.maxRetries, exercise.allowRetry);
  return `${lockStr} | ${retryStr}`;
}
