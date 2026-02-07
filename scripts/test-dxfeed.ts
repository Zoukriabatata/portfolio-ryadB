/**
 * TEST DXFEED CONNECTION
 *
 * Script de test minimal pour vérifier:
 * 1. La connexion à dxFeed demo
 * 2. L'événement "connected" reçu
 * 3. La réception de Trades sur /NQ
 *
 * Usage: npx ts-node scripts/test-dxfeed.ts
 * Ou: npx tsx scripts/test-dxfeed.ts
 */

import { Feed, EventType } from '@dxfeed/api';

const DXFEED_URL = 'wss://demo.dxfeed.com/webservice/cometd';
const SYMBOL = '/NQ';  // E-mini Nasdaq 100
const TEST_TIMEOUT = 30000;  // 30 seconds

console.log('═══════════════════════════════════════════════════');
console.log('   DXFEED CONNECTION TEST');
console.log('═══════════════════════════════════════════════════');
console.log('URL:', DXFEED_URL);
console.log('Symbol:', SYMBOL);
console.log('');

async function testConnection(): Promise<void> {
  const feed = new Feed();
  let connected = false;
  let tradeReceived = false;
  let quoteReceived = false;
  let tradeCount = 0;
  let quoteCount = 0;

  return new Promise((resolve, reject) => {
    // Timeout
    const timeout = setTimeout(() => {
      console.log('\n❌ TIMEOUT - Test failed after 30 seconds');
      console.log('Status:');
      console.log('  - Connected:', connected);
      console.log('  - Quotes received:', quoteCount);
      console.log('  - Trades received:', tradeCount);
      feed.disconnect();
      reject(new Error('Timeout'));
    }, TEST_TIMEOUT);

    // Register state handler
    feed.endpoint.registerStateChangeHandler((state) => {
      console.log('[State]', state);

      if (state.connected === true) {
        connected = true;
        console.log('\n✓ CONNECTED to dxFeed demo!');
        console.log('');

        // Subscribe to Quote (for bid/ask)
        console.log(`Subscribing to Quote on ${SYMBOL}...`);
        feed.subscribe(
          [EventType.Quote],
          [SYMBOL],
          (quote) => {
            const q = quote as { bidPrice?: number; askPrice?: number };
            quoteCount++;
            if (!quoteReceived) {
              quoteReceived = true;
              console.log(`\n✓ FIRST QUOTE RECEIVED!`);
              console.log('  Bid:', q.bidPrice);
              console.log('  Ask:', q.askPrice);
            }
            if (quoteCount <= 3) {
              console.log(`  [Quote #${quoteCount}] Bid: ${q.bidPrice}, Ask: ${q.askPrice}`);
            }
          }
        );

        // Subscribe to Trade
        console.log(`Subscribing to Trade on ${SYMBOL}...`);
        feed.subscribe(
          [EventType.Trade],
          [SYMBOL],
          (trade) => {
            const t = trade as { price?: number; size?: number; time?: number };
            tradeCount++;
            if (!tradeReceived) {
              tradeReceived = true;
              console.log(`\n✓ FIRST TRADE RECEIVED!`);
              console.log('  Price:', t.price);
              console.log('  Size:', t.size);
              console.log('  Time:', t.time);
            }

            if (tradeCount <= 5) {
              console.log(`  [Trade #${tradeCount}] ${t.price} x ${t.size}`);
            }

            if (tradeCount >= 5 && quoteCount >= 3) {
              clearTimeout(timeout);
              console.log('\n═══════════════════════════════════════════════════');
              console.log('   ✓ TEST PASSED!');
              console.log('═══════════════════════════════════════════════════');
              console.log('Summary:');
              console.log('  - Connected: YES');
              console.log('  - Quotes received:', quoteCount);
              console.log('  - Trades received:', tradeCount);
              console.log('');
              feed.disconnect();
              resolve();
            }
          }
        );
      }
    });

    // Connect
    console.log('Connecting to dxFeed...');
    feed.connect(DXFEED_URL);
  });
}

// Run test
testConnection()
  .then(() => {
    console.log('Test completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error.message);
    process.exit(1);
  });
