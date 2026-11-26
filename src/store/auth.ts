import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthState {
  user: User | null;
  demoPhone: string | null;
  session: Session | null;
  loading: boolean;
  alertsEnabled: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
  initializeAuth: () => () => void;
  sendPhoneOtp: (phone: string) => Promise<void>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<void>;
  sendEmailOtp: (email: string) => Promise<void>;
  verifyEmailOtp: (email: string, token: string) => Promise<void>;
  enableDemoPhoneAlerts: (phone: string) => Promise<void>;
  signOut: () => Promise<void>;
  toggleAlerts: (enabled: boolean) => Promise<void>;
  requestNotificationPermission: () => Promise<NotificationPermission | 'unsupported'>;
}

function getInitialPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function notifyDeviceAlert(alert: { title: string; message: string; severity?: number | null }) {
  const { user, demoPhone, alertsEnabled, notificationPermission } = useAuthStore.getState();
  if ((!user && !demoPhone) || !alertsEnabled) return;

  if (notificationPermission === 'granted' && 'Notification' in window) {
    new Notification(`🚨 ${alert.title}`, {
      body: alert.message,
      tag: `disaster-alert-${alert.title}`,
      requireInteraction: (alert.severity ?? 3) >= 4,
    });
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  demoPhone: null,
  session: null,
  loading: true,
  alertsEnabled: true,
  notificationPermission: getInitialPermission(),

  initializeAuth: () => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session, user: session?.user ?? null, loading: false });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null, loading: false });
    });

    return () => subscription.unsubscribe();
  },

  sendPhoneOtp: async (phone: string) => {
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) throw error;
  },

  verifyPhoneOtp: async (phone: string, token: string) => {
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });
    if (error) throw error;
    set({ session: data.session, user: data.user });
    await get().requestNotificationPermission();
  },

  sendEmailOtp: async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  },

  verifyEmailOtp: async (email: string, token: string) => {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    if (error) throw error;
    set({ session: data.session, user: data.user });
    await get().requestNotificationPermission();
  },

  enableDemoPhoneAlerts: async (phone: string) => {
    set({ demoPhone: phone, alertsEnabled: true });
    await get().requestNotificationPermission();
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    set({ session: null, user: null, demoPhone: null });
  },

  toggleAlerts: async (enabled: boolean) => {
    set({ alertsEnabled: enabled });
    const { user, demoPhone } = get();
    if (!user && !demoPhone) return;
    if (enabled) {
      await get().requestNotificationPermission();
    }
  },

  requestNotificationPermission: async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      set({ notificationPermission: 'unsupported' });
      return 'unsupported';
    }
    const permission = await Notification.requestPermission();
    set({ notificationPermission: permission });
    return permission;
  },
}));
