/** Default fixed circuit baked into the worker (public keys + Railway URLs only). */
export type Hop = { id: string; url: string; publicKey: string };

export const DEFAULT_HOPS: [Hop, Hop, Hop] = [
  {
    id: "hop1",
    url: "https://hop1-production-70b7.up.railway.app",
    publicKey: "UApkmgQb2nVk9wGdIA2bXH9ZCCLrgYeYkYI7sfhJVFo=",
  },
  {
    id: "hop2",
    url: "https://hop2-production.up.railway.app",
    publicKey: "tBqgL+/QM8emvRev3lxYBgZ77udk9t9Ap2nUkH70JSI=",
  },
  {
    id: "hop3",
    url: "https://hop3-production.up.railway.app",
    publicKey: "c6B9oNUE+Z0G3vDXAro/m22rgGXXXtj2dO7K0ou21gU=",
  },
];

/** Optional pool for isolationKey / random 3-of-N (includes spare hop4). */
export const DEFAULT_POOL: Hop[] = [
  ...DEFAULT_HOPS,
  {
    id: "hop4",
    url: "https://hop4-production.up.railway.app",
    publicKey: "atBZQj1UfBeAYZmd1j37ZM+L87rGgmQ0569F9/8/Kwc=",
  },
];
