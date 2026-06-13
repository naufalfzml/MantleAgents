import { StrategyDetail } from '../_components/strategy-detail';

export const metadata = {
  title: 'Strategy Detail | MantleAgents',
};

export default function StrategyDetailPage({ params }: { params: { id: string } }) {
  return <StrategyDetail id={params.id} />;
}
