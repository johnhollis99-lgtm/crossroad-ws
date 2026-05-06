'use server';

import { revalidatePath } from 'next/cache';
import { getServiceClient } from '@/lib/supabase-server';
import { getSessionUser } from '@/lib/get-user';
import { locationToWkt } from '@/lib/location';
import { CATEGORY_MAP } from '@/lib/category-map';
import type { EditedFields } from '@/lib/types';

export async function approveRow(rowId: string, edits?: EditedFields): Promise<void> {
  const supabase = getServiceClient();

  // Load the full row plus the source document URL
  const { data: row, error: fetchErr } = await supabase
    .from('poi_review_queue')
    .select('*, narrative_documents!inner(url)')
    .eq('id', rowId)
    .single();

  if (fetchErr || !row) throw new Error(fetchErr?.message ?? 'Row not found');

  const nd = row.narrative_documents as { url: string };

  // Resolve DB category from the LLM guess or override
  const categorySlug =
    edits?.categorySlug ??
    (CATEGORY_MAP[row.category_guess as string] ?? 'history');

  const { data: cat } = await supabase
    .from('poi_categories')
    .select('id')
    .eq('slug', categorySlug)
    .maybeSingle();

  // Resolve final WKT location (edited pin > proposed_location)
  let locationWkt: string | null = null;
  if (edits?.lng != null && edits?.lat != null) {
    locationWkt = `SRID=4326;POINT(${edits.lng} ${edits.lat})`;
  } else {
    locationWkt = locationToWkt(row.proposed_location);
  }
  if (!locationWkt) throw new Error('No valid location — use Edit to set one before approving.');

  const user = await getSessionUser();

  // Insert into pois
  const { data: poi, error: insertErr } = await supabase
    .from('pois')
    .insert({
      name:              edits?.name        ?? row.name,
      description:       edits?.description ?? row.event_summary,
      location:          locationWkt,
      category_id:       cat?.id ?? null,
      source_type:       'narrative_extracted',
      source_id:         rowId,
      source_citation:   `${nd.url} :: "${row.source_quote as string}"`,
      confidence_score:  row.llm_confidence,
      verified:          true,
      significance_score: Math.round((row.llm_confidence as number) * 60),
      trip_mode:         'driving',
      editorial_status:  'draft',
      tags:              [],
      imported_at:       new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertErr) throw new Error(`POI insert failed: ${insertErr.message}`);

  // Mark the queue row approved and link to the new POI
  const { error: updateErr } = await supabase
    .from('poi_review_queue')
    .update({
      review_status:   'approved',
      promoted_poi_id: poi.id,
      reviewed_at:     new Date().toISOString(),
      reviewed_by:     user?.email ?? 'admin',
    })
    .eq('id', rowId);

  if (updateErr) throw new Error(`Queue update failed: ${updateErr.message}`);

  revalidatePath('/admin/poi-review');
}

export async function rejectRow(rowId: string): Promise<void> {
  const supabase = getServiceClient();
  const user     = await getSessionUser();

  const { error } = await supabase
    .from('poi_review_queue')
    .update({
      review_status: 'rejected',
      reviewed_at:   new Date().toISOString(),
      reviewed_by:   user?.email ?? 'admin',
    })
    .eq('id', rowId);

  if (error) throw new Error(`Reject failed: ${error.message}`);

  revalidatePath('/admin/poi-review');
}
