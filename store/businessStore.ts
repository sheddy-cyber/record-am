import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { Business, Branch, Category, Product, StockAlertSummary } from '@/types';
import {
  cacheProducts,
  createLocalId,
  enqueueMutations,
  nowIso,
  readCachedProducts,
  upsertCachedProducts,
} from '@/lib/offlineStore';

const getBranchStock = (product: Product, branchId: string) =>
  product.inventory?.find((item) => item.branch_id === branchId)?.quantity ?? 0;

const stripProductForWrite = (product: Product) => {
  const { category, inventory, ...payload } = product;
  return payload;
};

const fetchTrackedProducts = async (businessId: string) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        inventory(quantity, branch_id)
      `)
      .eq('business_id', businessId)
      .eq('is_active', true)
      .eq('is_service', false);

    if (error) throw error;

    const products = (data ?? []) as Product[];
    await upsertCachedProducts(businessId, products);
    return products;
  } catch {
    const cachedProducts = await readCachedProducts(businessId);
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
  fetchCategories: (businessId: string) => Promise<void>;
  fetchProducts: (businessId: string) => Promise<void>;
  createBusiness: (data: Partial<Business>, userId: string) => Promise<Business | null>;
  updateBusiness: (id: string, data: Partial<Business>) => Promise<void>;
  createCategory: (data: Partial<Category>) => Promise<Category | null>;
  createProduct: (data: Partial<Product>) => Promise<Product | null>;
  updateProduct: (id: string, data: Partial<Product>) => Promise<void>;
  getLowStockProducts: (businessId: string, branchId: string) => Promise<Product[]>;
  getStockAlerts: (businessId: string, branchId: string) => Promise<StockAlertSummary>;
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

  fetchProducts: async (businessId) => {
    try {
      const cachedProducts = await readCachedProducts(businessId);
      if (cachedProducts.length > 0) set({ products: cachedProducts });
    } catch {}

    const currentProducts = get().products;
    if (currentProducts.length === 0) set({ isLoading: true });

    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          category:categories(*),
          inventory(*)
        `)
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      const serverProducts = (data ?? []) as Product[];
      const cachedProducts = await readCachedProducts(businessId);
      const serverProductIds = new Set(serverProducts.map((product) => product.id));
      const localOnlyProducts = cachedProducts.filter((product) => !serverProductIds.has(product.id));
      const products = [...serverProducts, ...localOnlyProducts].sort((a, b) => a.name.localeCompare(b.name));
      set({ products });
      await cacheProducts(businessId, products);
    } catch (err: any) {
      const cachedProducts = await readCachedProducts(businessId);
      if (cachedProducts.length > 0) {
        set({ products: cachedProducts, error: null });
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
      console.log('[createBusiness] inserting business for user:', userId);
      const { data: business, error: bizError } = await supabase
        .from('businesses')
        .insert({ ...data, owner_id: userId })
        .select()
        .single();

      if (bizError) {
        console.error('[createBusiness] business insert error:', JSON.stringify(bizError));
        throw new Error(`Business insert failed: ${bizError.message} (code: ${bizError.code})`);
      }
      console.log('[createBusiness] business created:', business.id);

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
      console.log('[createBusiness] branch created:', branch.id);

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
      console.log('[createBusiness] member created successfully');

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
      const { error } = await supabase
        .from('businesses')
        .update(data)
        .eq('id', id);

      if (error) throw error;
      set((state) => ({
        businesses: state.businesses.map((b) => (b.id === id ? { ...b, ...data } : b)),
      }));
    } catch (err: any) {
      set({ error: err.message });
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

  getLowStockProducts: async (businessId, branchId) => {
    try {
      const products = await fetchTrackedProducts(businessId);

      return products.filter((product) => {
        const stock = getBranchStock(product, branchId);
        return stock > 0 && stock <= product.reorder_level;
      });
    } catch {
      return [];
    }
  },

  getStockAlerts: async (businessId, branchId) => {
    try {
      const products = await fetchTrackedProducts(businessId);
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
}));
