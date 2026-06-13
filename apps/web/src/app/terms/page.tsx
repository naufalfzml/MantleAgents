import Link from 'next/link';
import { Logo } from '@/components/logo';

export const metadata = {
  title: 'Terms of Service | MantleAgents',
  description: 'Terms of Service for MantleAgents',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <Link href="/">
          <Logo size="sm" />
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold">Terms of Service</h1>
        <p className="mt-4 text-muted-foreground">
          Last updated: {new Date().toLocaleDateString('en-US')}
        </p>
        <div className="prose prose-invert mt-8 max-w-none">
          <p className="text-muted-foreground">
            Your terms of service content goes here. This is a placeholder page.
          </p>
        </div>
        <Link
          href="/"
          className="mt-8 inline-block text-sm text-primary hover:underline"
        >
          ← Back to MantleAgents
        </Link>
      </main>
    </div>
  );
}
