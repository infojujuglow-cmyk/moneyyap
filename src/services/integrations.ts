import { supabase } from '@/lib/supabase';

export interface IntegrationSpaceAuthorization {
  spaceId: string;
  externalBusinessId: string | null;
  externalBusinessName: string | null;
}

export interface IntegrationConnection {
  id: string;
  workspaceId: string;
  displayName: string;
  status: 'active' | 'revoked';
  permissionScopes: string[];
  credentialPrefix: string;
  lastAccessedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  spaces: IntegrationSpaceAuthorization[];
}

const mapConnection = (row: Record<string, unknown>): IntegrationConnection => ({
  id: String(row.id),
  workspaceId: String(row.workspace_id),
  displayName: String(row.display_name),
  status: row.status as IntegrationConnection['status'],
  permissionScopes: (row.permission_scopes as string[] | null) ?? [],
  credentialPrefix: String(row.credential_prefix),
  lastAccessedAt: row.last_accessed_at as string | null,
  revokedAt: row.revoked_at as string | null,
  createdAt: String(row.created_at),
  spaces: ((row.integration_connection_spaces as Record<string, unknown>[] | null) ?? []).map((item) => ({
    spaceId: String(item.space_id),
    externalBusinessId: item.external_business_id as string | null,
    externalBusinessName: item.external_business_name as string | null,
  })),
});

export const loadIntegrationConnections = async (workspaceId: string) => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('integration_connections')
    .select('id,workspace_id,display_name,status,permission_scopes,credential_prefix,last_accessed_at,revoked_at,created_at,integration_connection_spaces(space_id,external_business_id,external_business_name)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapConnection(row));
};

export const createVentureOsIntegration = async (mappings: { spaceId: string; externalBusinessId?: string; externalBusinessName?: string }[]) => {
  if (!supabase) throw new Error('MoneyYap is not connected to Supabase.');
  const { data, error } = await supabase.rpc('create_venture_os_integration', {
    p_space_mappings: mappings.map((item) => ({
      space_id: item.spaceId,
      external_business_id: item.externalBusinessId?.trim() || null,
      external_business_name: item.externalBusinessName?.trim() || null,
    })),
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.connection_id || !result?.access_token) throw new Error('The integration credential could not be created.');
  return { connectionId: String(result.connection_id), accessToken: String(result.access_token) };
};

export const rotateIntegrationCredential = async (connectionId: string) => {
  if (!supabase) throw new Error('MoneyYap is not connected to Supabase.');
  const { data, error } = await supabase.rpc('rotate_integration_credential', { p_connection_id: connectionId });
  if (error) throw error;
  if (!data) throw new Error('The integration credential could not be rotated.');
  return String(data);
};

export const revokeIntegrationConnection = async (connectionId: string) => {
  if (!supabase) throw new Error('MoneyYap is not connected to Supabase.');
  const { error } = await supabase.rpc('revoke_integration_connection', { p_connection_id: connectionId });
  if (error) throw error;
};
