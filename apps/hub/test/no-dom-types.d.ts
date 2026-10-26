// Vitest's optional `jsdom` types pull in `lib.dom`, whose WebCrypto/Request types conflict with
// the Workers runtime types. The Hub never uses jsdom; tsconfig maps the module here instead.
export {};
