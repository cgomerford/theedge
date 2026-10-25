// Client-safe type for who is looking. The server side that computes it is getViewerTier() in require-pro.ts.
export type ViewerTier = 'pro' | 'member' | 'anon'
