// Define global jest methods
globalThis.jest = await import('@jest/globals').then(module => {
  const { jest } = module;
  return jest;
});
