import { CustomerRequest, CustomerRequestStatus } from '@/types';
import {
  createLocalId,
  enqueueMutations,
  readCachedRows,
  removeCachedRow,
  replaceCachedRows,
  updateCachedRow,
  upsertCachedRows,
} from '@/lib/offlineStore';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export interface CreateCustomerRequestParams {
  businessId: string;
  branchId?: string;
  itemName: string;
  customerName?: string;
  customerPhone?: string;
  quantityNeeded?: string;
  estimatedPrice?: number;
  notes?: string;
}

export async function fetchCustomerRequests(
  businessId: string,
  branchId?: string,
): Promise<CustomerRequest[]> {
  const scope = { businessId, branchId };
  const cached = await readCachedRows<CustomerRequest>(scope, 'customer_requests');

  try {
    let query = supabase
      .from('customer_requests')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (branchId) {
      query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }

    const { data, error } = await query;
    if (!error && data) {
      const serverRequests = data as CustomerRequest[];
      await replaceCachedRows(scope, 'customer_requests', serverRequests);
      return serverRequests;
    }
  } catch (err) {
    console.warn('[customerRequests] Supabase fetch fallback to cache:', err);
  }

  return (cached || []).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export async function createCustomerRequest(
  params: CreateCustomerRequestParams,
): Promise<CustomerRequest> {
  const scope = { businessId: params.businessId, branchId: params.branchId };
  const userId = useAuthStore.getState().user?.id;
  const userName =
    useAuthStore.getState().profile?.full_name ||
    useAuthStore.getState().user?.user_metadata?.full_name ||
    undefined;

  const now = new Date().toISOString();
  const newRequest: CustomerRequest = {
    id: createLocalId(),
    business_id: params.businessId,
    branch_id: params.branchId,
    item_name: params.itemName.trim(),
    customer_name: params.customerName?.trim() || undefined,
    customer_phone: params.customerPhone?.trim() || undefined,
    quantity_needed: params.quantityNeeded?.trim() || undefined,
    estimated_price: params.estimatedPrice,
    notes: params.notes?.trim() || undefined,
    status: 'pending',
    recorded_by: userId,
    recorded_by_name: userName,
    created_at: now,
    updated_at: now,
  };

  // 1. Immediately cache locally
  await upsertCachedRows(scope, 'customer_requests', [newRequest]);

  // 2. Sync to Supabase or queue offline mutation
  try {
    const { error } = await supabase.from('customer_requests').insert(newRequest);
    if (error) throw error;
  } catch (err) {
    await enqueueMutations([
      {
        operation: 'upsert',
        table: 'customer_requests',
        payload: newRequest,
        onConflict: 'id',
        description: `Add customer request for ${newRequest.item_name}`,
      },
    ]);
  }

  return newRequest;
}

export async function toggleCustomerRequestStatus(
  request: CustomerRequest,
  businessId: string,
  branchId?: string,
): Promise<CustomerRequestStatus> {
  const scope = { businessId, branchId };
  const nextStatus: CustomerRequestStatus = request.status === 'pending' ? 'bought' : 'pending';
  const now = new Date().toISOString();

  const patch: Partial<CustomerRequest> = {
    status: nextStatus,
    bought_at: nextStatus === 'bought' ? now : undefined,
    updated_at: now,
  };

  // 1. Update cache
  await updateCachedRow<CustomerRequest>(scope, 'customer_requests', request.id, patch);

  // 2. Sync to Supabase or queue offline mutation
  try {
    const { error } = await supabase
      .from('customer_requests')
      .update(patch)
      .eq('id', request.id);
    if (error) throw error;
  } catch (err) {
    await enqueueMutations([
      {
        operation: 'upsert',
        table: 'customer_requests',
        payload: { id: request.id, ...patch },
        onConflict: 'id',
        description: `Mark request "${request.item_name}" as ${nextStatus}`,
      },
    ]);
  }

  return nextStatus;
}

export async function deleteCustomerRequest(
  id: string,
  businessId: string,
  branchId?: string,
): Promise<void> {
  const scope = { businessId, branchId };

  // 1. Remove from cache
  await removeCachedRow(scope, 'customer_requests', id);

  // 2. Delete from Supabase
  try {
    const { error } = await supabase.from('customer_requests').delete().eq('id', id);
    if (error) throw error;
  } catch (err) {
    console.warn('[customerRequests] Supabase delete fallback:', err);
  }
}

export function formatWhatsAppUrl(
  phone: string,
  customerName: string | undefined,
  itemName: string,
  businessName: string,
): string {
  let cleanPhone = phone.replace(/[^0-9+]/g, '');
  if (cleanPhone.startsWith('+')) {
    cleanPhone = cleanPhone.slice(1);
  } else if (cleanPhone.startsWith('0')) {
    cleanPhone = `234${cleanPhone.slice(1)}`;
  }
  const greeting = customerName?.trim() ? `Hello ${customerName.trim()}` : 'Hello';
  const text = `${greeting}, the "${itemName.trim()}" you requested is now available at ${businessName}. You can stop by anytime to pick it up!`;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

export function formatTelUrl(phone: string): string {
  const cleanPhone = phone.replace(/[^0-9+]/g, '');
  return `tel:${cleanPhone}`;
}
