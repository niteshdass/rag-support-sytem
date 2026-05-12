import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { listDocuments } from '../api/documents';
import { listActivity } from '../api/activity';
import { useAuth } from '../hooks/useAuth';

function StatCard({ label, value, sub, onClick }: { label: string; value: string | number; sub?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-lg border bg-white p-5 shadow-sm ${onClick ? 'cursor-pointer hover:border-indigo-400 transition-colors' : ''}`}
    >
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { tenant } = useAuth();
  const navigate = useNavigate();

  const { data: allDocs } = useQuery({
    queryKey: ['documents', 'dashboard'],
    queryFn: () => listDocuments({ page: 1, pageSize: 1 }),
    staleTime: 60_000,
  });

  const { data: readyDocs } = useQuery({
    queryKey: ['documents', 'dashboard-ready'],
    queryFn: () => listDocuments({ status: 'ready', page: 1, pageSize: 1 }),
    staleTime: 60_000,
  });

  const { data: failedDocs } = useQuery({
    queryKey: ['documents', 'dashboard-failed'],
    queryFn: () => listDocuments({ status: 'failed', page: 1, pageSize: 1 }),
    staleTime: 60_000,
  });

  const { data: activity } = useQuery({
    queryKey: ['activity', 'dashboard'],
    queryFn: () => listActivity({ page: 1, pageSize: 5 }),
    staleTime: 30_000,
  });

  const totalDocs = allDocs?.total ?? 0;
  const readyCount = readyDocs?.total ?? 0;
  const failedCount = failedDocs?.total ?? 0;
  const activityCount = activity?.total ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          {tenant ? `${tenant.name}` : 'Dashboard'}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">Knowledge base overview</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Total documents"
          value={totalDocs}
          sub="all sources"
          onClick={() => navigate('/documents')}
        />
        <StatCard
          label="Ready"
          value={readyCount}
          sub="indexed & searchable"
          onClick={() => navigate('/documents?status=ready')}
        />
        <StatCard
          label="Failed"
          value={failedCount}
          sub="processing errors"
          onClick={failedCount > 0 ? () => navigate('/documents?status=failed') : undefined}
        />
        <StatCard
          label="Queries answered"
          value={activityCount}
          sub="all time"
          onClick={() => navigate('/activity')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-gray-900">Quick actions</h2>
          <div className="space-y-2">
            {[
              { label: '+ Upload documents', to: '/upload' },
              { label: '+ Paste text snippet', to: '/paste' },
              { label: 'Browse knowledge base', to: '/documents' },
              { label: 'Try the chat', to: '/chat' },
            ].map(({ label, to }) => (
              <button
                key={to}
                onClick={() => navigate(to)}
                className="block w-full rounded-md border border-gray-200 px-3 py-2 text-left text-sm text-gray-700 hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-gray-900">System status</h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Auto-resolve</span>
              <span className={`font-medium ${tenant?.autoResolveEnabled ? 'text-green-600' : 'text-gray-400'}`}>
                {tenant?.autoResolveEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Confidence threshold</span>
              <span className="font-medium text-gray-700 tabular-nums">
                {tenant?.confidenceThreshold != null
                  ? `${Math.round(tenant.confidenceThreshold * 100)}%`
                  : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Documents indexed</span>
              <span className="font-medium text-gray-700 tabular-nums">{readyCount}</span>
            </div>
          </div>
          <button
            onClick={() => navigate('/settings')}
            className="mt-4 text-xs text-indigo-600 hover:text-indigo-800"
          >
            Configure settings →
          </button>
        </div>
      </div>
    </div>
  );
}
