'use client';

import { useState, useTransition } from 'react';
import { approveRow, rejectRow } from './actions';
import { EditModal } from './EditModal';
import { locationToLngLat } from '@/lib/location';
import { CATEGORY_GUESS_LABELS } from '@/lib/category-map';
import type { ReviewRow, Category } from '@/lib/types';

// ── Static map image via Mapbox Static Images API ────────────────────────────

function StaticMap({ lng, lat, token }: { lng: number; lat: number; token: string }) {
  const overlay  = `pin-s+e74c3c(${lng},${lat})`;
  const center   = `${lng},${lat},12,0`;
  const src      = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlay}/${center}/280x160@2x?access_token=${token}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="Location preview" className="w-full h-full object-cover" />
  );
}

// ── Confidence badge ──────────────────────────────────────────────────────────

function ConfBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const cls = value >= 0.85
    ? 'bg-green-100 text-green-800'
    : value >= 0.70
      ? 'bg-yellow-100 text-yellow-800'
      : 'bg-red-100 text-red-800';
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {pct}%
    </span>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    needs_human: 'bg-amber-100 text-amber-800',
    pending:     'bg-blue-100  text-blue-800',
    approved:    'bg-green-100 text-green-800',
    rejected:    'bg-gray-100  text-gray-500',
  };
  const labels: Record<string, string> = {
    needs_human: 'Needs human',
    pending:     'Pending',
    approved:    'Approved',
    rejected:    'Rejected',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {labels[status] ?? status}
    </span>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

interface Props {
  row:          ReviewRow;
  categories:   Category[];
  mapboxToken:  string;
}

export function ReviewCard({ row, categories, mapboxToken }: Props) {
  const [editOpen, setEditOpen]   = useState(false);
  const [actionErr, setActionErr] = useState('');
  const [isPending, startTx]      = useTransition();

  const coords = locationToLngLat(row.proposed_location);
  const hasLoc = coords !== null;

  function handleApprove() {
    setActionErr('');
    startTx(async () => {
      try { await approveRow(row.id); }
      catch (e) { setActionErr(e instanceof Error ? e.message : String(e)); }
    });
  }

  function handleReject() {
    setActionErr('');
    startTx(async () => {
      try { await rejectRow(row.id); }
      catch (e) { setActionErr(e instanceof Error ? e.message : String(e)); }
    });
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">

      {/* ── Header ── */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <h2 className="font-semibold text-gray-900 flex-1 min-w-0 truncate">{row.name}</h2>
        <StatusBadge status={row.review_status} />
        <ConfBadge value={row.llm_confidence} />
        {row.verification_passed
          ? <span className="text-green-600 text-sm" title="Verification passed">✓ verified</span>
          : <span className="text-gray-400  text-sm" title="Not yet verified">– unverified</span>}
      </div>

      {/* ── Body ── */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px]">

        {/* Left: text */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-gray-700 leading-relaxed">{row.event_summary}</p>

          <blockquote className="border-l-4 border-teal-400 pl-3 italic text-sm text-gray-600">
            &ldquo;{row.source_quote}&rdquo;
          </blockquote>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>
              <span className="font-medium text-gray-700">Source:</span>{' '}
              <a
                href={row.document_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-600 hover:underline"
              >
                {row.document_title || row.document_source}
              </a>
            </span>
            {row.date_or_period && (
              <span>
                <span className="font-medium text-gray-700">Date:</span> {row.date_or_period}
              </span>
            )}
            <span>
              <span className="font-medium text-gray-700">Category:</span>{' '}
              {CATEGORY_GUESS_LABELS[row.category_guess] ?? row.category_guess}
            </span>
            {row.place_name_in_source && (
              <span>
                <span className="font-medium text-gray-700">Place:</span> {row.place_name_in_source}
              </span>
            )}
          </div>
        </div>

        {/* Right: map */}
        <div className="md:border-l border-gray-100 bg-gray-50 flex flex-col">
          <div className="flex-1 min-h-[160px] overflow-hidden">
            {hasLoc && mapboxToken ? (
              <StaticMap lng={coords[0]} lat={coords[1]} token={mapboxToken} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                No location set
              </div>
            )}
          </div>
          {row.geocode_display_name && (
            <p className="px-3 py-2 text-xs text-gray-500 border-t border-gray-100 truncate" title={row.geocode_display_name}>
              📍 {row.geocode_display_name}
            </p>
          )}
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center gap-2 flex-wrap">
        <button
          onClick={handleApprove}
          disabled={isPending || !hasLoc}
          title={hasLoc ? 'Approve and insert into pois' : 'No location — use Edit to set one'}
          className="px-4 py-1.5 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-40 transition-colors"
        >
          ✓ Approve
        </button>

        <button
          onClick={() => { setActionErr(''); setEditOpen(true); }}
          disabled={isPending}
          className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          ✏ Edit
        </button>

        <button
          onClick={handleReject}
          disabled={isPending}
          className="px-4 py-1.5 rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 disabled:opacity-40 transition-colors"
        >
          ✗ Reject
        </button>

        {isPending && <span className="text-xs text-gray-400 ml-1">Saving…</span>}
        {actionErr && (
          <span className="text-xs text-red-600 ml-1 flex-1">{actionErr}</span>
        )}

        <span className="ml-auto text-xs text-gray-300 font-mono hidden sm:block">
          {row.id.slice(0, 8)}
        </span>
      </div>

      {/* ── Edit modal ── */}
      {editOpen && (
        <EditModal
          row={row}
          categories={categories}
          mapboxToken={mapboxToken}
          onClose={() => setEditOpen(false)}
          onApproved={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}
