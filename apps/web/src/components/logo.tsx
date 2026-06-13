import Image from 'next/image';
import { cn } from '@/lib/utils';

const sizes = {
  sm: { icon: 24, text: 'text-lg' },
  md: { icon: 40, text: 'text-2xl' },
  lg: { icon: 56, text: 'text-4xl' },
} as const;

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showWordmark?: boolean;
}

export function Logo({ size = 'md', className, showWordmark = true }: LogoProps) {
  const { icon, text } = sizes[size];

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Image
        src="/mantleagents-polos.png"
        alt="MantleAgents logo"
        width={icon}
        height={icon}
        className="rounded-lg"
      />
      {showWordmark && (
        <span className={cn('font-bold tracking-tight', text)}>
          MantleAgents
        </span>
      )}
    </div>
  );
}
