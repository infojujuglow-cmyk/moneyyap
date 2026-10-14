import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, radii, shadows, spacing, typography } from '@/theme';

export function ChatComposer({ onSend, onAttach, placeholder = 'Tell MoneyYap anything…', autoFocus = false }: { onSend: (message: string) => void; onAttach?: () => void; placeholder?: string; autoFocus?: boolean }) {
  const [message, setMessage] = useState('');
  const submit = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    onSend(trimmed);
    setMessage('');
  };
  return (
    <View style={styles.shell}>
      {onAttach && <Pressable accessibilityLabel="Attach transaction image" onPress={onAttach} style={({ pressed }) => [styles.attach, pressed && styles.pressed]}><Ionicons name="add" size={22} color={colors.mintDeep} /></Pressable>}
      <TextInput
        autoFocus={autoFocus}
        placeholder={placeholder}
        placeholderTextColor={colors.slate}
        value={message}
        onChangeText={setMessage}
        onSubmitEditing={submit}
        returnKeyType="send"
        style={styles.input}
      />
      <Pressable accessibilityLabel={message.trim() ? 'Send message' : 'Record voice message'} onPress={message.trim() ? submit : undefined} style={({ pressed }) => [styles.send, pressed && styles.pressed]}>
        <Ionicons name={message.trim() ? 'arrow-up' : 'mic'} size={20} color={colors.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { minHeight: 58, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderStrong, paddingLeft: 7, paddingRight: 7, paddingVertical: 6, ...shadows.soft },
  attach: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintWash, marginRight: spacing.sm },
  input: { flex: 1, minHeight: 44, color: colors.ink, fontFamily: typography.regular, fontSize: 15 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mint },
  pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
});
