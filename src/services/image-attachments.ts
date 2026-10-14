import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { TransactionImageAttachment } from '@/types/finance';

const MAX_LONG_EDGE = 1_800;
const MAX_BASE64_CHARACTERS = 6_000_000;

export type TransactionImageSource = 'camera' | 'library';

export async function pickTransactionImage(source: TransactionImageSource): Promise<TransactionImageAttachment | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Camera access is needed to photograph a receipt. You can enable it in iPhone Settings.');
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: false,
    allowsMultipleSelection: false,
    quality: 0.9,
  };
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const longEdge = Math.max(asset.width, asset.height);
  const context = ImageManipulator.manipulate(asset.uri);
  if (longEdge > MAX_LONG_EDGE) {
    if (asset.width >= asset.height) context.resize({ width: MAX_LONG_EDGE, height: null });
    else context.resize({ width: null, height: MAX_LONG_EDGE });
  }
  const rendered = await context.renderAsync();
  const optimized = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.84, base64: true });
  if (!optimized.base64) throw new Error('MoneyYap could not prepare that image. Please try a screenshot or JPEG.');
  if (optimized.base64.length > MAX_BASE64_CHARACTERS) throw new Error('That image is still too large. Crop it to the transaction details and try again.');

  return {
    uri: optimized.uri,
    base64: optimized.base64,
    mimeType: 'image/jpeg',
    width: optimized.width,
    height: optimized.height,
    fileName: asset.fileName ?? null,
  };
}
