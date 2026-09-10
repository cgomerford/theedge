import { Suspense } from 'react';
import MaintenanceContent from './MaintenanceContent';

export default function MaintenancePage() {
  return (
    <Suspense fallback={null}>
      <MaintenanceContent />
    </Suspense>
  );
}