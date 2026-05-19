import { format, subDays } from 'date-fns';
import { closeDailySummary, getDailyBalanceSnapshot } from '@/lib/dailyBalance';
import { getAppSettings, markAutoCloseProcessed } from '@/lib/appSettings';

export interface AutoCloseResult {
  status: 'disabled' | 'already_processed' | 'already_closed' | 'closed';
  summaryDate?: string;
}

export async function maybeAutoCloseDailyBalance(
  businessId: string,
  branchId: string,
  userId: string,
  now = new Date(),
): Promise<AutoCloseResult> {
  const settings = await getAppSettings();
  if (!settings.autoCloseEnabled) {
    return { status: 'disabled' };
  }

  const [hour, minute] = settings.autoCloseTime.split(':').map(Number);
  const scheduledAt = new Date(now);
  scheduledAt.setHours(hour, minute, 0, 0);

  const targetDate = format(now >= scheduledAt ? now : subDays(now, 1), 'yyyy-MM-dd');
  const lastProcessedDate = settings.autoCloseLastRunByBranch[branchId];
  if (lastProcessedDate && lastProcessedDate >= targetDate) {
    return { status: 'already_processed', summaryDate: targetDate };
  }

  const snapshot = await getDailyBalanceSnapshot(businessId, branchId, targetDate);
  if (snapshot.summary.is_closed) {
    await markAutoCloseProcessed(branchId, targetDate);
    return { status: 'already_closed', summaryDate: targetDate };
  }

  const notes =
    snapshot.summary.notes?.trim() ||
    `Automatically closed at ${settings.autoCloseTime} because the day was not balanced manually. Expected cash was used as the actual cash count. Reopen this balance if you need to adjust it.`;

  await closeDailySummary({
    businessId,
    branchId,
    userId,
    summary: snapshot.summary,
    actualCash: snapshot.summary.cash_in_hand_expected,
    notes,
  });
  await markAutoCloseProcessed(branchId, targetDate);

  return { status: 'closed', summaryDate: targetDate };
}
