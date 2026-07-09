import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { store } from './src/store';
import { syncService } from './src/services/syncService';
import TriageFormScreen from './src/screens/TriageFormScreen';

export default function App() {
  useEffect(() => {
    // Started ONCE here, for the lifetime of the app process — not per-screen.
    // This is what makes background sync survive navigation between screens
    // in a larger app; the engine keeps listening for connectivity changes
    // regardless of which screen is currently mounted.
    syncService.start();

    return () => {
      syncService.stop();
    };
  }, []);

  return (
    <Provider store={store}>
      <TriageFormScreen />
      <StatusBar style="auto" />
    </Provider>
  );
}