import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Profile } from '../types';
import { activityLogService } from './activityLogService';

export interface FileVersion {
  id: string;
  file_id: string;
  version_number: number;
  storage_path: string;
  file_size: number;
  uploaded_by: string;
  created_at: string;
  change_note?: string;
  uploader?: Profile;
}

export interface WorkspaceFile {
  id: string;
  workspace_id: string;
  entity_type: string;
  entity_id: string;
  file_name: string;
  file_type: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  uploader?: Profile;
  versions?: FileVersion[];
}

export const fileService = {
  async fetchFiles(workspaceId: string, entityType: string, entityId: string): Promise<{ data: WorkspaceFile[], error: any }> {
    if (!isSupabaseConfigured) return { data: [], error: new Error('Supabase not configured') };
    try {
      const { data, error } = await supabase
        .from('workspace_files')
        .select(`
          *,
          uploader:uploaded_by (
            id,
            full_name,
            avatar_url
          )
        `)
        .eq('workspace_id', workspaceId)
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) return { data: [], error };
      return { data: (data || []) as WorkspaceFile[], error: null };
    } catch (e) {
      console.error('Failed to fetch files', e);
      return { data: [], error: e };
    }
  },

  async fetchFileVersions(fileId: string): Promise<FileVersion[]> {
    if (!isSupabaseConfigured) return [];
    try {
      const { data, error } = await supabase
        .from('file_versions')
        .select(`
          *,
          uploader:uploaded_by (
            id,
            full_name,
            avatar_url
          )
        `)
        .eq('file_id', fileId)
        .order('version_number', { ascending: false });

      if (error) throw error;
      return (data || []) as FileVersion[];
    } catch (e) {
      console.error('Failed to fetch file versions', e);
      return [];
    }
  },

  async uploadFile(
    workspaceId: string,
    entityType: string,
    entityId: string,
    file: File,
    uploaderId: string,
    onProgress?: (progress: number) => void
  ): Promise<WorkspaceFile | null> {
    if (!isSupabaseConfigured) return null;
    
    try {
      // 1. Upload to Supabase Storage
      const timestamp = new Date().getTime();
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const storagePath = `${workspaceId}/${entityType}/${entityId}/${timestamp}_${safeName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('workspace_files')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // 2. Create WorkspaceFile Record
      const fileType = file.name.split('.').pop() || 'unknown';
      const { data: fileRecord, error: dbError } = await supabase
        .from('workspace_files')
        .insert({
          workspace_id: workspaceId,
          entity_type: entityType,
          entity_id: entityId,
          file_name: file.name,
          file_type: fileType,
          mime_type: file.type,
          file_size: file.size,
          storage_path: storagePath,
          uploaded_by: uploaderId
        })
        .select(`
          *,
          uploader:uploaded_by (
            id,
            full_name,
            avatar_url
          )
        `)
        .single();

      if (dbError) throw dbError;

      // 3. Create Version 1
      await supabase.from('file_versions').insert({
        file_id: fileRecord.id,
        version_number: 1,
        storage_path: storagePath,
        file_size: file.size,
        uploaded_by: uploaderId,
        change_note: 'Initial upload'
      });

      // 4. Log Activity
      await activityLogService.appendLog({
        workspace_id: workspaceId,
        actor_id: uploaderId,
        action: 'file_uploaded',
        metadata: { file_name: file.name, entity_type: entityType, entity_id: entityId }
      }).catch(console.error);

      return fileRecord as WorkspaceFile;
    } catch (e) {
      console.error('Failed to upload file', e);
      return null;
    }
  },

  async replaceFile(
    fileRecord: WorkspaceFile,
    file: File,
    uploaderId: string,
    changeNote: string = 'Updated version'
  ): Promise<WorkspaceFile | null> {
    if (!isSupabaseConfigured) return null;
    
    try {
      // 1. Determine next version number
      const { count } = await supabase
        .from('file_versions')
        .select('*', { count: 'exact', head: true })
        .eq('file_id', fileRecord.id);
      
      const nextVersion = (count || 0) + 1;

      // 2. Upload to Storage
      const timestamp = new Date().getTime();
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const storagePath = `${fileRecord.workspace_id}/${fileRecord.entity_type}/${fileRecord.entity_id}/${timestamp}_${safeName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('workspace_files')
        .upload(storagePath, file, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      // 3. Insert Version
      await supabase.from('file_versions').insert({
        file_id: fileRecord.id,
        version_number: nextVersion,
        storage_path: storagePath,
        file_size: file.size,
        uploaded_by: uploaderId,
        change_note: changeNote
      });

      // 4. Update Main Record
      const fileType = file.name.split('.').pop() || 'unknown';
      const { data: updatedRecord, error: updateError } = await supabase
        .from('workspace_files')
        .update({
          file_name: file.name,
          file_type: fileType,
          mime_type: file.type,
          file_size: file.size,
          storage_path: storagePath,
          uploaded_by: uploaderId,
          updated_at: new Date().toISOString()
        })
        .eq('id', fileRecord.id)
        .select(`*, uploader:uploaded_by(id, full_name, avatar_url)`)
        .single();

      if (updateError) throw updateError;

      // 5. Log Activity
      await activityLogService.appendLog({
        workspace_id: fileRecord.workspace_id,
        actor_id: uploaderId,
        action: 'file_replaced',
        metadata: { file_name: file.name, version: nextVersion }
      }).catch(console.error);

      return updatedRecord as WorkspaceFile;
    } catch (e) {
      console.error('Failed to replace file', e);
      return null;
    }
  },

  async deleteFile(fileRecord: WorkspaceFile, actorId: string): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    try {
      const { error } = await supabase
        .from('workspace_files')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', fileRecord.id);
      
      if (error) throw error;

      await activityLogService.appendLog({
        workspace_id: fileRecord.workspace_id,
        actor_id: actorId,
        action: 'file_archived',
        metadata: { file_name: fileRecord.file_name }
      }).catch(console.error);

      return true;
    } catch (e) {
      console.error('Failed to delete file', e);
      return false;
    }
  },

  async restoreVersion(fileRecord: WorkspaceFile, versionRecord: FileVersion, restorerId: string): Promise<WorkspaceFile | null> {
    if (!isSupabaseConfigured) return null;
    try {
      // 1. Determine next version number
      const { count } = await supabase
        .from('file_versions')
        .select('*', { count: 'exact', head: true })
        .eq('file_id', fileRecord.id);
      
      const nextVersion = (count || 0) + 1;

      // 2. Insert Version pointing to the previous storage_path
      await supabase.from('file_versions').insert({
        file_id: fileRecord.id,
        version_number: nextVersion,
        storage_path: versionRecord.storage_path,
        file_size: versionRecord.file_size,
        uploaded_by: restorerId,
        change_note: `Restored from version ${versionRecord.version_number}`
      });

      // 3. Update Main Record
      const { data: updatedRecord, error: updateError } = await supabase
        .from('workspace_files')
        .update({
          file_size: versionRecord.file_size,
          storage_path: versionRecord.storage_path,
          uploaded_by: restorerId,
          updated_at: new Date().toISOString()
        })
        .eq('id', fileRecord.id)
        .select(`*, uploader:uploaded_by(id, full_name, avatar_url)`)
        .single();

      if (updateError) throw updateError;

      // 4. Log Activity
      await activityLogService.appendLog({
        workspace_id: fileRecord.workspace_id,
        actor_id: restorerId,
        action: 'version_restored',
        metadata: { file_name: fileRecord.file_name, restored_version: versionRecord.version_number, new_version: nextVersion }
      }).catch(console.error);

      return updatedRecord as WorkspaceFile;
    } catch (e) {
      console.error('Failed to restore version', e);
      return null;
    }
  },

  async getFileDownloadUrl(storagePath: string, fileName: string): Promise<string | null> {
    if (!isSupabaseConfigured) return null;
    try {
      const { data, error } = await supabase.storage
        .from('workspace_files')
        .createSignedUrl(storagePath, 3600, { download: fileName });

      if (error) throw error;
      return data.signedUrl;
    } catch (e) {
      console.error('Failed to generate download URL', e);
      return null;
    }
  }
};
