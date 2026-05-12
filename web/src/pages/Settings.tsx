import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSettings, patchSettings } from '../api/settings';

export default function Settings() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    staleTime: 60_000,
  });

  const [autoResolveEnabled, setAutoResolveEnabled] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.85);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setAutoResolveEnabled(data.autoResolveEnabled);
      setConfidenceThreshold(data.confidenceThreshold);
      setDirty(false);
    }
  }, [data]);

  const [savedVisible, setSavedVisible] = useState(false);

  const mutation = useMutation({
    mutationFn: patchSettings,
    onSuccess: updated => {
      queryClient.setQueryData(['settings'], updated);
      setDirty(false);
      setSavedVisible(true);
      setTimeout(() => setSavedVisible(false), 3000);
    },
  });

  function handleToggle() {
    setAutoResolveEnabled(v => !v);
    setDirty(true);
  }

  function handleSlider(e: React.ChangeEvent<HTMLInputElement>) {
    setConfidenceThreshold(Number(e.target.value));
    setDirty(true);
  }

  function handleSave() {
    mutation.mutate({ autoResolveEnabled, confidenceThreshold });
  }

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <span className="text-sm text-gray-500">Loading…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-48 items-center justify-center">
        <span className="text-sm text-red-500">Failed to load settings.</span>
      </div>
    );
  }

  const pct = Math.round(confidenceThreshold * 100);

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        <p className="mt-0.5 text-sm text-gray-500">Auto-resolve and confidence configuration.</p>
      </div>

      {/* Auto-resolve toggle */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900">Auto-resolve</p>
            <p className="mt-0.5 text-xs text-gray-500">
              When enabled, high-confidence answers are sent directly without agent review.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoResolveEnabled}
            onClick={handleToggle}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
              autoResolveEnabled ? 'bg-indigo-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                autoResolveEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {autoResolveEnabled && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Auto-resolve is active. Tickets above the confidence threshold will be resolved
            without human review. Monitor the Activity feed closely when first enabling.
          </div>
        )}
      </div>

      {/* Confidence threshold slider */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-900">Confidence threshold</p>
          <span className="text-sm font-semibold tabular-nums text-indigo-600">{pct}%</span>
        </div>
        <p className="mt-0.5 text-xs text-gray-500">
          Answers must score above this threshold to be auto-resolved. Higher = more conservative.
        </p>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={confidenceThreshold}
          onChange={handleSlider}
          className="mt-3 w-full accent-indigo-600"
        />
        <div className="mt-1 flex justify-between text-xs text-gray-400">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
        {confidenceThreshold >= 0.95 && (
          <p className="mt-2 text-xs text-amber-700">
            At {pct}%, very few answers will meet the threshold. Most tickets will be drafted for agents.
          </p>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!dirty || mutation.isPending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {mutation.isPending ? 'Saving…' : 'Save changes'}
        </button>
        {savedVisible && !dirty && (
          <span className="text-sm text-green-600">Saved.</span>
        )}
        {mutation.isError && (
          <span className="text-sm text-red-600">Save failed. Try again.</span>
        )}
      </div>
    </div>
  );
}
