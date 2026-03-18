import type { Metadata } from 'next';
import UserTesterPage from '@/components/ai/UserTesterPage';

export const metadata: Metadata = {
  title: 'Bilans Utilisateur IA | OrderFlow',
  description: 'Audit automatique du site par une IA simulant un utilisateur réel.',
};

export default function BilansPage() {
  return <UserTesterPage />;
}
