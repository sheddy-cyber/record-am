import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { Business, Branch, Category, Product, StockAlertSummary, BusinessMember, UserProfile, UserRole } from '@/types';
import {
  cacheProducts,
  createLocalId,
  enqueueMutations,
  nowIso,
  readCachedProducts,
  upsertCachedProducts,
} from '@/lib/offlineStore';
import { hasArrayChanged } from '@/lib/storeUtils';

const getBranchStock = (product: Product, branchId: string) =>
  product.inventory?.find((item) => item.branch_id === branchId)?.quantity ?? 0;

const stripProductForWrite = (product: Product) => {
  const { category, inventory, ...payload } = product;
  return payload;
};

/**
 * Cost price is commercial data. Never retain it in a cashier-visible store or
 * offline cache: UI hiding alone would leave it readable from Zustand/SQLite.
 */
const maskProductCosts = (products: Product[]): Product[] =>
  products.map((product) => ({ ...product, cost_price: 0 }));

const fetchTrackedProducts = async (businessId: string, includeCosts = true) => {
  try {
    const productSource = includeCosts ? 'products' : 'staff_products';
    const { data, error } = await supabase
      .from(productSource)
      .select(`
        *,
        inventory(quantity, branch_id)
      `)
      .eq('business_id', businessId)
      .eq('is_service', false)
      .eq('is_active', true);

    if (error) throw error;

    const allProducts = (includeCosts ? (data ?? []) : maskProductCosts((data ?? []) as Product[])) as Product[];
    const activeProducts = allProducts.filter(p => p.is_active);
    await cacheProducts(businessId, activeProducts);
    return activeProducts;
  } catch {
    const cachedProducts = includeCosts
      ? await readCachedProducts(businessId)
      : maskProductCosts(await readCachedProducts(businessId));
    return cachedProducts.filter((product) => product.is_active && !product.is_service);
  }
};

