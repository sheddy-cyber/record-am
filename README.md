# 📦 Record Am — SME Business Management App

Record Am is a mobile-first business management app built for Nigerian and African SMEs. It helps business owners track inventory, record sales, manage debts, log expenses, and get a clear daily picture of their business.

---

## ✅ Phase 1 Features (This Release)

| Module | Features |
|---|---|
| 🔐 Auth | Register, Login, Business Onboarding |
| 🏠 Dashboard | Today's revenue, expenses, profit, quick stats, recent sales, debt overview, low-stock alerts |
| 📦 Inventory | Add products/services, update stock (in/out/adjust/damage), low stock filter, category support |
| 🛒 Sales | Cart-style sale recording, credit/partial/full payment, customer tracking, auto debt creation |
| 📋 Debts | Record debts, track repayments, overdue detection, progress bars |
| 💸 Expenses | Record expenses by category (rent, electricity, etc.) |
| ⚙️ More | Settings hub, sign out, expense logging |

---

## 🛠️ Tech Stack

- **React Native + Expo** — Cross-platform mobile (iOS + Android + Web)
- **Expo Router** — File-based navigation
- **Supabase** — Database (PostgreSQL), Auth, Row-Level Security
- **NativeWind** — Tailwind CSS for React Native
- **Zustand** — App state management
- **date-fns** — Date formatting
- **react-native-toast-message** — Toast notifications

---

## 🚀 Setup Instructions

### Prerequisites

Make sure you have the following installed:

```bash
node --version   # v18 or higher required
npm --version    # v9 or higher
```

Install Expo CLI globally (if not already installed):

```bash
npm install -g expo-cli eas-cli
```

Install the Expo Go app on your phone:
- **Android**: https://play.google.com/store/apps/details?id=host.exp.exponent
- **iOS**: https://apps.apple.com/app/expo-go/id982107779

---

### Step 1 — Set Up Supabase

1. Go to **https://supabase.com** and create a free account
2. Click **"New Project"** and fill in:
   - **Project name**: Record Am (or anything you like)
   - **Database password**: Choose a strong password (save it somewhere)
   - **Region**: Choose closest to you (e.g. West EU or US East)
3. Wait for the project to be created (~1 minute)
4. Go to **Settings → API** in your Supabase dashboard
5. Copy your **Project URL** and **anon public** key — you'll need these shortly

---

### Step 2 — Run the Database Schema

1. In your Supabase dashboard, go to **SQL Editor**
2. Click **"New Query"**
3. Open the file `lib/supabase-schema.sql` from this project
4. Copy the entire contents and paste it into the SQL editor
5. Click **"Run"** (green button)
6. You should see: `Record Am schema created successfully!` at the bottom

This creates all 17 tables, relationships, RLS policies, indexes, and triggers.

---

### Step 3 — Configure Environment Variables

In the project root folder, create a file named `.env`:

```bash
# On Mac/Linux:
cp .env.example .env

# On Windows:
copy .env.example .env
```

Open `.env` and fill in your Supabase credentials:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Replace the values with the ones from your Supabase dashboard (**Settings → API**).

---

### Step 4 — Install Dependencies

Open a terminal in the project folder and run:

```bash
npm install
```

This installs all required packages. It may take 2–3 minutes on first run.

---

### Step 5 — Start the App

```bash
npm start
```

This opens the **Expo Dev Server** in your terminal. You'll see a QR code.

**To run on your phone:**
- Open **Expo Go** on your phone
- Scan the QR code shown in the terminal
- The app will load on your device

**To run on Android Emulator:**
```bash
npm run android
```

**To run on iOS Simulator (Mac only):**
```bash
npm run ios
```

**To run on Web (browser):**
```bash
npm run web
```

---

## 📱 First Time Use

1. Open the app → tap **"Register here"**
2. Enter your full name, email, phone, and password
3. You'll be taken to the **Business Setup** screen
4. Enter your business name, select your business type, and tap Continue
5. You'll land on the **Dashboard** — your business is ready!

---

## 📁 Project Structure

