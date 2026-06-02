import { supabase } from './src/lib/supabase';
import crypto from 'crypto';

function sha256(message: string): string {
  return crypto.createHash('sha256').update(message).digest('hex');
}

const deterministicStringify = (obj: any): string => {
  if (obj === null || obj === undefined) return 'null';
  if (Array.isArray(obj)) return '[' + obj.map(deterministicStringify).join(',') + ']';
  if (typeof obj === 'object') {
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + deterministicStringify(obj[k])).join(',') + '}';
  }
  return JSON.stringify(obj);
};

async function checkHashChain() {
  const { data: workspaces } = await supabase.from('workspaces').select('id');
  if (!workspaces) return;

  for (const ws of workspaces) {
    const { data: logs } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('workspace_id', ws.id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (!logs || logs.length === 0) continue;

    console.log(`Checking workspace: ${ws.id}`);
    let currentPrevHash = 'GENESIS_BLOCK';
    for (let i = 0; i < Math.min(logs.length, 10); i++) {
      const log = logs[i];
      const ts = new Date(log.created_at).toISOString();
      const metadataStr = log.metadata ? deterministicStringify(log.metadata) : 'null';
      const message = `${log.workspace_id}${log.actor_id ?? ''}${log.project_id ?? ''}${log.task_id ?? ''}${log.action}${metadataStr}${log.previous_hash}${ts}`;
      const newHash = sha256(message);

      console.log(`[Index ${i}] ID: ${log.id}`);
      console.log(`  Action: ${log.action}`);
      console.log(`  Prev Hash (in DB): ${log.previous_hash}`);
      console.log(`  Expected Prev Hash: ${currentPrevHash}`);
      console.log(`  Hash (in DB): ${log.hash}`);
      console.log(`  Recomputed Hash: ${newHash}`);

      if (log.previous_hash !== currentPrevHash || log.hash !== newHash) {
        console.log(`  >>> MISMATCH AT INDEX ${i} <<<`);
      }
      currentPrevHash = log.hash;
    }
  }
}

checkHashChain().catch(console.error);
