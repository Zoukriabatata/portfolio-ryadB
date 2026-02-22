import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Senzoukria — Order Flow Analytics',
    short_name: 'Senzoukria',
    description: 'Institutional-grade orderflow analytics platform with real-time heatmaps, footprint charts, and gamma exposure.',
    start_url: '/live',
    display: 'standalone',
    background_color: '#0a0a12',
    theme_color: '#10b981',
    icons: [
      {
        src: '/favicon.ico',
        sizes: '48x48',
        type: 'image/x-icon',
      },
    ],
  };
}
