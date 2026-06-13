import type { RiskProfile } from '@mantleagents/shared';

interface ScoreInputs {
  experience: 'beginner' | 'some_experience' | 'advanced';
  horizon: 'short' | 'medium' | 'long';
  volatility: 'sell' | 'hold' | 'buy';
  investmentAmount: 'under_100' | '100_1000' | '1000_10000' | 'over_10000';
}

const experienceScores: Record<ScoreInputs['experience'], number> = {
  beginner: 1,
  some_experience: 2,
  advanced: 3,
};

const horizonScores: Record<ScoreInputs['horizon'], number> = {
  short: 1,
  medium: 2,
  long: 3,
};

const volatilityScores: Record<ScoreInputs['volatility'], number> = {
  sell: 1,
  hold: 2,
  buy: 3,
};

const investmentScores: Record<ScoreInputs['investmentAmount'], number> = {
  under_100: 1,
  '100_1000': 2,
  '1000_10000': 3,
  over_10000: 3,
};

export function computeRiskScore(inputs: ScoreInputs): number {
  return (
    experienceScores[inputs.experience] +
    horizonScores[inputs.horizon] +
    volatilityScores[inputs.volatility] +
    investmentScores[inputs.investmentAmount]
  );
}

export function scoreToProfile(score: number): RiskProfile {
  if (score <= 6) return 'conservative';
  if (score <= 9) return 'moderate';
  return 'aggressive';
}
