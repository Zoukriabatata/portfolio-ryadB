'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { CME_CONTRACTS } from '@/types/ib-protocol';

type Step = 1 | 2 | 3 | 4;

const CME_SYMBOLS = Object.entries(CME_CONTRACTS);

export default function IBSetupWizard() {
  const { data: session } = useSession();
  const [step, setStep] = useState<Step>(1);
  const [gatewayUrl, setGatewayUrl] = useState(
    process.env.NEXT_PUBLIC_IB_GATEWAY_URL || 'ws://localhost:4000'
  );
  const [selectedSymbol, setSelectedSymbol] = useState('ES');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestMessage('Connexion au gateway...');

    try {
      // Test HTTP health endpoint
      const healthUrl = gatewayUrl.replace('wss://', 'https://').replace('ws://', 'http://') + '/health';
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });

      if (res.ok) {
        const data = await res.json();
        setTestStatus('success');
        setTestMessage(`Gateway en ligne - ${data.connectedUsers || 0} utilisateurs connectes`);
      } else {
        setTestStatus('error');
        setTestMessage('Gateway inaccessible');
      }
    } catch {
      setTestStatus('error');
      setTestMessage('Impossible de contacter le gateway. Verifiez l\'URL et votre connexion.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] py-16 px-4">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-zinc-500 hover:text-white text-sm mb-6 inline-block">
          &larr; Dashboard
        </Link>

        <h1 className="text-3xl font-bold text-white mb-2">Configuration IB Gateway</h1>
        <p className="text-zinc-400 mb-8">Connectez votre compte Interactive Brokers pour les futures CME</p>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                step >= s
                  ? 'bg-green-500 text-white'
                  : 'bg-zinc-800 text-zinc-500'
              }`}>
                {step > s ? '\u2713' : s}
              </div>
              {s < 4 && <div className={`flex-1 h-0.5 ${step > s ? 'bg-green-500' : 'bg-zinc-800'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Subscribe to CME Data */}
        {step === 1 && (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8">
            <h2 className="text-xl font-semibold text-white mb-4">
              Etape 1 : Souscrire aux donnees CME
            </h2>
            <p className="text-zinc-400 mb-6">
              Vous devez avoir un compte Interactive Brokers avec un abonnement aux donnees futures CME.
            </p>

            <div className="space-y-4">
              <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                <h3 className="text-white font-medium mb-2">1. Ouvrir un compte IB</h3>
                <p className="text-zinc-400 text-sm">
                  Si ce n&apos;est pas deja fait, ouvrez un compte sur interactivebrokers.com
                </p>
              </div>

              <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                <h3 className="text-white font-medium mb-2">2. Souscrire au Market Data</h3>
                <p className="text-zinc-400 text-sm mb-2">
                  Dans votre compte IB, allez dans Settings &rarr; Market Data Subscriptions et ajoutez :
                </p>
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded">
                  <p className="text-green-400 font-mono text-sm font-bold">US Futures Value Bundle</p>
                  <p className="text-zinc-400 text-xs mt-1">~$14.50/mois (Non-Professional)</p>
                </div>
                <p className="text-zinc-500 text-xs mt-2">
                  Couvre : ES, MES, NQ, MNQ, YM, GC, MGC, CL et plus
                </p>
              </div>

              <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                <h3 className="text-white font-medium mb-2">3. Statut Non-Professional</h3>
                <p className="text-zinc-400 text-sm">
                  Assurez-vous que votre statut de donnees est &quot;Non-Professional&quot; pour beneficier du tarif reduit.
                  IB le demande lors de l&apos;ouverture de compte.
                </p>
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              className="mt-6 w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              J&apos;ai souscrit aux donnees &rarr;
            </button>
          </div>
        )}

        {/* Step 2: Configure IB Gateway */}
        {step === 2 && (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8">
            <h2 className="text-xl font-semibold text-white mb-4">
              Etape 2 : IB Gateway API
            </h2>
            <p className="text-zinc-400 mb-6">
              SENZOUKRIA se connecte a IB via un serveur gateway qui fait le pont entre IB Gateway et votre navigateur.
            </p>

            <div className="space-y-4">
              <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                <h3 className="text-white font-medium mb-2">Comment ca marche ?</h3>
                <div className="text-zinc-400 text-sm font-mono bg-zinc-900 p-3 rounded mt-2 overflow-x-auto">
                  <div>Votre navigateur</div>
                  <div className="text-green-400 ml-4">&darr; WebSocket (chiffre)</div>
                  <div className="ml-4">Gateway SENZOUKRIA (VPS)</div>
                  <div className="text-green-400 ml-8">&darr; TCP</div>
                  <div className="ml-8">IB Gateway (votre compte)</div>
                  <div className="text-green-400 ml-12">&darr;</div>
                  <div className="ml-12">CME (votre data)</div>
                </div>
              </div>

              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <p className="text-amber-400 text-sm">
                  Vos identifiants IB ne sont jamais transmis a SENZOUKRIA.
                  Le gateway se connecte a une instance IB Gateway configuree avec votre propre compte.
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(1)} className="px-6 py-3 bg-zinc-800 text-zinc-400 rounded-lg hover:bg-zinc-700 transition-colors">
                &larr; Retour
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
              >
                Compris &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Test Connection */}
        {step === 3 && (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8">
            <h2 className="text-xl font-semibold text-white mb-4">
              Etape 3 : Tester la connexion
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Gateway URL</label>
                <input
                  type="text"
                  value={gatewayUrl}
                  onChange={(e) => setGatewayUrl(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-green-500 transition-colors"
                />
                <p className="text-zinc-600 text-xs mt-1">URL du gateway fournie par SENZOUKRIA</p>
              </div>

              <button
                onClick={handleTestConnection}
                disabled={testStatus === 'testing'}
                className="w-full py-3 bg-zinc-800 border border-zinc-700 text-white rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                {testStatus === 'testing' ? 'Test en cours...' : 'Tester la connexion'}
              </button>

              {testStatus === 'success' && (
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
                  {testMessage}
                </div>
              )}

              {testStatus === 'error' && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {testMessage}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(2)} className="px-6 py-3 bg-zinc-800 text-zinc-400 rounded-lg hover:bg-zinc-700 transition-colors">
                &larr; Retour
              </button>
              <button
                onClick={() => setStep(4)}
                className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
              >
                Suivant &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Select Symbol */}
        {step === 4 && (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8">
            <h2 className="text-xl font-semibold text-white mb-4">
              Etape 4 : Choisir votre symbole
            </h2>
            <p className="text-zinc-400 mb-6">Selectionnez le contrat futures que vous souhaitez analyser.</p>

            <div className="grid grid-cols-2 gap-3">
              {CME_SYMBOLS.map(([sym, spec]) => (
                <button
                  key={sym}
                  onClick={() => setSelectedSymbol(sym)}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    selectedSymbol === sym
                      ? 'border-green-500 bg-green-500/10'
                      : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white font-bold font-mono">{sym}</span>
                    <span className="text-xs text-zinc-500">{spec.exchange}</span>
                  </div>
                  <p className="text-zinc-400 text-sm mt-1">{spec.description}</p>
                  <p className="text-zinc-600 text-xs mt-1">
                    Tick: {spec.tickSize} = ${spec.tickValue}
                  </p>
                </button>
              ))}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(3)} className="px-6 py-3 bg-zinc-800 text-zinc-400 rounded-lg hover:bg-zinc-700 transition-colors">
                &larr; Retour
              </button>
              <Link
                href={`/liquidity?source=ib&symbol=${selectedSymbol}`}
                className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity text-center"
              >
                Lancer {selectedSymbol} &rarr;
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