```
record-am/
├── app/
│   ├── _layout.tsx              # Root layout (auth listener, splash screen)
│   ├── index.tsx                # Entry redirect (auth check)
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx            # Login screen
│   │   ├── register.tsx         # Registration screen
│   │   └── onboarding.tsx       # Business setup (3-step wizard)
│   └── (app)/
│       ├── _layout.tsx
│       └── (tabs)/
│           ├── _layout.tsx      # Tab bar configuration
│           ├── dashboard.tsx    # Home dashboard
│           ├── inventory.tsx    # Stock management
│           ├── sales.tsx        # Sales recording (cart style)
│           ├── debts.tsx        # Debt & credit tracking
│           └── more.tsx         # Expenses + settings hub
├── components/
│   ├── ui/
│   │   └── index.tsx            # Button, Card, Badge, StatCard, EmptyState, etc.
│   ├── layout/
│   │   └── index.tsx            # ScreenShell, BrandMark, ScreenHeader, etc.
│   ├── charts/
│   │   └── index.tsx            # BarChart, LineChart, DonutChart, MetricCard
│   └── forms/
│       └── index.tsx            # InputField, SelectField, Toggle
├── lib/
│   ├── supabase.ts              # Supabase client
│   └── supabase-schema.sql      # Full database schema (run in Supabase)
├── store/
│   ├── authStore.ts             # Auth + session + business state
│   └── businessStore.ts         # Products, categories, inventory state
├── types/
│   └── index.ts                 # All TypeScript interfaces
├── constants/
│   └── index.ts                 # Design tokens, colors, typography, etc.
├── .env.example                 # Template for environment variables
├── app.json                     # Expo config
├── babel.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## 🗄️ Database Schema

The Supabase schema includes **17 tables**:

| Table | Purpose |
|---|---|
| `businesses` | Business profiles |
| `branches` | Multiple locations per business |
| `user_profiles` | Extended user data |
| `business_members` | User-business roles (owner/manager/cashier/auditor) |
| `categories` | Product categories |
| `products` | Products and services |
| `inventory` | Stock levels per product per branch |
| `stock_movements` | Every stock in/out/adjustment |
| `suppliers` | Supplier contacts |
| `customers` | Customer records |
| `sales` | Sale transactions |
| `sale_items` | Line items per sale |
| `expenses` | Business expenses |
| `purchases` | Supplier purchases |
| `purchase_items` | Items per purchase |
| `customer_debts` | Credit sales / debts owed to business |
| `debt_repayments` | Repayment records |
| `supplier_debts` | Money business owes suppliers |
| `daily_summaries` | End-of-day balances |
| `activity_logs` | Audit trail |

All tables have **Row Level Security (RLS)** — users can only access data from their own business.

---

## 🔮 Coming in Phase 2

- 📊 Business analytics & charts (sales trends, profit margins, top products)
- ⚖️ Daily checks & balances (cash reconciliation)
- 🚚 Full supplier management
- 👥 Full customer management with history
- 📑 PDF receipt and report generation
- 📲 WhatsApp sharing for receipts and debt reminders
- 🔔 Push notifications (low stock, overdue debts, daily summary)
- 🌐 Offline-first sync (WatermelonDB)
- 👥 Staff management and role-based access
- 📦 Stock history view

---

## 🐛 Troubleshooting

**"Network request failed" on login:**
- Check your `.env` file has the correct Supabase URL and key
- Make sure your phone and computer are on the same WiFi network

**"relation does not exist" error:**
- The database schema hasn't been run yet
- Go to Supabase SQL Editor and run `lib/supabase-schema.sql`

**App doesn't load on Expo Go:**
- Make sure you're on the same network as your development machine
- Try pressing `r` in the terminal to reload

**White screen after login:**
- Check the Supabase schema was run correctly
- Check the browser console or Expo logs for error details

---

## 📞 Support

This is Phase 1 of the Record Am project. Each subsequent phase adds more features on top of this foundation. The codebase is structured to be modular — each tab screen is self-contained and can be expanded independently.
