import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Vibration,
  Platform,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SP } from '@/constants';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SCAN_AREA_SIZE = Math.min(SCREEN_WIDTH * 0.75, 280);

export interface ScanFeedback {
  message: string;
  type?: 'success' | 'error' | 'info';
}

interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
  subtitle?: string;
  keepOpenOnScan?: boolean;
  doneButtonLabel?: string;
  scanFeedback?: ScanFeedback | null;
}

export function BarcodeScannerModal({
  visible,
  onClose,
  onScan,
  title = 'Scan Barcode or QR Code',
  subtitle = 'Position the code within the frame to scan',
  keepOpenOnScan = false,
  doneButtonLabel,
  scanFeedback,
}: BarcodeScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [isScanned, setIsScanned] = useState(false);
  const scanTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (visible) {
      setIsScanned(false);
      setManualCode('');
      setShowManualInput(false);
      setTorch(false);
    } else {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    }
  }, [visible]);

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (isScanned) return;

    const data = result.data?.trim();
    if (!data) return;

    setIsScanned(true);

    try {
      Vibration.vibrate(80);
    } catch (_) {}

    onScan(data);
    if (!keepOpenOnScan) {
      onClose();
    }

    // Prevent immediate re-trigger
    scanTimeoutRef.current = setTimeout(() => {
      setIsScanned(false);
    }, 1200);
  };

  const handleManualSubmit = () => {
    const trimmed = manualCode.trim();
    if (!trimmed) return;
    try {
      Vibration.vibrate(50);
    } catch (_) {}
    onScan(trimmed);
    setManualCode('');
    setShowManualInput(false);
    if (!keepOpenOnScan) {
      onClose();
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Permission Check */}
        {!permission?.granted ? (
          <View style={styles.permissionContainer}>
            <View style={styles.permissionIconCircle}>
              <Feather name="camera" size={36} color={COLORS.ink} />
            </View>
            <Text style={styles.permissionTitle}>Camera Access Required</Text>
            <Text style={styles.permissionSubtitle}>
              Record Am needs camera permission to scan barcodes and QR codes for quick stock recording.
            </Text>
            <TouchableOpacity
              style={styles.permissionButton}
              activeOpacity={0.8}
              onPress={requestPermission}
            >
              <Text style={styles.permissionButtonText}>Allow Camera Access</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={StyleSheet.absoluteFill}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{
                barcodeTypes: [
                  'qr',
                  'ean13',
                  'ean8',
                  'upc_a',
                  'upc_e',
                  'code128',
                  'code39',
                  'code93',
                  'itf14',
                  'codabar',
                  'aztec',
                  'datamatrix',
                  'pdf417',
                ],
              }}
              onBarcodeScanned={isScanned ? undefined : handleBarcodeScanned}
            />

            {/* Dark Mask Overlay around Scan Area */}
            <View style={styles.overlayTop}>
              <View style={styles.headerRow}>
                <TouchableOpacity
                  style={styles.iconCircleButton}
                  onPress={onClose}
                  activeOpacity={0.7}
                >
                  <Feather name="x" size={22} color="#FFFFFF" />
                </TouchableOpacity>

                <View style={styles.headerCenter}>
                  <Text style={styles.headerTitle}>{title}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.iconCircleButton, torch && styles.iconCircleActive]}
                  onPress={() => setTorch((prev) => !prev)}
                  activeOpacity={0.7}
                >
                  <Feather name={torch ? 'zap' : 'zap-off'} size={20} color={torch ? COLORS.onAccent : '#FFFFFF'} />
                </TouchableOpacity>
              </View>
              <Text style={styles.overlaySubtitle}>{subtitle}</Text>
              {scanFeedback ? (
                <View
                  style={[
                    styles.feedbackBanner,
                    scanFeedback.type === 'error'
                      ? styles.feedbackBannerError
                      : scanFeedback.type === 'info'
                      ? styles.feedbackBannerInfo
                      : styles.feedbackBannerSuccess,
                  ]}
                >
                  <Feather
                    name={
                      scanFeedback.type === 'error'
                        ? 'alert-circle'
                        : scanFeedback.type === 'info'
                        ? 'info'
                        : 'check-circle'
                    }
                    size={16}
                    color="#FFFFFF"
                  />
                  <Text style={styles.feedbackBannerText} numberOfLines={2}>
                    {scanFeedback.message}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.overlayMiddle}>
              <View style={styles.overlaySide} />
              {/* Center Viewfinder */}
              <View style={styles.viewFinder}>
                {/* Viewfinder Corners */}
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />

                {isScanned ? (
                  <View style={styles.scannedIndicator}>
                    <ActivityIndicator size="small" color={COLORS.accent} />
                    <Text style={styles.scannedText}>Processing...</Text>
                  </View>
                ) : (
                  <View style={styles.reticleLine} />
                )}
              </View>
              <View style={styles.overlaySide} />
            </View>

            <View style={styles.overlayBottom}>
              {keepOpenOnScan ? (
                <TouchableOpacity
                  style={styles.doneScanButton}
                  onPress={onClose}
                  activeOpacity={0.8}
                >
                  <Feather name="check" size={18} color={COLORS.ink} />
                  <Text style={styles.doneScanButtonText}>
                    {doneButtonLabel || 'Done Scanning'}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {showManualInput ? (
                <View style={styles.manualInputWrapper}>
                  <TextInput
                    value={manualCode}
                    onChangeText={setManualCode}
                    placeholder="Type or paste barcode..."
                    placeholderTextColor="#94a3b8"
                    keyboardType="default"
                    autoFocus
                    style={styles.manualTextInput}
                  />
                  <TouchableOpacity
                    style={styles.manualDoneButton}
                    onPress={handleManualSubmit}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.manualDoneButtonText}>Use</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.manualCancelButton}
                    onPress={() => setShowManualInput(false)}
                  >
                    <Feather name="x" size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.manualPromptButton}
                  onPress={() => setShowManualInput(true)}
                  activeOpacity={0.75}
                >
                  <Feather name="edit-3" size={16} color="#FFFFFF" />
                  <Text style={styles.manualPromptText}>Can't scan? Type code manually</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SP.page,
    backgroundColor: COLORS.surface,
  },
  permissionIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0, 78, 137, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  permissionTitle: {
    fontSize: 20,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    marginBottom: 10,
    textAlign: 'center',
  },
  permissionSubtitle: {
    fontSize: 14,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  permissionButton: {
    backgroundColor: COLORS.ink,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: RADIUS.md,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontFamily: FONT.semiBold,
    fontSize: 15,
  },
  cancelButton: {
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: COLORS.text.muted,
    fontFamily: FONT.medium,
    fontSize: 14,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingTop: Platform.OS === 'ios' ? 54 : 36,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: FONT.bold,
    textAlign: 'center',
  },
  overlaySubtitle: {
    color: '#cbd5e1',
    fontSize: 13,
    fontFamily: FONT.regular,
    textAlign: 'center',
    marginTop: 4,
  },
  iconCircleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircleActive: {
    backgroundColor: COLORS.accent,
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: SCAN_AREA_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  viewFinder: {
    width: SCAN_AREA_SIZE,
    height: SCAN_AREA_SIZE,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: COLORS.accent,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 14,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 14,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 14,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 14,
  },
  reticleLine: {
    width: '80%',
    height: 2,
    backgroundColor: COLORS.accent,
    opacity: 0.8,
  },
  scannedIndicator: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scannedText: {
    color: '#FFFFFF',
    fontFamily: FONT.medium,
    fontSize: 13,
  },
  overlayBottom: {
    flex: 1.2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 30,
    paddingHorizontal: 20,
  },
  manualPromptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  manualPromptText: {
    color: '#FFFFFF',
    fontFamily: FONT.medium,
    fontSize: 13,
  },
  manualInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.accent,
    gap: 8,
  },
  manualTextInput: {
    flex: 1,
    color: '#FFFFFF',
    fontFamily: FONT.regular,
    fontSize: 14,
    paddingVertical: 8,
  },
  manualDoneButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
  },
  manualDoneButtonText: {
    color: COLORS.ink,
    fontFamily: FONT.bold,
    fontSize: 13,
  },
  manualCancelButton: {
    padding: 6,
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: RADIUS.full,
    marginTop: 10,
    maxWidth: '92%',
  },
  feedbackBannerSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.94)',
  },
  feedbackBannerError: {
    backgroundColor: 'rgba(239, 68, 68, 0.94)',
  },
  feedbackBannerInfo: {
    backgroundColor: 'rgba(2, 132, 199, 0.94)',
  },
  feedbackBannerText: {
    color: '#FFFFFF',
    fontFamily: FONT.semiBold,
    fontSize: 13,
    textAlign: 'center',
  },
  doneScanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: RADIUS.full,
    marginBottom: 16,
    minWidth: 220,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  doneScanButtonText: {
    color: COLORS.ink,
    fontFamily: FONT.bold,
    fontSize: 14.5,
  },
});
