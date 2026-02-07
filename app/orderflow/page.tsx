'use client';

import { redirect } from 'next/navigation';

/**
 * ORDERFLOW PAGE - Redirects to Footprint
 *
 * This page has been consolidated into /footprint
 * which uses the professional FootprintChartPro component.
 */

export default function OrderFlowPage() {
  redirect('/footprint');
}
