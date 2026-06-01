import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Profile } from '../types';

export interface Mention {
  id: string; // The user ID mentioned
  name: string; // Display name used
}

export interface UniversalComment {
  id: string;
  workspace_id: string;
  entity_type: string;
  entity_id: string;
  author_id: string;
  body: string;
  mentions: Mention[];
  attachments: any[];
  created_at: string;
  updated_at: string;
  edited_at?: string;
  deleted_at?: string;
  parent_comment_id?: string;
  author?: Profile;
}

export const collaborationService = {
  /**
   * Parse a body text for @mentions. Assumes format like `@John Doe ` 
   * Actually, the frontend component will manage mentions explicitly in a structured way 
   * during composition, but this helper can extract them if we just use a generic regex,
   * though it's safer to have the UI pass the exact mentions array.
   */
  async fetchComments(workspaceId: string, entityType: string, entityId: string): Promise<{ data: UniversalComment[], error: any }> {
    if (!isSupabaseConfigured) return { data: [], error: new Error('Supabase not configured') };
    
    try {
      const { data, error } = await supabase
        .from('universal_comments')
        .select(`
          *,
          author:author_id (
            id,
            full_name,
            avatar_url,
            role,
            email
          )
        `)
        .eq('workspace_id', workspaceId)
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (error) return { data: [], error };
      return { data: (data || []) as UniversalComment[], error: null };
    } catch (e) {
      console.error('Failed to fetch universal comments:', e);
      return { data: [], error: e };
    }
  },

  async addComment(
    workspaceId: string, 
    entityType: string, 
    entityId: string, 
    authorId: string, 
    body: string, 
    mentions: Mention[] = [],
    routePath?: string
  ): Promise<UniversalComment | null> {
    if (!isSupabaseConfigured) return null;

    try {
      const { data, error } = await supabase
        .from('universal_comments')
        .insert({
          workspace_id: workspaceId,
          entity_type: entityType,
          entity_id: entityId,
          author_id: authorId,
          body,
          mentions,
        })
        .select(`
          *,
          author:author_id (
            id,
            full_name,
            avatar_url,
            role,
            email
          )
        `)
        .single();

      if (error) throw error;

      // Dispatch notifications to mentioned users
      if (mentions.length > 0) {
        await this.dispatchMentionNotifications(workspaceId, entityType, entityId, authorId, mentions, body, routePath);
      }

      return data as UniversalComment;
    } catch (e) {
      console.error('Failed to add comment:', e);
      return null;
    }
  },

  async updateComment(commentId: string, newBody: string, newMentions: Mention[] = [], editorId: string): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    try {
      // Fetch existing to save history
      const { data: existing } = await supabase
        .from('universal_comments')
        .select('body')
        .eq('id', commentId)
        .single();
        
      if (existing) {
        await supabase.from('comment_versions').insert({
          comment_id: commentId,
          previous_content: existing.body,
          new_content: newBody,
          edited_by: editorId
        });
      }

      const { error } = await supabase
        .from('universal_comments')
        .update({
          body: newBody,
          mentions: newMentions,
          edited_at: new Date().toISOString()
        })
        .eq('id', commentId);
      
      return !error;
    } catch (e) {
      console.error('Failed to update comment', e);
      return false;
    }
  },

  async deleteComment(commentId: string): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    try {
      const { error } = await supabase
        .from('universal_comments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', commentId);
      
      return !error;
    } catch (e) {
      console.error('Failed to delete comment', e);
      return false;
    }
  },

  async dispatchMentionNotifications(
    workspaceId: string,
    entityType: string,
    entityId: string,
    authorId: string,
    mentions: Mention[],
    body: string,
    routePath?: string
  ) {
    if (!isSupabaseConfigured) return;
    
    try {
      // Noise Control: Check for recent mention notifications to these users for this entity
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60000).toISOString();
      const { data: recentNotifs } = await supabase
        .from('notifications')
        .select('recipient_id, message')
        .eq('source_entity_type', entityType)
        .eq('source_entity_id', entityId)
        .eq('type', 'mention')
        .gte('created_at', fiveMinutesAgo);

      // Create a notification record for each mentioned user
      const notifications = [];
      const updates = [];

      for (const mention of mentions) {
        const recent = recentNotifs?.find(n => n.recipient_id === mention.id);
        
        if (recent) {
          // Determine if it was already aggregated
          const match = recent.message?.match(/^(\d+) new comments/);
          const count = match ? parseInt(match[1]) + 1 : 2;
          
          updates.push(
            supabase.from('notifications')
              .update({
                title: 'New Mentions',
                message: `${count} new comments mentioning you`,
                read_at: null,
                updated_at: new Date().toISOString()
              })
              .eq('recipient_id', mention.id)
              .eq('source_entity_type', entityType)
              .eq('source_entity_id', entityId)
              .gte('created_at', fiveMinutesAgo)
          );
        } else {
          notifications.push({
            workspace_id: workspaceId,
            recipient_id: mention.id,
            user_id: mention.id, 
            category: 'assignments',
            type: 'mention',
            title: 'New Mention',
            message: body,
            source_entity_type: entityType,
            source_entity_id: entityId,
            source_anchor_id: authorId,
            route_path: routePath
          });
        }
      }

      if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications);
      }
      
      if (updates.length > 0) {
        await Promise.all(updates);
      }
    } catch (e) {
      console.error('Failed to dispatch mention notifications', e);
    }
  }
};
