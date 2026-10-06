const validTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

export function defaultEndTime(startTime) {
  if (!validTime(startTime)) return '';
  const [hour, minute] = startTime.split(':').map(Number);
  const end = hour * 60 + minute + 60;
  if (end >= 24 * 60) return '';
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
}

export function timeRangeError(startTime, endTime) {
  if (!startTime && !endTime) return '';
  if (!validTime(startTime) || !validTime(endTime)) return '请选择完整的开始时间和结束时间。';
  if (endTime <= startTime) return '结束时间必须晚于开始时间。';
  return '';
}
