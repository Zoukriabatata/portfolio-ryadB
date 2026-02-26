/**
 * Geolocation & Impossible Travel Detection
 *
 * Detects account sharing by identifying physically impossible travel:
 * - Same account used from Paris at 10:00, then from Tokyo at 10:05 (impossible)
 * - Max realistic speed: 900 km/h (commercial airplane)
 *
 * Uses ip-api.com (FREE, 45 req/min, no API key)
 * Upgrade to MaxMind GeoIP2 ($50/year) for higher traffic
 */

import { prisma, isPrismaAvailable } from '@/lib/db';

interface GeoLocation {
  country: string;
  city: string;
  lat: number;
  lon: number;
  ip: string;
}

// ✅ FREE API: ip-api.com (45 requests/min, no key required)
const GEO_API = 'http://ip-api.com/json';

// Cache géolocalisation en mémoire (éviter requêtes répétées)
const geoCache = new Map<string, { geo: GeoLocation; expires: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 heures

/**
 * Detect impossible travel
 *
 * Checks if user moved from location A to B faster than physically possible.
 * Max speed: 900 km/h (airplane)
 *
 * @param userId - User ID
 * @param currentIp - Current IP address
 * @returns {suspicious, reason, distance, timeDiff}
 */
export async function detectImpossibleTravel(
  userId: string,
  currentIp: string
): Promise<{
  suspicious: boolean;
  reason?: string;
  distance?: number;
  timeDiff?: number;
}> {
  try {
    // Skip DB check if prisma is unavailable (dev mode without DB)
    if (!isPrismaAvailable()) {
      return { suspicious: false };
    }

    // Get last known location from recent session
    const lastSession = await prisma.session.findFirst({
      where: {
        userId,
        expiresAt: { gt: new Date() }, // Active sessions only
      },
      orderBy: { lastActivity: 'desc' },
      select: {
        ipAddress: true,
        lastActivity: true,
      },
    });

    if (!lastSession || !lastSession.ipAddress) {
      return { suspicious: false };
    }

    // Same IP = no problem
    if (lastSession.ipAddress === currentIp) {
      return { suspicious: false };
    }

    // Get geolocation for both IPs
    const [lastGeo, currentGeo] = await Promise.all([
      getGeoLocation(lastSession.ipAddress),
      getGeoLocation(currentIp),
    ]);

    // Calculate distance in kilometers
    const distance = calculateHaversineDistance(
      lastGeo.lat, lastGeo.lon,
      currentGeo.lat, currentGeo.lon
    );

    // Calculate time elapsed in hours
    const timeDiff = (Date.now() - lastSession.lastActivity.getTime()) / (1000 * 60 * 60);

    // ✅ DETECTION: Max realistic speed = 900 km/h (commercial airplane)
    const maxRealisticDistance = timeDiff * 900;

    // Ignore small movements (<100 km = same region/VPN switch)
    if (distance < 100) {
      return { suspicious: false, distance, timeDiff };
    }

    // Impossible travel detected
    if (distance > maxRealisticDistance) {
      return {
        suspicious: true,
        reason: `Voyage impossible: ${Math.round(distance)}km en ${timeDiff.toFixed(1)}h depuis ${lastGeo.city}, ${lastGeo.country}`,
        distance,
        timeDiff,
      };
    }

    return { suspicious: false, distance, timeDiff };

  } catch (error) {
    console.error('Geo validation error:', error);
    // FAIL OPEN: Don't block users if geolocation fails
    return { suspicious: false };
  }
}

/**
 * Get geolocation for IP address
 *
 * Uses ip-api.com (free, 45 req/min)
 * Caches results for 24h to minimize API calls
 */
async function getGeoLocation(ip: string): Promise<GeoLocation> {
  // Check cache first
  const cached = geoCache.get(ip);
  if (cached && cached.expires > Date.now()) {
    return cached.geo;
  }

  try {
    // ✅ ip-api.com: FREE, 45 req/min, no API key needed
    const response = await fetch(`${GEO_API}/${ip}`, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 86400 }, // Next.js cache for 24h
    });

    if (!response.ok) {
      throw new Error(`Geo API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status === 'fail') {
      throw new Error(data.message || 'Geolocation failed');
    }

    const geo: GeoLocation = {
      country: data.country || 'Unknown',
      city: data.city || 'Unknown',
      lat: data.lat || 0,
      lon: data.lon || 0,
      ip,
    };

    // Cache for 24h
    geoCache.set(ip, {
      geo,
      expires: Date.now() + CACHE_TTL,
    });

    return geo;

  } catch (error) {
    console.error('Geolocation error for IP', ip, error);

    // Fallback: return unknown location
    return {
      country: 'Unknown',
      city: 'Unknown',
      lat: 0,
      lon: 0,
      ip,
    };
  }
}

/**
 * Calculate distance between two coordinates
 *
 * Uses Haversine formula for great-circle distance on a sphere.
 * Accuracy: ±0.5% for typical Earth distances.
 *
 * @returns Distance in kilometers
 */
function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Get country from IP (lightweight, no distance calc)
 *
 * Useful for simple country-based restrictions.
 */
export async function getCountryFromIp(ip: string): Promise<string> {
  const geo = await getGeoLocation(ip);
  return geo.country;
}

/**
 * Clear geolocation cache
 *
 * Useful for testing or manual cache invalidation.
 */
export function clearGeoCache(): void {
  geoCache.clear();
}

/**
 * Get cache stats (for monitoring)
 */
export function getGeoCacheStats(): { size: number; entries: string[] } {
  return {
    size: geoCache.size,
    entries: Array.from(geoCache.keys()),
  };
}
