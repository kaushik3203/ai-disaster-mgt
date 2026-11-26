import React, { useEffect } from 'react';
import Dashboard from './components/Dashboard';
import Navbar from './components/Navbar';
import { useAuthStore } from './store/auth';

function App() {
  const initializeAuth = useAuthStore(state => state.initializeAuth);

  useEffect(() => {
    const unsubscribe = initializeAuth();
    return unsubscribe;
  }, [initializeAuth]);

  return (
    <>
      <Navbar />
      <Dashboard />
    </>
  );
}

export default App;