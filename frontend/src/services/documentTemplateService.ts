import { supabase } from '../lib/supabase';

export type TemplateType = 'invoice' | 'receipt' | 'offer_letter' | 'experience_letter' | 'salary_slip' | 'report' | 'custom';

export interface DocumentTemplate {
  id: string;
  workspace_id: string;
  name: string;
  type: TemplateType;
  template_body: string;
  header_config: Record<string, any>;
  footer_config: Record<string, any>;
  styles: Record<string, any>;
  logo_url?: string;
  is_default: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentTemplateHistory {
  id: string;
  template_id: string;
  version_number: number;
  name: string;
  template_body: string;
  header_config: Record<string, any>;
  footer_config: Record<string, any>;
  styles: Record<string, any>;
  logo_url?: string;
  created_by: string;
  created_at: string;
}

export const fetchDocumentTemplates = async (workspaceId: string): Promise<DocumentTemplate[]> => {
  const { data, error } = await supabase
    .from('document_templates')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching document templates:', error);
    return [];
  }
  return data || [];
};

export const fetchTemplateHistory = async (templateId: string): Promise<DocumentTemplateHistory[]> => {
  const { data, error } = await supabase
    .from('document_template_history')
    .select('*')
    .eq('template_id', templateId)
    .order('version_number', { ascending: false });

  if (error) {
    console.error('Error fetching template history:', error);
    return [];
  }
  return data || [];
};

export const createDocumentTemplate = async (
  template: Partial<DocumentTemplate>
): Promise<DocumentTemplate | null> => {
  const { data, error } = await supabase
    .from('document_templates')
    .insert([template])
    .select()
    .single();

  if (error) {
    console.error('Error creating document template:', error);
    return null;
  }
  
  // Track creation in history
  if (data) {
    await supabase.from('document_template_history').insert([{
      template_id: data.id,
      version_number: 1,
      name: data.name,
      template_body: data.template_body,
      header_config: data.header_config,
      footer_config: data.footer_config,
      styles: data.styles,
      logo_url: data.logo_url,
      created_by: data.created_by
    }]);
  }

  return data;
};

export const updateDocumentTemplate = async (
  id: string,
  updates: Partial<DocumentTemplate>
): Promise<DocumentTemplate | null> => {
  // First get current version number from history
  const history = await fetchTemplateHistory(id);
  const nextVersion = history.length > 0 ? history[0].version_number + 1 : 2;

  const { data, error } = await supabase
    .from('document_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating document template:', error);
    return null;
  }

  // Track update in history
  if (data) {
    await supabase.from('document_template_history').insert([{
      template_id: data.id,
      version_number: nextVersion,
      name: data.name,
      template_body: data.template_body,
      header_config: data.header_config,
      footer_config: data.footer_config,
      styles: data.styles,
      logo_url: data.logo_url,
      created_by: data.created_by
    }]);
  }

  return data;
};

export const deleteDocumentTemplate = async (id: string): Promise<boolean> => {
  const { error } = await supabase
    .from('document_templates')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting document template:', error);
    return false;
  }
  return true;
};
