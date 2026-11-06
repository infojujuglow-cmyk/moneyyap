import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppText, Button, Chip } from '@/components/ui';
import { AccountVisualCard, ProviderMark } from '@/components/AccountVisualCard';
import { useAuth } from '@/context/AuthContext';
import { useFinance } from '@/context/FinanceContext';
import { colors, radii, spacing, typography } from '@/theme';
import { getErrorMessage } from '@/lib/errors';
import { accountProviders, defaultVisualType, providerForAccount, visualTypeLabel } from '@/lib/account-branding';
import type { Account, AccountType, AccountVisualType } from '@/types/finance';

const accountTypes: { value: AccountType; label: string }[] = [{ value: 'bank', label: 'Bank' }, { value: 'credit_card', label: 'Credit card' }, { value: 'ewallet', label: 'E-wallet' }, { value: 'cash', label: 'Cash' }, { value: 'other', label: 'Other' }];

export default function AddAccountScreen() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const { session } = useAuth();
  const { accounts, addAccount, updateAccount, members, spaces, selectedSpaceId, workspaceId, isLoading } = useFinance();
  const account = edit ? accounts.find((item) => item.id === edit) : undefined;
  const isEditing = Boolean(account);
  const [type, setType] = useState<AccountType>('bank');
  const [name, setName] = useState(account?.name ?? '');
  const [institution, setInstitution] = useState(account?.institution ?? '');
  const [providerKey, setProviderKey] = useState<string | null>(account?.providerKey ?? null);
  const [visualType, setVisualType] = useState<AccountVisualType>(account?.visualType ?? 'savings');
  const [accountLast4, setAccountLast4] = useState(account?.accountLast4 ?? '');
  const [creditLimit, setCreditLimit] = useState(account?.creditLimit == null ? '' : String(account.creditLimit));
  const [balance, setBalance] = useState(account ? String(Math.abs(account.openingBalance)) : '');
  const [ownerId, setOwnerId] = useState<string | null>(account ? account.ownerUserId : session?.user.id ?? null);
  const [spaceId, setSpaceId] = useState<string | null>(account?.spaceId ?? selectedSpaceId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!isLoading && !workspaceId) router.replace('/(auth)/household-setup');
  }, [isLoading, workspaceId]);
  useEffect(() => {
    if (!account) return;
    const frame = requestAnimationFrame(() => {
      setType(account.type); setName(account.name); setInstitution(account.institution ?? ''); setProviderKey(account.providerKey); setVisualType(account.visualType);
      setAccountLast4(account.accountLast4 ?? ''); setCreditLimit(account.creditLimit == null ? '' : String(account.creditLimit)); setBalance(String(Math.abs(account.openingBalance)));
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
      const normalizedLast4 = accountLast4.replace(/\D/g, '').slice(-4);
      const normalizedCreditLimit = type === 'credit_card' && creditLimit.trim() ? Math.max(0, Number(creditLimit.replace(/,/g, '')) || 0) : null;
      const provider = providerForAccount({ providerKey, institution, name });
      const changes = { name: name.trim(), type, visualType, institution: type === 'cash' ? null : institution.trim() || null, providerKey: type === 'cash' ? null : providerKey, accountLast4: type === 'cash' || normalizedLast4.length !== 4 ? null : normalizedLast4, creditLimit: normalizedCreditLimit, openingBalance, ownerUserId: ownerId, spaceId, accent: provider.colors[0] };
      if (account) {
        await updateAccount(account.id, changes);
      } else {
        await addAccount({ ...changes, currency: 'PHP', balance: openingBalance, isActive: true });
      }
      router.back();
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to add this account. Please try again.'));
    } finally { setSaving(false); }
  };
  const changeType = (nextType: AccountType) => {
    setType(nextType);
    setVisualType(defaultVisualType(nextType));
    if (nextType === 'cash') { setInstitution(''); setProviderKey(null); setAccountLast4(''); setCreditLimit(''); }
    if (nextType !== 'credit_card') setCreditLimit('');
  };
  const chooseProvider = (key: string) => {
    const provider = accountProviders.find((item) => item.key === key);
    if (!provider) return;
    setProviderKey(provider.key); setInstitution(provider.name);
  };
  const visualOptions: AccountVisualType[] = type === 'bank' ? ['debit', 'checking', 'savings'] : [defaultVisualType(type)];
  const walletProviderKeys = new Set(['maya', 'gcash']);
  const visibleProviders = type === 'ewallet'
    ? accountProviders.filter((provider) => walletProviderKeys.has(provider.key))
    : type === 'bank' || type === 'credit_card'
      ? accountProviders.filter((provider) => !walletProviderKeys.has(provider.key))
      : accountProviders;
  const previewProvider = providerForAccount({ providerKey, institution, name: name || 'New account' });
  const preview: Account = { id: account?.id ?? 'preview', name: name.trim() || 'Your account', type, visualType, institution: type === 'cash' ? null : institution.trim() || null, providerKey: type === 'cash' ? null : providerKey, accountLast4: accountLast4.length === 4 ? accountLast4 : null, creditLimit: type === 'credit_card' && creditLimit ? Number(creditLimit.replace(/,/g, '')) || null : null, currency: 'PHP', openingBalance: type === 'credit_card' ? -Math.abs(Number(balance.replace(/,/g, '')) || 0) : Number(balance.replace(/,/g, '')) || 0, balance: type === 'credit_card' ? -Math.abs(Number(balance.replace(/,/g, '')) || 0) : Number(balance.replace(/,/g, '')) || 0, ownerUserId: ownerId, spaceId, accent: previewProvider.colors[0], isActive: true };
  if (!workspaceId) return <View style={styles.screen} />;
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={styles.header}><Pressable onPress={() => router.back()} style={styles.close}><Ionicons name="close" size={23} color={colors.ink} /></Pressable><AppText variant="h3">{isEditing ? 'Edit account' : 'New account'}</AppText><View style={styles.close} /></View><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.preview}><AccountVisualCard account={preview} /></View>
    <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>ACCOUNT TYPE</AppText><View style={styles.wrap}>{accountTypes.map((item) => <Chip key={item.value} label={item.label} selected={type === item.value} onPress={() => changeType(item.value)} />)}</View></View>
    {type === 'bank' && <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>BANK ACCOUNT STYLE</AppText><View style={styles.wrap}>{visualOptions.map((item) => <Chip key={item} label={visualTypeLabel[item]} selected={visualType === item} onPress={() => setVisualType(item)} />)}</View></View>}
    <LabeledInput label="ACCOUNT NAME" value={name} onChangeText={setName} placeholder="e.g. BPI Savings" />
    {type !== 'cash' && <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>BANK OR PROVIDER</AppText><View style={styles.providerGrid}>{visibleProviders.map((provider) => <Pressable key={provider.key} onPress={() => chooseProvider(provider.key)} style={[styles.providerOption, providerKey === provider.key && styles.providerOptionSelected]}><ProviderMark account={{ providerKey: provider.key, institution: provider.name, name: provider.name }} compact /><AppText variant="caption" numberOfLines={1} style={styles.providerName}>{provider.name}</AppText></Pressable>)}</View><LabeledInput label="OTHER PROVIDER" value={institution} onChangeText={(value) => { setInstitution(value); if (value !== accountProviders.find((item) => item.key === providerKey)?.name) setProviderKey(null); }} placeholder="Enter a bank or provider" /></View>}
    {type !== 'cash' && <LabeledInput label="LAST 4 DIGITS · OPTIONAL" value={accountLast4} onChangeText={(value) => setAccountLast4(value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" keyboardType="number-pad" maxLength={4} />}
    {type === 'credit_card' && <LabeledInput label="CREDIT LIMIT · OPTIONAL" value={creditLimit} onChangeText={setCreditLimit} placeholder="0" keyboardType="decimal-pad" />}
    <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>{type === 'credit_card' ? (isEditing ? 'OPENING CARD BALANCE' : 'CURRENT CARD BALANCE') : 'OPENING BALANCE'}</AppText><View style={styles.balanceField}><AppText variant="h3" style={styles.peso}>₱</AppText><TextInput value={balance} onChangeText={setBalance} placeholder="0" placeholderTextColor={colors.slate} keyboardType="decimal-pad" style={styles.balanceInput} /></View></View>
    <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>WHO CAN SEE THIS ACCOUNT?</AppText><View style={styles.wrap}>{members.map((member) => <Chip key={member.id} label={member.id === session?.user.id ? `${member.fullName} (me)` : member.fullName} selected={ownerId === member.id} onPress={() => setOwnerId(member.id)} />)}<Chip label="Shared with workspace" selected={ownerId === null} onPress={() => setOwnerId(null)} /></View><AppText variant="caption" style={styles.muted}>Only the selected owner can see this account and its transactions. Shared accounts are visible to everyone in the workspace.</AppText></View>
    <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>SPACE · OPTIONAL</AppText><View style={styles.wrap}><Chip label="Any Space" selected={spaceId === null} onPress={() => setSpaceId(null)} />{spaces.filter((item) => !item.isArchived).map((space) => <Chip key={space.id} label={space.name} selected={spaceId === space.id} onPress={() => setSpaceId(space.id)} />)}</View></View>
    <View style={styles.note}><Ionicons name="information-circle-outline" size={20} color={colors.mintDeep} /><AppText style={styles.noteText}>{isEditing ? 'Changing the opening balance updates the current balance. Past transactions stay unchanged.' : type === 'credit_card' ? 'Card balances are treated as liabilities. Paying this card will not count as new spending.' : 'You can adjust this opening balance later.'}</AppText></View>
    {error && <AppText style={styles.error}>{error}</AppText>}
    <Button label={isEditing ? 'Save changes' : 'Add account'} icon={isEditing ? 'checkmark' : 'add'} loading={saving} disabled={!name.trim()} onPress={submit} />
  </ScrollView></KeyboardAvoidingView>;
}

function LabeledInput({ label, value, onChangeText, placeholder, keyboardType, maxLength }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default' | 'number-pad' | 'decimal-pad'; maxLength?: number }) { return <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>{label}</AppText><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.slate} keyboardType={keyboardType} maxLength={maxLength} style={styles.input} /></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.softWhite, paddingTop: Platform.OS === 'ios' ? 52 : 30 },
  header: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl, gap: spacing.xxl, paddingBottom: 60 },
  preview: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  field: { gap: spacing.md },
  label: { color: colors.slate },
  muted: { color: colors.slate },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  providerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  providerOption: { width: '48%', minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  providerOptionSelected: { backgroundColor: colors.mintWash, borderColor: colors.mintDark },
  providerName: { flex: 1, color: colors.slateDark },
  input: { minHeight: 54, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.lg, fontFamily: typography.regular, fontSize: 16, color: colors.ink },
  balanceField: { minHeight: 58, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.lg },
  peso: { color: colors.slate },
  balanceInput: { flex: 1, fontFamily: typography.semibold, fontSize: 22, color: colors.neutralAmount, paddingLeft: spacing.sm },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.mintWash, borderRadius: radii.md, padding: spacing.lg },
  noteText: { flex: 1, color: colors.mintDeep },
  error: { color: colors.danger },
});