interface BusinessState {
  businesses: Business[];
  branches: Branch[];
  categories: Category[];
  products: Product[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchBusinesses: (userId: string) => Promise<void>;
  fetchBranches: (businessId: string) => Promise<void>;
  hydrateCache: (businessId: string, includeCosts?: boolean) => Promise<void>;
  fetchCategories: (businessId: string) => Promise<void>;
  fetchProducts: (businessId: string, includeCosts?: boolean) => Promise<void>;
  createBusiness: (data: Partial<Business>, userId: string) => Promise<Business | null>;
  fetchTeamMembers: (businessId: string) => Promise<(BusinessMember & { user_profiles: UserProfile })[]>;
  updateTeamMemberRole: (memberId: string, role: UserRole) => Promise<void>;
  updateTeamMemberProfile: (userId: string, fullName: string, phone: string) => Promise<void>;
  removeTeamMember: (memberId: string) => Promise<void>;
  transferOwnership: (businessId: string, newOwnerUserId: string) => Promise<void>;
  updateBusiness: (id: string, data: Partial<Business>) => Promise<void>;
  createCategory: (data: Partial<Category>) => Promise<Category | null>;
  createProduct: (data: Partial<Product>) => Promise<Product | null>;
  deleteProduct: (id: string) => Promise<void>;
  updateProduct: (id: string, data: Partial<Product>) => Promise<void>;
  getLowStockProducts: (businessId: string, branchId: string, includeCosts?: boolean) => Promise<Product[]>;
  getStockAlerts: (businessId: string, branchId: string, includeCosts?: boolean) => Promise<StockAlertSummary>;
  reset: () => void;
}

export const useBusinessStore = create<BusinessState>((set, get) => ({
  businesses: [],
  branches: [],
  categories: [],
  products: [],
  isLoading: false,
  error: null,

  fetchBusinesses: async (userId) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('business_members')
        .select('businesses(*)')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) throw error;
      const businesses = data?.map((d: any) => d.businesses).filter(Boolean) ?? [];
      set({ businesses });
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchBranches: async (businessId) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('business_id', businessId)
        .order('is_main', { ascending: false });

      if (error) throw error;
      set({ branches: data ?? [] });
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchCategories: async (businessId) => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('business_id', businessId)
        .order('name');

      if (error) throw error;
      set({ categories: data ?? [] });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  hydrateCache: async (businessId, includeCosts = true) => {
    try {
      const cachedProducts = includeCosts
        ? await readCachedProducts(businessId)
        : maskProductCosts(await readCachedProducts(businessId));
      if (cachedProducts.length > 0) {
        if (hasArrayChanged(get().products, cachedProducts)) {
          set({ products: cachedProducts });
        }
      }
      if (!includeCosts) {
        await cacheProducts(businessId, cachedProducts);
      }
    } catch {}
  },

  fetchProducts: async (businessId, includeCosts = true) => {
    try {
      const cachedProducts = includeCosts
        ? await readCachedProducts(businessId)
        : maskProductCosts(await readCachedProducts(businessId));
      if (cachedProducts.length > 0) {
        if (hasArrayChanged(get().products, cachedProducts)) {
          set({ products: cachedProducts });
        }
      }
    } catch {}

    const currentProducts = get().products;
    if (currentProducts.length === 0) set({ isLoading: true });

    try {
      const productQuery = includeCosts
        ? supabase
            .from('products')
            .select(`
              *,
              category:categories(*),
              inventory(*)
            `)
            .eq('is_active', true)
        : supabase.from('staff_products').select('*').eq('is_active', true);
      const { data, error } = await productQuery
        .eq('business_id', businessId)
        .order('name');

      if (error) throw error;
      let serverProducts = (data ?? []) as Product[];

      if (!includeCosts && serverProducts.length > 0) {
        const [{ data: inventory, error: inventoryError }, { data: categories, error: categoriesError }] = await Promise.all([
          supabase.from('inventory').select('*').in('product_id', serverProducts.map((product) => product.id)),
          supabase.from('categories').select('*').eq('business_id', businessId),
        ]);
        if (inventoryError) throw inventoryError;
        if (categoriesError) throw categoriesError;

        const inventoryByProduct = new Map<string, Product['inventory']>();
        for (const item of inventory ?? []) {
          const productInventory = inventoryByProduct.get(item.product_id) ?? [];
          productInventory.push(item);
          inventoryByProduct.set(item.product_id, productInventory);
        }
        const categoryById = new Map((categories ?? []).map((category) => [category.id, category]));
        serverProducts = serverProducts.map((product) => ({
          ...product,
          cost_price: 0,
          inventory: inventoryByProduct.get(product.id) ?? [],
          category: product.category_id ? categoryById.get(product.category_id) : undefined,
        }));
      }

      // Auto-heal: If any physical products have missing/zero cost_price, check if purchase_items has their unit_cost
      const zeroCostProductIds = includeCosts ? serverProducts
        .filter((p) => !p.is_service && (!p.cost_price || Number(p.cost_price) === 0))
        .map((p) => p.id) : [];

      if (zeroCostProductIds.length > 0) {
        try {
          const { data: latestPurchasedItems } = await supabase
            .from('purchase_items')
            .select('product_id, unit_cost, created_at')
            .in('product_id', zeroCostProductIds)
            .gt('unit_cost', 0)
            .order('created_at', { ascending: false });

          if (latestPurchasedItems && latestPurchasedItems.length > 0) {
            const costByProduct = new Map<string, number>();
            for (const pi of latestPurchasedItems) {
              if (!costByProduct.has(pi.product_id)) {
                costByProduct.set(pi.product_id, Number(pi.unit_cost));
              }
            }

            for (const [prodId, unitCost] of costByProduct.entries()) {
              const p = serverProducts.find((prod) => prod.id === prodId);
              if (p) {
                p.cost_price = unitCost;
                void supabase.from('products').update({ cost_price: unitCost }).eq('id', prodId);
                void supabase
                  .from('sale_items')
                  .update({ cost_price: unitCost })
                  .eq('product_id', prodId)
                  .or('cost_price.is.null,cost_price.eq.0');
              }
            }
          }
        } catch (healErr) {
          console.warn('[fetchProducts] auto-heal cost price error:', healErr);
        }
      }

      const cachedProducts = includeCosts
        ? await readCachedProducts(businessId)
        : maskProductCosts(await readCachedProducts(businessId));
      const serverProductIds = new Set(serverProducts.map((product) => product.id));
      const localOnlyProducts = cachedProducts.filter((product) => !serverProductIds.has(product.id));
      const allMerged = [...serverProducts, ...localOnlyProducts].sort((a, b) => a.name.localeCompare(b.name));
      
      const activeProducts = (includeCosts ? allMerged : maskProductCosts(allMerged)).filter(p => p.is_active);
      
      if (hasArrayChanged(get().products, activeProducts)) {
        set({ products: activeProducts });
      }
      await cacheProducts(businessId, activeProducts);
    } catch (err: any) {
      const cachedProducts = includeCosts
        ? await readCachedProducts(businessId)
        : maskProductCosts(await readCachedProducts(businessId));
      if (cachedProducts.length > 0) {
        if (hasArrayChanged(get().products, cachedProducts)) {
          set({ products: cachedProducts, error: null });
        } else {
          set({ error: null });
        }
      } else {
        set({ error: err.message });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  createBusiness: async (data, userId) => {
    set({ isLoading: true, error: null });
    try {
      // Step 1: Insert business

      const { data: business, error: bizError } = await supabase
        .from('businesses')
        .insert({ ...data, owner_id: userId })
        .select()
        .single();

      if (bizError) {
        console.error('[createBusiness] business insert error:', JSON.stringify(bizError));
        throw new Error(`Business insert failed: ${bizError.message} (code: ${bizError.code})`);
      }


      // Step 2: Create main branch
      const { data: branch, error: branchError } = await supabase
        .from('branches')
        .insert({
          business_id: business.id,
          name: 'Main Branch',
          is_main: true,
        })
        .select()
        .single();

      if (branchError) {
        console.error('[createBusiness] branch insert error:', JSON.stringify(branchError));
        throw new Error(`Branch insert failed: ${branchError.message} (code: ${branchError.code})`);
      }


      // Step 3: Add owner as business member
      const { error: memberError } = await supabase.from('business_members').insert({
        business_id: business.id,
        user_id: userId,
        branch_id: branch.id,
        role: 'owner',
        joined_at: new Date().toISOString(),
      });

      if (memberError) {
        console.error('[createBusiness] member insert error:', JSON.stringify(memberError));
        throw new Error(`Member insert failed: ${memberError.message} (code: ${memberError.code})`);
      }


      set((state) => ({ businesses: [...state.businesses, business] }));
      return business;
    } catch (err: any) {
      console.error('[createBusiness] FINAL ERROR:', err.message);
      set({ error: err.message });
      return null;
    } finally {
      set({ isLoading: false });
    }
  },

  updateBusiness: async (id, data) => {
    try {
      const timestamp = nowIso();
      const patch = { ...data, updated_at: timestamp };
      
      // Optimistic update for instant UI feedback
      set((state) => ({
        businesses: state.businesses.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      }));

      // Background network sync
      void enqueueMutations([
        {
          operation: 'update',
          table: 'businesses',
          payload: patch,
          match: { id },
          conflictPolicy: 'server-wins-if-newer',
          description: 'Sync business update',
        },
      ]);
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  fetchTeamMembers: async (businessId: string) => {
    try {
      const { data, error } = await supabase
        .from('business_members')
        .select(`
          *,
          user_profiles (*)
        `)
        .eq('business_id', businessId)
        .eq('is_active', true);

      if (error) throw error;
      return data || [];
    } catch (err: any) {
      console.error('[fetchTeamMembers] Error:', err.message);
      return [];
    }
  },

  updateTeamMemberRole: async (memberId: string, role: UserRole) => {
    try {
      const { error } = await supabase
        .from('business_members')
        .update({ role })
        .eq('id', memberId);

      if (error) throw error;
    } catch (err: any) {
      console.error('[updateTeamMemberRole] Error:', err.message);
      throw new Error('Failed to update team member role.');
    }
  },

  updateTeamMemberProfile: async (userId: string, fullName: string, phone: string) => {
    try {
      const { error } = await supabase.rpc('update_team_member_profile', {
        p_member_user_id: userId,
        p_new_full_name: fullName,
        p_new_phone: phone
      });

      if (error) throw error;
    } catch (err: any) {
      console.error('[updateTeamMemberProfile] Error:', err.message);
      throw new Error(err.message || 'Failed to update team member name.');
    }
  },

  removeTeamMember: async (memberId: string) => {
    try {
      const { error } = await supabase
        .from('business_members')
        .update({ is_active: false })
        .eq('id', memberId);

      if (error) throw error;
    } catch (err: any) {
      console.error('[removeTeamMember] Error:', err.message);
      throw err;
    }
  },

  transferOwnership: async (businessId: string, newOwnerUserId: string) => {
    try {
      const { error } = await supabase.rpc('transfer_ownership', {
        p_business_id: businessId,
        p_new_owner_user_id: newOwnerUserId,
      });

      if (error) throw error;

      // Update local businesses list so owner_id reflects the transfer immediately
      set((state) => ({
        businesses: state.businesses.map((b) =>
          b.id === businessId ? { ...b, owner_id: newOwnerUserId } : b,
        ),
      }));
    } catch (err: any) {
      console.error('[transferOwnership] Error:', err.message);
      throw err;
    }
  },

  createCategory: async (data) => {
    try {
      const { data: category, error } = await supabase
        .from('categories')
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      set((state) => ({ categories: [...state.categories, category] }));
      return category;
    } catch (err: any) {
      set({ error: err.message });
      return null;
    }
  },

  createProduct: async (data) => {
    try {
      if (!data.business_id || !data.name) {
        throw new Error('Product business and name are required.');
      }

      const timestamp = nowIso();
      const product: Product = {
        id: data.id ?? createLocalId(),
        business_id: data.business_id,
        category_id: data.category_id,
        name: data.name,
        description: data.description,
        sku: data.sku,
        barcode: data.barcode,
        unit: data.unit ?? 'piece',
        cost_price: Number(data.cost_price ?? 0),
        selling_price: Number(data.selling_price ?? 0),
        reorder_level: Number(data.reorder_level ?? 5),
        image_url: data.image_url,
        is_service: Boolean(data.is_service ?? false),
        is_active: data.is_active ?? true,
        created_at: data.created_at ?? timestamp,
        updated_at: timestamp,
        inventory: data.inventory ?? [],
      };

      set((state) => ({ products: [...state.products, product] }));
      await Promise.all([
        upsertCachedProducts(product.business_id, [product]),
        enqueueMutations([
          {
            operation: 'upsert',
            table: 'products',
            payload: stripProductForWrite(product),
            onConflict: 'id',
            description: `Sync product ${product.name}`,
          },
        ]),
      ]);
      return product;
    } catch (err: any) {
      set({ error: err.message });
      return null;
    }
  },

  deleteProduct: async (id) => {
    set((state) => ({
      products: state.products.filter((p) => p.id !== id),
    }));
  },

  updateProduct: async (id, data) => {
    try {
      const timestamp = nowIso();
      const patch = { ...data, updated_at: timestamp };
      set((state) => ({
        products: state.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      }));
      const product = get().products.find((item) => item.id === id);
      if (product) {
        await upsertCachedProducts(product.business_id, [{ ...product, ...patch } as Product]);
      }
      await enqueueMutations([
        {
          operation: 'update',
          table: 'products',
          payload: patch,
          match: { id },
          conflictPolicy: 'server-wins-if-newer',
          description: 'Sync product update',
        },
      ]);
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  getLowStockProducts: async (businessId, branchId, includeCosts = false) => {
    try {
      const products = await fetchTrackedProducts(businessId, includeCosts);

      return products.filter((product) => {
        const stock = getBranchStock(product, branchId);
        return stock > 0 && stock <= product.reorder_level;
      });
    } catch {
      return [];
    }
  },

  getStockAlerts: async (businessId, branchId, includeCosts = false) => {
    try {
      const products = await fetchTrackedProducts(businessId, includeCosts);
      const lowStockProducts: Product[] = [];
      const outOfStockProducts: Product[] = [];

      products.forEach((product) => {
        const stock = getBranchStock(product, branchId);

        if (stock <= 0) {
          outOfStockProducts.push(product);
          return;
        }

        if (stock <= product.reorder_level) {
          lowStockProducts.push(product);
        }
      });

      return { lowStockProducts, outOfStockProducts };
    } catch {
      return { lowStockProducts: [], outOfStockProducts: [] };
    }
  },

  reset: () =>
    set({
      businesses: [],
      branches: [],
      categories: [],
      products: [],
      isLoading: false,
      error: null,
    }),
}));
