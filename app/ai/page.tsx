import type { Metadata } from 'next';
import AIAgentsPage from '@/components/ai/AIAgentsPage';

export const metadata: Metadata = {
  title: 'AI Trading Suite',
  description: 'Analyse de marché IA (GEX, skew, option flow) + assistant support.',
};

export default function AiPage() {
  return <AIAgentsPage />;
}
