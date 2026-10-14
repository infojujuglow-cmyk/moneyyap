import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.softWhite }, animation: 'slide_from_right' }} />;
}
