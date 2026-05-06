export type ReviewStatus = 'pending' | 'needs_human' | 'approved' | 'rejected';

export interface ReviewRow {
  id:                    string;
  narrative_document_id: string;
  name:                  string;
  event_summary:         string;
  place_name_in_source:  string;
  geocoding_hint:        string | null;
  date_or_period:        string | null;
  source_quote:          string;
  category_guess:        string;
  llm_confidence:        number;
  // geography(Point,4326) — comes back from Supabase as GeoJSON object or null
  proposed_location:     unknown;
  geocode_display_name:  string | null;
  review_status:         ReviewStatus;
  verification_passed:   boolean;
  verification_reasoning: string | null;
  created_at:            string;
  // Joined from narrative_documents
  document_url:          string;
  document_source:       string;
  document_title:        string;
}

export interface Category {
  id:           string;
  slug:         string;
  display_name: string;
}

export interface EditedFields {
  name?:         string;
  description?:  string;
  categorySlug?: string;
  lng?:          number;
  lat?:          number;
}
