'use client';

import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

type VideoModalProps = {
  trigger: ReactNode;
};

export function VideoModal({ trigger }: VideoModalProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-4xl border-white/[0.08] bg-card p-3 sm:p-4">
        <DialogHeader className="sr-only">
          <DialogTitle>What is JakartAgents?</DialogTitle>
          <DialogDescription>
            Product demo video showing how JakartAgents works.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-xl border border-white/[0.08]">
          <div className="relative w-full pt-[56.25%]">
            <iframe
              className="absolute inset-0 h-full w-full"
              src="https://player.vimeo.com/video/1165647906?transparent=0"
              title="What is JakartAgents?"
              loading="lazy"
              allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
              allowFullScreen
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
