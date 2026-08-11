# Team & Staff Management - Implementation Plan

## Goal
Build a secure, easy-to-use Team Management feature that allows business owners to invite staff, assign them roles (Cashier, Manager, Auditor), and manage their access to the business.

## Proposed Screens

### 1. Team Dashboard (`app/(app)/team/index.tsx`)
- A list of all current staff members.
- Shows their name, assigned role, and status (Active/Pending).
- Accessible only to users with the `owner` or `manager` role.
- Includes an "Invite Staff" button.

### 2. Invite Staff Screen (`app/(app)/team/invite.tsx`)
- A form to invite a new staff member.
- **Fields**: Staff Email, Role Assignment (Dropdown: Manager, Cashier, Auditor).
- Generates a secure invite or adds them to the business.

### 3. Edit Staff Role (`app/(app)/team/[id].tsx`)
- An owner can click on an existing staff member to change their role or revoke their access to the business completely.

## Integration with Existing App
- We will add a "Staff" menu item back into the `More` tab (`app/(app)/(tabs)/_more.tsx`) but wrapped in the `<RoleGate allowedRoles={['owner', 'manager']}>` so cashiers can't access it.

## User Review Required / Open Questions

> [!IMPORTANT]
> **How should staff join the app?**
> Since this app uses secure authentication (Supabase), every staff member needs their own account. Which flow do you prefer?
> 
> **Option A (Email Invite - Recommended)**: You enter the staff member's email in the app. They receive an email with a link to download the app and create an account, which automatically links them to your business with the correct role.
> 
> **Option B (Business Join Code)**: You generate a 6-digit "Business Code" in the app. The staff member downloads the app, creates their own account, and enters that 6-digit code to link to your business.

Please review the plan and let me know your preferred invite flow (Option A or Option B) so I can begin execution!
