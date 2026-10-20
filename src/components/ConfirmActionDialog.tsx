import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { getErrorMessage } from '@/lib/errors';
import { colors, radii, spacing } from '@/theme';
import { AppText, Button } from './ui';

interface ConfirmActionDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function ConfirmActionDialog({ visible, title, message, confirmLabel, onClose, onConfirm }: ConfirmActionDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    if (busy) return;
    setError(null);
    onClose();
  };
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to complete this action. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
    <View style={styles.backdrop}>
      <Pressable accessibilityLabel="Cancel" style={StyleSheet.absoluteFill} onPress={close} />
      <View style={styles.card}>
        <AppText variant="h3">{title}</AppText>
        <AppText style={styles.message}>{message}</AppText>
        {error && <AppText variant="caption" style={styles.error}>{error}</AppText>}
        <View style={styles.actions}>
          <Button label="Cancel" variant="ghost" disabled={busy} onPress={close} />
          <Button label={confirmLabel} variant="danger" loading={busy} onPress={confirm} />
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, backgroundColor: 'rgba(18, 25, 35, 0.42)' },
  card: { width: '100%', maxWidth: 420, borderRadius: radii.lg, backgroundColor: colors.white, padding: spacing.xl, gap: spacing.md },
  message: { color: colors.slateDark },
  error: { color: colors.danger },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
});
