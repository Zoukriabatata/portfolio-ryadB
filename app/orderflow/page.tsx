import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Order Flow Analysis',
  description: 'Professional order flow analysis with footprint charts, delta profiles, and real-time trade visualization on Senzoukria.',
};

/**
 * ORDERFLOW PAGE - Redirects to Footprint
 *
 * This page has been consolidated into /footprint
 * which uses the professional FootprintChartPro component.
 */

export default function OrderFlowPage() {
  redirect('/footprint');
}
