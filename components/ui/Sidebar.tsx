'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  badge?: 'new';
}

// Trading section items
const tradingItems: NavItem[] = [
  {
    name: 'Accueil',
    href: '/',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    name: 'Live',
    href: '/live',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    name: 'Footprint',
    href: '/footprint',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    name: 'Liquidity',
    href: '/liquidity',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    name: 'Heatmap ATAS',
    href: '/heatmap',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <rect x="3" y="3" width="5" height="5" rx="1" strokeWidth={1.5} />
        <rect x="10" y="3" width="5" height="5" rx="1" strokeWidth={1.5} fill="currentColor" fillOpacity="0.3" />
        <rect x="17" y="3" width="5" height="5" rx="1" strokeWidth={1.5} />
        <rect x="3" y="10" width="5" height="5" rx="1" strokeWidth={1.5} fill="currentColor" fillOpacity="0.5" />
        <rect x="10" y="10" width="5" height="5" rx="1" strokeWidth={1.5} fill="currentColor" fillOpacity="0.7" />
        <rect x="17" y="10" width="5" height="5" rx="1" strokeWidth={1.5} fill="currentColor" fillOpacity="0.3" />
        <rect x="3" y="17" width="5" height="5" rx="1" strokeWidth={1.5} />
        <rect x="10" y="17" width="5" height="5" rx="1" strokeWidth={1.5} fill="currentColor" fillOpacity="0.2" />
        <rect x="17" y="17" width="5" height="5" rx="1" strokeWidth={1.5} fill="currentColor" fillOpacity="0.6" />
      </svg>
    ),
    badge: 'new',
  },
  {
    name: 'Volatility',
    href: '/volatility',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
      </svg>
    ),
  },
  {
    name: 'GEX',
    href: '/gex',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
  },
];

// Tools & Resources section
const toolsItems: NavItem[] = [
  {
    name: 'News',
    href: '/news',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
      </svg>
    ),
  },
  {
    name: 'Boutique',
    href: '/boutique',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        {/* Gift/Store icon - premium shop feel */}
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 8H3v2a2 2 0 0 0 2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0 2-2V8Z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8V21M12 8c2.5 0 3-4 3-4H9s.5 4 3 4Z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-2.5 0-3-4-3-4h6s-.5 4-3 4Z" />
        <circle cx="12" cy="15" r="2" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth={1.5} />
      </svg>
    ),
  },
];

// Navigation link component
function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  return (
    <Link
      href={item.href}
      className={`
        relative flex items-center justify-center lg:justify-start gap-3 px-3 py-2.5 rounded-lg
        transition-all duration-200
        ${isActive
          ? 'bg-green-500/20 text-green-400'
          : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
        }
      `}
    >
      {item.icon}
      <span className="hidden lg:block text-sm font-medium">{item.name}</span>
      {item.badge === 'new' && (
        <span className="hidden lg:block ml-auto text-[10px] font-bold text-green-400 bg-green-500/20 px-2 py-0.5 rounded-full">
          NEW
        </span>
      )}
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed left-0 top-0 z-[60] h-screen w-16 lg:w-64 bg-zinc-950 border-r border-zinc-800">
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="flex items-center justify-center lg:justify-start h-16 px-4 border-b border-zinc-800">
          <span className="text-xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent hidden lg:block">
            SENZOUKRIA
          </span>
          <span className="text-xl font-bold text-green-400 lg:hidden">SZ</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 lg:px-3 overflow-y-auto">
          {/* Trading Section */}
          <div className="mb-4">
            <div className="hidden lg:block px-3 mb-2">
              <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Trading</span>
            </div>
            <div className="space-y-0.5 p-1 rounded-xl border border-zinc-800/50 bg-zinc-900/30">
              {tradingItems.map((item) => (
                <NavLink
                  key={item.name}
                  item={item}
                  isActive={pathname === item.href}
                />
              ))}
            </div>
          </div>

          {/* Tools & Resources Section */}
          <div>
            <div className="hidden lg:block px-3 mb-2">
              <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Outils</span>
            </div>
            <div className="space-y-0.5 p-1 rounded-xl border border-zinc-800/50 bg-zinc-900/30">
              {toolsItems.map((item) => (
                <NavLink
                  key={item.name}
                  item={item}
                  isActive={pathname === item.href}
                />
              ))}
            </div>
          </div>
        </nav>

        {/* Connection Status */}
        <div className="p-4 border-t border-zinc-800">
          <div className="flex items-center justify-center lg:justify-start gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="hidden lg:block text-xs text-zinc-400">Connected</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
