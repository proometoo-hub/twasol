import React, { createContext, useContext, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { SOCKET_URL } from '../api';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token, user, isLoggedIn } = useAuth();
  const socketRef = useRef(null);

  useEffect(() => {
    if (!isLoggedIn) {
      if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
      return;
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });

    socket.on('connect', () => console.log('Socket connected'));
    socket.on('disconnect', () => console.log('Socket disconnected'));

    socketRef.current = socket;

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [isLoggedIn, token]);

  return (
    <SocketContext.Provider value={socketRef}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ref = useContext(SocketContext);
  if (ref === null) throw new Error('useSocket must be inside SocketProvider');
  return ref; // returns ref, use ref.current to access socket
}
