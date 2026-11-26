import { create } from 'zustand';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { notifyDeviceAlert } from './auth';
import { fetchLiveDisasters } from '../lib/liveDisasters';
import type { Database } from '../lib/database.types';

let activeChannels: RealtimeChannel[] = [];

function applyRealtimePayload<T extends { id: string }>(
  items: T[],
  payload: RealtimePostgresChangesPayload<T>
): T[] {
  if (payload.eventType === 'INSERT') {
    const next = payload.new as T;
    return items.some(item => item.id === next.id) ? items : [...items, next];
  }
  if (payload.eventType === 'UPDATE') {
    const next = payload.new as T;
    return items.map(item => (item.id === next.id ? { ...item, ...next } : item));
  }
  if (payload.eventType === 'DELETE') {
    const oldId = (payload.old as Partial<T>).id;
    return oldId ? items.filter(item => item.id !== oldId) : items;
  }
  return items;
}

type Disaster = Database['public']['Tables']['disasters']['Row'];
type Resource = Database['public']['Tables']['resources']['Row'];
type Team = Database['public']['Tables']['teams']['Row'];
type Report = Database['public']['Tables']['reports']['Row'];
type Alert = Database['public']['Tables']['alerts']['Row'];

interface DisasterStore {
  disasters: Disaster[];
  resources: Resource[];
  teams: Team[];
  reports: Report[];
  alerts: Alert[];
  loading: boolean;
  error: string | null;
  subscribeToUpdates: () => void;
  unsubscribeFromUpdates: () => void;
  fetchInitialData: () => Promise<void>;
  createDisaster: (disaster: Partial<Disaster>) => Promise<void>;
  updateDisaster: (id: string, updates: Partial<Disaster>) => Promise<void>;
  createReport: (report: Partial<Report>) => Promise<void>;
  createResource: (resource: Partial<Resource>) => Promise<void>;
  updateResource: (id: string, updates: Partial<Resource>) => Promise<void>;
  deployTeam: (teamId: string, disasterId: string) => Promise<void>;
  allocateResources: (resourceId: string, disasterId: string, quantity: number) => Promise<void>;
  broadcastAlert: (alert: Partial<Alert>) => Promise<void>;
}


