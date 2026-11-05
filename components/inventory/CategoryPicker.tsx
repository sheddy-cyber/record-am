import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import { BottomSheetModal } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { COLORS, FONT, RADIUS, SP } from '@/constants';
import { Category } from '@/types';

const SUGGESTED_CATEGORIES = [
  'Beverages',
  'Groceries',
  'Snacks',
  'Toiletries',
  'Cosmetics',
  'Electronics',
  'Clothing',
];

interface CategoryPickerProps {
  categoryId?: string | null;
  onSelectCategory?: (categoryId: string | null, category?: Category) => void;
  label?: string;
  required?: boolean;
  containerStyle?: ViewStyle;
}

export function CategoryPicker({
  categoryId,
  onSelectCategory,
  label = 'Product Category',
  required = false,
  containerStyle,
}: CategoryPickerProps) {
  const currentBusiness = useAuthStore((s) => s.currentBusiness);
  const categories = useBusinessStore((s) => s.categories);
  const createCategory = useBusinessStore((s) => s.createCategory);
  const products = useBusinessStore((s) => s.products);

  const [modalVisible, setModalVisible] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const selectedCategory = categories.find((c) => c.id === categoryId);

  const handleCreateNewCategory = async (nameToCreate?: string) => {
    const rawName = (nameToCreate ?? newCatName).trim();
    if (!rawName) {
      Toast.show({ type: 'error', text1: 'Please enter a category name' });
      return;
    }
    if (!currentBusiness?.id) return;

    // Check if category with this name already exists
    const existing = categories.find(
      (c) => c.name.trim().toLowerCase() === rawName.toLowerCase()
    );
    if (existing) {
      onSelectCategory?.(existing.id, existing);
      setNewCatName('');
      setModalVisible(false);
      return;
    }

    setIsCreating(true);
    try {
      const created = await createCategory({
        business_id: currentBusiness.id,
        name: rawName,
      });

      if (created) {
        onSelectCategory?.(created.id, created);
        setNewCatName('');
        setModalVisible(false);
        Toast.show({
          type: 'success',
          text1: 'Category created',
          text2: `Assigned to "${created.name}"`,
        });
      }
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Could not create category',
        text2: err?.message,
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleSelect = (cat: Category | null) => {
    if (cat) {
      onSelectCategory?.(cat.id, cat);
    } else {
      onSelectCategory?.(null, undefined);
    }
    setModalVisible(false);
  };

  return (
    <View style={containerStyle}>
      {label ? (
        <Text
          style={{
            fontSize: 13,
            fontFamily: FONT.medium,
            color: COLORS.text.primary,
            marginBottom: 6,
          }}
        >
          {label}
          {required ? <Text style={{ color: COLORS.danger }}> *</Text> : null}
        </Text>
      ) : null}

      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        activeOpacity={0.75}
        style={styles.pickerTrigger}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <View
            style={[
              styles.iconWrapper,
              selectedCategory && styles.iconWrapperActive,
            ]}
          >
            <Feather
              name={selectedCategory ? 'tag' : 'folder'}
              size={14}
              color={selectedCategory ? COLORS.navy : COLORS.text.muted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.selectedText,
                !selectedCategory && styles.selectedTextPlaceholder,
              ]}
              numberOfLines={1}
            >
              {selectedCategory ? selectedCategory.name : 'General (No Category)'}
            </Text>
          </View>
        </View>
        <Feather name="chevron-down" size={17} color={COLORS.text.muted} />
      </TouchableOpacity>

      {/* ── Category Selection Modal ──────────────────────────── */}
      <BottomSheetModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Select Category"
        subtitle="Organize items for browsing and inventory filtering"
        maxHeight="82%"
      >
        {/* Quick Create Input */}
        <View style={styles.createBox}>
          <Text style={styles.createBoxTitle}>CREATE NEW CATEGORY</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={newCatName}
              onChangeText={setNewCatName}
              placeholder="e.g. Beverages, Snacks..."
              placeholderTextColor={COLORS.text.muted}
              style={styles.createInput}
              onSubmitEditing={() => handleCreateNewCategory()}
              returnKeyType="done"
            />
            <TouchableOpacity
              onPress={() => handleCreateNewCategory()}
              disabled={!newCatName.trim() || isCreating}
              style={[
                styles.createBtn,
                (!newCatName.trim() || isCreating) && styles.createBtnDisabled,
              ]}
              activeOpacity={0.8}
            >
              <Text style={styles.createBtnText}>
                {isCreating ? 'Adding...' : '+ Add'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Category List */}
        <ScrollView
          style={{ maxHeight: 320 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
        >
          {/* Default General Option */}
          <TouchableOpacity
            onPress={() => handleSelect(null)}
            style={[
              styles.categoryRow,
              !categoryId && styles.categoryRowSelected,
            ]}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={styles.catIconContainer}>
                <Feather name="folder" size={15} color={COLORS.text.muted} />
              </View>
              <View>
                <Text
                  style={[
                    styles.catName,
                    !categoryId && styles.catNameSelected,
                  ]}
                >
                  General (No Category)
                </Text>
                <Text style={styles.catMeta}>Default for unassigned products</Text>
              </View>
            </View>
            {!categoryId ? (
              <Feather name="check" size={18} color={COLORS.navy} />
            ) : null}
          </TouchableOpacity>

          {/* Existing Categories */}
          {categories.map((cat) => {
            const isSelected = categoryId === cat.id;
            const prodCount = products.filter(
              (p) => p.category_id === cat.id
            ).length;

            return (
              <TouchableOpacity
                key={cat.id}
                onPress={() => handleSelect(cat)}
                style={[
                  styles.categoryRow,
                  isSelected && styles.categoryRowSelected,
                ]}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <View
                    style={[
                      styles.catIconContainer,
                      isSelected && styles.catIconContainerSelected,
                    ]}
                  >
                    <Feather
                      name="tag"
                      size={15}
                      color={isSelected ? COLORS.navy : COLORS.text.secondary}
                    />
                  </View>
                  <View>
                    <Text
                      style={[
                        styles.catName,
                        isSelected && styles.catNameSelected,
                      ]}
                    >
                      {cat.name}
                    </Text>
                    <Text style={styles.catMeta}>
                      {prodCount} item{prodCount === 1 ? '' : 's'} in inventory
                    </Text>
                  </View>
                </View>
                {isSelected ? (
                  <Feather name="check" size={18} color={COLORS.navy} />
                ) : null}
              </TouchableOpacity>
            );
          })}

          {/* Suggestions when list is small */}
          {categories.length < 3 && (
            <View style={styles.suggestionsContainer}>
              <Text style={styles.suggestionsTitle}>QUICK SUGGESTIONS</Text>
              <View style={styles.chipsRow}>
                {SUGGESTED_CATEGORIES.filter(
                  (s) => !categories.some((c) => c.name.toLowerCase() === s.toLowerCase())
                ).map((suggestion) => (
                  <TouchableOpacity
                    key={suggestion}
                    onPress={() => handleCreateNewCategory(suggestion)}
                    style={styles.suggestionChip}
                    activeOpacity={0.7}
                  >
                    <Feather name="plus" size={11} color={COLORS.navy} />
                    <Text style={styles.suggestionChipText}>{suggestion}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  pickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    minHeight: 50,
    backgroundColor: COLORS.card,
  },
  iconWrapper: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapperActive: {
    backgroundColor: 'rgba(0, 78, 137, 0.1)',
  },
  selectedText: {
    fontSize: 14.5,
    fontFamily: FONT.medium,
    color: COLORS.text.primary,
  },
  selectedTextPlaceholder: {
    color: COLORS.text.muted,
    fontFamily: FONT.regular,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '82%',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    paddingBottom: 28,
    gap: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 6,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    letterSpacing: -0.2,
  },
  modalSubtitle: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
    marginTop: 2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBox: {
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.lg,
    padding: 12,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  createBoxTitle: {
    fontSize: 10,
    fontFamily: FONT.bold,
    color: COLORS.text.muted,
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  createInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    fontSize: 13.5,
    fontFamily: FONT.regular,
    color: COLORS.text.primary,
  },
  createBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnDisabled: {
    opacity: 0.5,
  },
  createBtnText: {
    fontSize: 12.5,
    fontFamily: FONT.bold,
    color: '#FFFFFF',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    marginBottom: 4,
  },
  categoryRowSelected: {
    backgroundColor: 'rgba(0, 78, 137, 0.07)',
  },
  catIconContainer: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catIconContainerSelected: {
    backgroundColor: 'rgba(0, 78, 137, 0.12)',
  },
  catName: {
    fontSize: 14,
    fontFamily: FONT.medium,
    color: COLORS.text.primary,
  },
  catNameSelected: {
    fontFamily: FONT.bold,
    color: COLORS.navy,
  },
  catMeta: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
    marginTop: 1,
  },
  suggestionsContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderSubtle,
    gap: 8,
  },
  suggestionsTitle: {
    fontSize: 10,
    fontFamily: FONT.bold,
    color: COLORS.text.muted,
    letterSpacing: 0.5,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  suggestionChipText: {
    fontSize: 11.5,
    fontFamily: FONT.medium,
    color: COLORS.navy,
  },
});
