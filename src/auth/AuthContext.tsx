import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as bcrypt from 'bcryptjs';
import {apiRequest, ApiError} from '../api/client';
import {defaultPreferences, type StudyPreferences, type UserProfile} from '../types';

type SessionResponse = {accessToken: string; user: UserProfile};
type LocalAccount = {user: UserProfile; passwordHash: string};
type AuthContextValue = {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  signUp: (input: {name: string; email: string; password: string}) => Promise<UserProfile>;
  signIn: (input: {email: string; password: string}) => Promise<UserProfile>;
  connectLocalAccount: (password: string) => Promise<{user: UserProfile; accessToken: string}>;
  signInWithGoogle: (idToken: string) => Promise<UserProfile>;
  savePreferences: (preferences: StudyPreferences) => Promise<UserProfile>;
  signOut: () => Promise<void>;
};

const TOKEN_KEY = 'brujula.access-token.v1';
const LOCAL_SESSION_KEY = 'brujula.local-session.v1';
const LOCAL_ACCOUNTS_KEY = 'brujula.local-accounts.v1';
const REMOTE_PROFILE_KEY = 'brujula.cached-profile.v1';
const AuthContext = createContext<AuthContextValue | null>(null);

// React Native doesn't expose the Web Crypto or Node crypto APIs that bcryptjs
// uses to generate salts. Expo Crypto supplies secure native random bytes.
bcrypt.setRandomFallback(length => Array.from(Crypto.getRandomBytes(length)));

async function readToken() {
  if (Platform.OS === 'web') return AsyncStorage.getItem(TOKEN_KEY);
  try {
    return (await SecureStore.getItemAsync(TOKEN_KEY)) ?? AsyncStorage.getItem(LOCAL_SESSION_KEY);
  } catch {
    return AsyncStorage.getItem(LOCAL_SESSION_KEY);
  }
}

async function writeToken(token: string) {
  if (Platform.OS === 'web') return AsyncStorage.setItem(TOKEN_KEY, token);
  return SecureStore.setItemAsync(TOKEN_KEY, token);
}

async function removeToken() {
  if (Platform.OS === 'web') return AsyncStorage.removeItem(TOKEN_KEY);
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
  await AsyncStorage.removeItem(LOCAL_SESSION_KEY);
}

async function writeLocalToken(token: string) {
  if (Platform.OS === 'web') return writeToken(token);
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await AsyncStorage.removeItem(LOCAL_SESSION_KEY);
  } catch {
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
    await AsyncStorage.setItem(LOCAL_SESSION_KEY, token);
  }
}

async function readLocalAccounts(): Promise<Record<string, LocalAccount>> {
  try {
    const value = await AsyncStorage.getItem(LOCAL_ACCOUNTS_KEY);
    return value ? JSON.parse(value) as Record<string, LocalAccount> : {};
  } catch {
    return {};
  }
}

