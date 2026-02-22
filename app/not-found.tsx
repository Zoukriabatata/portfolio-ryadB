import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient gradient orbs */}
      <div
        className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />
      <div
        className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(6,182,212,0.05) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />

      <div className="text-center max-w-lg relative z-10">
        {/* Glitch 404 */}
        <div className="relative mb-8 select-none">
          <h1
            className="text-[160px] sm:text-[200px] font-black leading-none tracking-tighter"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.03) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            404
          </h1>
          {/* Glow reflection */}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ filter: 'blur(40px)', opacity: 0.3 }}
          >
            <span className="text-[160px] sm:text-[200px] font-black leading-none tracking-tighter text-emerald-500">
              404
            </span>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-white/90 mb-3">
          Page not found
        </h2>
        <p className="text-sm text-white/40 mb-10 leading-relaxed max-w-sm mx-auto">
          This page doesn&apos;t exist or has been moved. Here are some places you might want to go:
        </p>

        {/* Quick navigation grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { href: '/live', label: 'Live Charts', icon: 'M3 3v18h18', color: '#10b981' },
            { href: '/journal', label: 'Journal', icon: 'M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 004 17V5a2 2 0 012-2h14v14H6.5', color: '#f59e0b' },
            { href: '/pricing', label: 'Pricing', icon: 'M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6', color: '#06b6d4' },
            { href: '/news', label: 'News', icon: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1', color: '#84cc16' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-white/[0.06] hover:border-white/[0.12] transition-all duration-300"
              style={{ background: 'rgba(255,255,255,0.02)' }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                style={{ background: `${item.color}15`, border: `1px solid ${item.color}25` }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={item.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon} />
                </svg>
              </div>
              <span className="text-[11px] font-medium text-white/50 group-hover:text-white/80 transition-colors">
                {item.label}
              </span>
            </Link>
          ))}
        </div>

        {/* CTA buttons */}
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/70 hover:text-white text-sm font-medium transition-all duration-200 border border-white/[0.08] hover:border-white/[0.15]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Home
          </Link>
          <Link
            href="/live"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border"
            style={{
              background: 'rgba(16,185,129,0.1)',
              borderColor: 'rgba(16,185,129,0.2)',
              color: '#34d399',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Open Charts
          </Link>
        </div>
      </div>
    </div>
  );
}
