import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Options Flow',
  description: 'Unusual options flow scanner — real CBOE data, sorted by premium.',
};

// Keep-alive layout renders FlowPageContent directly via DashboardClientLayout.
// This page is only hit when the keep-alive container hasn't mounted yet.
export default function FlowPage() {
  return null;
}
