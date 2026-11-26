import React, { useState } from 'react';
import { Map, Globe2, BarChart2, Users, Box, AlertTriangle, MessageSquare, Bot, Brain } from 'lucide-react';
import AIChat from './AIChat';
import { useDisasterStore } from '../store/disaster';

interface DockProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

export default function Dock({ activeView, onViewChange }: DockProps) {
  const { teams, resources, reports, alerts } = useDisasterStore();
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);

  const menuItems = [
    { id: 'chat', icon: Bot, label: 'AI Assistant' },
    { id: 'map', icon: Map, label: 'Map View' },
    { id: 'globe', icon: Globe2, label: 'Globe' },
    { id: 'analytics', icon: BarChart2, label: 'Analytics' },
    { id: 'analysis', icon: Brain, label: 'AI Analysis' },
    { id: 'teams', icon: Users, label: 'Teams' },
    { id: 'resources', icon: Box, label: 'Resources' },
    { id: 'incidents', icon: AlertTriangle, label: 'Incidents' },
    { id: 'communications', icon: MessageSquare, label: 'Comms' }
  ];

  const handleViewChange = (view: string) => {
    if (view === 'chat') {
      setShowChat(!showChat);
      setActivePanel(null);
    } else if (['teams', 'resources', 'incidents', 'communications'].includes(view)) {
      setActivePanel(prev => (prev === view ? null : view));
      setShowChat(false);
    } else {
      onViewChange(view);
      setActivePanel(null);
    }
  };

  const renderPanelContent = (view: string) => {
    switch (view) {
      case 'teams':
        return (
          <div className="p-4">
            <h2 className="text-xl font-bold text-white mb-4">Emergency Response Teams ({teams.length})</h2>
            <div className="space-y-4">
              {teams.map(team => (
                <div key={team.id} className="glass p-4 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-white">{team.name}</h3>
                      <p className="text-sm text-gray-300 capitalize">{team.type} • {team.current_members}/{team.capacity} members</p>
                      <p className="text-sm text-gray-400">{team.location_name}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      team.status === 'available' ? 'bg-green-500/20 text-green-300' :
                      team.status === 'responding' || team.status === 'on-site' ? 'bg-blue-500/20 text-blue-300' :
                      'bg-yellow-500/20 text-yellow-300'
                    }`}>
                      {team.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'resources':
        return (
          <div className="p-4">
            <h2 className="text-xl font-bold text-white mb-4">Resource Management ({resources.length})</h2>
            <div className="space-y-4">
              {resources.map(resource => (
                <div key={resource.id} className="glass p-4 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-white">{resource.name}</h3>
                      <p className="text-sm text-gray-300 capitalize">{resource.type}</p>
                      <p className="text-sm text-gray-400">
                        {resource.quantity} {resource.unit} at {resource.location_name}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      resource.status === 'available' ? 'bg-green-500/20 text-green-300' :
                      resource.status === 'deployed' ? 'bg-blue-500/20 text-blue-300' :
                      'bg-yellow-500/20 text-yellow-300'
                    }`}>
                      {resource.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'incidents':
        return (
          <div className="p-4">
            <h2 className="text-xl font-bold text-white mb-4">Incident Reports ({reports.length})</h2>
            <div className="space-y-4">
              {reports.length === 0 ? (
                <p className="text-sm text-gray-400">No incident reports submitted yet.</p>
              ) : (
                reports.map(incident => (
                  <div key={incident.id} className="glass p-4 rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-white">{incident.title}</h3>
                        <p className="text-sm text-gray-300">{incident.location_name}</p>
                        <p className="text-sm text-gray-400">
                          {new Date(incident.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-col items-end space-y-2">
                        {incident.severity != null && (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            incident.severity >= 4 ? 'bg-red-500/20 text-red-300' :
                            incident.severity >= 3 ? 'bg-yellow-500/20 text-yellow-300' :
                            'bg-blue-500/20 text-blue-300'
                          }`}>
                            Severity {incident.severity}
                          </span>
                        )}
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          incident.status === 'pending' ? 'bg-red-500/20 text-red-300' :
                          incident.status === 'verified' ? 'bg-yellow-500/20 text-yellow-300' :
                          'bg-green-500/20 text-green-300'
                        }`}>
                          {incident.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );

      case 'communications':
        return (
          <div className="p-4">
            <h2 className="text-xl font-bold text-white mb-4">Emergency Alerts ({alerts.length})</h2>
            <div className="space-y-4">
              {alerts.map(alert => (
                <div key={alert.id} className="glass p-4 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className={`w-2 h-2 rounded-full ${
                          (alert.severity ?? 3) >= 4 ? 'bg-red-500' :
                          (alert.severity ?? 3) >= 3 ? 'bg-yellow-500' :
                          'bg-green-500'
                        }`}></span>
                        <h3 className="font-semibold text-white">{alert.title}</h3>
                      </div>
                      <p className="text-sm text-gray-300 mt-2">{alert.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(alert.sent_at || alert.created_at).toLocaleString()}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      alert.type === 'evacuation' ? 'bg-red-500/20 text-red-300' :
                      alert.type === 'warning' ? 'bg-yellow-500/20 text-yellow-300' :
                      'bg-blue-500/20 text-blue-300'
                    }`}>
                      {alert.type}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50">
        <div className="flex items-center space-x-2 bg-black/40 backdrop-blur-lg rounded-full p-2 border border-white/10 shadow-lg">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === 'chat' ? showChat : activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleViewChange(item.id)}
                className={`relative group p-3 rounded-full transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs font-medium text-white bg-black/80 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* AI Chat Panel */}
      {showChat && (
        <div className="fixed bottom-32 right-8 w-96 z-40 shadow-2xl">
          <AIChat />
        </div>
      )}

      {/* Other Panels */}
      {activePanel && (
        <div className="fixed bottom-32 left-1/2 transform -translate-x-1/2 w-full max-w-2xl z-40">
          <div className="glass rounded-xl shadow-xl max-h-[60vh] overflow-y-auto">
            {renderPanelContent(activePanel)}
          </div>
        </div>
      )}
    </>
  );
}