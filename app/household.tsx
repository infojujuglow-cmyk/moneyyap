import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useState } from 'react';
import { Screen } from '@/components/Screen';
import { AppText, Avatar, Button, IconCircle, SectionHeader, Surface } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { colors, spacing } from '@/theme';

export default function HouseholdScreen() {
  const { members, addWorkspaceMember } = useFinance();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const leadMembers = members.slice(0, 2);
  const memberNames = leadMembers.map((member) => member.fullName).join(' & ') || 'Your workspace';
  return <Screen title="Workspace members" subtitle="Shared visibility, individual ownership" right={<Pressable onPress={() => router.back()}><IconCircle name="close" /></Pressable>}>
    <Surface style={styles.hero}><View style={styles.people}>{leadMembers.map((member, index) => <View key={member.id} style={index ? styles.overlap : undefined}><Avatar initials={member.initials} size={60} color={index ? colors.blueWash : undefined} /></View>)}</View><AppText variant="h2">{memberNames}</AppText><AppText style={styles.muted}>Members see the same workspace. Accounts and transactions can still have an owner.</AppText></Surface>
    <View style={styles.section}><SectionHeader title="Members" /><Surface style={styles.members}>{members.map((member, index) => <View key={member.id} style={[styles.member, index > 0 && styles.borderTop]}><Avatar initials={member.initials} /><View style={styles.flex}><AppText variant="bodyMedium">{member.fullName}</AppText><AppText variant="caption" style={styles.muted}>{member.role}</AppText></View><Ionicons name="checkmark-circle" size={20} color={colors.mintDark} /></View>)}</Surface></View>
    <Button label="Add workspace member" variant="secondary" icon="person-add-outline" onPress={() => { setInviteError(null); setIsInviteOpen(true); }} />
    <Modal visible={isInviteOpen} transparent animationType="fade" onRequestClose={() => setIsInviteOpen(false)}>
      <View style={styles.modalBackdrop}><Surface style={styles.modalCard}><AppText variant="h3">Add a member</AppText><AppText style={styles.modalCopy}>They need to create a MoneyYap account first using this same email.</AppText><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="name@email.com" placeholderTextColor={colors.slate} style={styles.input} />{inviteError && <AppText style={styles.error}>{inviteError}</AppText>}<View style={styles.modalActions}><Button label="Cancel" variant="ghost" onPress={() => setIsInviteOpen(false)} /><Button label="Add member" loading={isInviting} disabled={!email.trim()} onPress={async () => { setIsInviting(true); setInviteError(null); try { await addWorkspaceMember(email); setEmail(''); setIsInviteOpen(false); } catch (error) { setInviteError(error instanceof Error ? error.message : 'Unable to add this member.'); } finally { setIsInviting(false); } }} /></View></Surface></View>
    </Modal>
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', padding: spacing.xxl, gap: spacing.md, backgroundColor: colors.mintWash, borderColor: colors.mintMist },
  people: { flexDirection: 'row', paddingRight: 12 },
  overlap: { marginLeft: -12 },
  muted: { color: colors.slate, textAlign: 'center' },
  section: { gap: spacing.md },
  members: { paddingHorizontal: spacing.lg },
  member: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  borderTop: { borderTopWidth: 1, borderTopColor: colors.border },
  flex: { flex: 1 },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: 'rgba(18, 25, 35, 0.42)' },
  modalCard: { padding: spacing.xl, gap: spacing.md },
  modalCopy: { color: colors.slate },
  input: { minHeight: 54, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, paddingHorizontal: spacing.lg, color: colors.ink, fontSize: 16 },
  error: { color: colors.danger },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
});
