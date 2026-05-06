import { getServiceClient } from '@/lib/supabase-server';
import { ReviewCard } from './ReviewCard';
import type { ReviewRow, Category } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function PoiReviewPage() {
  const supabase = getServiceClient();

  const [{ data: rawRows, error: rowErr }, { data: cats }] = await Promise.all([
    supabase
      .from('poi_review_queue')
      .select('*, narrative_documents!inner(url, source, title)')
      .in('review_status', ['needs_human', 'pending'])
      .order('llm_confidence', { ascending: false })
      .limit(200),
    supabase
      .from('poi_categories')
      .select('id, slug, display_name')
      .order('sort_order'),
  ]);

  if (rowErr) throw new Error(`Failed to load queue: ${rowErr.message}`);

  const rows: ReviewRow[] = (rawRows ?? []).map((r) => {
    const nd = r.narrative_documents as { url: string; source: string; title: string };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { narrative_documents: _nd, ...rest } = r;
    return {
      ...(rest as Omit<ReviewRow, 'document_url' | 'document_source' | 'document_title'>),
      document_url:    nd.url,
      document_source: nd.source,
      document_title:  nd.title,
    };
  });

  const categories = (cats ?? []) as Category[];
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

  const needsHuman = rows.filter((r) => r.review_status === 'needs_human');
  const pending    = rows.filter((r) => r.review_status === 'pending');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">POI Review Queue</h1>
        <div className="flex gap-3 text-sm text-gray-500">
          {needsHuman.length > 0 && (
            <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full font-medium">
              {needsHuman.length} needs human
            </span>
          )}
          {pending.length > 0 && (
            <span className="bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full font-medium">
              {pending.length} pending
            </span>
          )}
          {rows.length === 0 && <span>Queue is empty</span>}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-24 text-gray-400">
          <p className="text-xl font-medium">All clear</p>
          <p className="text-sm mt-1">No candidates awaiting review.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {rows.map((row) => (
            <ReviewCard
              key={row.id}
              row={row}
              categories={categories}
              mapboxToken={mapboxToken}
            />
          ))}
        </div>
      )}
    </div>
  );
}