async function saveLocalAccounts(accounts: Record<string, LocalAccount>) {
  await AsyncStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function normalizeEmail(email: string) {
  return email.trim().normalize('NFC').toLowerCase();
}

export function AuthProvider({children}: React.PropsWithChildren) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const restore = async () => {
      try {
        const storedToken = await readToken();
        if (!storedToken) return;

        if (storedToken.startsWith('local:')) {
          const accounts = await readLocalAccounts();
          const localUser = Object.values(accounts).find(account => account.user.id === storedToken.slice('local:'.length))?.user;
          if (localUser && mounted) {
            setToken(storedToken);
            setUser(localUser);
          } else {
            await removeToken();
          }
          return;
        }

        try {
          const profile = await apiRequest<UserProfile>('/profile', {}, storedToken);
          await AsyncStorage.setItem(REMOTE_PROFILE_KEY, JSON.stringify(profile));
          if (mounted) {
            setToken(storedToken);
            setUser(profile);
          }
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            await removeToken();
            await AsyncStorage.removeItem(REMOTE_PROFILE_KEY);
            return;
          }
          const cachedProfile = await AsyncStorage.getItem(REMOTE_PROFILE_KEY);
          if (cachedProfile && mounted) {
            setToken(storedToken);
            setUser(JSON.parse(cachedProfile) as UserProfile);
          } else {
            await removeToken();
          }
        }
      } catch {
        await removeToken().catch(() => undefined);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void restore();
    return () => { mounted = false; };
  }, []);

  const acceptSession = useCallback(async (session: SessionResponse) => {
    await writeToken(session.accessToken);
    await AsyncStorage.setItem(REMOTE_PROFILE_KEY, JSON.stringify(session.user));
    setToken(session.accessToken);
    setUser(session.user);
    return session.user;
  }, []);

  const acceptLocalSession = useCallback(async (localUser: UserProfile) => {
    const localToken = `local:${localUser.id}`;
    await writeLocalToken(localToken);
    await AsyncStorage.removeItem(REMOTE_PROFILE_KEY);
    setToken(localToken);
    setUser(localUser);
    return localUser;
  }, []);

  const createLocalAccount = useCallback(async (input: {name: string; email: string; password: string}) => {
    const email = normalizeEmail(input.email);
    const accounts = await readLocalAccounts();
    if (accounts[email]) throw new ApiError('Ya existe una cuenta en este dispositivo con ese correo.', 409);

    const localUser: UserProfile = {
      id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      name: input.name.trim(),
      email,
      preferences: defaultPreferences,
      onboardingCompleted: false,
    };
    accounts[email] = {user: localUser, passwordHash: await bcrypt.hash(input.password, 10)};
    await saveLocalAccounts(accounts);
    return acceptLocalSession(localUser);
  }, [acceptLocalSession]);

  const signUp = useCallback(async (input: {name: string; email: string; password: string}) => {
    try {
      const session = await apiRequest<SessionResponse>('/auth/register', {method: 'POST', body: JSON.stringify(input)});
      return acceptSession(session);
    } catch (error) {
      // A missing API, missing endpoint, or unavailable database should not block local onboarding.
      if (error instanceof ApiError && (error.status === 0 || error.status === 404 || error.status >= 500)) {
        return createLocalAccount(input);
      }
      throw error;
    }
  }, [acceptSession, createLocalAccount]);

  const signInLocally = useCallback(async (input: {email: string; password: string}) => {
    const account = (await readLocalAccounts())[normalizeEmail(input.email)];
    if (!account) return {user: null, accountExists: false};
    const valid = await bcrypt.compare(input.password, account.passwordHash);
    return {user: valid ? account.user : null, accountExists: true};
  }, []);

  const signIn = useCallback(async (input: {email: string; password: string}) => {
    try {
      const session = await apiRequest<SessionResponse>('/auth/login', {method: 'POST', body: JSON.stringify(input)});
      return acceptSession(session);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 0 || error.status === 404 || error.status >= 500)) {
        const localResult = await signInLocally(input);
        if (localResult.user) return acceptLocalSession(localResult.user);
        if (localResult.accountExists) throw new ApiError('El correo o la contraseña no coinciden.', 401);
        if (error.status === 0 || error.status === 404) {
          throw new ApiError('No encontramos una cuenta en este dispositivo. Crea una cuenta para empezar.', 404);
        }
        throw error;
      }
      if (error instanceof ApiError && error.status === 401) {
        const localResult = await signInLocally(input);
        if (localResult.user) return acceptLocalSession(localResult.user);
      }
      throw error;
    }
  }, [acceptLocalSession, acceptSession, signInLocally]);

  const connectLocalAccount = useCallback(async (password: string) => {
    if (!token?.startsWith('local:') || !user) throw new ApiError('Esta cuenta ya está conectada al servidor.', 400);

    const localAccount = Object.values(await readLocalAccounts()).find(account => account.user.id === user.id);
    if (!localAccount) throw new ApiError('No encontramos los datos de esta cuenta local. Vuelve a iniciar sesión.', 404);
    if (!await bcrypt.compare(password, localAccount.passwordHash)) {
      throw new ApiError('La contraseña no coincide con esta cuenta.', 401);
    }

    let session: SessionResponse;
    try {
      session = await apiRequest<SessionResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({email: localAccount.user.email, password}),
      });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      try {
        session = await apiRequest<SessionResponse>('/auth/register', {
          method: 'POST',
          body: JSON.stringify({name: localAccount.user.name, email: localAccount.user.email, password}),
        });
      } catch (registerError) {
        if (registerError instanceof ApiError && registerError.status === 409) {
          throw new ApiError('Ya existe una cuenta con este correo en el servidor. Inicia sesión con la contraseña de esa cuenta.', 409);
        }
        throw registerError;
      }
    }

    if (localAccount.user.onboardingCompleted) {
      const profile = await apiRequest<UserProfile>('/profile/preferences', {
        method: 'PATCH',
        body: JSON.stringify(localAccount.user.preferences),
      }, session.accessToken);
      session = {...session, user: profile};
    }

    await acceptSession(session);
    return {user: session.user, accessToken: session.accessToken};
  }, [acceptSession, token, user]);

  const signInWithGoogle = useCallback(async (idToken: string) => {
    const session = await apiRequest<SessionResponse>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({idToken}),
    });
    return acceptSession(session);
  }, [acceptSession]);

  const savePreferences = useCallback(async (preferences: StudyPreferences) => {
    if (!token || !user) throw new Error('Inicia sesión para guardar tus preferencias.');
    const updatedUser = {...user, preferences, onboardingCompleted: true};

    if (token.startsWith('local:')) {
      const accounts = await readLocalAccounts();
      const account = Object.values(accounts).find(item => item.user.id === user.id);
      if (!account) throw new Error('No encontramos tu cuenta local. Vuelve a iniciar sesión.');
      account.user = updatedUser;
      await saveLocalAccounts(accounts);
      setUser(updatedUser);
      return updatedUser;
    }

    try {
      const profile = await apiRequest<UserProfile>('/profile/preferences', {method: 'PATCH', body: JSON.stringify(preferences)}, token);
      await AsyncStorage.setItem(REMOTE_PROFILE_KEY, JSON.stringify(profile));
      setUser(profile);
      return profile;
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) {
        await AsyncStorage.setItem(REMOTE_PROFILE_KEY, JSON.stringify(updatedUser));
        setUser(updatedUser);
        return updatedUser;
      }
      throw error;
    }
  }, [token, user]);

  const signOut = useCallback(async () => {
    await removeToken().catch(() => undefined);
    await AsyncStorage.removeItem(REMOTE_PROFILE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({user, token, loading, signUp, signIn, connectLocalAccount, signInWithGoogle, savePreferences, signOut}), [user, token, loading, signUp, signIn, connectLocalAccount, signInWithGoogle, savePreferences, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
