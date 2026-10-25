import { notFound } from 'next/navigation'

// Section is switched off: every URL under here returns a real 404.
// The folder is kept so it can be switched back on by deleting this file.
export default function Layout({ children }: { children: React.ReactNode }) {
  notFound()
  return children
}
