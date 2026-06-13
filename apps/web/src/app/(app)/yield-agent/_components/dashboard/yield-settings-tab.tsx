'use client';

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useMotionSafe } from '@/lib/motion';
import {
  Settings,
  ArrowDownToLine,
  ArrowRightLeft,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import {
  useYieldAgentStatus,
  useUpdateYieldSettings,
  useWithdrawAll,
  useConvertToUsdc,
} from '@/hooks/use-yield-agent';
import { formatFrequency } from '@mantleagents/shared';
import { SliderField } from '@/components/slider-field';

export function YieldSettingsTab() {
  const m = useMotionSafe();
  const { data: statusData, isLoading: statusLoading } =
    useYieldAgentStatus();
  const updateSettings = useUpdateYieldSettings();
  const withdrawAll = useWithdrawAll();
  const convertToUsdc = useConvertToUsdc();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  const config = statusData?.config;
  const params = config?.strategyParams;

  const [frequency, setFrequency] = useState(4);
  const [minAprThreshold, setMinAprThreshold] = useState(5);
  const [maxSingleVaultPct, setMaxSingleVaultPct] = useState(40);
  const [minHoldPeriodDays, setMinHoldPeriodDays] = useState(3);
  const [maxVaultCount, setMaxVaultCount] = useState(5);
  const [minTvlUsd, setMinTvlUsd] = useState(50_000);
  const [autoCompound, setAutoCompound] = useState(false);

  // Sync form state when data loads
  useEffect(() => {
    if (!config) return;
    setFrequency(config.frequency);

    if (params) {
      setMinAprThreshold(params.minAprThreshold);
      setMaxSingleVaultPct(params.maxSingleVaultPct);
      setMinHoldPeriodDays(params.minHoldPeriodDays);
      setMaxVaultCount(params.maxVaultCount);
      setMinTvlUsd(params.minTvlUsd);
      setAutoCompound(params.autoCompound);
    }
  }, [config, params]);

  const handleSave = () => {
    updateSettings.mutate(
      {
        frequency,
        strategyParams: {
          minAprThreshold,
          maxSingleVaultPct,
          minHoldPeriodDays,
          maxVaultCount,
          minTvlUsd,
          autoCompound,
        },
      },
      {
        onSuccess: () => toast.success('Settings saved'),
        onError: () => toast.error('Failed to save settings'),
      },
    );
  };

  const handleWithdraw = () => {
    withdrawAll.mutate(undefined, {
      onSuccess: (data) => {
        setWithdrawOpen(false);
        const results = data?.results ?? [];
        const convertResult = data?.convertResult;
        const succeeded = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success && !r.skipped);
        const total = results.length;

        if (total === 0) {
          toast.info('No active positions to withdraw');
        } else if (failed.length === 0) {
          let convertMsg = '';
          if (convertResult) {
            if (convertResult.swapped.length > 0) {
              convertMsg =
                convertResult.skipped.length > 0
                  ? ` Converted to USDC. ${convertResult.skipped.length} token(s) skipped.`
                  : ' Converted to USDC.';
            } else if (convertResult.skipped.length > 0) {
              convertMsg = ` Could not convert: ${convertResult.skipped.map((s) => `${s.symbol}: ${s.reason}`).join('; ')}`;
            }
          }
          toast.success(
            (total === 1 ? 'Position withdrawn' : `${succeeded}/${total} positions withdrawn`) +
              convertMsg,
          );
        } else {
          const errMsg = failed[0]?.error ?? 'Unknown error';
          toast.error(
            `${succeeded}/${total} withdrawn. ${failed.length} failed: ${errMsg}`,
          );
        }
      },
      onError: () => toast.error('Failed to withdraw'),
    });
  };

  const handleConvertToUsdc = () => {
    convertToUsdc.mutate(undefined, {
      onSuccess: (data) => {
        setConvertOpen(false);
        const swapped = data?.swapped ?? [];
        const skipped = data?.skipped ?? [];

        if (swapped.length === 0 && skipped.length === 0) {
          toast.info('No convertible tokens');
        } else if (swapped.length > 0 && skipped.length === 0) {
          toast.success(
            swapped.length === 1
              ? `Converted ${swapped[0].symbol} to USDC`
              : `Converted ${swapped.length} tokens to USDC`,
          );
        } else if (swapped.length > 0 && skipped.length > 0) {
          const skipList = skipped.map((s) => `${s.symbol}: ${s.reason}`).join('; ');
          toast.success(
            `Converted ${swapped.length} tokens to USDC`,
            { description: `Skipped: ${skipList}` },
          );
        } else {
          const skipList = skipped.map((s) => `${s.symbol}: ${s.reason}`).join('; ');
          toast.warning('No tokens converted', { description: skipList });
        }
      },
      onError: () => toast.error('Failed to convert to USDC'),
    });
  };

  if (statusLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-4 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!config) {
    return (
      <Card className="border-dashed border-gb-dark bg-gb-deep">
        <CardContent className="flex flex-col items-center justify-center py-10 text-center">
          <Settings className="mb-3 size-6 text-gb-mid/50" />
          <p className="text-sm text-gb-mid">
            No yield agent configured. Complete onboarding first.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      {...m.fadeIn}
      transition={{ duration: m.duration.normal }}
      className="space-y-6"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="size-4 text-amber-500" />
            Strategy Settings
          </CardTitle>
          <CardDescription>
            Configure how the yield agent selects and manages vault positions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <SliderField
            label="Run Frequency"
            tooltip="How many hours between each agent run. Lower values mean more frequent yield optimization."
            value={frequency}
            onChange={setFrequency}
            min={1}
            max={24}
            step={1}
            formatValue={formatFrequency}
          />

          <SliderField
            label="Min APR Threshold"
            tooltip="Only enter vaults with APR above this threshold."
            value={minAprThreshold}
            onChange={setMinAprThreshold}
            min={0}
            max={50}
            step={0.5}
            suffix="%"
          />

          <SliderField
            label="Max Single Vault Allocation"
            tooltip="Maximum percentage of portfolio in a single vault."
            value={maxSingleVaultPct}
            onChange={setMaxSingleVaultPct}
            min={1}
            max={100}
            step={1}
            suffix="%"
          />

          <SliderField
            label="Min Hold Period"
            tooltip="Minimum days to hold a vault position before rotating."
            value={minHoldPeriodDays}
            onChange={setMinHoldPeriodDays}
            min={0}
            max={30}
            step={1}
            suffix=" days"
          />

          <SliderField
            label="Max Vault Count"
            tooltip="Maximum number of vaults to hold positions in simultaneously."
            value={maxVaultCount}
            onChange={setMaxVaultCount}
            min={1}
            max={10}
            step={1}
          />

          <SliderField
            label="Min TVL (USD)"
            tooltip="Only consider vaults with TVL above this amount."
            value={minTvlUsd}
            onChange={setMinTvlUsd}
            min={0}
            max={500_000}
            step={10_000}
            formatValue={(v) => `$${v.toLocaleString()}`}
          />

          {/* Auto Compound */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="autoCompound" className="text-sm font-medium">
                Auto-Compound
              </Label>
              <p className="text-xs text-muted-foreground">
                Automatically reinvest earned rewards back into the vault.
              </p>
            </div>
            <Switch
              id="autoCompound"
              checked={autoCompound}
              onCheckedChange={setAutoCompound}
            />
          </div>

          <Button
            onClick={handleSave}
            disabled={updateSettings.isPending}
            className="w-full"
          >
            {updateSettings.isPending ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : null}
            Save Settings
          </Button>
        </CardContent>
      </Card>

      {/* Convert to USDC */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowRightLeft className="size-4 text-amber-500" />
            Convert to USDC
          </CardTitle>
          <CardDescription>
            Swap all wallet tokens to USDC. Only tokens with a supported swap route
            are converted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full">
                <ArrowRightLeft className="size-4 mr-2" />
                Convert to USDC
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Convert to USDC</DialogTitle>
                <DialogDescription>
                  This will swap all convertible tokens (USDT, USDm, EURm, etc.)
                  to USDC. Tokens without a swap route will be skipped. Continue?
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  disabled={convertToUsdc.isPending}
                  onClick={handleConvertToUsdc}
                >
                  {convertToUsdc.isPending ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : null}
                  Convert
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* Withdraw All */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">
            Danger Zone
          </CardTitle>
          <CardDescription>
            Withdraw all funds from active vault positions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="w-full">
                <ArrowDownToLine className="size-4 mr-2" />
                Withdraw All Positions
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Withdraw All Positions</DialogTitle>
                <DialogDescription>
                  This will withdraw all funds from every active vault position
                  and convert them to USDC. Claim any pending rewards separately
                  before withdrawing if needed. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  disabled={withdrawAll.isPending}
                  onClick={handleWithdraw}
                >
                  {withdrawAll.isPending ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : null}
                  Confirm Withdraw
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </motion.div>
  );
}
