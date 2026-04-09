import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../i18n/strings';

const EMOJI_GROUPS = [
  {
    id: 'smileys',
    labelAr: 'وجوه',
    labelEn: 'Smileys',
    items: ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','🙂','😉','😍','🥰','😘','😗','😎','🤩','🥳','😇','🤗','🤔','🫡','🤭','🤫','🙃','😴','🤤','😌','😬','🥹','😭','😤'],
  },
  {
    id: 'gestures',
    labelAr: 'إشارات',
    labelEn: 'Gestures',
    items: ['👍','👎','👏','🙌','🫶','🤝','🙏','👌','✌️','🤞','🤟','🫰','👋','💪','👀','🧠','🫂','☝️','👇','👈','👉','👊','🤛','🤜'],
  },
  {
    id: 'hearts',
    labelAr: 'قلوب',
    labelEn: 'Hearts',
    items: ['❤️','🧡','💛','💚','🩵','💙','💜','🩷','🤍','🖤','🤎','💔','❤️‍🔥','❤️‍🩹','💖','💘','💝','💞','💕','💗','💓','💟','❣️','💌'],
  },
  {
    id: 'nature',
    labelAr: 'طبيعة',
    labelEn: 'Nature',
    items: ['🌞','🌙','⭐','✨','⚡','🔥','🌈','☔','🌊','🌴','🌵','🌹','🌺','🌸','🌼','🍀','🌿','🍁','🪴','🌍','🌎','🌏','🪐','☁️'],
  },
  {
    id: 'food',
    labelAr: 'طعام',
    labelEn: 'Food',
    items: ['🍎','🍓','🍇','🍉','🍍','🥭','🍒','🥝','🍋','🥑','🌶️','🥕','🍔','🍕','🌭','🍟','🥪','🌮','🍿','🍩','🍪','🎂','☕','🧃'],
  },
  {
    id: 'activities',
    labelAr: 'أنشطة',
    labelEn: 'Activities',
    items: ['⚽','🏀','🏐','🎾','🏓','🥊','🏆','🎯','🎮','🧩','🎨','🎬','🎧','🎤','🎻','🥁','💃','🕺','🎉','🎊','🎁','🪩','🚀','🏁'],
  },
  {
    id: 'travel',
    labelAr: 'سفر',
    labelEn: 'Travel',
    items: ['🚗','🚕','🚌','🚎','🏎️','🚓','🚑','✈️','🛫','🛬','🚀','🚁','⛵','🚤','🚢','🏖️','🏝️','🏙️','🌉','🏠','🏡','🏢','🗺️','🧭'],
  },
  {
    id: 'objects',
    labelAr: 'أشياء',
    labelEn: 'Objects',
    items: ['📱','💻','⌚','📷','🎥','📞','🔋','💡','🧷','📝','📌','📎','🔒','🔑','🛎️','🧸','🪄','💎','🧯','🧰','🔔','🎙️','📡','💬'],
  },
];

const RECENT_KEY = 'tawasol_recent_emojis';

const getRecent = () => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveRecent = (emoji) => {
  const next = [emoji, ...getRecent().filter((item) => item !== emoji)].slice(0, 24);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
};

export default function EmojiPicker({ locale, onSelect, onClose }) {
  const rootRef = useRef(null);
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState('recent');
  const [recent, setRecent] = useState(() => (typeof window === 'undefined' ? [] : getRecent()));

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) onClose?.();
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [onClose]);

  const filteredGroups = useMemo(() => {
    const q = query.trim();
    const baseGroups = recent.length
      ? [{ id: 'recent', labelAr: 'الأخيرة', labelEn: 'Recent', items: recent }, ...EMOJI_GROUPS]
      : EMOJI_GROUPS;

    if (!q) return baseGroups;
    return baseGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((emoji) => emoji.includes(q)),
      }))
      .filter((group) => group.items.length);
  }, [query, recent]);

  const visibleGroups = activeGroup === 'recent'
    ? filteredGroups
    : filteredGroups.filter((group) => group.id === activeGroup || query);

  const handlePick = (emoji) => {
    saveRecent(emoji);
    setRecent(getRecent());
    onSelect?.(emoji);
  };

  return (
    <div className="emoji-picker-popover" ref={rootRef}>
      <div className="emoji-picker-head">
        <strong>{t(locale, 'emojiLibrary')}</strong>
        <button type="button" className="ghost-inline" onClick={onClose}>{t(locale, 'close')}</button>
      </div>

      <div className="emoji-picker-search">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t(locale, 'searchEmoji')}
        />
      </div>

      <div className="emoji-picker-tabs">
        {(recent.length ? [{ id: 'recent', labelAr: 'الأخيرة', labelEn: 'Recent' }, ...EMOJI_GROUPS] : EMOJI_GROUPS).map((group) => (
          <button
            key={group.id}
            type="button"
            className={activeGroup === group.id ? 'active' : ''}
            onClick={() => setActiveGroup(group.id)}
          >
            {locale === 'ar' ? group.labelAr : group.labelEn}
          </button>
        ))}
      </div>

      <div className="emoji-picker-groups">
        {visibleGroups.map((group) => (
          <div key={group.id} className="emoji-group">
            <div className="emoji-group-title">{locale === 'ar' ? group.labelAr : group.labelEn}</div>
            <div className="emoji-grid">
              {group.items.map((emoji) => (
                <button key={`${group.id}-${emoji}`} type="button" className="emoji-grid-item" onClick={() => handlePick(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
        {!visibleGroups.length && <div className="mini-note">{t(locale, 'emptySearch')}</div>}
      </div>
    </div>
  );
}
