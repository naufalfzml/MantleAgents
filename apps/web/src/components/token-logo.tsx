import { TOKEN_METADATA } from '@mantleagents/shared';
import { cn } from '@/lib/utils';

interface TokenLogoProps {
  symbol: string;
  size?: number;
  className?: string;
}

/**
 * Renders a token logo image from TOKEN_METADATA, falling back to the flag emoji.
 */
export function TokenLogo({ symbol, size = 20, className }: TokenLogoProps) {
  const meta = TOKEN_METADATA[symbol];
  const logo = meta?.logo;
  const flag = meta?.flag;

  if (logo) {
    return (
      <img
        src={logo}
        alt={symbol}
        width={size}
        height={size}
        className={cn("pixelated rounded-none border border-gb-deep bg-gb-light", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  if (flag) {
    return <span className={cn("pixelated", className)}>{flag}</span>;
  }

  return null;
}
