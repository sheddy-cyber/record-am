// ============================================================
// RECORD AM - Development helpers (web + __DEV__ only)
// Lets a browser preview of the app show real screens with local sample data
// (no backend writes): run `__recordamDemo()` in the console.
// Compiled out of production bundles by the __DEV__ guard.
// ============================================================

import { Platform } from 'react-native';

if (__DEV__ && Platform.OS === 'web' && typeof window !== 'undefined') {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const stores = () => ({
    router: require('expo-router').router,
    auth: require('@/store/authStore').useAuthStore,
    business: require('@/store/businessStore').useBusinessStore,
    dashboard: require('@/store/dashboardStore').useDashboardStore,
    sales: require('@/store/saleStore').useSaleStore,
    debts: require('@/store/debtStore').useDebtStore,
    customers: require('@/store/customerStore').useCustomerStore,
    suppliers: require('@/store/supplierStore').useSupplierStore,
    voice: require('@/store/voiceStore').useVoiceStore,
    tabs: require('@/store/tabStore').useTabStore,
    analytics: require('@/store/analyticsStore').useAnalyticsStore,
    reports: require('@/lib/reports'),
  });

  const sample = () => {
    const now = Date.now();
    const iso = (minsAgo: number) => new Date(now - minsAgo * 60000).toISOString();
    const biz = { id: 'biz-demo', name: 'Adaeze Provisions', type: 'provisions', owner_id: 'u-demo', currency: 'NGN', currency_symbol: '₦', created_at: iso(0), updated_at: iso(0) };
    const branches = [
      { id: 'br-1', business_id: 'biz-demo', name: 'Ikeja', address: '12 Allen Avenue', is_main: true, created_at: iso(0), updated_at: iso(0) },
      { id: 'br-2', business_id: 'biz-demo', name: 'Yaba', address: '4 Herbert Macaulay Way', is_main: false, created_at: iso(0), updated_at: iso(0) },
    ];
    const user = { id: 'u-demo', email: 'demo@example.test', user_metadata: { full_name: 'Adaeze Okafor' } };
    const mk = (id: string, name: string, unit: string, cost: number, price: number, q1: number, q2: number, reorder: number, cat: string) => ({
      id, business_id: 'biz-demo', name, unit, cost_price: cost, selling_price: price, reorder_level: reorder,
      is_service: false, is_active: true, created_at: iso(5000), updated_at: iso(100),
      category: { id: `c-${cat}`, name: cat }, category_id: `c-${cat}`,
      inventory: [
        { id: `${id}-i1`, product_id: id, branch_id: 'br-1', quantity: q1, last_updated: iso(50) },
        { id: `${id}-i2`, product_id: id, branch_id: 'br-2', quantity: q2, last_updated: iso(50) },
      ],
    });
    const products = [
      mk('p1', 'Peak Milk 400g', 'tin', 1850, 2300, 42, 18, 10, 'Dairy'),
      mk('p2', 'Golden Penny Semovita 1kg', 'pack', 1450, 1800, 3, 11, 6, 'Grains'),
      mk('p3', 'Indomie Chicken (carton)', 'carton', 9800, 11500, 0, 4, 2, 'Noodles'),
      mk('p4', 'Coca-Cola 50cl', 'bottle', 280, 400, 96, 60, 24, 'Drinks'),
      mk('p5', 'Dangote Sugar 500g', 'pack', 780, 1000, 25, 9, 8, 'Grains'),
      mk('p6', 'Milo Refill 500g', 'pack', 3200, 3900, 4, 7, 5, 'Beverages'),
      mk('p7', 'Kings Oil 1L', 'bottle', 2600, 3200, 14, 3, 6, 'Oils'),
      mk('p8', 'Hypo Bleach 500ml', 'bottle', 650, 850, 19, 12, 6, 'Household'),
    ];
    const activities = [
      { id: 'a1', kind: 'sale', sale_id: 'sale-demo-1', customer_name: 'Chidi Eze', reference: 'S-1041', items_summary: '2× Peak Milk, 1× Milo Refill', total_amount: 8500, amount_paid: 8500, amount_owed: 0, payment_status: 'paid', payment_method: 'transfer', created_at: iso(12) },
      { id: 'a2', kind: 'sale', customer_name: 'Walk-in', reference: 'S-1040', items_summary: '6× Coca-Cola 50cl', total_amount: 2400, amount_paid: 2400, amount_owed: 0, payment_status: 'paid', payment_method: 'cash', created_at: iso(40) },
      { id: 'a3', kind: 'debt_repayment', customer_name: 'Mama Ngozi', reference: 'R-220', items_summary: '', total_amount: 15000, amount_paid: 15000, amount_owed: 0, payment_status: 'paid', payment_method: 'cash', created_at: iso(75) },
      { id: 'a4', kind: 'sale', customer_name: 'Tunde Bakare', reference: 'S-1039', items_summary: '1× Indomie Chicken (carton)', total_amount: 11500, amount_paid: 6000, amount_owed: 5500, payment_status: 'partial', payment_method: 'cash', created_at: iso(130) },
      { id: 'a5', kind: 'sale', customer_name: 'Blessing A.', reference: 'S-1038', items_summary: '2× Kings Oil 1L, 1× Sugar', total_amount: 7400, amount_paid: 7400, amount_owed: 0, payment_status: 'paid', payment_method: 'pos', created_at: iso(190) },
    ];
    const debts = [
      { id: 'd1', business_id: 'biz-demo', branch_id: 'br-1', customer_name: 'Tunde Bakare', original_amount: 5500, amount_paid: 0, balance: 5500, status: 'outstanding', due_date: iso(-4000), created_at: iso(130), updated_at: iso(130) },
      { id: 'd2', business_id: 'biz-demo', branch_id: 'br-1', customer_name: 'Mama Ngozi', original_amount: 60000, amount_paid: 15000, balance: 45000, status: 'partial', due_date: iso(3000), created_at: iso(9000), updated_at: iso(75) },
      { id: 'd3', business_id: 'biz-demo', branch_id: 'br-1', customer_name: 'Ifeanyi Stores', original_amount: 21500, amount_paid: 0, balance: 21500, status: 'outstanding', due_date: iso(-6000), created_at: iso(12000), updated_at: iso(12000) },
    ];
    const stats = { today_sales: 184500, today_profit: 42300, today_expenses: 6500, total_products: 8, low_stock_count: 3, out_of_stock_count: 1, outstanding_debts: 72000, total_customers: 31, today_sales_count: 14 };
    return { biz, branches, user, products, activities, debts, stats };
  };

  const seed = () => {
    const R = stores();
    const d = sample();
    R.auth.setState({ session: { user: d.user, access_token: 'demo' }, user: d.user, profile: { id: 'u-demo', full_name: 'Adaeze Okafor' }, currentBusiness: d.biz, currentBranch: d.branches[0], userRole: 'owner', isInitialized: true, isLoading: false });
    R.business.setState({ branches: d.branches, products: d.products });
    R.dashboard.setState({ stats: d.stats, recentActivities: d.activities, recentDebts: d.debts, isLoading: false, error: null });
    R.debts.setState({ debts: d.debts });
    // Device cache too, so screens that paint from it (Sales) have data offline.
    void require('@/lib/offlineStore').upsertCachedRevenueActivities('biz-demo', 'br-1', d.activities);
    // A cached sale behind the first activity, so its receipt can be previewed offline.
    const names = ['Peak Milk 400g', 'Milo Refill 500g', 'Indomie Chicken', 'Coca-Cola 50cl', 'Kings Oil 1L', 'Dangote Sugar 500g', 'Golden Penny Semovita', 'Hypo Bleach 500ml'];
    const saleItems = names.map((name, i) => ({ id: `sale-demo-1-i${i}`, sale_id: 'sale-demo-1', product_id: `p${i + 1}`, quantity: i + 1, unit_price: 1000 + i * 250, total_price: (i + 1) * (1000 + i * 250), cost_price: 0, product: { id: `p${i + 1}`, name, unit: 'pack' } }));
    const off = require('@/lib/offlineStore');
    void off.upsertCachedRows({ businessId: 'biz-demo', branchId: 'br-1' }, 'sales', [{ id: 'sale-demo-1', business_id: 'biz-demo', branch_id: 'br-1', sale_number: 'S-1041', customer_name: 'Chidi Eze', total_amount: saleItems.reduce((t, i) => t + i.total_price, 0), amount_paid: 8500, amount_owed: 0, discount_amount: 0, payment_status: 'paid', payment_method: 'transfer', created_at: d.activities[0].created_at, updated_at: d.activities[0].created_at }]);
    void off.upsertCachedRows({ businessId: 'biz-demo', branchId: 'br-1' }, 'sale_items', saleItems);
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const revenue = [96000, 121500, 88000, 143000, 167500, 212000, 184500];
    const top = [
      { product_id: 'p4', product_name: 'Coca-Cola 50cl', total_qty: 214, total_revenue: 85600, total_profit: 25680 },
      { product_id: 'p1', product_name: 'Peak Milk 400g', total_qty: 96, total_revenue: 220800, total_profit: 43200 },
      { product_id: 'p5', product_name: 'Dangote Sugar 500g', total_qty: 71, total_revenue: 71000, total_profit: 15620 },
      { product_id: 'p7', product_name: 'Kings Oil 1L', total_qty: 38, total_revenue: 121600, total_profit: 22800 },
      { product_id: 'p6', product_name: 'Milo Refill 500g', total_qty: 22, total_revenue: 85800, total_profit: 15400 },
    ];
    R.analytics.setState({
      isLoading: false,
      summary: {
        total_revenue: 1012500, gross_profit: 231400, net_profit: 168900, total_expenses: 62500, total_discounts: 8400,
        total_transactions: 132, avg_transaction_value: 7670, prev_revenue: 901000, prev_profit: 150000,
        revenue_growth: 12.4, profit_growth: 12.6, historical_stock_items: 327, historical_stock_value: 688400,
      },
      salesTrend: days.map((label, i) => ({ date: label, label, revenue: revenue[i], profit: Math.round(revenue[i] * 0.22), transactions: 12 + i * 3 })),
      topProducts: top,
      allProducts: top,
      expenseBreakdown: [
        { category: 'rent', total: 30000, percentage: 48 },
        { category: 'transport', total: 14500, percentage: 23 },
        { category: 'electricity', total: 11000, percentage: 18 },
        { category: 'other', total: 7000, percentage: 11 },
      ],
    });
  };

  const w = window as any;
  Object.defineProperty(w, '__recordam', { get: stores, configurable: true });
  w.__recordamSeed = seed;
  w.__recordamDemo = (path = '/(app)/(tabs)', tab?: string) => {
    seed();
    stores().router.replace(path);
    if (tab) setTimeout(() => stores().tabs.getState().setActiveTab(tab), 50);
    // Live fetches fail without a session and may clear state; re-apply a few times.
    [500, 1500, 3000, 5000].forEach((t) => setTimeout(seed, t));
    return 'demo ready';
  };
}

export {};
