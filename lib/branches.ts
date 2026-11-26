import { Branch } from '@/types';

/** Closed branches keep their history but are hidden from day-to-day use. */
export const isBranchOpen = (branch: Pick<Branch, 'is_active'> | null | undefined) =>
  Boolean(branch) && branch!.is_active !== false;

export const openBranches = <T extends Pick<Branch, 'is_active'>>(branches: T[]) =>
  branches.filter((branch) => branch.is_active !== false);

/** Thrown when a branch still has sales or other records and so cannot be deleted. */
export class BranchHasRecordsError extends Error {
  constructor(public readonly branchName: string) {
    super(`${branchName} has sales or other records, so it can't be deleted. Close it instead to keep its history.`);
    this.name = 'BranchHasRecordsError';
  }
}
