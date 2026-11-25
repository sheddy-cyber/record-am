import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { nowIso } from '@/lib/offlineStore';

const LOGO_BUCKET = 'business-logos';

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const byteLength = Math.floor((clean.length * 3) / 4) - padding;
  const buffer = new ArrayBuffer(Math.max(0, byteLength));
  const bytes = new Uint8Array(buffer);

  let byteIdx = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const e1 = BASE64_ALPHABET.indexOf(clean[i]);
    const e2 = BASE64_ALPHABET.indexOf(clean[i + 1]);
    const e3 = clean[i + 2] === '=' ? 0 : BASE64_ALPHABET.indexOf(clean[i + 2]);
    const e4 = clean[i + 3] === '=' ? 0 : BASE64_ALPHABET.indexOf(clean[i + 3]);

    const triple = (e1 << 18) | (e2 << 12) | (e3 << 6) | e4;
    if (byteIdx < bytes.length) bytes[byteIdx++] = (triple >> 16) & 0xff;
    if (byteIdx < bytes.length) bytes[byteIdx++] = (triple >> 8) & 0xff;
    if (byteIdx < bytes.length) bytes[byteIdx++] = triple & 0xff;
  }

  return buffer;
}

const resolveImageMimeAndExt = (asset: DocumentPicker.DocumentPickerAsset) => {
  const nameLower = (asset.name || '').toLowerCase();
  const mimeLower = (asset.mimeType || '').toLowerCase();

  if (mimeLower.includes('png') || nameLower.endsWith('.png')) {
    return { contentType: 'image/png', ext: 'png' };
  }
  if (mimeLower.includes('webp') || nameLower.endsWith('.webp')) {
    return { contentType: 'image/webp', ext: 'webp' };
  }
  if (mimeLower.includes('gif') || nameLower.endsWith('.gif')) {
    return { contentType: 'image/gif', ext: 'gif' };
  }
  return { contentType: 'image/jpeg', ext: 'jpg' };
};

const syncBusinessLogoLocally = (businessId: string, logoUrl: string | undefined) => {
  const auth = useAuthStore.getState();
  if (auth.currentBusiness && auth.currentBusiness.id === businessId) {
    auth.setCurrentBusiness({
      ...auth.currentBusiness,
      logo_url: logoUrl,
      updated_at: nowIso(),
    });
  }

  useBusinessStore.setState((state) => ({
    businesses: state.businesses.map((b) =>
      b.id === businessId ? { ...b, logo_url: logoUrl, updated_at: nowIso() } : b,
    ),
  }));
};

export async function pickAndUploadBusinessLogo(businessId: string): Promise<string | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (picked.canceled || !picked.assets?.length) {
    return null;
  }

  const asset = picked.assets[0];
  if (asset.size && asset.size > 5 * 1024 * 1024) {
    throw new Error('Please choose an image smaller than 5 MB.');
  }

  const { contentType, ext } = resolveImageMimeAndExt(asset);
  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const fileBuffer = base64ToArrayBuffer(base64);

  const storagePath = `${businessId}/logo-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message || 'Could not upload logo. Check your internet connection.');
  }

  const { data: publicUrlData } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(storagePath);
  const publicUrl = publicUrlData?.publicUrl;
  if (!publicUrl) {
    throw new Error('Logo uploaded, but no public URL was returned.');
  }

  const { error: updateError } = await supabase
    .from('businesses')
    .update({ logo_url: publicUrl, updated_at: nowIso() })
    .eq('id', businessId);

  if (updateError) {
    throw new Error(updateError.message || 'Logo uploaded, but saving to business profile failed.');
  }

  syncBusinessLogoLocally(businessId, publicUrl);
  return publicUrl;
}

export async function removeBusinessLogo(businessId: string): Promise<void> {
  const { error } = await supabase
    .from('businesses')
    .update({ logo_url: null, updated_at: nowIso() })
    .eq('id', businessId);

  if (error) {
    throw new Error(error.message || 'Could not remove business logo.');
  }

  syncBusinessLogoLocally(businessId, undefined);
}
