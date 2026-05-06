// Maps LLM category_guess values to poi_categories slugs
export const CATEGORY_MAP: Record<string, string> = {
  labor_history: 'history',
  literary:      'art',
  indigenous:    'history',
  gold_rush:     'history',
  civil_rights:  'history',
  crime:         'history',
  folklore:      'local_culture',
  architecture:  'architecture',
  maritime:      'history',
  military:      'history',
  other:         'history',
};

// Human-readable labels for the LLM category values
export const CATEGORY_GUESS_LABELS: Record<string, string> = {
  labor_history: 'Labor History',
  literary:      'Literary',
  indigenous:    'Indigenous',
  gold_rush:     'Gold Rush',
  civil_rights:  'Civil Rights',
  crime:         'Crime',
  folklore:      'Folklore',
  architecture:  'Architecture',
  maritime:      'Maritime',
  military:      'Military',
  other:         'Other',
};
