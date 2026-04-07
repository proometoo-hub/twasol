import { Platform } from 'react-native';

async function requestAndroid(permissionApi, perm) {
  if (!permissionApi) return false;
  const res = await permissionApi.request(perm);
  return res === permissionApi.RESULTS.GRANTED;
}

export async function requestCallPermissions(mode = 'audio', PermissionsAndroid) {
  const result = { camera: false, microphone: false, error: '' };
  try {
    if (Platform.OS !== 'android') {
      result.microphone = true;
      result.camera = mode === 'video';
      return result;
    }
    if (mode === 'audio' || mode === 'video') {
      result.microphone = await requestAndroid(PermissionsAndroid, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    }
    if (mode === 'video') {
      result.camera = await requestAndroid(PermissionsAndroid, PermissionsAndroid.PERMISSIONS.CAMERA);
    }
    if (!result.microphone && !result.camera) {
      result.error = 'لم يتم منح صلاحيات الميكروفون أو الكاميرا. ستبقى الدردشة النصية متاحة داخل المكالمة.';
    } else if (!result.microphone) {
      result.error = 'الكاميرا متاحة لكن الميكروفون غير متاح حاليًا. يمكنك متابعة الكتابة أو إعادة المحاولة.';
    } else if (mode === 'video' && !result.camera) {
      result.error = 'الميكروفون متاح لكن الكاميرا غير متاحة حاليًا. ستبدأ المكالمة بدون فيديو.';
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : 'تعذر طلب صلاحيات المكالمة.';
  }
  return result;
}

export function describeCallState(mode, state) {
  if (mode === 'video') {
    if (state.camera && state.microphone) return 'تم تجهيز الكاميرا والميكروفون. يمكنك بدء المكالمة أو المتابعة بالدردشة داخل الجلسة.';
    if (state.microphone && !state.camera) return 'الميكروفون جاهز. ستعمل المكالمة بدون فيديو حتى تسمح بالكاميرا.';
    if (!state.microphone && state.camera) return 'الكاميرا جاهزة لكن الميكروفون غير متاح. يمكنك الكتابة أو إعادة محاولة تفعيل الميكروفون.';
    return 'لم يتم الوصول إلى أجهزة الصوت أو الفيديو. ستبقى جلسة المحادثة النصية داخل المكالمة متاحة.';
  }
  return state.microphone
    ? 'الميكروفون جاهز للمكالمة الصوتية. يمكنك المتابعة أو استخدام الدردشة داخل الجلسة.'
    : 'لم يتم الوصول إلى الميكروفون. يمكنك متابعة المحادثة النصية داخل جلسة الاتصال وإعادة المحاولة لاحقًا.';
}
