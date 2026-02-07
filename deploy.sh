#!/bin/bash
# Script de déploiement automatique sur Vercel
# À exécuter UNE FOIS : bash deploy.sh

echo "🚀 Déploiement sur Vercel..."

# 1. Login Vercel (ouvre le navigateur UNE FOIS)
echo "📝 Étape 1: Authentification Vercel (s'ouvre dans le navigateur)"
vercel login

# 2. Déploiement
echo "🎯 Étape 2: Déploiement du site..."
vercel --prod

echo "✅ Déploiement terminé !"
echo "🌐 Ton site est en ligne !"
