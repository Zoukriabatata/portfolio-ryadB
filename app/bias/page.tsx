import type { Metadata } from 'next';
import BiasDashboard from '@/components/BiasDashboard';

export const metadata: Metadata = {
  title: 'Bias Dashboard',
  description: 'QQQ trading bias based on GEX, options flow, IV skew and key levels.',
};

export default function BiasPage() {
  return (
    <div className="h-full">
      <BiasDashboard />
    </div>
  );
}
