// Empty stub for the `server-only` package during Vitest runs.
// In the Next.js build, `server-only` resolves to its real (no-op on the
// server / throwing on the client) module; under Node test there is no
// `react-server` export condition, so we replace it with this no-op.
export {};