export const useDisasterStore = create<DisasterStore>((set, get) => ({
  disasters: [],
  resources: [],
  teams: [],
  reports: [],
  alerts: [],
  loading: false,
  error: null,

  subscribeToUpdates: () => {
    if (activeChannels.length > 0) {
      activeChannels.forEach(channel => supabase.removeChannel(channel));
      activeChannels = [];
    }

    activeChannels = [
      supabase
        .channel('disasters-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'disasters' },
          payload => set({ disasters: applyRealtimePayload(get().disasters, payload as RealtimePostgresChangesPayload<Disaster>) })
        ),
      supabase
        .channel('resources-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'resources' },
          payload => set({ resources: applyRealtimePayload(get().resources, payload as RealtimePostgresChangesPayload<Resource>) })
        ),
      supabase
        .channel('teams-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' },
          payload => set({ teams: applyRealtimePayload(get().teams, payload as RealtimePostgresChangesPayload<Team>) })
        ),
      supabase
        .channel('reports-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' },
          payload => set({ reports: applyRealtimePayload(get().reports, payload as RealtimePostgresChangesPayload<Report>) })
        ),
      supabase
        .channel('alerts-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' },
          payload => {
            if (payload.eventType === 'INSERT') {
              notifyDeviceAlert(payload.new as Alert);
            }
            set({ alerts: applyRealtimePayload(get().alerts, payload as RealtimePostgresChangesPayload<Alert>) });
          }
        )
    ];

    activeChannels.forEach(channel => channel.subscribe());
  },

  unsubscribeFromUpdates: () => {
    activeChannels.forEach(channel => supabase.removeChannel(channel));
    activeChannels = [];
  },

  fetchInitialData: async () => {
    set({ loading: true, error: null });
    try {
      const [
        { data: disasters, error: disastersError }, 
        { data: resources, error: resourcesError },
        { data: teams, error: teamsError },
        { data: reports, error: reportsError },
        { data: alerts, error: alertsError },
        liveDisasters
      ] = await Promise.all([
        supabase.from('disasters').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('resources').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('teams').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('alerts').select('*').order('created_at', { ascending: false }).limit(100),
        fetchLiveDisasters()
      ]);

      if (disastersError) throw disastersError;
      if (resourcesError) throw resourcesError;
      if (teamsError) throw teamsError;
      if (reportsError) throw reportsError;
      if (alertsError) throw alertsError;

      const dbDisasters = disasters || [];
      const existingIds = new Set(dbDisasters.map(d => d.id));
      const mergedDisasters = [
        ...dbDisasters,
        ...liveDisasters.filter(d => !existingIds.has(d.id))
      ];

      set({
        disasters: mergedDisasters,
        resources: resources || [],
        teams: teams || [],
        reports: reports || [],
        alerts: alerts || [],
        loading: false
      });
    } catch (error) {
      console.error('Error fetching data:', error);
      set({ error: 'Failed to fetch data', loading: false });
    }
  },

  createDisaster: async (disaster) => {
    try {
      const { data, error } = await supabase
        .from('disasters')
        .insert([disaster])
        .select()
        .single();

      if (error) throw error;
      const { disasters } = get();
      set({ disasters: [...disasters, data] });
    } catch (error) {
      console.error('Error creating disaster:', error);
      throw error;
    }
  },

  updateDisaster: async (id, updates) => {
    try {
      const { data, error } = await supabase
        .from('disasters')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      const { disasters } = get();
      set({
        disasters: disasters.map(d => d.id === id ? { ...d, ...data } : d)
      });
    } catch (error) {
      console.error('Error updating disaster:', error);
      throw error;
    }
  },

  createReport: async (report) => {
    try {
      const { data, error } = await supabase
        .from('reports')
        .insert([{
          ...report,
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;
      const { reports } = get();
      set({ reports: [...reports, data] });
    } catch (error) {
      console.error('Error creating report:', error);
      throw error;
    }
  },

  createResource: async (resource) => {
    try {
      const { data, error } = await supabase
        .from('resources')
        .insert([{
          ...resource,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;
      const { resources } = get();
      set({ resources: [...resources, data] });
    } catch (error) {
      console.error('Error creating resource:', error);
      throw error;
    }
  },

  updateResource: async (id, updates) => {
    try {
      const { data, error } = await supabase
        .from('resources')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      const { resources } = get();
      set({
        resources: resources.map(r => r.id === id ? { ...r, ...data } : r)
      });
    } catch (error) {
      console.error('Error updating resource:', error);
      throw error;
    }
  },

  deployTeam: async (teamId, disasterId) => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .update({
          status: 'responding',
          assigned_to: disasterId,
          updated_at: new Date().toISOString(),
          last_active: new Date().toISOString()
        })
        .eq('id', teamId)
        .select()
        .single();

      if (error) throw error;
      const { teams } = get();
      set({
        teams: teams.map(t => t.id === teamId ? { ...t, ...data } : t)
      });
    } catch (error) {
      console.error('Error deploying team:', error);
      throw error;
    }
  },

  allocateResources: async (resourceId, disasterId, quantity) => {
    try {
      const { data, error } = await supabase
        .from('resources')
        .update({
          status: 'deployed',
          assigned_to: disasterId,
          quantity: quantity,
          updated_at: new Date().toISOString()
        })
        .eq('id', resourceId)
        .select()
        .single();

      if (error) throw error;
      const { resources } = get();
      set({
        resources: resources.map(r => r.id === resourceId ? { ...r, ...data } : r)
      });
    } catch (error) {
      console.error('Error allocating resources:', error);
      throw error;
    }
  },

  broadcastAlert: async (alert) => {
    try {
      const { data, error } = await supabase
        .from('alerts')
        .insert([{
          ...alert,
          status: 'sent',
          sent_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;
      const { alerts } = get();
      set({ alerts: [...alerts, data] });
    } catch (error) {
      console.error('Error broadcasting alert:', error);
      throw error;
    }
  }
}));