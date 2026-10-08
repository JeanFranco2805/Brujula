import {useCallback, useState} from 'react';
import {Alert, Platform} from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim();
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();

export function useGoogleSignIn() {
  const [loading, setLoading] = useState(false);
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    // The hook requires client IDs at construction. These fallbacks are never used to open a flow.
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || 'not-configured.apps.googleusercontent.com',
    iosClientId: GOOGLE_IOS_CLIENT_ID || 'not-configured.apps.googleusercontent.com',
    webClientId: GOOGLE_WEB_CLIENT_ID || 'not-configured.apps.googleusercontent.com',
    scopes: ['openid', 'profile', 'email'],
  }, {scheme: 'brujula'});

  const start = useCallback(async (onIdToken: (idToken: string) => Promise<void>) => {
    const configured = Platform.select({
      android: GOOGLE_ANDROID_CLIENT_ID,
      ios: GOOGLE_IOS_CLIENT_ID,
      default: GOOGLE_WEB_CLIENT_ID,
    });
    if (!configured) {
      Alert.alert(
        'Google aún no está configurado',
        'Agrega EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID, EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID y EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID al .env; en backend/.env configura GOOGLE_CLIENT_IDS con esos mismos IDs. Luego crea una nueva build. El registro por correo puede usarse mientras tanto.'
      );
      return;
    }
    if (!request) {
      Alert.alert('Preparando acceso con Google', 'Espera un momento e inténtalo de nuevo.');
      return;
    }

    setLoading(true);
    try {
      const result = await promptAsync();
      if (result.type === 'success') {
        const idToken = result.params.id_token;
        if (!idToken) throw new Error('Google no devolvió un token de identidad.');
        await onIdToken(idToken);
      } else if (result.type === 'error') {
        Alert.alert('No se pudo continuar con Google', result.error?.message ?? 'Inténtalo de nuevo.');
      }
    } catch (error) {
      Alert.alert('No se pudo continuar con Google', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [promptAsync, request]);

  return {loading, start};
}
