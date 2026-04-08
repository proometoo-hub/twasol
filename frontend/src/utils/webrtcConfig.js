function clean(value) {
  return String(value || '').trim();
}

function isPlaceholder(value) {
  const raw = clean(value).toLowerCase();
  return !raw || raw.includes('your_turn_host') || raw === 'username' || raw === 'credential' || raw.includes('example.com');
}

function normalizeUrls(raw) {
  const value = clean(raw);
  if (!value) return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function parseIceServersJson(raw) {
  const value = clean(raw);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(Boolean).map((server) => ({
      ...server,
      urls: Array.isArray(server?.urls) ? server.urls : clean(server?.urls),
    })).filter((server) => server.urls && (Array.isArray(server.urls) ? server.urls.length : true));
  } catch (error) {
    console.warn('Invalid REACT_APP_ICE_SERVERS_JSON:', error);
    return null;
  }
}

function buildIceServers() {
  const fromJson = parseIceServersJson(process.env.REACT_APP_ICE_SERVERS_JSON);
  if (fromJson?.length) return fromJson;

  const stunUrls = normalizeUrls(process.env.REACT_APP_STUN_URL || 'stun:stun.l.google.com:19302');
  const turnUrls = normalizeUrls(process.env.REACT_APP_TURN_URL || process.env.REACT_APP_TURN_URLS || '').filter((url) => !isPlaceholder(url));
  const turnUsername = clean(process.env.REACT_APP_TURN_USERNAME);
  const turnCredential = clean(process.env.REACT_APP_TURN_CREDENTIAL);

  const servers = [];
  if (stunUrls.length) servers.push({ urls: stunUrls.length === 1 ? stunUrls[0] : stunUrls });
  if (turnUrls.length && !isPlaceholder(turnUsername) && !isPlaceholder(turnCredential)) {
    servers.push({
      urls: turnUrls.length === 1 ? turnUrls[0] : turnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
  }
  return servers;
}

export const ICE_SERVERS = buildIceServers();
export const RTC_CONFIGURATION = { iceServers: ICE_SERVERS };
export const HAS_TURN_SERVER = ICE_SERVERS.some((server) => {
  const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
  return urls.some((url) => clean(url).toLowerCase().startsWith('turn:') || clean(url).toLowerCase().startsWith('turns:'));
});
