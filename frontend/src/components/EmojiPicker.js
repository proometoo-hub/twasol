import React, { useState, useEffect, useRef } from 'react';

const EMOJI_DATA = {
  'smileys': ['😀','😂','🤣','😊','😍','🥰','😘','😜','🤪','😎','🤩','🥳','😏','😢','😭','😤','🤬','🤯','😱','🥶','🤢','🤮','😷','🤒','🤕','🤑','🤠','😈','👻','💀','☠️','👽','🤖','💩','😺','😸','😹','😻','😼','😽','🙀','😿','😾'],
  'gestures': ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄'],
  'hearts': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️','🫶','💌','💋','💍','💎'],
  'objects': ['📱','💻','⌨️','🖥️','🖨️','🖱️','🖲️','💽','💾','💿','📀','📷','📸','📹','🎥','📡','🔭','🔬','💡','🔦','🏮','📔','📕','📖','📗','📘','📙','📚','📓','📒','📃','📜','📄','📰','🗞️','🎵','🎶','🎤','🎧','📻'],
  'nature': ['🌸','🌹','🌺','🌻','🌼','🌷','🌱','🌲','🌳','🌴','🌵','🌾','🌿','☘️','🍀','🍁','🍂','🍃','🍄','🐚','🪨','🌍','🌎','🌏','🌕','🌙','⭐','🌟','✨','⚡','🔥','💧','🌊','❄️','☃️','⛄','🌈','☀️','⛅','☁️'],
  'food': ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🍕','🍔','🍟','🌭','🥪','🌮','🌯','🫔','🥙','🧆','🥗','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍩','🍰','🧁','🍫','🍬','🍭','☕','🍵','🧃','🥤','🍺','🍷']
};
const ICONS = { 'smileys':'😀','gestures':'👋','hearts':'❤️','objects':'📱','nature':'🌸','food':'🍎' };

export default function EmojiPicker({ onSelect, onClose }) {
  const [cat, setCat] = useState('smileys');
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const emojis = search ? Object.values(EMOJI_DATA).flat() : EMOJI_DATA[cat] || [];

  return (
    <div className="emoji-picker" ref={ref}>
      <div className="emoji-search"><input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} autoFocus /></div>
      <div className="emoji-categories">{Object.entries(ICONS).map(([k, ic]) => <button key={k} className={`emoji-cat-btn ${cat === k && !search ? 'active' : ''}`} onClick={() => { setCat(k); setSearch(''); }}>{ic}</button>)}</div>
      <div className="emoji-grid">{emojis.map((e, i) => <span key={i} className="emoji-item" onClick={() => onSelect(e)}>{e}</span>)}</div>
    </div>
  );
}
