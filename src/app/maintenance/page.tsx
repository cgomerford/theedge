import { Suspense } from 'react';
import MaintenanceContent from './MaintenanceContent';
import { noindex } from '@/lib/seo';

export const metadata = { title: 'Back soon', ...noindex() };

export default function MaintenancePage() {
  return (
    <Suspense fallback={null}>
      <MaintenanceContent />
    </Suspense>
  );
}