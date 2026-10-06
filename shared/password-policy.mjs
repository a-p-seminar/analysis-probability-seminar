export function newPasswordError(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128 || !value.trim()) {
    return '新密码须为 12–128 个字符，且不能全为空格。';
  }
  return '';
}
