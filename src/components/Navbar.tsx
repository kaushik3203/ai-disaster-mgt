import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Settings, Bell, HelpCircle, User, LogOut, Shield, Mail, AlertTriangle, Bot } from 'lucide-react';
import AIChat from './AIChat';
import AuthModal from './AuthModal';
import { useAuthStore } from '../store/auth';
import { useDisasterStore } from '../store/disaster';

export default function Navbar() {
  const { user, demoPhone, alertsEnabled, notificationPermission, toggleAlerts, signOut } = useAuthStore();
  const { alerts } = useDisasterStore();
  const [readAlertIds, setReadAlertIds] = useState<string[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
        setShowSettings(false);
        setShowHelp(false);
        setShowProfile(false);
        setShowChat(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowNotifications(false);
        setShowSettings(false);
        setShowHelp(false);
        setShowProfile(false);
        setShowChat(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const toggleMenu = (menu: 'notifications' | 'settings' | 'help' | 'profile' | 'chat') => {
    setShowNotifications(menu === 'notifications' ? !showNotifications : false);
    setShowSettings(menu === 'settings' ? !showSettings : false);
    setShowHelp(menu === 'help' ? !showHelp : false);
    setShowProfile(menu === 'profile' ? !showProfile : false);
    setShowChat(menu === 'chat' ? !showChat : false);
  };

  const unreadAlerts = alerts.filter(a => !readAlertIds.includes(a.id));

  const handleMarkAllRead = () => {
    setReadAlertIds(alerts.map(a => a.id));
  };

  const renderNotificationsPanel = () => (
    <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-slate-900 border border-white/15 text-white rounded-lg shadow-xl z-50">
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Notifications</h3>
        {unreadAlerts.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">
            {unreadAlerts.length} new
          </span>
        )}
      </div>
      <div className="max-h-96 overflow-y-auto">
        {unreadAlerts.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">
            All caught up! No unread notifications.
          </div>
        ) : (
          unreadAlerts.map(notification => (
            <div key={notification.id} className="p-4 border-b border-white/10 hover:bg-white/5">
              <div className="flex items-start">
                {(notification.type === 'evacuation' || notification.type === 'warning') && (
                  <AlertTriangle className="w-5 h-5 text-red-400 mt-1 shrink-0" />
                )}
                {notification.type === 'update' && (
                  <Mail className="w-5 h-5 text-blue-400 mt-1 shrink-0" />
                )}
                {notification.type === 'all-clear' && (
                  <Shield className="w-5 h-5 text-green-400 mt-1 shrink-0" />
                )}
                <div className="ml-3">
                  <p className="text-sm font-medium text-white">{notification.title}</p>
                  <p className="text-sm text-gray-300">{notification.message}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(notification.sent_at || notification.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="p-3 border-t border-white/10 flex justify-end">
        <button
          onClick={handleMarkAllRead}
          disabled={unreadAlerts.length === 0}
          className="text-sm text-blue-400 hover:text-blue-300 disabled:text-gray-500 disabled:cursor-not-allowed font-medium transition-colors"
        >
          Read All
        </button>
      </div>
    </div>
  );

  const renderSettingsPanel = () => (
    <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-slate-900 border border-white/15 text-white rounded-lg shadow-xl z-50">
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-4">Settings</h3>
        <div className="space-y-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input type="checkbox" defaultChecked className="rounded border-white/20 bg-black/30" />
            <span className="text-sm text-gray-200">Enable desktop notifications</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input type="checkbox" defaultChecked className="rounded border-white/20 bg-black/30" />
            <span className="text-sm text-gray-200">Dark mode</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input type="checkbox" defaultChecked className="rounded border-white/20 bg-black/30" />
            <span className="text-sm text-gray-200">Auto-refresh live feeds</span>
          </label>
          <button
            onClick={() => setShowSettings(false)}
            className="w-full px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  const renderHelpPanel = () => (
    <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-slate-900 border border-white/15 text-white rounded-lg shadow-xl z-50">
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-3">Help & Support</h3>
        <div className="space-y-2 text-sm text-gray-300">
          <p>• Click any marker on the map for live wind, water & sea telemetry.</p>
          <p>• Use Phone Login to receive browser alerts for new emergencies.</p>
          <p>• Use the bottom dock to switch between Map, 3D Globe, Analytics & AI.</p>
        </div>
      </div>
    </div>
  );

  const renderProfilePanel = () => (
    <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-slate-900 border border-white/15 text-white rounded-lg shadow-xl z-50">
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center">
          <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
            <span className="text-white text-lg font-semibold">
              {user?.phone ? 'U' : 'A'}
            </span>
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-white">
              {user || demoPhone ? 'Verified User' : 'Guest / Demo'}
            </p>
            <p className="text-xs text-gray-400">
              {user?.phone || demoPhone || user?.email || 'Not signed in'}
            </p>
          </div>
        </div>
      </div>
      <div className="p-3 space-y-2">
        <label className="flex items-center justify-between px-2 py-2 text-sm text-gray-200 hover:bg-white/5 rounded-lg cursor-pointer">
          <span>Device Alerts</span>
          <input
            type="checkbox"
            checked={alertsEnabled}
            onChange={(e) => toggleAlerts(e.target.checked)}
            className="rounded border-white/20 text-blue-600"
          />
        </label>
        <p className="px-2 text-xs text-gray-400">
          Browser permission: <span className="font-medium text-gray-200">{notificationPermission}</span>
        </p>
        <div className="border-t border-white/10 pt-2">
          {user || demoPhone ? (
            <button
              onClick={async () => {
                await signOut();
                setShowProfile(false);
              }}
              className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg flex items-center"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </button>
          ) : (
            <button
              onClick={() => {
                setShowProfile(false);
                setShowAuthModal(true);
              }}
              className="w-full text-left px-3 py-2 text-sm text-blue-400 hover:bg-blue-500/10 rounded-lg flex items-center"
            >
              <Mail className="w-4 h-4 mr-2" />
              Login with Email
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black/20 backdrop-blur-lg border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Activity className="w-8 h-8 text-blue-400" />
            <span className="ml-2 text-xl font-bold text-white">DisasterHub</span>
          </div>
          
          <div ref={actionsRef} className="flex items-center space-x-4">
            <div className="relative">
              <button 
                className="p-2 text-gray-300 hover:text-white transition-colors relative"
                onClick={() => toggleMenu('chat')}
              >
                <Bot className="w-5 h-5" />
                <span className="absolute top-0 right-0 w-2 h-2 bg-blue-500 rounded-full"></span>
              </button>
              {showChat && (
                <div className="absolute right-0 mt-2 w-96 z-50">
                  <AIChat onClose={() => setShowChat(false)} />
                </div>
              )}
            </div>

            <div className="relative">
              <button 
                className="p-2 text-gray-300 hover:text-white transition-colors relative"
                onClick={() => toggleMenu('notifications')}
              >
                <Bell className="w-5 h-5" />
                {unreadAlerts.length > 0 && (
                  <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
                )}
              </button>
              {showNotifications && renderNotificationsPanel()}
            </div>

            <div className="relative">
              <button 
                className="p-2 text-gray-300 hover:text-white transition-colors"
                onClick={() => toggleMenu('settings')}
              >
                <Settings className="w-5 h-5" />
              </button>
              {showSettings && renderSettingsPanel()}
            </div>

            <div className="relative">
              <button 
                className="p-2 text-gray-300 hover:text-white transition-colors"
                onClick={() => toggleMenu('help')}
              >
                <HelpCircle className="w-5 h-5" />
              </button>
              {showHelp && renderHelpPanel()}
            </div>

            <div className="w-px h-6 bg-white/20"></div>

            <div className="relative">
              {user || demoPhone ? (
                <button
                  className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                  onClick={() => toggleMenu('profile')}
                >
                  <User className="w-5 h-5 text-blue-400" />
                  <span className="text-sm text-white">{user?.phone || demoPhone || 'Account'}</span>
                </button>
              ) : (
                <button
                  className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-blue-600/80 hover:bg-blue-600 transition-colors"
                  onClick={() => setShowAuthModal(true)}
                >
                  <Mail className="w-4 h-4 text-white" />
                  <span className="text-sm text-white font-medium">Login</span>
                </button>
              )}
              {showProfile && renderProfilePanel()}
            </div>
          </div>
        </div>
      </div>
      {showAuthModal && createPortal(<AuthModal onClose={() => setShowAuthModal(false)} />, document.body)}
    </nav>
  );
}