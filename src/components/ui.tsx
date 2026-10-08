import React, {useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import {SafeAreaView, type Edge} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {colors, radius, spacing} from '../theme';

type IconName = keyof typeof Ionicons.glyphMap;

export function AppPage({children, edges}: React.PropsWithChildren<{edges?: Edge[]}>) {
  return <SafeAreaView edges={edges} style={styles.safeArea}>{children}</SafeAreaView>;
}

export function Brand({compact = false}: {compact?: boolean}) {
  return (
    <View style={[styles.brand, compact && styles.brandCompact]}>
      <View style={styles.brandMark}>
        <Ionicons name="compass-outline" size={compact ? 19 : 22} color={colors.teal} />
      </View>
      <Text style={[styles.brandName, compact && styles.brandNameCompact]}>Brújula</Text>
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  icon,
  disabled = false,
  loading = false,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const secondary = variant === 'secondary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        secondary && styles.buttonSecondary,
        (disabled || loading) && styles.buttonDisabled,
        pressed && !disabled && styles.pressed,
      ]}>
      {loading ? (
        <ActivityIndicator color={secondary ? colors.primary : colors.surface} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={19} color={secondary ? colors.primary : colors.surface} /> : null}
          <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{title}</Text>
          {!icon && !secondary ? <Ionicons name="arrow-forward" size={18} color={colors.surface} /> : null}
        </>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  icon,
  secureTextEntry,
  ...props
}: TextInputProps & {label: string; icon: IconName}) {
  const [show, setShow] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputShell}>
        <Ionicons name={icon} size={19} color={colors.muted} />
        <TextInput
          accessibilityLabel={label}
          autoCapitalize={props.autoCapitalize ?? 'none'}
          placeholderTextColor="#98A2B3"
          style={styles.input}
          secureTextEntry={secureTextEntry ? !show : false}
          {...props}
        />
        {secureTextEntry ? (
          <Pressable accessibilityRole="button" accessibilityLabel={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} onPress={() => setShow(!show)} hitSlop={10}>
            <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function SurfaceCard({children, style}: React.PropsWithChildren<{style?: object}>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionHeading({title, action, onAction}: {title: string; action?: string; onAction?: () => void}) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Pill({label, selected = false, onPress}: {label: string; selected?: boolean; onPress?: () => void}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? {selected} : undefined}
      onPress={onPress}
      style={[styles.pill, selected && styles.pillSelected]}>
      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: colors.background},
  brand: {flexDirection: 'row', alignItems: 'center', gap: 9},
  brandCompact: {gap: 7},
  brandMark: {width: 34, height: 34, borderRadius: 12, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center'},
  brandName: {fontSize: 22, color: colors.text, fontWeight: '800', letterSpacing: -0.6},
  brandNameCompact: {fontSize: 18},
  button: {minHeight: 54, borderRadius: radius.md, paddingHorizontal: 18, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10},
  buttonSecondary: {backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: 'center'},
  buttonDisabled: {opacity: 0.55},
  buttonText: {flex: 1, textAlign: 'center', color: colors.surface, fontSize: 16, fontWeight: '700'},
  buttonTextSecondary: {flex: 0, color: colors.primary},
  pressed: {opacity: 0.85, transform: [{scale: 0.99}]},
  fieldWrap: {gap: 8, marginBottom: 16},
  fieldLabel: {fontSize: 14, color: colors.text, fontWeight: '600'},
  inputShell: {minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingHorizontal: 14, backgroundColor: colors.surface},
  input: {flex: 1, minHeight: 52, color: colors.text, fontSize: 15},
  card: {backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md},
  sectionHeading: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12},
  sectionTitle: {fontSize: 18, color: colors.text, fontWeight: '700'},
  sectionAction: {fontSize: 13, color: colors.primary, fontWeight: '700'},
  pill: {borderRadius: radius.pill, borderColor: colors.border, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface},
  pillSelected: {borderColor: colors.teal, backgroundColor: colors.tealSoft},
  pillText: {fontSize: 13, color: colors.muted, fontWeight: '600'},
  pillTextSelected: {color: colors.teal},
});
