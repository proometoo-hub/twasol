import { useEffect, useCallback, useState, useRef } from 'react';

// ===== KEYBOARD SHORTCUTS =====
export function useKeyboardShortcuts(handlers) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') handlers.onEscape?.();
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'n' || e.key === 'N') { e.preventDefault(); handlers.onNewChat?.(); }
        if (e.key === 'f' || e.key === 'F') { e.preventDefault(); handlers.onSearch?.(); }
        if (e.key === 'k' || e.key === 'K') { e.preventDefault(); handlers.onCommandPalette?.(); }
      }
      if (e.key === 'Escape') handlers.onEscape?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlers]);
}

// ===== DRAG & DROP =====
export function useDragDrop(onFileDrop) {
  const [isDragging, setIsDragging] = useState(false);
  const counterRef = useRef(0);

  const onDragEnter = useCallback((e) => {
    e.preventDefault(); counterRef.current++;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault(); counterRef.current--;
    if (counterRef.current === 0) setIsDragging(false);
  }, []);

  const onDragOver = useCallback((e) => { e.preventDefault(); }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault(); counterRef.current = 0; setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && onFileDrop) onFileDrop(files[0]);
  }, [onFileDrop]);

  return { isDragging, dragProps: { onDragEnter, onDragLeave, onDragOver, onDrop } };
}

// ===== DRAFTS =====
const draftsMap = {};
export function useDrafts(chatId) {
  const [draft, setDraft] = useState(draftsMap[chatId] || '');

  const saveDraft = useCallback((text) => {
    draftsMap[chatId] = text;
    setDraft(text);
  }, [chatId]);

  const clearDraft = useCallback(() => {
    delete draftsMap[chatId];
    setDraft('');
  }, [chatId]);

  const loadDraft = useCallback(() => {
    return draftsMap[chatId] || '';
  }, [chatId]);

  return { draft, saveDraft, clearDraft, loadDraft };
}
