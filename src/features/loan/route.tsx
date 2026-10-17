import { useSearchParams } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { LoanCalculator } from './LoanCalculator';
import { readPrefill } from './model';

function LoanPage() {
  const [params] = useSearchParams();
  return <LoanCalculator key={params.toString()} prefill={readPrefill(params)} />;
}
export const route: FeatureRoute = { path: '/tinh-vay', element: <LoanPage />, handle: { title: 'Tính vay' } };
