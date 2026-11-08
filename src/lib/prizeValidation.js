export const validPrizeReward = (reward, announced) => reward.length <= 240 && (!announced || reward.trim().length > 0)
export const validPoolAmount = (value) => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1000000
