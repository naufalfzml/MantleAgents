'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { RiskAnswers } from '@mantleagents/shared';
import { STABLE_TOKENS, TOKEN_METADATA } from '@mantleagents/shared';
import { TokenLogo } from '@/components/token-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useMotionSafe } from '@/lib/motion';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type StepKey = keyof RiskAnswers;

interface TextQuestion {
  key: 'name';
  type: 'text';
  title: string;
  subtitle: string;
  placeholder: string;
}

interface SingleQuestion {
  key: StepKey;
  type: 'single';
  title: string;
  options: { value: string; label: string; desc?: string }[];
}

interface MultiQuestion {
  key: 'currencies';
  type: 'multi';
  title: string;
  subtitle: string;
}

type Question = TextQuestion | SingleQuestion | MultiQuestion;

/* -------------------------------------------------------------------------- */
/*  Questions                                                                 */
/* -------------------------------------------------------------------------- */

const QUESTIONS: Question[] = [
  {
    key: 'name',
    type: 'text',
    title: "What should we call you?",
    subtitle: 'This is your display name in MantleAgents.',
    placeholder: 'Enter your name',
  },
  {
    key: 'experience',
    type: 'single',
    title: "What's your trading experience?",
    options: [
      { value: 'beginner', label: 'Beginner', desc: "I'm new to trading" },
      {
        value: 'some_experience',
        label: 'Some experience',
        desc: "I've traded before",
      },
      { value: 'advanced', label: 'Advanced', desc: 'I trade regularly' },
    ],
  },
  {
    key: 'horizon',
    type: 'single',
    title: "What's your investment horizon?",
    options: [
      { value: 'short', label: 'Short term', desc: 'Days to weeks' },
      { value: 'medium', label: 'Medium term', desc: 'Weeks to months' },
      { value: 'long', label: 'Long term', desc: 'Months to years' },
    ],
  },
  {
    key: 'volatility',
    type: 'single',
    title: 'When markets drop 20%, you...',
    options: [
      { value: 'sell', label: 'Sell immediately', desc: 'Protect my capital' },
      { value: 'hold', label: 'Hold steady', desc: 'Wait it out' },
      { value: 'buy', label: 'Buy more', desc: 'Great opportunity' },
    ],
  },
  {
    key: 'currencies',
    type: 'multi',
    title: 'Which currencies interest you?',
    subtitle: 'Select at least one. Your agent will trade these.',
  },
  {
    key: 'investmentAmount',
    type: 'single',
    title: 'How much do you plan to start with?',
    options: [
      { value: 'under_100', label: 'Under $100' },
      { value: '100_1000', label: '$100 \u2013 $1,000' },
      { value: '1000_10000', label: '$1,000 \u2013 $10,000' },
      { value: 'over_10000', label: 'Over $10,000' },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/*  Props                                                                     */
/* -------------------------------------------------------------------------- */

interface QuestionnaireProps {
  onComplete: (answers: RiskAnswers) => void;
  isSubmitting: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function Questionnaire({ onComplete, isSubmitting }: QuestionnaireProps) {
  const m = useMotionSafe();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<RiskAnswers>>({});
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = backward
  const inputRef = useRef<HTMLInputElement>(null);
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const question = QUESTIONS[currentStep];
  const progressValue = ((currentStep + 1) / QUESTIONS.length) * 100;

  /* ---- Validation -------------------------------------------------------- */

  const isCurrentValid = useCallback((): boolean => {
    const q = QUESTIONS[currentStep];
    switch (q.key) {
      case 'name':
        return (answers.name?.trim().length ?? 0) > 0;
      case 'currencies':
        return (answers.currencies?.length ?? 0) > 0;
      default:
        return answers[q.key] !== undefined;
    }
  }, [currentStep, answers]);

  /* ---- Navigation -------------------------------------------------------- */

  const goForward = useCallback(() => {
    if (!isCurrentValid() || isSubmitting) return;
    if (currentStep === QUESTIONS.length - 1) {
      onComplete(answers as RiskAnswers);
    } else {
      setDirection(1);
      setCurrentStep((s) => s + 1);
    }
  }, [isCurrentValid, isSubmitting, currentStep, answers, onComplete]);

  const goBack = useCallback(() => {
    if (isSubmitting) return;
    setDirection(-1);
    setCurrentStep((s) => Math.max(0, s - 1));
  }, [isSubmitting]);

  /* ---- Single-select with auto-advance ----------------------------------- */

  const handleSingleSelect = useCallback(
    (key: StepKey, value: string) => {
      if (isSubmitting) return;
      setAnswers((prev) => ({ ...prev, [key]: value }));

      // Clear any pending timer
      if (autoAdvanceTimer.current) {
        clearTimeout(autoAdvanceTimer.current);
      }

      autoAdvanceTimer.current = setTimeout(() => {
        if (currentStep === QUESTIONS.length - 1) {
          onComplete({ ...answers, [key]: value } as RiskAnswers);
        } else {
          setDirection(1);
          setCurrentStep((s) => s + 1);
        }
      }, 300);
    },
    [isSubmitting, currentStep, answers, onComplete],
  );

  /* ---- Multi-select toggle ----------------------------------------------- */

  const toggleCurrency = useCallback(
    (symbol: string) => {
      if (isSubmitting) return;
      setAnswers((prev) => {
        const current = prev.currencies ?? [];
        const next = current.includes(symbol)
          ? current.filter((s) => s !== symbol)
          : [...current, symbol];
        return { ...prev, currencies: next };
      });
    },
    [isSubmitting],
  );

  /* ---- Cleanup auto-advance timer on unmount ----------------------------- */

  useEffect(() => {
    return () => {
      if (autoAdvanceTimer.current) {
        clearTimeout(autoAdvanceTimer.current);
      }
    };
  }, []);

  /* ---- Auto-focus text input --------------------------------------------- */

  useEffect(() => {
    if (question.type === 'text' && inputRef.current) {
      // Small delay so the animation can start before focus
      const id = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [currentStep, question.type]);

  /* ---- Keyboard handling ------------------------------------------------- */

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isSubmitting) return;

      const q = QUESTIONS[currentStep];

      if (e.key === 'Enter') {
        e.preventDefault();
        goForward();
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        goBack();
        return;
      }

      // Backspace: go back only when the text input is empty or on non-text steps
      if (e.key === 'Backspace') {
        if (q.type === 'text') {
          if (!answers.name) {
            goBack();
          }
          // Otherwise let the input handle the backspace naturally
          return;
        }
        e.preventDefault();
        goBack();
        return;
      }

      // Number keys for single-choice steps
      if (q.type === 'single') {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= q.options.length) {
          e.preventDefault();
          handleSingleSelect(q.key, q.options[num - 1].value);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, isSubmitting, answers.name, goForward, goBack, handleSingleSelect]);

  /* ---- Render helpers ---------------------------------------------------- */

  function renderTextStep(q: TextQuestion) {
    return (
      <div className="flex flex-col gap-2">
        <Input
          ref={inputRef}
          type="text"
          placeholder={q.placeholder}
          value={answers.name ?? ''}
          onChange={(e) =>
            setAnswers((prev) => ({ ...prev, name: e.target.value }))
          }
          disabled={isSubmitting}
          className="h-12 text-base"
        />
        <p className="text-xs text-muted-foreground">
          Press{' '}
          <kbd className="rounded border border-border px-1 py-0.5 font-mono text-xs">
            Enter
          </kbd>{' '}
          to continue
        </p>
      </div>
    );
  }

  function renderSingleStep(q: SingleQuestion) {
    return (
      <div className="flex flex-col gap-3">
        {q.options.map((opt, index) => {
          const isSelected = answers[q.key] === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => handleSingleSelect(q.key, opt.value)}
              disabled={isSubmitting}
              className={cn(
                'flex w-full items-center gap-4 rounded-lg border p-4 text-left transition-colors cursor-pointer',
                isSelected
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border hover:border-muted-foreground/50 text-muted-foreground hover:text-foreground',
                isSubmitting && 'pointer-events-none opacity-50',
              )}
            >
              <span className="flex size-6 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
                {index + 1}
              </span>
              <div>
                <div className="font-medium">{opt.label}</div>
                {opt.desc && (
                  <div className="text-sm text-muted-foreground">
                    {opt.desc}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  function renderMultiStep(_q: MultiQuestion) {
    const selected = answers.currencies ?? [];
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {STABLE_TOKENS.map((symbol) => {
            const isSelected = selected.includes(symbol);
            const meta =
              TOKEN_METADATA[symbol as keyof typeof TOKEN_METADATA];
            return (
              <button
                key={symbol}
                onClick={() => toggleCurrency(symbol)}
                disabled={isSubmitting}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors cursor-pointer min-h-[44px]',
                  isSelected
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:border-muted-foreground/50',
                  isSubmitting && 'pointer-events-none opacity-50',
                )}
              >
                <TokenLogo symbol={symbol} size={18} />
                <span>{symbol}</span>
              </button>
            );
          })}
        </div>
        {selected.length > 0 && (
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={goForward} disabled={isSubmitting}>
              Continue
            </Button>
            <p className="text-xs text-muted-foreground">
              or press{' '}
              <kbd className="rounded border border-border px-1 py-0.5 font-mono text-xs">
                Enter
              </kbd>
            </p>
          </div>
        )}
      </div>
    );
  }

  function renderStepContent() {
    switch (question.type) {
      case 'text':
        return renderTextStep(question);
      case 'single':
        return renderSingleStep(question);
      case 'multi':
        return renderMultiStep(question);
    }
  }

  /* ---- Subtitle accessor ------------------------------------------------- */

  const subtitle =
    'subtitle' in question ? (question as TextQuestion | MultiQuestion).subtitle : undefined;

  /* ---- Main render ------------------------------------------------------- */

  return (
    <div className="flex w-full max-w-lg flex-col gap-8">
      <Progress value={progressValue} className="h-1" />

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={currentStep}
          custom={direction}
          initial={{ opacity: 0, y: direction * 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: direction * -40 }}
          transition={m.spring}
          className="w-full max-w-lg"
        >
          {/* Step number + title */}
          <div className="mb-6">
            <p className="mb-1 text-sm text-muted-foreground">
              {currentStep + 1} of {QUESTIONS.length}
            </p>
            <h2 className="text-2xl font-bold tracking-tight">
              {question.title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-muted-foreground">{subtitle}</p>
            )}
          </div>

          {/* Step content */}
          {renderStepContent()}

          {/* Navigation hint */}
          {currentStep > 0 && (
            <p className="mt-6 text-xs text-muted-foreground">
              Press{' '}
              <kbd className="rounded border border-border px-1 py-0.5 font-mono text-xs">
                &uarr;
              </kbd>{' '}
              to go back
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
