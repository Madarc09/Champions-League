# Vercel deployment repair

The previous package forced a live 10.5 MB player-feed download and 32 CapSpace page requests during Vercel's `prebuild` step. Any network or source failure stopped the entire deployment.

This package removes that mandatory prebuild operation.

Runtime order:
1. Nick's manual correction, when present.
2. Populated `data/SALARY_CAP_SPACE.json`, when present.
3. Explicit safeguards for Adam Fox, Jason Robertson, Nicholas Robertson, and Gavin McKenna.
4. The existing resilient salary snapshot/cache.
5. Rookie seed salary, when available.

The optional command `npm run salary-cap-space` still exists for generating the static files in an environment where the source URLs are available, but Vercel deployment no longer depends on it.
