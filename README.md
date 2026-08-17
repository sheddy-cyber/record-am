# 📦 Record Am — SME Business Management & POS App

Record Am is a modern, mobile-first business management and Point of Sale (POS) application built for African SMEs, retailers, wholesalers, pharmacies, and service providers. It empowers business owners to record sales, manage inventory, track customer & supplier debts, reconcile daily cash balances, manage team access, generate digital receipts/reports, and analyze business performance—both online and offline.

---

## ✨ Features & Capabilities

### 🛒 Sales & Point of Sale (POS)
- **Cart-Style Checkout**: Rapid item selection, quantity adjustment, and line-item/cart discount handling.
- **Flexible Payment Methods**: Supports Cash, Bank Transfer, POS/Card, and Credit/Split/Partial payments.
- **Automatic Debt Logging**: Unpaid or partially paid sales automatically generate customer debt records.
- **Digital Receipts**: Instant thermal-style printable receipt generation (PDF) and direct WhatsApp sharing.

### 📦 Inventory & Stock Management
- **Products & Services**: Full catalog management with categories, SKU/barcodes, cost prices, and selling prices.
- **Stock Movement Tracking**: Comprehensive logs for Stock In, Stock Out, Restock, Damage, and Adjustments.
- **Low-Stock Alerts**: Automatic threshold monitoring with dashboard indicators and push notifications.
- **Stock History**: Detailed audit trail for every inventory adjustment across branches.

### 📊 Business Analytics & Reports
- **Real-Time KPIs**: Track revenue, gross profit, net profit, total expenses, and transaction volumes.
- **Visual Analytics**: Interactive charts for revenue trends, payment method breakdowns, and top-performing products.
- **Flexible Date Filtering**: View analytics for Today, Yesterday, Last 7 Days, This Month, or Custom periods.
- **Daily Financial Reports**: Generate end-of-day summary reports with automated profit & cash calculations.

### ⚖️ Daily Checks & Balances (Cash Reconciliation)
- **Cash Drawer Reconciliation**: Compare expected cash sales against actual counted cash.
- **Discrepancy Detection**: Automatic surplus and shortage tracking.
- **End-of-Day Closing**: Lock daily records, generate daily reports, and schedule automated closing.

### 📋 Debt & Credit Management
- **Customer & Supplier Debts**: Track money owed to the business and money owed to suppliers.
- **Repayment Tracking**: Log installment repayments with real-time balance updates and progress bars.
- **Overdue Detection & Reminders**: Highlight overdue debts and generate one-tap WhatsApp payment reminder messages.

### 👥 Team & Staff Access Control
- **Role-Based Access Control (RBAC)**: Support for `Owner`, `Manager`, `Cashier`, and `Auditor` roles.
- **Role Gates**: Enforce feature-level permissions across sensitive financial actions and settings.
- **Easy Onboarding**: Invite staff or allow them to join an existing business using a secure Business ID.

### 🤝 Customer & Supplier Management (CRM)
- **Customer Directory**: Track purchase history, outstanding debt balances, and contact details.
- **Supplier Directory**: Manage vendor details, purchase orders, and outstanding accounts payable.
- **Purchase Invoicing**: Record supplier purchases with automatic inventory quantity updates.

