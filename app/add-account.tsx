import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppText, Button, Chip } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { colors, radii, spacing, typography } from '@/theme';
import type { AccountType } from '@/types/finance';
import { getErrorMessage } from '@/lib/errors';

const accountTypes: { value: AccountType; label: string }[] = [{ value: 'bank', label: 'Bank' }, { value: 'credit_card', label: 'Credit card' }, { value: 'ewallet', label: 'E-wallet' }, { value: 'cash', label: 'Cash' }, { value: 'other', label: 'Other' }];

export default function AddAccountScreen() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const { accounts, addAccount, updateAccount, members, spaces, selectedSpaceId, workspaceId, isLoading } = useFinance();
  const account = edit ? accounts.find((item) => item.id === edit) : undefined;
  const isEditing = Boolean(account);
  const [type, setType] = useState<AccountType>('bank');
  const [name, setName] = useState(account?.name ?? '');
  const [institution, setInstitution] = useState(account?.institution ?? '');
  const [balance, setBalance] = useState(account ? String(Math.abs(account.openingBalance)) : '');
  const [ownerId, setOwnerId] = useState<string | null>(account?.ownerUserId ?? members[0]?.id ?? null);
  const [spaceId, setSpaceId] = useState<string | null>(account?.spaceId ?? selectedSpaceId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!isLoading && !workspaceId) router.replace('/(auth)/household-setup');
  }, [isLoading, workspaceId]);
  useEffect(() => {
    if (!account) return;
    const frame = requestAnimationFrame(() => {
      setType(account.type); setName(account.name); setInstitution(account.institution ?? ''); setBalance(String(Math.abs(account.openingBalance)));
      setOwnerId(account.ownerUserId); setSpaceId(account.spaceId);
    });
    return () => cancelAnimationFrame(frame);
  }, [account]);
  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true); setError(null);
    try {
      const enteredBalance = Number(balance.replace(/,/g, '')) || 0;
      const openingBalance = type === 'credit_card' ? -Math.abs(enteredBalance) : enteredBalance;
      if (account) {
        await updateAccount(account.id, { name: name.trim(), type, institution: type === 'cash' ? null : institution.trim() || null, openingBalance, ownerUserId: ownerId, spaceId, accent: type === 'credit_card' ? '#182A5A' : colors.mintDark });
      } else {
        await addAccount({ name: name.trim(), type, institution: institution.trim() || null, currency: 'PHP', openingBalance, balance: openingBalance, ownerUserId: ownerId, spaceId, accent: type === 'credit_card' ? '#182A5A' : colors.mintDark, isActive: true });
      }
      router.back();
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to add this account. Please try again.'));
    } finally { setSaving(false); }
  };
  if (!workspaceId) return <View style={styles.screen} />;
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={styles.header}><Pressable onPress={() => router.back()} style={styles.close}><Ionicons name="close" size={23} color={colors.ink} /></Pressable><AppText variant="h3">{isEditing ? 'Edit account' : 'New account'}</AppText><View style={styles.close} /></View><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>ACCOUNT TYPE</AppText><View style={styles.wrap}>{accountTypes.map((item) => <Chip key={item.value} label={item.label} selected={type === item.value} onPress={() => setType(item.value)} />)}</View></View>
    <LabeledInput label="ACCOUNT NAME" value={name} onChangeText={setName} placeholder="e.g. BPI Savings" />
    {type !== 'cash' && <LabeledInput label="INSTITUTION" value={institution} onChangeText={setInstitution} placeholder="e.g. BPI" />}
    <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>{type === 'credit_card' ? (isEditing ? 'OPENING CARD BALANCE' : 'CURRENT CARD BALANCE') : 'OPENING BALANCE'}</AppText><View style={styles.balanceField}><AppText variant="h3" style={styles.peso}>₱</AppText><TextInput value={balance} onChangeText={setBalance} placeholder="0" placeholderTextColor={colors.slate} keyboardType="decimal-pad" style={styles.balanceInput} /></View></View>
    <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>OWNER</AppText><View style={styles.wrap}>{members.map((member) => <Chip key={member.id} label={member.fullName} selected={ownerId === member.id} onPress={() => setOwnerId(member.id)} />)}<Chip label="Shared" selected={ownerId === null} onPress={() => setOwnerId(null)} /></View></View>
    <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>SPACE · OPTIONAL</AppText><View style={styles.wrap}><Chip label="Any Space" selected={spaceId === null} onPress={() => setSpaceId(null)} />{spaces.filter((item) => !item.isArchived).map((space) => <Chip key={space.id} label={space.name} selected={spaceId === space.id} onPress={() => setSpaceId(space.id)} />)}</View></View>
    <View style={styles.note}><Ionicons name="information-circle-outline" size={20} color={colors.mintDeep} /><AppText style={styles.noteText}>{isEditing ? 'Changing the opening balance updates the current balance. Past transactions stay unchanged.' : type === 'credit_card' ? 'Card balances are treated as liabilities. Paying this card will not count as new spending.' : 'You can adjust this opening balance later.'}</AppText></View>
    {error && <AppText style={styles.error}>{error}</AppText>}
    <Button label={isEditing ? 'Save changes' : 'Add account'} icon={isEditing ? 'checkmark' : 'add'} loading={saving} disabled={!name.trim()} onPress={submit} />
  </ScrollView></KeyboardAvoidingView>;
}

function LabeledInput({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string }) { return <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>{label}</AppText><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.slate} style={styles.input} /></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.softWhite, paddingTop: Platform.OS === 'ios' ? 52 : 30 },
  header: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl, gap: spacing.xxl, paddingBottom: 60 },
  field: { gap: spacing.md },
  label: { color: colors.slate },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  input: { minHeight: 54, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.lg, fontFamily: typography.regular, fontSize: 16, color: colors.ink },
  balanceField: { minHeight: 58, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.lg },
  peso: { color: colors.slate },
  balanceInput: { flex: 1, fontFamily: typography.semibold, fontSize: 22, color: colors.ink, paddingLeft: spacing.sm },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.mintWash, borderRadius: radii.md, padding: spacing.lg },
  noteText: { flex: 1, color: colors.mintDeep },
  error: { color: colors.danger },
});
