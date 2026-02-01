'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Chart', icon: '📈' },
  { href: '/live', label: 'Live', icon: '🔴' },
  { href: '/footprint', label: 'Footprint', icon: '📊' },
  { href: '/gex', label: 'GEX', icon: '📉' },
  { href: '/volatility', label: 'Volatility', icon: '📈' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#0a0a0a] text-white">
      {/* Top Navigation - Fixed height */}
      <nav className="h-14 flex-shrink-0 bg-[#111111] border-b border-zinc-800 flex items-center px-4">
        <div className="flex items-center gap-6">
          {/* Logo */}
          <span className="text-lg font-bold text-white">Trading</span>

          {/* Navigation */}
          <div className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                  pathname === item.href
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <span className="mr-2">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* Content - Takes remaining height, no overflow */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
