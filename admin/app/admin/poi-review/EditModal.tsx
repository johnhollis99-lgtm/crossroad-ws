'use client';

import { useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { approveRow } from './actions';
import { locationToLngLat } from '@/lib/location';
import { CATEGORY_MAP } from '@/lib/category-map';
import type { ReviewRow, Category } from '@/lib/types';

const MapEditor = dynamic(() => import('./MapEditor'), {
  ssr:     false,
  loading: () => <div className="w-full h-[300px] bg-gray-100 rounded-lg flex items-center justify-center text-sm text-gray-400">Loading map…</div>,
});

interface Props {
  row:         ReviewRow;
  categories:  Category[];
  mapboxToken: string;
  onClose:     () => void;
  onApproved:  () => void;
}

export function EditModal({ row, categories, mapboxToken, onClose, onApproved }: Props) {
  const initialCoords = locationToLngLat(row.proposed_location);

  const [name,         setName]         = useState(row.name);
  const [description,  setDescription]  = useState(row.event_summary);
  const [categorySlug, setCategorySlug] = useState(
    CATEGORY_MAP[row.category_guess] ?? 'history',
  );
  const [lng, setLng] = useState<number | null>(initialCoords?.[0] ?? null);
  const [lat, setLat] = useState<number | null>(initialCoords?.[1] ?? null);
  const [error, setError]             = useState('');
  const [isPending, startTx]          = useTransition();

  function handleMapChange(newLng: number, newLat: number) {
    setLng(newLng);
    setLat(newLat);
  }

  function handleApprove() {
    setError('');
    startTx(async () => {
      try {
        await approveRow(row.id, {
          name,
          description,
          categorySlug,
          lng: lng ?? undefined,
          lat: lat ?? undefined,
        });
        onApproved();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Edit candidate</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Original quote — read-only context */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Source quote</p>
            <blockquote className="border-l-4 border-teal-400 pl-3 italic text-sm text-gray-600">
              &ldquo;{row.source_quote}&rdquo;
            </blockquote>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={categorySlug}
              onChange={(e) => setCategorySlug(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.slug}>{cat.display_name}</option>
              ))}
            </select>
          </div>

          {/* Map */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
            {mapboxToken ? (
              <MapEditor
                initialLng={initialCoords?.[0] ?? null}
                initialLat={initialCoords?.[1] ?? null}
                token={mapboxToken}
                onChange={handleMapChange}
              />
            ) : (
              <p className="text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-4 text-center">
                NEXT_PUBLIC_MAPBOX_TOKEN not configured
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center gap-3">
          {error && (
            <p className="text-sm text-red-600 flex-1">{error}</p>
          )}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApprove}
              disabled={isPending || (!lng && !initialCoords)}
              className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 disabled:opacity-40 transition-colors"
            >
              {isPending ? 'Saving…' : '✓ Approve with edits'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
