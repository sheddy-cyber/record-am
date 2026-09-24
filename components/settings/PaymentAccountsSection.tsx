import React, { useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Badge, Button, Card, SectionHeader } from '@/components/ui';
import { COLORS, FONT, RADIUS } from '@/constants';
import { PaymentAccount, PaymentAccountChannel } from '@/types';
import { usePaymentAccountStore } from '@/store/paymentAccountStore';
import { PaymentAccountModal } from './PaymentAccountModal';

interface PaymentAccountsSectionProps {
  businessId: string;
}

export const PaymentAccountsSection: React.FC<PaymentAccountsSectionProps> = ({ businessId }) => {
  const { accounts, createAccount, deleteAccount } = usePaymentAccountStore();
  const [modalVisible, setModalVisible] = useState(false);

  const handleCreate = async (params: {
    name: string;
    accountNumber?: string;
    channel: PaymentAccountChannel;
  }) => {
    await createAccount({
      businessId,
      name: params.name,
      accountNumber: params.accountNumber,
      channel: params.channel,
    });
  };

  const handleDelete = (account: PaymentAccount) => {
    Alert.alert(
      'Remove Account',
      `Are you sure you want to remove "${account.name}"? Past transactions recorded with this account will remain intact.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await deleteAccount(account.id);
          },
        },
      ]
    );
  };

  const getChannelBadge = (channel: PaymentAccountChannel) => {
    switch (channel) {
      case 'transfer':
        return <Badge label="Transfer" variant="info" />;
      case 'pos':
        return <Badge label="POS / Card" variant="warning" />;
      case 'both':
      default:
        return <Badge label="Transfer & POS" variant="success" />;
    }
  };

  return (
    <Card>
      <View style={{ marginBottom: 12 }}>
        <SectionHeader title="Bank Accounts & POS Terminals" />
        <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: -4 }}>
          Save the accounts and POS terminals you use to receive payments.
        </Text>
      </View>

      {accounts.length > 0 ? (
        <View style={{ gap: 8, marginTop: 4, marginBottom: 12 }}>
          {accounts.map((acc) => (
            <View
              key={acc.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 12,
                backgroundColor: COLORS.surface,
                borderRadius: RADIUS.md,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: acc.channel === 'pos' ? '#FFF4E5' : '#EBF3FB',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather
                    name={acc.channel === 'pos' ? 'credit-card' : 'send'}
                    size={16}
                    color={acc.channel === 'pos' ? COLORS.warning : COLORS.accent}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                    {acc.name}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                    {getChannelBadge(acc.channel)}
                    {acc.account_number ? (
                      <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted }}>
                        Acc: {acc.account_number}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => handleDelete(acc)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ padding: 4 }}
              >
                <Feather name="trash-2" size={16} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <View
          style={{
            padding: 16,
            borderRadius: RADIUS.md,
            backgroundColor: COLORS.surface,
            borderWidth: 1,
            borderColor: COLORS.border,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginVertical: 10,
          }}
        >
          <Feather name="credit-card" size={24} color={COLORS.text.muted} />
          <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary, textAlign: 'center' }}>
            No bank accounts or POS terminals added yet.
          </Text>
          <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted, textAlign: 'center' }}>
            Add your accounts so cashiers can select them when customers pay by transfer or POS.
          </Text>
        </View>
      )}

      <Button
        title="+ Add Bank or POS Account"
        onPress={() => setModalVisible(true)}
        variant="secondary"
        size="md"
      />

      <PaymentAccountModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleCreate}
      />
    </Card>
  );
};
