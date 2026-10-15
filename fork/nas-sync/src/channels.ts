/** IPC names owned by this fork. They are not `ai:` channels. */
export const NAS_SYNC_CHANNELS = {
  get: 'fork:nas-sync:get',
  save: 'fork:nas-sync:save',
  syncNow: 'fork:nas-sync:sync-now',
  pickWorkspace: 'fork:nas-sync:pick-workspace',
  network: 'fork:nas-sync:network',
  status: 'fork:nas-sync:status',
} as const
