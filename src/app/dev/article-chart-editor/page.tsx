// Dev harness page for the article chart dialogs (see Client.tsx). Not linked anywhere, not indexed.
import Client from './Client'
import { noindex } from '@/lib/seo'

export const metadata = { ...noindex() }
export default function Page() { return <Client /> }
