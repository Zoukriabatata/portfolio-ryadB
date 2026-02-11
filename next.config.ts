import type { NextConfig } from "next";
import WebpackObfuscator from 'webpack-obfuscator';
import { withSentryConfig } from '@sentry/nextjs';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  devIndicators: false,
  reactStrictMode: false,

  // ✅ SÉCURITÉ PRODUCTION: Désactiver source maps
  productionBrowserSourceMaps: false,

  // ✅ COMPRESSION GZIP
  compress: true,

  compiler: {
    // ✅ SUPPRIMER TOUS LES CONSOLE.LOG EN PRODUCTION
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'], // Garder uniquement error/warn pour monitoring
    } : false,
  },

  webpack: (config, { dev, isServer }) => {
    // ✅ OBFUSCATION MAXIMALE EN PRODUCTION (CLIENT UNIQUEMENT)
    if (!dev && !isServer) {
      config.plugins.push(
        new WebpackObfuscator({
          // 🔒 CONFIGURATION MAXIMALE (sécurité > performance)
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 1, // Max (default 0.75)
          deadCodeInjection: true,
          deadCodeInjectionThreshold: 0.5, // Augmenté pour plus de code mort
          debugProtection: true,
          debugProtectionInterval: 2000, // Crash si DevTools ouvert
          disableConsoleOutput: true,
          identifierNamesGenerator: 'hexadecimal',
          log: false,
          numbersToExpressions: true,
          renameGlobals: false,
          selfDefending: true, // Code se défend contre le formatting
          simplify: true,
          splitStrings: true,
          splitStringsChunkLength: 5, // Petits chunks pour obscurcir
          stringArray: true,
          stringArrayCallsTransform: true,
          stringArrayEncoding: ['rc4'], // Encodage fort
          stringArrayIndexShift: true,
          stringArrayRotate: true,
          stringArrayShuffle: true,
          stringArrayWrappersCount: 3, // Augmenté
          stringArrayWrappersChainedCalls: true,
          stringArrayWrappersParametersMaxCount: 5,
          stringArrayWrappersType: 'function',
          stringArrayThreshold: 1, // Max (toutes les strings)
          transformObjectKeys: true,
          unicodeEscapeSequence: false,

          // ✅ EXCLURE NODE_MODULES (sinon React/Next.js planteront)
        }, [
          'node_modules/**/*',
          '**/*.json',
        ])
      );

      // ✅ MINIMISATION AGRESSIVE
      config.optimization = {
        ...config.optimization,
        minimize: true,
        minimizer: [
          ...(config.optimization.minimizer || []),
        ],
      };

      // ✅ OBFUSQUER LES NOMS DE CHUNKS
      config.output.chunkFilename = 'static/chunks/[contenthash].js';
      config.output.filename = 'static/chunks/[contenthash].js';
    }

    return config;
  },
};

// Wrapping avec Bundle Analyzer + Sentry
export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  // Sentry Webpack Plugin options
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Authentication token pour upload des source maps
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Désactiver en dev (pas besoin d'upload)
  silent: process.env.NODE_ENV !== 'production',

  // Upload des source maps uniquement en production
  widenClientFileUpload: true,
  sourcemaps: {
    disable: false, // Enable source maps upload
  },
  disableLogger: true, // Pas de logs Sentry pendant le build
});
