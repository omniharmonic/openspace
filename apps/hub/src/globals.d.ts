// The Workers runtime types declare `crypto` as a block-scoped const, which `typeof globalThis`
// does not include; @openspace/schema reads `globalThis.crypto`, so expose it as a var too.
declare var crypto: Crypto;
