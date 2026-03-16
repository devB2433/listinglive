export type QuotaSubmissionState = {
  requiredQuota: number;
  availableQuota: number;
  canSubmit: boolean;
  maxShortTaskCount: number;
  maxLongSegmentCount: number;
};

export function getQuotaSubmissionState(requiredQuota: number, availableQuota: number): QuotaSubmissionState {
  const normalizedRequiredQuota = Math.max(Math.trunc(requiredQuota), 0);
  const normalizedAvailableQuota = Math.max(Math.trunc(availableQuota), 0);
  return {
    requiredQuota: normalizedRequiredQuota,
    availableQuota: normalizedAvailableQuota,
    canSubmit: normalizedAvailableQuota >= normalizedRequiredQuota,
    maxShortTaskCount: normalizedAvailableQuota,
    maxLongSegmentCount: normalizedAvailableQuota,
  };
}
