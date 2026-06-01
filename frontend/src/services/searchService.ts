import { supabase } from '../lib/supabase';

export interface SearchResult {
  entity_type: 'project' | 'task' | 'file' | 'comment' | 'user' | 'decision' | 'client' | 'invoice';
  entity_id: string;
  title: string;
  context: string;
  last_updated: string;
  owner_id: string | null;
  rank: number;
}

export const searchService = {
  async searchWorkspace(query: string, limit: number = 50): Promise<SearchResult[]> {
    if (!query || query.trim() === '') return [];
    
    try {
      const { data, error } = await supabase.rpc('search_workspace', {
        p_query: query.trim(),
        p_limit: limit
      });
      
      if (error) {
        console.error('Workspace search failed:', error);
        return [];
      }
      
      return data || [];
    } catch (e) {
      console.error('Exception during workspace search:', e);
      return [];
    }
  }
};
