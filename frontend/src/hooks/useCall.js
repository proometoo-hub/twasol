import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import useNotification from './useNotification';

export default function useCall(conversations) {
  const socketRef = useSocket();
  const { user } = useAuth();
  const playNotif = useNotification();
  const [callData, setCallData] = useState(null);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !user) return;

    const onIncoming = ({ callerId, signal, callType, conversationId }) => {
      let callerInfo = null;
      for (const c of conversations) {
        const m = c.members?.find(m => m.userId === callerId);
        if (m) { callerInfo = m.user; break; }
      }
      if (!callerInfo) callerInfo = { id: callerId, name: 'User', avatar: '' };
      setCallData({ mode: 'direct', targetUser: callerInfo, callType, isIncoming: true, incomingSignal: signal, conversationId, startedAt: new Date().toISOString() });
      playNotif();
    };

    const onIncomingGroup = ({ conversationId, callerId, callType }) => {
      const conversation = conversations.find(c => c.id === conversationId);
      if (!conversation) return;
      const callerInfo = conversation.members?.find(m => m.userId === callerId)?.user || { id: callerId, name: 'مشرف الاتصال' };
      setCallData({ mode: 'group', conversation, callType, isIncoming: true, callerInfo, conversationId, startedAt: new Date().toISOString() });
      playNotif();
    };

    const clear = () => setCallData(prev => prev ? { ...prev, endedAt: new Date().toISOString() } : null);
    const clearFull = () => setCallData(null);

    socket.on('incoming_call', onIncoming);
    socket.on('incoming_group_call', onIncomingGroup);
    socket.on('call_rejected', clear);
    socket.on('call_ended', clearFull);
    socket.on('native_call_end', clearFull);
    return () => {
      socket.off('incoming_call', onIncoming);
      socket.off('incoming_group_call', onIncomingGroup);
      socket.off('call_rejected', clear);
      socket.off('call_ended', clearFull);
      socket.off('native_call_end', clearFull);
    };
  }, [socketRef, conversations, playNotif, user]);

  const startCall = useCallback((target, callType) => {
    if (target?.conversationId || target?.isGroup || target?.isChannel || target?.members?.length) {
      const conversation = target.id ? target : null;
      setCallData({ mode: 'group', conversation, callType, isIncoming: false, startedAt: new Date().toISOString() });
      return;
    }
    setCallData({ mode: 'direct', targetUser: target, callType, isIncoming: false, incomingSignal: null, startedAt: new Date().toISOString() });
  }, []);

  const endCall = useCallback(() => { setCallData(null); }, []);
  return { callData, startCall, endCall };
}