### 🔄 Offline Resilience & Security
- **Offline-First Mode**: Queue transactions and updates locally with automatic background sync upon reconnection.
- **Biometric Security**: Protect business data with Fingerprint, Face ID, or PIN app lock.
- **Row-Level Security (RLS)**: Strict database-level multi-tenant isolation via Supabase RLS policies.
- **Push & In-App Notifications**: Alerts for low stock levels, pending debts, and daily business closing reminders.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Mobile Framework** | [React Native](https://reactnative.dev/) (0.81) / [Expo](https://expo.dev/) (SDK 54) |
| **Routing** | [Expo Router](https://docs.expo.dev/router/introduction/) (File-based, typed routes) |
| **Backend & Database** | [Supabase](https://supabase.com/) (PostgreSQL, Auth, Row-Level Security, RPCs) |
| **State Management** | [Zustand](https://github.com/pmndrs/zustand) |
| **Styling & UI** | Vanilla StyleSheet + Custom Design System tokens & NativeWind |
| **Hardware & Native APIs** | `expo-local-authentication`, `expo-print`, `expo-sharing`, `expo-notifications`, `expo-secure-store` |
| **List Performance** | `@shopify/flash-list` |
| **Date & Utilities** | `date-fns`, `@react-native-community/netinfo` |

---

## 📁 Project Structure

```
record-am/
├── app/
│   ├── _layout.tsx                 # Root layout & providers (Auth, Biometrics, Splash)
│   ├── +html.tsx                   # Web HTML template
│   ├── index.tsx                   # Entry gate & auth redirect
│   ├── (auth)/                     # Authentication & onboarding flow
│   │   ├── _layout.tsx
│   │   ├── login.tsx               # Login screen
│   │   ├── register.tsx            # Account registration
│   │   ├── onboarding.tsx          # Business setup wizard
│   │   └── join-business.tsx       # Staff join via Business ID
│   └── (app)/                      # Main application flow
│       ├── _layout.tsx             # Protected app stack
│       ├── (tabs)/                 # Bottom tab navigation
│       │   ├── _layout.tsx
│       │   ├── _dashboard.tsx      # Main dashboard with live KPIs
│       │   ├── _sales.tsx          # POS / Cart sale recording
│       │   ├── _inventory.tsx      # Product catalog & stock levels
│       │   ├── _debts.tsx          # Customer & supplier debt tracking
│       │   └── _more.tsx           # More hub & secondary modules
│       ├── analytics/              # Business intelligence & charts
│       ├── balance/                # Daily cash reconciliation & closing
│       ├── customers/              # Customer management & profiles
│       ├── suppliers/              # Supplier directory & management
│       ├── purchases/              # Purchase orders & stock replenishment
│       ├── stock-history/          # Inventory movement audit logs
│       ├── team/                   # Staff management & role assignments
│       ├── settings/               # App preferences, biometrics, receipts
│       ├── notifications.tsx       # In-app notifications center
│       ├── record-sale.tsx         # Detailed sales checkout modal
│       ├── record-expense.tsx      # Expense recording modal
│       ├── record-debt.tsx         # Debt creation modal
│       ├── record-purchase.tsx     # Purchase entry modal
│       ├── add-stock.tsx           # Product creation & stock intake
│       └── update-stock.tsx        # Stock adjustment modal
├── components/
│   ├── auth/                       # RoleGate & auth-related components
│   ├── charts/                     # BarChart, LineChart, MetricCard
│   ├── forms/                      # InputField, SelectField, Toggle
│   ├── inventory/                  # Stock cards, category pills
│   ├── layout/                     # ScreenShell, ScreenHeader, BrandMark
│   ├── navigation/                 # Custom tab bar & navigation helpers
│   └── ui/                         # Button, Card, Badge, StatCard, EmptyState
├── lib/
│   ├── supabase.ts                 # Supabase client configuration
│   ├── supabase-schema.sql         # Base PostgreSQL database schema
│   ├── appSettings.ts              # Local app configuration & preferences
│   ├── dailyBalance.ts             # Cash reconciliation logic & calculations
│   ├── mismatchService.ts          # Discrepancy detection & audit helpers
│   ├── notifications.ts            # Local notifications & schedule manager
│   ├── offlineRecords.ts           # Offline mutation handling
│   ├── offlineStore.ts             # Offline cache & synchronization engine
│   ├── recordDeletion.ts           # Cascade deletion & audit logging
│   └── reports.ts                  # PDF receipt & daily summary generator
├── store/
│   ├── authStore.ts                # User session, profile & business context
│   ├── businessStore.ts            # Products, categories & team state
│   ├── saleStore.ts                # POS cart & sales operations
│   ├── debtStore.ts                # Debts & repayment tracking
│   ├── customerStore.ts            # Customer CRM operations
│   ├── supplierStore.ts            # Supplier CRM operations
│   ├── purchaseStore.ts            # Purchase orders & inventory sync
│   ├── dailyBalanceStore.ts        # Cash reconciliation state
│   ├── analyticsStore.ts           # Financial analytics & metrics
│   └── notificationStore.ts        # Notification state & unread count
├── types/
│   └── index.ts                    # Global TypeScript interfaces & data models
├── constants/
│   └── index.ts                    # Colors, typography, spacing, currencies
└── app.json                        # Expo application manifest
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed on your development machine:
- **Node.js**: `v18.0.0` or higher
- **npm**: `v9.0.0` or higher
- **Expo Go** app on your physical device ([Android](https://play.google.com/store/apps/details?id=host.exp.exponent) / [iOS](https://apps.apple.com/app/expo-go/id982107779)) or an active Android Emulator / iOS Simulator.

---

### Step 1 — Clone and Install Dependencies

```bash
git clone https://github.com/your-username/record-am.git
cd record-am
npm install
```

---

### Step 2 — Set Up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in your Supabase dashboard.
3. Copy and run the contents of [`lib/supabase-schema.sql`](lib/supabase-schema.sql).
4. Run any supplementary migrations located in `supabase/migrations/` if applicable.
5. In your Supabase dashboard, navigate to **Settings → API** and obtain:
   - **Project URL**
   - **Anon Public API Key**

---

### Step 3 — Configure Environment Variables

Create a `.env` file in the root directory:

```bash
# On Mac/Linux:
cp .env.example .env

# On Windows:
copy .env.example .env
```

Populate `.env` with your Supabase credentials:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

---

### Step 4 — Run the Application

Start the Expo development server:

```bash
npm start
```

Use the terminal controls to open the app:
- **Physical Device**: Scan the terminal QR code with the **Expo Go** app (Android) or the Camera app (iOS).
- **Android Emulator**: Press `a` or run `npm run android`.
- **iOS Simulator**: Press `i` or run `npm run ios` (macOS only).
- **Web Browser**: Press `w` or run `npm run web`.

---

## 🗄️ Database Architecture

The application is backed by PostgreSQL on Supabase with strict **Row-Level Security (RLS)** ensuring complete tenant data isolation:

| Table | Description |
|---|---|
| `businesses` | Business entity profiles, currencies, and owner details |
| `branches` | Business locations and branch metadata |
| `user_profiles` | User account information and biometric PIN hashes |
| `business_members` | Staff memberships and role permissions (`owner`, `manager`, `cashier`, `auditor`) |
| `categories` | Product and service category classifications |
| `products` | Product catalog, pricing, SKU, and unit definitions |
| `inventory` | Real-time stock levels per product per branch |
| `stock_movements` | Immutable audit trail for stock in/out/adjustments/damages |
| `customers` | Customer directory with outstanding balances and contact information |
| `suppliers` | Vendor directory and payables tracking |
| `sales` | Sale transactions, payment methods, and totals |
| `sale_items` | Individual line items per sale transaction |
| `expenses` | Categorized operating expenses |
| `purchases` | Supplier purchase orders and replenishment records |
| `purchase_items` | Items linked to purchase orders |
| `customer_debts` | Receivables and credit sale balances |
| `debt_repayments` | Installment logs for debt payoffs |
| `daily_summaries` | End-of-day balances, expected cash, and closure records |
| `activity_logs` | Audit trail for sensitive business operations |

---

## 🔒 Security & Roles

Record Am includes built-in Role-Based Access Control:

- **Owner**: Full access to all business operations, financial metrics, team management, and settings.
- **Manager**: Access to sales, inventory, daily closing, reports, customers, suppliers, and staff oversight.
- **Cashier**: Focused access for sales recording, product lookup, and customer debt collection. Restricted from sensitive financial reporting and team management.
- **Auditor**: Read-only oversight for financial reports, stock movements, and audit logs.

Sensitive screens and actions are guarded using the `<RoleGate />` component and backend RLS policies.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
