// ============================================================
// RECORD AM - Shared pieces for the Excel / CSV import screens
// ============================================================

import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/icons';
import { COLORS, FONT } from '@/constants';

/** Numbered step heading: "1  Start from the template". */
export function ImportStep({ number, title, detail }: { number: number; title: string; detail?: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{number}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.stepTitle}>{title}</Text>
        {detail ? <Text style={styles.stepDetail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

/** Dashed tap target for choosing a spreadsheet. */
export function FilePickerBox({
  fileName,
  busy,
  disabled,
  onPress,
  hint,
}: {
  fileName?: string | null;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
  hint?: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.drop, fileName && styles.dropDone, pressed && { opacity: 0.75 }]}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={fileName ? `Selected ${fileName}. Choose a different file` : 'Choose a file'}
    >
      {busy ? (
        <>
          <ActivityIndicator color={COLORS.text.muted} />
          <Text style={styles.dropText}>Reading your file…</Text>
        </>
      ) : (
        <>
          <Icon name={fileName ? 'check-circle' : 'upload-cloud'} size={26} color={fileName ? COLORS.success : COLORS.text.muted} />
          <Text style={styles.dropTitle} numberOfLines={1}>
            {fileName || 'Tap to choose a file'}
          </Text>
          <Text style={styles.dropText}>{fileName ? 'Tap to choose a different file' : hint ?? 'From your phone, Google Drive or WhatsApp'}</Text>
        </>
      )}
    </Pressable>
  );
}

export const importStyles = StyleSheet.create({
  group: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  rowTitle: { fontSize: 15, fontFamily: FONT.medium, color: COLORS.text.primary, flexShrink: 1 },
  rowMeta: { fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2 },
  rowAmount: { fontSize: 15, fontFamily: FONT.semiBold, color: COLORS.text.primary, fontVariant: ['tabular-nums'] },
  more: { fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.muted, textAlign: 'center', marginTop: 10 },
  errors: { marginTop: 14, padding: 14, borderRadius: 16, backgroundColor: COLORS.dangerLight, gap: 4 },
  errorsTitle: { fontSize: 14, fontFamily: FONT.semiBold, color: COLORS.dangerText, marginBottom: 2 },
  errorsText: { fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.dangerText, lineHeight: 18 },
  done: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, padding: 14, borderRadius: 16, backgroundColor: COLORS.successLight },
  doneText: { flex: 1, fontSize: 14, fontFamily: FONT.medium, color: COLORS.successText, lineHeight: 19 },
});

const styles = StyleSheet.create({
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 26, marginBottom: 12 },
  stepNumber: { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.ink, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumberText: { fontSize: 13, fontFamily: FONT.semiBold, color: '#FFFFFF' },
  stepTitle: { fontSize: 17, fontFamily: FONT.semiBold, color: COLORS.text.primary, letterSpacing: -0.3 },
  stepDetail: { fontSize: 13.5, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2, lineHeight: 19 },
  drop: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.borderDark,
    borderRadius: 18,
    paddingVertical: 26,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.card,
  },
  dropDone: { borderStyle: 'solid', borderColor: COLORS.border },
  dropTitle: { fontSize: 15, fontFamily: FONT.semiBold, color: COLORS.text.primary, textAlign: 'center' },
  dropText: { fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.muted, textAlign: 'center' },
});
